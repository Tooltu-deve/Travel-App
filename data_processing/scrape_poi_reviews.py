"""
Script để tìm kiếm POI bằng Google Text Search API và scrape reviews bằng Selenium
- Tìm POI bằng Google Places API (Text Search)
- Lọc POI có số lượng reviews > 100
- Scrape reviews từ Google Maps bằng Selenium
- Xuất ra file reviews.csv với các cột: placeID, reviews
"""

import os
import time
import csv
import json
import requests
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

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

def search_pois_by_text(query: str, location: str = None, max_results: int = 100):
    """
    Tìm kiếm POI bằng Google Places API (Text Search) với pagination
    
    Args:
        query: Từ khóa tìm kiếm (ví dụ: "restaurants in Ho Chi Minh City")
        location: Vị trí tìm kiếm (optional, format: "lat,lng")
        max_results: Số lượng kết quả tối đa muốn lấy (mặc định 100)
    
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
                    "radius": 5000.0  # 5km radius
                }
            }
        except:
            pass
    
    all_pois = []
    next_page_token = None
    page_count = 0
    
    try:
        while True:
            page_count += 1
            print(f"\n📄 Đang lấy trang {page_count}...")
            
            # Nếu có nextPageToken từ lần trước, thêm vào body
            if next_page_token:
                body["pageToken"] = next_page_token
            
            response = requests.post(url, headers=headers, json=body, timeout=10)
            
            if response.status_code != 200:
                print(f"⚠️  API Error: HTTP {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                break
            
            data = response.json()
            places = data.get('places', [])
            next_page_token = data.get('nextPageToken')
            
            print(f"  → Nhận được {len(places)} POI từ trang {page_count}")
            
            # Xử lý từng place
            for place in places:
                place_id = place.get('id', '')
                name = place.get('displayName', {}).get('text', '') if isinstance(place.get('displayName'), dict) else place.get('displayName', '')
                user_rating_count = place.get('userRatingCount', 0)
                
                # Chỉ lấy POI có số lượng reviews > 100
                if user_rating_count and user_rating_count > 100:
                    all_pois.append({
                        'place_id': place_id,
                        'name': name,
                        'user_rating_total': user_rating_count
                    })
                    print(f"    ✅ {name}: {user_rating_count} reviews")
                else:
                    print(f"    ⏭️  {name}: {user_rating_count} reviews (bỏ qua, < 100)")
            
            # Kiểm tra điều kiện dừng
            if not next_page_token:
                print(f"  → Không còn trang tiếp theo")
                break
            
            if len(all_pois) >= max_results:
                print(f"  → Đã đạt giới hạn {max_results} POI")
                break
            
            # Đợi một chút trước khi gọi request tiếp theo (tránh rate limit)
            print(f"  ⏳ Đợi 2 giây trước khi lấy trang tiếp theo...")
            time.sleep(2)
            
            # Xóa pageToken khỏi body để tránh lỗi nếu không có nextPageToken
            if 'pageToken' in body:
                del body['pageToken']
        
        print(f"\n✅ Tổng cộng lấy được {len(all_pois)} POI phù hợp từ {page_count} trang")
        return all_pois[:max_results]  # Giới hạn số lượng kết quả
        
    except Exception as e:
        print(f"❌ Lỗi khi gọi API: {e}")
        import traceback
        traceback.print_exc()
        return all_pois  # Trả về những gì đã lấy được

def setup_selenium_driver():
    """
    Thiết lập Selenium WebDriver
    """
    chrome_options = Options()
    chrome_options.add_argument('--headless')  # Chạy ở chế độ headless (không hiển thị browser)
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        print(f"❌ Lỗi khi khởi tạo Selenium WebDriver: {e}")
        print("   Gợi ý: Cài đặt ChromeDriver và đảm bảo nó có trong PATH")
        return None

def scrape_reviews_from_google_maps(place_id: str, driver, max_reviews: int = 50):
    """
    Scrape reviews từ Google Maps bằng Selenium
    
    Args:
        place_id: Place ID của POI
        driver: Selenium WebDriver instance
        max_reviews: Số lượng reviews tối đa cần lấy
    
    Returns:
        List các review text
    """
    # URL Google Maps cho place_id - sử dụng format chính xác
    # Cách 1: Sử dụng place_id trực tiếp
    url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    
    # Cách 2: Nếu cách 1 không hoạt động, có thể dùng Places API để lấy tên và tìm kiếm
    # Nhưng tạm thời dùng cách 1
    
    reviews = []
    
    try:
        print(f"    Đang mở Google Maps cho place_id: {place_id}...")
        driver.get(url)
        
        # Đợi trang load
        wait = WebDriverWait(driver, 10)
        time.sleep(3)
        
        try:
            # Tìm và click vào button "Reviews" hoặc scroll xuống phần reviews
            # Google Maps thường có button "Reviews" hoặc phần reviews ở dưới
            scroll_pause_time = 1.5
            screen_height = driver.execute_script("return window.innerHeight")
            
            # Scroll nhiều lần để load reviews
            for i in range(5):
                driver.execute_script(f"window.scrollTo(0, {screen_height * (i + 1)});")
                time.sleep(scroll_pause_time)
            
            # Đợi một chút để reviews load
            time.sleep(2)
            
            # Tìm các element chứa reviews
            # Google Maps sử dụng class động, nên cần thử nhiều selector
            review_texts = set()  # Dùng set để tránh duplicate
            
            # Các selector phổ biến cho review text trong Google Maps
            selectors = [
                "span.wiI7pd",  # Review text chính
                "div.MyEned span",  # Review text trong container
                "div.jftiEf span.wiI7pd",  # Review text trong review card
                "div[data-review-id] span",  # Review text trong data-review-id
            ]
            
            for selector in selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        text = elem.text.strip()
                        # Lọc text hợp lệ (đủ dài, không phải số, không phải icon text)
                        if (text and 
                            len(text) > 20 and 
                            not text.isdigit() and
                            not text.startswith('★') and
                            ':' not in text[:10]):  # Bỏ qua label như "5 stars:"
                            review_texts.add(text)
                except:
                    continue
            
            # Nếu vẫn chưa có reviews, thử cách khác: tìm theo XPath
            if not review_texts:
                try:
                    # Tìm tất cả div có chứa text dài (có thể là reviews)
                    all_divs = driver.find_elements(By.XPATH, "//div[contains(@class, 'MyEned') or contains(@class, 'jftiEf')]")
                    for div in all_divs:
                        text = div.text.strip()
                        # Lọc text hợp lệ
                        if (text and 
                            len(text) > 30 and 
                            len(text) < 2000 and  # Reviews thường không quá dài
                            '\n' in text and  # Reviews thường có nhiều dòng
                            not text.startswith('★')):
                            # Lấy dòng đầu tiên hoặc toàn bộ text
                            lines = text.split('\n')
                            for line in lines:
                                if len(line) > 20:
                                    review_texts.add(line)
                except:
                    pass
            
            # Chuyển set thành list và giới hạn số lượng
            reviews = list(review_texts)[:max_reviews]
            
        except TimeoutException:
            print(f"    ⚠️  Timeout khi đợi reviews load")
        except NoSuchElementException:
            print(f"    ⚠️  Không tìm thấy phần reviews")
        except Exception as e:
            print(f"    ⚠️  Lỗi khi scrape reviews: {e}")
            import traceback
            traceback.print_exc()
        
        print(f"    ✅ Lấy được {len(reviews)} reviews")
        
    except Exception as e:
        print(f"    ❌ Lỗi khi scrape reviews cho {place_id}: {e}")
        import traceback
        traceback.print_exc()
    
    return reviews

# Danh sách 20 thành phố nổi tiếng nhất ở Việt Nam với tọa độ trung tâm
VIETNAM_CITIES = [
    {"name": "Hà Nội", "lat": 21.0285, "lng": 105.8542},
    {"name": "Thành phố Hồ Chí Minh", "lat": 10.8231, "lng": 106.6297},
    {"name": "Đà Nẵng", "lat": 16.0544, "lng": 108.2022},
    {"name": "Hải Phòng", "lat": 20.8449, "lng": 106.6881},
    {"name": "Cần Thơ", "lat": 10.0452, "lng": 105.7469},
    {"name": "Nha Trang", "lat": 12.2388, "lng": 109.1967},
    {"name": "Huế", "lat": 16.4637, "lng": 107.5909},
    {"name": "Vũng Tàu", "lat": 10.3460, "lng": 107.0843},
    {"name": "Phan Thiết", "lat": 10.9376, "lng": 108.1018},
    {"name": "Quy Nhon", "lat": 13.7765, "lng": 109.2237},
    {"name": "Hạ Long", "lat": 20.9101, "lng": 107.1839},
    {"name": "Sapa", "lat": 22.3364, "lng": 103.8437},
    {"name": "Đà Lạt", "lat": 11.9404, "lng": 108.4583},
    {"name": "Hội An", "lat": 15.8801, "lng": 108.3380},
    {"name": "Phú Quốc", "lat": 10.2899, "lng": 103.9840},
    {"name": "Mũi Né", "lat": 10.9600, "lng": 108.2800},
    {"name": "Tam Đảo", "lat": 21.4500, "lng": 105.6500},
    {"name": "Cát Bà", "lat": 20.8000, "lng": 107.0167},
    {"name": "Mai Châu", "lat": 20.6667, "lng": 105.0833},
    {"name": "Mộc Châu", "lat": 20.8500, "lng": 104.6333},
]

def main():
    """
    Hàm chính để tìm POI và scrape reviews cho 20 thành phố nổi tiếng nhất ở Việt Nam
    """
    print("\n" + "="*60)
    print("SCRAPER POI REVIEWS - Google Places API + Selenium")
    print("Tự động chạy cho 20 thành phố nổi tiếng nhất ở Việt Nam")
    print("="*60)
    
    # Hỏi số lượng POI tối đa cho mỗi thành phố
    max_results_input = input("\nSố lượng POI tối đa cho mỗi thành phố (mặc định 50, nhấn Enter để dùng mặc định): ").strip()
    max_results_per_city = int(max_results_input) if max_results_input.isdigit() else 50
    
    # Hỏi có muốn scrape reviews không
    scrape_reviews = input("\nBạn có muốn scrape reviews từ Google Maps không? (y/n, mặc định: n): ").strip().lower()
    scrape_reviews = scrape_reviews == 'y'
    
    # Tạo thư mục reviews nếu chưa có
    os.makedirs('./reviews', exist_ok=True)
    
    # Thiết lập Selenium nếu cần scrape reviews
    driver = None
    if scrape_reviews:
        print("\n🚀 Đang khởi tạo Selenium WebDriver...")
        driver = setup_selenium_driver()
        if not driver:
            print("⚠️  Không thể khởi tạo Selenium. Chỉ tìm kiếm POI, không scrape reviews.")
            scrape_reviews = False
    
    # Tổng hợp dữ liệu từ tất cả thành phố
    all_reviews_data = []
    all_pois_summary = []
    
    # Chạy cho từng thành phố
    for city_idx, city in enumerate(VIETNAM_CITIES, 1):
        print("\n" + "="*60)
        print(f"[{city_idx}/{len(VIETNAM_CITIES)}] Đang xử lý: {city['name']}")
        print("="*60)
        
        # Tạo query
        query = f"Địa điểm du lịch và thắng cảnh ở {city['name']}"
        location = f"{city['lat']},{city['lng']}"
        
        print(f"🔍 Query: {query}")
        print(f"📍 Location: {city['name']} ({city['lat']}, {city['lng']})")
        print(f"   Giới hạn: {max_results_per_city} POI")
        
        try:
            # Tìm kiếm POI với pagination
            pois = search_pois_by_text(query, location, max_results=max_results_per_city)
            
            if not pois:
                print(f"⚠️  Không tìm thấy POI nào phù hợp cho {city['name']}")
                continue
            
            print(f"\n✅ Tìm thấy {len(pois)} POI có > 100 reviews cho {city['name']}")
            
            # Lưu summary POI
            for poi in pois:
                all_pois_summary.append({
                    'city': city['name'],
                    'place_id': poi['place_id'],
                    'name': poi['name'],
                    'user_rating_total': poi['user_rating_total']
                })
            
            # Scrape reviews nếu được yêu cầu
            if scrape_reviews and driver:
                print(f"\n📝 Đang scrape reviews cho {len(pois)} POI ở {city['name']}...")
                
                for idx, poi in enumerate(pois, 1):
                    print(f"\n  [{idx}/{len(pois)}] {poi['name']}")
                    print(f"      Place ID: {poi['place_id']}")
                    print(f"      Số reviews: {poi['user_rating_total']}")
                    
                    reviews = scrape_reviews_from_google_maps(poi['place_id'], driver, max_reviews=50)
                    
                    if reviews:
                        # Lưu từng review như một dòng riêng
                        for review in reviews:
                            all_reviews_data.append({
                                'placeID': poi['place_id'],
                                'reviews': review
                            })
                    
                    # Nghỉ giữa các request để tránh bị block
                    if idx < len(pois):
                        time.sleep(2)
            
        except Exception as e:
            print(f"❌ Lỗi khi xử lý {city['name']}: {e}")
            import traceback
            traceback.print_exc()
            continue  # Tiếp tục với thành phố tiếp theo
        
        # Nghỉ giữa các thành phố
        if city_idx < len(VIETNAM_CITIES):
            print(f"\n⏳ Đợi 3 giây trước khi chuyển sang thành phố tiếp theo...")
            time.sleep(3)
    
    # Đóng browser nếu có
    if driver:
        driver.quit()
    
    # Lưu summary POI
    summary_file = './reviews/pois_summary.csv'
    print(f"\n💾 Đang lưu summary POI vào {summary_file}...")
    try:
        with open(summary_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['city', 'place_id', 'name', 'user_rating_total'])
            writer.writeheader()
            writer.writerows(all_pois_summary)
        print(f"✅ Đã lưu {len(all_pois_summary)} POI vào {summary_file}")
    except Exception as e:
        print(f"❌ Lỗi khi lưu summary: {e}")
    
    # Lưu reviews vào CSV (nếu có)
    if all_reviews_data:
        output_file = './reviews/all_reviews.csv'
        print(f"\n💾 Đang lưu {len(all_reviews_data)} reviews vào {output_file}...")
        
        try:
            # Kiểm tra file đã tồn tại chưa để append hoặc tạo mới
            file_exists = os.path.exists(output_file)
            with open(output_file, 'a' if file_exists else 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['placeID', 'reviews'])
                if not file_exists:
                    writer.writeheader()
                writer.writerows(all_reviews_data)
            
            print(f"✅ Đã lưu thành công vào {output_file}")
            print(f"   - Tổng số reviews: {len(all_reviews_data)}")
            
            # Thống kê theo thành phố
            city_stats = {}
            for poi in all_pois_summary:
                city = poi['city']
                if city not in city_stats:
                    city_stats[city] = {'pois': 0, 'reviews': 0}
                city_stats[city]['pois'] += 1
            
            # Đếm reviews theo placeID và map về city
            poi_to_city = {poi['place_id']: poi['city'] for poi in all_pois_summary}
            for row in all_reviews_data:
                place_id = row['placeID']
                if place_id in poi_to_city:
                    city = poi_to_city[place_id]
                    city_stats[city]['reviews'] += 1
            
            print(f"\n📊 Thống kê theo thành phố:")
            for city, stats in sorted(city_stats.items()):
                print(f"   - {city}: {stats['pois']} POI, {stats['reviews']} reviews")
            
        except Exception as e:
            print(f"❌ Lỗi khi lưu file CSV: {e}")
    else:
        print("\n⚠️  Không có reviews nào được scrape (có thể do không chọn scrape hoặc lỗi)")
    
    # Tổng kết
    print("\n" + "="*60)
    print("✅ HOÀN TẤT!")
    print("="*60)
    print(f"   - Đã xử lý: {len(VIETNAM_CITIES)} thành phố")
    print(f"   - Tổng số POI: {len(all_pois_summary)}")
    if all_reviews_data:
        print(f"   - Tổng số reviews: {len(all_reviews_data)}")
    print(f"   - File summary: {summary_file}")
    if all_reviews_data:
        print(f"   - File reviews: ./reviews/all_reviews.csv")

if __name__ == "__main__":
    main()

