import pandas as pd
from transformers import pipeline
from datasets import Dataset
import json
import torch # Cần thiết để kiểm tra và sử dụng GPU
import warnings
import os
import requests
from dotenv import load_dotenv
from glob import glob

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

# ---- 2. TẢI MÔ HÌNH (PIPELINE) ----
# Tải pipeline Zero-Shot Classification.
# 'facebook/bart-large-mnli' là mô hình tiêu chuẩn, mạnh mẽ cho nhiệm vụ này.
# Nó sẽ tự động tải về (khoảng 1.6GB) trong lần chạy đầu tiên.
print("Đang tải mô hình Zero-Shot...")
try:
    # device=device_index: 
    #   - 0: NVIDIA CUDA GPU
    #   - 'mps': Apple Silicon GPU (Mac M1/M2/M3)
    #   - -1: CPU
    classifier = pipeline(
        "zero-shot-classification",
        model="facebook/bart-large-mnli",
        device=device_index
    )
    print("Tải mô hình thành công.")
except Exception as e:
    print(f"Lỗi khi tải mô hình: {e}")
    print("Gợi ý: Nếu lỗi liên quan đến MPS, thử chạy lại hoặc fallback về CPU bằng cách set device_index = -1")
    exit()

# ---- 3. ĐỊNH NGHĨA CÁC THẺ CẢM XÚC ----
EMOTIONAL_TAGS = [
    'quiet', 'peaceful', 'relaxing',  # Nhóm Yên tĩnh
    'crowded', 'lively', 'vibrant',     # Nhóm Náo nhiệt
    'romantic', 'good for couples',          # Nhóm Lãng mạn
    'expensive', 'luxury', 'high-end',          # Nhóm Đắt đỏ
    'good value', 'cheap', 'affordable', # Nhóm Đáng tiền
    'touristy', 'tourist-friendly',                      # Nhiều khách du lịch
    'local gem', 'authentic', 'genuine',       # Địa phương, đích thực
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

    # CHẠY PHÂN LOẠI (INFERENCE) - TỐI ƯU VỚI DATASET VÀ BATCH PROCESSING
    # Sử dụng Dataset để batch processing hiệu quả hơn, tận dụng GPU tốt hơn
    try:
        # Tạo Dataset từ reviews_list để xử lý theo batch
        dataset = Dataset.from_dict({"text": reviews_list})
        
        # Hàm xử lý batch - được gọi với batch_size reviews cùng lúc
        def classify_batch(examples):
            texts = examples["text"]  # List các text trong batch
            # Pipeline tự động xử lý batch này, tận dụng GPU tốt hơn
            results = classifier(
                texts,
                candidate_labels=EMOTIONAL_TAGS,
                multi_label=True
            )
            # Trả về dạng dict với labels và scores cho mỗi text trong batch
            return {
                "labels": [r["labels"] for r in results],
                "scores": [r["scores"] for r in results]
            }
        
        # Map với batched=True để xử lý theo batch
        # batch_size: số reviews xử lý cùng lúc (tăng nếu GPU memory đủ)
        # Với GPU: 32-128 thường tốt, với CPU: 8-16
        batch_size = 64 if device_index != -1 else 16
        dataset = dataset.map(
            classify_batch,
            batched=True,
            batch_size=batch_size,
            remove_columns=["text"]  # Xóa cột text sau khi xử lý để tiết kiệm memory
        )
        
        # Chuyển kết quả từ Dataset về dạng list predictions (giữ format cũ)
        predictions = []
        for i in range(len(dataset)):
            predictions.append({
                "labels": dataset[i]["labels"],
                "scores": dataset[i]["scores"]
            })
            
    except Exception as e:
        print(f"Lỗi khi chạy mô hình cho POI {placeID}: {e}")
        continue

    # ---- 6. TÍNH TOÁN ĐIỂM SỐ TRUNG BÌNH ----
    # 'predictions' là một list các dictionary (mỗi review 1 dict)
    # Ví dụ: [{'labels': ['quiet', 'expensive', ...], 'scores': [0.9, 0.8, ...]}, ...]
    
    # Chúng ta cần tính điểm TRUNG BÌNH của tất cả các review cho POI này
    
    # Khởi tạo điểm số cho POI này
    tag_scores_sum = {tag: 0.0 for tag in EMOTIONAL_TAGS}
    
    # Cộng dồn điểm số từ mỗi review
    for pred in predictions:
        for label, score in zip(pred['labels'], pred['scores']):
            tag_scores_sum[label] += score
            
    # Tính trung bình cộng
    num_reviews = len(reviews_list)
    avg_scores = {tag: (total_score / num_reviews) for tag, total_score in tag_scores_sum.items()}
    
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


