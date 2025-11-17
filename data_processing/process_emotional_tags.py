import pandas as pd
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from datasets import Dataset
import json
import torch # Cần thiết để kiểm tra và sử dụng GPU
import warnings
import os
import requests
from dotenv import load_dotenv
from glob import glob
import numpy as np

# Load biến môi trường từ file .env
load_dotenv()

# Google API Key cho Place Details
GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY', '')


if not GOOGLE_PLACES_API_KEY:
    print("⚠️  CẢNH BÁO: GOOGLE_PLACES_API_KEY chưa được set trong biến môi trường!")
    print("   Place details sẽ không được lấy. Hãy set: export GOOGLE_PLACES_API_KEY='your_key'")
else:
    print(f"✅ GOOGLE_PLACES_API_KEY đã được set (độ dài: {len(GOOGLE_PLACES_API_KEY)} ký tự)")

def map_price_level_to_budget_range(price_level):
    """
    Map Google Places API (new) price level enum strings to budget range.
    Places API (new) uses strings like:
    - PRICE_LEVEL_FREE
    - PRICE_LEVEL_INEXPENSIVE
    - PRICE_LEVEL_MODERATE
    - PRICE_LEVEL_EXPENSIVE
    - PRICE_LEVEL_VERY_EXPENSIVE
    
    Nếu price_level là None hoặc không hợp lệ, mặc định là 'free'
    """
    if price_level is None:
        return 'free'
    
    # Chuyển sang uppercase để so sánh (case-insensitive)
    price_level_str = str(price_level).upper()
    
    # Map các enum strings của Places API (new)
    if price_level_str == 'PRICE_LEVEL_FREE':
        return 'free'
    elif price_level_str == 'PRICE_LEVEL_INEXPENSIVE':
        return 'cheap'
    elif price_level_str == 'PRICE_LEVEL_MODERATE':
        return 'affordable'
    elif price_level_str == 'PRICE_LEVEL_EXPENSIVE':
        return 'expensive'
    elif price_level_str == 'PRICE_LEVEL_VERY_EXPENSIVE':
        return 'luxury'
    
    # Fallback: Nếu là số (tương thích với API cũ)
    try:
        pl = int(price_level)
        if pl == 0:
            return 'free'
        elif pl == 1:
            return 'cheap'
        elif pl == 2:
            return 'affordable'
        elif pl == 3:
            return 'expensive'
        elif pl >= 4:
            return 'luxury'
    except (ValueError, TypeError):
        pass
    
    # Nếu không nhận dạng được, mặc định là 'free'
    return 'free'

def fetch_place_details(place_id: str):
    """
    Lấy thông tin chi tiết POI từ Google Places API (new).
    Trả về: name, budget_range, location (lat/lng), formatted_address, type, opening_hours
    """
    if not GOOGLE_PLACES_API_KEY:
        print(f"⚠️  Cảnh báo: GOOGLE_PLACES_API_KEY chưa được set. Bỏ qua place_id: {place_id}")
        return {}
    try:
        # Sử dụng Places API (new) - endpoint mới
        url = f'https://places.googleapis.com/v1/places/{place_id}'
        
        # Headers cho Places API (new)
        headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'displayName,formattedAddress,location,priceLevel,types,regularOpeningHours'
        }
        
        r = requests.get(url, headers=headers, timeout=12)
        
        # Kiểm tra status code
        if r.status_code != 200:
            print(f"⚠️  Google Places API (new) error cho {place_id}: HTTP {r.status_code}")
            try:
                error_data = r.json()
                print(f"   Error: {error_data}")
            except:
                print(f"   Response: {r.text[:200]}")
            return {}
        
        data = r.json()
        
        # Lấy thông tin từ response
        name = data.get('displayName', {}).get('text') if isinstance(data.get('displayName'), dict) else data.get('displayName')
        formatted_address = data.get('formattedAddress')
        
        # Location
        location_data = data.get('location', {})
        lat = location_data.get('latitude')
        lng = location_data.get('longitude')
        
        # Price level và budget range
        # Nếu priceLevel không có, mặc định là 'free'
        price_level = data.get('priceLevel')
        budget_range = map_price_level_to_budget_range(price_level)
        # Đảm bảo budget_range luôn có giá trị (không bao giờ None)
        if budget_range is None:
            budget_range = 'free'
        
        # Types (loại địa điểm)
        types = data.get('types', [])
        # Lấy type chính (thường là type đầu tiên hoặc loại bỏ 'establishment', 'point_of_interest')
        main_type = None
        if types:
            # Loại bỏ các type chung, giữ lại type cụ thể
            filtered_types = [t for t in types if t not in ['establishment', 'point_of_interest']]
            main_type = filtered_types[0] if filtered_types else types[0]
        
        # Opening hours
        opening_hours = data.get('regularOpeningHours')
        
        # Tạo location object nếu có lat và lng
        location = None
        if lat is not None and lng is not None:
            location = {
                'lat': lat,
                'lng': lng
            }
        
        return {
            'name': name,
            'budget_range': budget_range,
            'latitude': lat,  # Giữ lại để tương thích
            'longitude': lng,  # Giữ lại để tương thích
            'location': location,  # Thêm location object
            'formatted_address': formatted_address,
            'type': main_type,
            'types': types,  # Giữ tất cả types để tham khảo
            'opening_hours': opening_hours,
        }
    except Exception as e:
        print(f"❌ Lỗi khi fetch place details cho {place_id}: {e}")
        return {}

