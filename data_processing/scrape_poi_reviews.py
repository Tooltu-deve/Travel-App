def fetch_place_details(place_id: str, api_key: str):
    """
    Lấy thông tin chi tiết POI từ Google Places API (new).
    Trả về dict với price_level (nếu có).
    """
    try:
        url = f'https://places.googleapis.com/v1/places/{place_id}'
        headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': api_key,
            'X-Goog-FieldMask': 'priceLevel,displayName'
        }
        r = requests.get(url, headers=headers, timeout=8, verify=False)
        if r.status_code != 200:
            return {}
        return r.json()
    except Exception:
        return {}
"""
Script để tìm kiếm POI bằng Google Text Search API
- Tìm POI bằng Google Places API (Text Search)
- Lọc POI có số lượng reviews > 100
- Xuất ra file pois_summary.csv với các cột: city, place_id, name, user_rating_total
"""

import os
import time
import csv
import requests
import urllib3
import re
from dotenv import load_dotenv

# Disable SSL warnings và verification (để xử lý lỗi certificate trên Windows)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Tạo session với SSL verification disabled
def create_requests_session():
    """
    Tạo requests session với SSL verification disabled để xử lý lỗi certificate trên Windows
    """
    session = requests.Session()
    session.verify = False  # Disable SSL verification
    return session

# Load biến môi trường
load_dotenv()

# Google Places API Key
GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY', '')

if not GOOGLE_PLACES_API_KEY:
    print("⚠️  CẢNH BÁO: GOOGLE_PLACES_API_KEY chưa được set trong biến môi trường!")
    print("   Hãy set: export GOOGLE_PLACES_API_KEY='your_key'")
    exit(1)
else:
    print(f"✅ GOOGLE_PLACES_API_KEY đã được set (độ dài: {len(GOOGLE_PLACES_API_KEY)} ký tự)")

def search_pois_by_text(query: str, location: str = None, min_results: int = 65, max_results: int = 200, existing_place_ids: set = None):
    """
    Tìm kiếm POI bằng Google Places API (Text Search) với pagination
    
    Args:
        query: Từ khóa tìm kiếm (ví dụ: "restaurants in Ho Chi Minh City")
        location: Vị trí tìm kiếm (optional, format: "lat,lng")
        min_results: Số lượng POI tối thiểu cần lấy (mặc định 65)
        max_results: Số lượng kết quả tối đa muốn lấy (mặc định 200)
    
    Returns:
        List các POI với place_id, name, user_rating_total
    """
    url = "https://places.googleapis.com/v1/places:searchText"
    
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.userRatingCount,nextPageToken'
    }
    
    # Tạo request body
    body = {
        "textQuery": query,
        "maxResultCount": 20  # Tối đa 20 kết quả mỗi request
    }
    
    if location:
        # Parse location nếu có
        try:
            lat, lng = map(float, location.split(','))
            body["locationBias"] = {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng
                    },
                    "radius": 15000.0  # Tăng lên 15km radius để tìm được nhiều POI hơn
                }
            }
        except:
            pass
    
    # Tạo session với SSL verification disabled
    session = create_requests_session()
    
    all_pois = []
    all_place_ids = existing_place_ids.copy() if existing_place_ids else set()
    next_page_token = None
    page_count = 0
    
    try:
        while True:
            page_count += 1
            print(f"\n{'─'*60}")
            print(f"📄 Trang {page_count} | Đã lấy: {len(all_pois)}/{max_results} POI")
            print(f"{'─'*60}")
            
            # Nếu có nextPageToken từ lần trước, thêm vào body
            if next_page_token:
                body["pageToken"] = next_page_token
            
            # Gọi API với session đã disable SSL verification
            response = session.post(url, headers=headers, json=body, timeout=10)
            
            if response.status_code != 200:
                print(f"❌ Lỗi API: HTTP {response.status_code}")
                print(f"   Chi tiết: {response.text[:200]}")
                break
            
            data = response.json()
            places = data.get('places', [])
            next_page_token = data.get('nextPageToken')
            
            print(f"   📥 Nhận được {len(places)} POI từ API")
            
            # Xử lý từng place
            valid_count = 0
            skipped_count = 0
            for place in places:
                place_id = place.get('id', '')
                name = place.get('displayName', {}).get('text', '') if isinstance(place.get('displayName'), dict) else place.get('displayName', '')
                user_rating_count = place.get('userRatingCount', 0)
                
                # Chỉ lấy POI có:
                # 1. Số lượng reviews > 100
                # 2. Chưa có trong danh sách
                if user_rating_count and user_rating_count > 100 and place_id not in all_place_ids:
                    all_pois.append({
                        'place_id': place_id,
                        'name': name,
                        'user_rating_total': user_rating_count
                    })
                    all_place_ids.add(place_id)  # Thêm vào set để tránh trùng lặp
                    valid_count += 1
                    print(f"   ✅ [{len(all_pois):3d}] {name[:50]:<50} | {user_rating_count:>6} reviews")
                else:
                    skipped_count += 1
                    skip_reason = []
                    if not user_rating_count or user_rating_count <= 100:
                        skip_reason.append(f"< 100 reviews")
                    if place_id in all_place_ids:
                        skip_reason.append("trùng lặp")
                    
                    if skipped_count <= 3:  # Chỉ hiển thị 3 POI đầu tiên bị bỏ qua
                        reason = ", ".join(skip_reason) if skip_reason else "không hợp lệ"
                        print(f"   ⏭️  [{skipped_count:3d}] {name[:50]:<50} | {user_rating_count:>6} reviews (bỏ qua: {reason})")
            
            if skipped_count > 3:
                print(f"   ⏭️  ... và {skipped_count - 3} POI khác bị bỏ qua (< 100 reviews)")
            
            print(f"   📊 Trang này: {valid_count} hợp lệ, {skipped_count} bỏ qua")
            
            # Kiểm tra điều kiện dừng
            if not next_page_token:
                print(f"\n   ⏹️  Không còn trang tiếp theo")
                break
            
            if len(all_pois) >= max_results:
                print(f"\n   ✅ Đã đạt {max_results} POI, dừng pagination")
                break
            
            if len(all_pois) >= min_results and page_count >= 5:  # Đã scroll ít nhất 5 trang
                print(f"\n   ✅ Đã đạt tối thiểu {min_results} POI sau {page_count} trang")
                break
            
            # Đợi một chút trước khi request tiếp để tránh rate limit
            time.sleep(1)
        
        # Giới hạn số lượng POI
        all_pois = all_pois[:max_results]
        
    except Exception as e:
        print(f"❌ Lỗi khi gọi API: {e}")
        import traceback
        traceback.print_exc()
    
    return all_pois

# Danh sách 10 thành phố nổi tiếng nhất ở Việt Nam với tọa độ trung tâm
VIETNAM_CITIES = [
    {"name": "Hà Nội", "lat": 21.0285, "lng": 105.8542},
    {"name": "Thành phố Hồ Chí Minh", "lat": 10.8231, "lng": 106.6297},
    {"name": "Đà Nẵng", "lat": 16.0544, "lng": 108.2022},
    {"name": "Hải Phòng", "lat": 20.8449, "lng": 106.6881},
    {"name": "Cần Thơ", "lat": 10.0452, "lng": 105.7469},
    {"name": "Nha Trang", "lat": 12.2388, "lng": 109.1967},
    {"name": "Huế", "lat": 16.4637, "lng": 107.5909},
    {"name": "Vũng Tàu", "lat": 10.3460, "lng": 107.0843},
    {"name": "Hạ Long", "lat": 20.9101, "lng": 107.1839},
    {"name": "Đà Lạt", "lat": 11.9404, "lng": 108.4583},
    {"name": "Sa Pa", "lat": 22.3354, "lng": 103.8438},
    {"name": "Hội An", "lat": 15.8801, "lng": 108.3380},
    {"name": "Phú Quốc", "lat": 10.2899, "lng": 103.9840},
    {"name": "Phan Thiết", "lat": 10.9804, "lng": 108.2615},
    {"name": "Ninh Bình", "lat": 20.2506, "lng": 105.9745},
]