# Tắt các cảnh báo không cần thiết từ DataLoader
warnings.filterwarnings('ignore', category=UserWarning, module='torch.utils.data.dataloader')

# ---- 1. KIỂM TRA VÀ THIẾT LẬP GPU ----
# Việc này rất quan trọng. Chạy trên GPU sẽ nhanh hơn 100 lần so với CPU.
# Hỗ trợ cả NVIDIA CUDA và Apple Silicon MPS (Metal)
device_index = -1  # Mặc định là CPU

if torch.cuda.is_available():
    device_index = 0  # NVIDIA CUDA GPU
    print(f"Phát hiện NVIDIA GPU! Đang chạy trên: {torch.cuda.get_device_name(device_index)}")
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    device_index = 'mps'  # Apple Silicon GPU (M1/M2/M3)
    print("Phát hiện Apple Silicon GPU (MPS)! Đang sử dụng Metal Performance Shaders.")
else:
    device_index = -1  # CPU
    print("Không tìm thấy GPU, đang sử dụng CPU (sẽ rất chậm!).")

# ---- 2. TẢI MÔ HÌNH PHOBERT ĐÃ FINE-TUNE ----
# Tải mô hình PhoBERT đã được fine-tune cho emotional tag classification
MODEL_PATH = "./final_few_shot_phobert_model"

print(f"Đang tải mô hình PhoBERT đã fine-tune từ: {MODEL_PATH}...")
try:
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Không tìm thấy mô hình tại {MODEL_PATH}. "
            "Hãy chạy fine_tune_phoBERT.py trước để tạo mô hình."
        )
    
    # Load tokenizer và model
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, use_fast=False)
    
    # Xác định device cho model
    if device_index == 'mps':
        device = torch.device('mps')
    elif device_index == 0:
        device = torch.device('cuda')
    else:
        device = torch.device('cpu')
    
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
    model.to(device)
    model.eval()  # Chuyển sang chế độ evaluation
    
    # Load label mappings từ model config
    id_to_label = model.config.id2label
    label_to_id = model.config.label2id
    NUM_LABELS = len(id_to_label)
    
    print(f"✅ Tải mô hình thành công!")
    print(f"   - Số lượng tags: {NUM_LABELS}")
    print(f"   - Device: {device}")
    print(f"   - Tags: {sorted(id_to_label.values())}")
    
except Exception as e:
    print(f"❌ Lỗi khi tải mô hình: {e}")
    print("Gợi ý: Hãy chạy fine_tune_phoBERT.py trước để tạo mô hình.")
    exit()

# ---- 3. ĐỊNH NGHĨA CÁC THẺ CẢM XÚC ----
# Lưu ý: Tags sẽ được load từ model config, không cần định nghĩa ở đây nữa
# Nhưng giữ lại để tương thích với code cũ (nếu cần)
EMOTIONAL_TAGS = [
    'quiet', 'peaceful', 'relaxing',  # Nhóm Yên tĩnh
    'crowded', 'lively', 'vibrant',     # Nhóm Náo nhiệt
    'romantic', 'good for couples',          # Nhóm Lãng mạn
    'expensive', 'luxury', 'high-end',          # Nhóm Đắt đỏ
    'good value', 'cheap', 'affordable', # Nhóm Đáng tiền
    'touristy', 'tourist-friendly',                      # Nhiều khách du lịch
    'local_gem', 'authentic', 'genuine',       # Địa phương, đích thực (lưu ý: local_gem không có dấu cách)
    'adventurous', 'exciting', 'thrilling',        # Mạo hiểm
    'family-friendly', 'cozy', 'comfortable', # Nhóm Gia đình, thoải mái
    'modern', 'artistic', 'creative', 
    'historical', 'cultural', 'traditional',
    'spiritual', 'religious', 'faith',
]

# ---- 4. TẢI DỮ LIỆU ĐÁNH GIÁ ----
# Đọc tất cả file CSV trong thư mục reviews/
reviews_dir = "reviews"
csv_files = glob(os.path.join(reviews_dir, "*.csv"))

if not csv_files:
    print(f"Lỗi: Không tìm thấy file CSV nào trong thư mục '{reviews_dir}/'.")
    exit()

print(f"Tìm thấy {len(csv_files)} file CSV trong thư mục '{reviews_dir}/':")
for csv_file in csv_files:
    print(f"  - {csv_file}")

# Đọc và combine tất cả file CSV
try:
    df_list = []
    for csv_file in csv_files:
        print(f"\nĐang đọc file: {csv_file}...")
        df = pd.read_csv(csv_file)
        print(f"  → Đọc được {len(df)} dòng")
        
        # Kiểm tra các cột bắt buộc
        if 'placeID' not in df.columns or 'review-text' not in df.columns:
            print(f"  ⚠️  Cảnh báo: File '{csv_file}' thiếu cột 'placeID' hoặc 'review-text'. Bỏ qua file này.")
            continue
        
        df_list.append(df)
    
    if not df_list:
        raise ValueError("Không có file CSV nào hợp lệ (có đủ cột 'placeID' và 'review-text').")
    
    # Combine tất cả dataframe
    df_reviews = pd.concat(df_list, ignore_index=True)
    print(f"\n✅ Đã combine {len(df_list)} file CSV thành {len(df_reviews)} dòng tổng cộng.")
    
except Exception as e:
    print(f"Lỗi khi đọc file CSV: {e}")
    exit()

# ---- 5. XỬ LÝ VÀ GÁN THẺ (THE CORE LOOP) ----
print("Bắt đầu xử lý gán thẻ...")
poi_final_scores = {} # Dictionary cuối cùng để lưu kết quả

# Nhóm các review theo từng POI
grouped = df_reviews.groupby('placeID')