def main():
    """
    Hàm chính để tìm POI cho các thành phố nổi tiếng nhất ở Việt Nam
    """
    print("\n" + "="*60)
    print("TÌM KIẾM POI - Google Places API")
    print("Tự động chạy cho 10 thành phố nổi tiếng nhất ở Việt Nam")
    print("="*60)
    
    # Cấu hình số lượng POI cho mỗi thành phố
    min_results_per_city = 90  # Yêu cầu tối thiểu 90 POI
    max_results_per_city = 120  # Tối đa 120 POI
    print(f"\n📋 Yêu cầu: {min_results_per_city}-{max_results_per_city} POI mỗi thành phố, mỗi POI có > 100 reviews")
    
    # Tạo thư mục reviews nếu chưa có
    os.makedirs('./placeID', exist_ok=True)
    
    # Tổng hợp dữ liệu từ tất cả thành phố
    all_pois_summary = []
    
    per_query_limit = 20  # Luôn cố lấy tối đa 20 POI cho mỗi query

    # Chạy cho từng thành phố
    for city_idx, city in enumerate(VIETNAM_CITIES, 1):
        city_pois_summary = []
        print("\n" + "═"*70)
        print(f"🏙️  [{city_idx:2d}/{len(VIETNAM_CITIES)}] {city['name']}")
        print("═"*70)
        
        # Tạo nhiều query khác nhau để tìm được nhiều POI hơn (4 queries chính)
        queries = [
            f"Địa điểm du lịch và thắng cảnh ở {city['name']}",
            f"Bảo tàng và di tích lịch sử ở {city['name']}",
            f"Chùa và đền thờ ở {city['name']}",
            f"Cà phê và nhà hàng nổi tiếng ở {city['name']}",
            f"Bãi biển và khu nghĩ dưỡng ở {city['name']}",
            f"Vườn quốc gia và khu du lịch sinh thái ở {city['name']}",
        ]
        
        location = f"{city['lat']},{city['lng']}"
        
        print(f"   📍 Location: ({city['lat']}, {city['lng']})")
        print(f"   📋 Mục tiêu: {min_results_per_city}-{max_results_per_city} POI, mỗi POI > 100 reviews")
        print(f"   🔍 Sử dụng {len(queries)} query khác nhau để tìm POI...")
        
        try:
            # Tìm kiếm POI với nhiều query khác nhau
            all_place_ids = set()
            pois = []
            
            for query_idx, query in enumerate(queries, 1):
                if len(pois) >= max_results_per_city:
                    print(f"\n   ✅ Đã đạt {max_results_per_city} POI, dừng tìm kiếm")
                    break

                remaining_needed = max_results_per_city - len(pois)
                max_for_this_query = min(per_query_limit, remaining_needed)
                if max_for_this_query <= 0:
                    continue

                print(f"\n   🔍 Query {query_idx}/{len(queries)}: {query}")
                print(f"   📊 Đã có: {len(pois)} POI, sẽ lấy tối đa: {max_for_this_query} POI trong query này")
                
                # Tìm kiếm với query này, truyền existing_place_ids để tránh trùng lặp
                query_pois = search_pois_by_text(
                    query, 
                    location, 
                    min_results=0,  # Không yêu cầu tối thiểu cho từng query
                    max_results=max_for_this_query,
                    existing_place_ids=all_place_ids
                )
                
                # Cập nhật place_ids
                for poi in query_pois:
                    all_place_ids.add(poi['place_id'])
                
                pois.extend(query_pois)
                
                print(f"   ✅ Query này tìm thấy {len(query_pois)} POI mới, tổng: {len(pois)} POI")
                
                # Nếu đã đủ, dừng lại
                if len(pois) >= min_results_per_city:
                    print(f"   ✅ Đã đạt tối thiểu {min_results_per_city} POI (tiếp tục chạy hết các query để đa dạng)")
                
                # Đợi một chút giữa các query để tránh rate limit
                if query_idx < len(queries):
                    time.sleep(1)
            
            # Giới hạn số lượng POI
            pois = pois[:max_results_per_city]
            
            if not pois:
                print(f"\n   ❌ Không tìm thấy POI nào phù hợp")
                continue
            
            # Kiểm tra số lượng POI
            print(f"\n   {'─'*66}")
            if len(pois) < min_results_per_city:
                print(f"   ⚠️  Cảnh báo: {len(pois)}/{min_results_per_city} POI (thiếu {min_results_per_city - len(pois)} POI)")
            else:
                print(f"   ✅ Tìm thấy {len(pois)} POI (đạt yêu cầu {min_results_per_city}-{max_results_per_city})")
            print(f"   {'─'*66}")
            
            # Lọc POI sang trọng/đắt tiền bằng price_level
            print(f"\n   🔎 Đang kiểm tra price_level cho {len(pois)} POI...")
            luxury_levels = {"PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE", "luxury", "expensive", 3, 4, 5}
            filtered_pois = []
            for idx, poi in enumerate(pois, 1):
                details = fetch_place_details(poi['place_id'], GOOGLE_PLACES_API_KEY)
                price_level = details.get('priceLevel')
                # Hỗ trợ cả enum string và số (API cũ)
                is_luxury = False
                if price_level is not None:
                    if isinstance(price_level, str):
                        if price_level.upper() in luxury_levels:
                            is_luxury = True
                    else:
                        try:
                            if int(price_level) >= 3:
                                is_luxury = True
                        except Exception:
                            pass
                if is_luxury:
                    filtered_pois.append(poi)
                if idx % 10 == 0 or idx == len(pois):
                    print(f"      Đã kiểm tra {idx}/{len(pois)} POI...")

            print(f"   ✅ Có {len(filtered_pois)}/{len(pois)} POI sang trọng/đắt tiền")

            # Lưu POI vào summary (để thống kê)
            for poi in filtered_pois:
                poi_summary = {
                    'city': city['name'],
                    'place_id': poi['place_id'],
                    'name': poi['name'],
                    'user_rating_total': poi['user_rating_total']
                }
                city_pois_summary.append(poi_summary)
                all_pois_summary.append(poi_summary)

            # Xuất file CSV cho thành phố hiện tại (chỉ có place_id)
            if filtered_pois:
                # Sanitize tên thành phố để dùng làm tên file (loại bỏ ký tự đặc biệt)
                city_name_safe = city['name'].replace(' ', '_').replace('/', '_').replace('\\', '_')
                city_pois_file = f'./placeID/{city_name_safe}.csv'

                print(f"\n   💾 Đang lưu POI cho {city['name']}...")
                try:
                    with open(city_pois_file, 'w', newline='', encoding='utf-8') as f:
                        writer = csv.DictWriter(f, fieldnames=['place_id'])
                        writer.writeheader()
                        for poi in filtered_pois:
                            writer.writerow({'place_id': poi['place_id']})
                    print(f"   ✅ Đã lưu {len(filtered_pois)} POI → {city_pois_file}")
                except Exception as e:
                    print(f"   ❌ Lỗi khi lưu file CSV cho {city['name']}: {e}")
            else:
                print(f"\n   ⚠️  Không có POI sang trọng/đắt tiền nào để lưu cho {city['name']}")
            
        except Exception as e:
            print(f"❌ Lỗi khi xử lý {city['name']}: {e}")
            import traceback
            traceback.print_exc()
            continue  # Tiếp tục với thành phố tiếp theo
        
        # Nghỉ giữa các thành phố
        if city_idx < len(VIETNAM_CITIES):
            print(f"\n   ⏳ Đợi 3 giây trước khi chuyển sang thành phố tiếp theo...\n")
            time.sleep(3)
    
    # Lưu summary POI
    summary_file = './placeID/pois_summary.csv'
    print(f"\n{'═'*70}")
    print(f"💾 LƯU DỮ LIỆU")
    print(f"{'═'*70}")
    print(f"   📄 Đang lưu summary POI...")
    try:
        with open(summary_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['city', 'place_id', 'name', 'user_rating_total'])
            writer.writeheader()
            writer.writerows(all_pois_summary)
        print(f"   ✅ Đã lưu {len(all_pois_summary)} POI → {summary_file}")
    except Exception as e:
        print(f"   ❌ Lỗi khi lưu summary: {e}")
    
    # Thống kê theo thành phố
    if all_pois_summary:
        city_stats = {}
        for poi in all_pois_summary:
            city = poi['city']
            if city not in city_stats:
                city_stats[city] = {'pois': 0}
            city_stats[city]['pois'] += 1
        
        print(f"\n   📊 Thống kê theo thành phố:")
        print(f"   {'─'*66}")
        for city, stats in sorted(city_stats.items()):
            print(f"   {city:30s} | {stats['pois']:3d} POI")
    
    # Tổng kết
    print(f"\n{'═'*70}")
    print(f"✅ HOÀN TẤT!")
    print(f"{'═'*70}")
    print(f"   🏙️  Thành phố đã xử lý: {len(VIETNAM_CITIES)}")
    print(f"   📍 Tổng số POI: {len(all_pois_summary):,}")
    print(f"   💾 File summary: {summary_file}")
    print(f"   📁 Các file CSV theo thành phố đã được lưu trong folder ./reviews/")
    print(f"   📄 Mỗi thành phố có file: {{tên_thành_phố}}.csv (chỉ chứa place_id)")
    print(f"{'═'*70}\n")

if __name__ == "__main__":
    main()