for placeID, group in grouped:
    print(f"\nĐang xử lý POI ID: {placeID} (Có {len(group)} reviews)")
    
    # Lấy danh sách review (chuyển thành list)
    reviews_list = group['review-text'].dropna().tolist()
    
    if not reviews_list:
        print(f"POI {placeID} không có review text hợp lệ, bỏ qua.")
        continue

    # CHẠY PHÂN LOẠI (INFERENCE) - SỬ DỤNG PHOBERT FINE-TUNED
    # Sử dụng Dataset để batch processing hiệu quả hơn, tận dụng GPU tốt hơn
    try:
        # Tạo Dataset từ reviews_list để xử lý theo batch
        dataset = Dataset.from_dict({"text": reviews_list})
        
        # Hàm tokenize và encode
        def tokenize_batch(examples):
            return tokenizer(
                examples["text"],
                truncation=True,
                padding='max_length',
                max_length=128,
                return_tensors=None  # Trả về list thay vì tensor
            )
        
        # Tokenize tất cả reviews
        tokenized_dataset = dataset.map(
            tokenize_batch,
            batched=True,
            remove_columns=["text"]
        )
        
        # Hàm predict batch
        def predict_batch(examples):
            # Chuẩn bị input_ids và attention_mask
            input_ids = torch.tensor(examples["input_ids"]).to(device)
            attention_mask = torch.tensor(examples["attention_mask"]).to(device)
            
            # Predict
            with torch.no_grad():
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                logits = outputs.logits  # Shape: (batch_size, num_labels)
            
            # Chuyển logits sang probabilities bằng softmax
            probs = torch.nn.functional.softmax(logits, dim=-1).cpu().numpy()
            
            # Lấy top-k labels và scores cho mỗi review (multi-label: lấy tất cả labels có prob > threshold)
            threshold = 0.1  # Ngưỡng để coi là positive label
            batch_labels = []
            batch_scores = []
            
            for prob in probs:
                # Lấy tất cả labels có probability > threshold
                label_indices = np.where(prob > threshold)[0]
                if len(label_indices) == 0:
                    # Nếu không có label nào > threshold, lấy top-3
                    label_indices = np.argsort(prob)[-3:][::-1]
                
                # Sắp xếp theo score giảm dần
                sorted_indices = label_indices[np.argsort(prob[label_indices])[::-1]]
                
                labels = [id_to_label[int(idx)] for idx in sorted_indices]
                scores = [float(prob[int(idx)]) for idx in sorted_indices]
                
                batch_labels.append(labels)
                batch_scores.append(scores)
            
            return {
                "labels": batch_labels,
                "scores": batch_scores
            }
        
        # Predict theo batch
        batch_size = 32 if device_index != -1 else 8
        predictions = []
        
        for i in range(0, len(tokenized_dataset), batch_size):
            batch = tokenized_dataset[i:i+batch_size]
            batch_results = predict_batch(batch)
            predictions.extend([
                {"labels": labels, "scores": scores}
                for labels, scores in zip(batch_results["labels"], batch_results["scores"])
            ])
            
    except Exception as e:
        print(f"Lỗi khi chạy mô hình cho POI {placeID}: {e}")
        import traceback
        traceback.print_exc()
        continue

    # ---- 6. TÍNH TOÁN ĐIỂM SỐ TRUNG BÌNH ----
    # 'predictions' là một list các dictionary (mỗi review 1 dict)
    # Ví dụ: [{'labels': ['quiet', 'expensive', ...], 'scores': [0.9, 0.8, ...]}, ...]
    
    # Chúng ta cần tính điểm TRUNG BÌNH của tất cả các review cho POI này
    
    # Khởi tạo điểm số cho POI này - sử dụng tất cả labels từ model
    all_tags = list(id_to_label.values())
    tag_scores_sum = {tag: 0.0 for tag in all_tags}
    tag_counts = {tag: 0 for tag in all_tags}  # Đếm số lần tag xuất hiện
    
    # Cộng dồn điểm số từ mỗi review
    for pred in predictions:
        for label, score in zip(pred['labels'], pred['scores']):
            if label in tag_scores_sum:
            tag_scores_sum[label] += score
            tag_counts[label] += 1
            
    # Tính trung bình cộng (chỉ tính cho các tags có xuất hiện ít nhất 1 lần)
    num_reviews = len(reviews_list)
    avg_scores = {}
    for tag in all_tags:
        if tag_counts[tag] > 0:
            avg_scores[tag] = tag_scores_sum[tag] / num_reviews
        else:
            avg_scores[tag] = 0.0
    
    # Lưu kết quả
    poi_final_scores[placeID] = avg_scores
    print(f"POI {placeID} - Điểm số trung bình (ví dụ): quiet={avg_scores.get('quiet', 0):.2f}, crowded={avg_scores.get('crowded', 0):.2f}")


# ---- 7. LƯU KẾT QUẢ CUỐI CÙNG ----
# 'poi_final_scores' là một dictionary lớn chứa điểm số cho tất cả POI
print("\nHoàn tất xử lý! Đang lưu kết quả (kèm thông tin Place Details)...")
try:
    # Append theo dạng JSON Lines: mỗi POI là một dòng JSON đầy đủ thông tin
    written = 0
    with_details = 0
    without_details = 0
    with open('poi_location_details.json', 'a', encoding='utf-8') as f:
        for place_id, tags in poi_final_scores.items():
            details = fetch_place_details(place_id)
            has_details = any(v is not None for v in details.values())
            if has_details:
                with_details += 1
            else:
                without_details += 1
            record = {
                'placeID': place_id,
                'emotional_tags': tags,
                **({k: v for k, v in details.items() if v is not None})
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1
    print(f"Đã append {written} dòng vào 'poi_location_details.json' (JSON Lines).")
    print(f"   - Có place details: {with_details} POI")
    print(f"   - Không có place details: {without_details} POI")
    if without_details > 0:
        print(f"   ⚠️  {without_details} POI không có place details. Kiểm tra API key và quota.")
except Exception as e:
    print(f"Lỗi khi lưu file JSON: {e}")


