"""
Script để tìm kiếm POI bằng Google Text Search API và scrape reviews bằng Playwright
- Tìm POI bằng Google Places API (Text Search)
- Lọc POI có số lượng reviews > 100
- Scrape reviews từ Google Maps bằng Playwright (với anti-detection)
- Xuất ra file reviews.csv với các cột: placeID, reviews
"""

import os
import time
import csv
import json
import requests
import random
import urllib3
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

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

def search_pois_by_text(query: str, location: str = None, min_results: int = 65, max_results: int = 200):
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
                    "radius": 5000.0  # 5km radius
                }
            }
        except:
            pass
    
    # Tạo session với SSL verification disabled
    session = create_requests_session()
    
    all_pois = []
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
                
                # Chỉ lấy POI có số lượng reviews > 100
                if user_rating_count and user_rating_count > 100:
                    all_pois.append({
                        'place_id': place_id,
                        'name': name,
                        'user_rating_total': user_rating_count
                    })
                    valid_count += 1
                    print(f"   ✅ [{len(all_pois):3d}] {name[:50]:<50} | {user_rating_count:>6} reviews")
                else:
                    skipped_count += 1
                    if skipped_count <= 3:  # Chỉ hiển thị 3 POI đầu tiên bị bỏ qua
                        print(f"   ⏭️  [{skipped_count:3d}] {name[:50]:<50} | {user_rating_count:>6} reviews (bỏ qua)")
            
            if skipped_count > 3:
                print(f"   ⏭️  ... và {skipped_count - 3} POI khác bị bỏ qua (< 100 reviews)")
            
            print(f"   📊 Trang này: {valid_count} hợp lệ, {skipped_count} bỏ qua")
            
            # Kiểm tra điều kiện dừng
            if not next_page_token:
                print(f"\n   ⏹️  Không còn trang tiếp theo")
                if len(all_pois) < min_results:
                    print(f"   ⚠️  Cảnh báo: Chỉ lấy được {len(all_pois)}/{min_results} POI (thiếu {min_results - len(all_pois)} POI)")
                break
            
            if len(all_pois) >= max_results:
                print(f"\n   ✅ Đã đạt giới hạn {max_results} POI")
                break
            
            # Nếu đã đủ min_results nhưng chưa đạt max_results, vẫn tiếp tục để lấy thêm
            if len(all_pois) >= min_results and len(all_pois) < max_results:
                remaining = max_results - len(all_pois)
                print(f"   📈 Đã đủ {min_results} POI, tiếp tục lấy thêm {remaining} POI...")
            
            # Đợi một chút trước khi gọi request tiếp theo (tránh rate limit)
            print(f"   ⏳ Đợi 2 giây trước khi lấy trang tiếp theo...")
            time.sleep(2)
            
            # Xóa pageToken khỏi body để tránh lỗi nếu không có nextPageToken
            if 'pageToken' in body:
                del body['pageToken']
        
        print(f"\n{'═'*60}")
        print(f"✅ Hoàn tất: {len(all_pois)} POI hợp lệ từ {page_count} trang")
        print(f"{'═'*60}\n")
        return all_pois[:max_results]  # Giới hạn số lượng kết quả
        
    except Exception as e:
        print(f"❌ Lỗi khi gọi API: {e}")
        import traceback
        traceback.print_exc()
        return all_pois  # Trả về những gì đã lấy được

# User agents pool để randomize
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

# Viewport sizes để randomize
VIEWPORT_SIZES = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
]

def human_delay(min_seconds=0.5, max_seconds=2.0):
    """Random delay để mô phỏng hành vi con người"""
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)

def human_scroll(page, container=None, steps=3):
    """Scroll giống con người với random pauses"""
    if container:
        # Scroll trong container
        for i in range(steps):
            scroll_amount = random.randint(200, 500)
            try:
                page.evaluate(f"""
                    (container) => {{
                        container.scrollTop += {scroll_amount};
                    }}
                """, container.element_handle())
            except:
                # Fallback: scroll page
                page.mouse.wheel(0, scroll_amount)
            human_delay(0.3, 0.8)
    else:
        # Scroll trang
        for i in range(steps):
            scroll_amount = random.randint(300, 600)
            page.mouse.wheel(0, scroll_amount)
            human_delay(0.4, 1.0)

def setup_playwright_browser(playwright):
    """
    Thiết lập Playwright Browser với anti-detection
    """
    try:
        # Random user agent và viewport
        user_agent = random.choice(USER_AGENTS)
        viewport = random.choice(VIEWPORT_SIZES)
        
        # Launch browser với stealth mode và thêm args để tránh detection
        browser = playwright.chromium.launch(
            headless=True,  # Có thể đổi thành False để debug
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-infobars',
                '--disable-notifications',
                '--disable-popup-blocking',
                '--start-maximized',
                '--disable-extensions',
                '--disable-plugins-discovery',
                '--disable-default-apps',
            ]
        )
        
        # Tạo context với anti-detection settings
        context = browser.new_context(
            viewport=viewport,
            user_agent=user_agent,
            locale='en-US',
            timezone_id='America/New_York',
            permissions=['geolocation'],
            geolocation={'latitude': 10.8231, 'longitude': 106.6297},  # HCM coordinates
            color_scheme='light',
            # Thêm extra HTTP headers
            extra_http_headers={
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        )
        
        # Inject stealth scripts để ẩn automation (nâng cao)
        context.add_init_script("""
            // Override navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Override chrome object
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // Override platform
            Object.defineProperty(navigator, 'platform', {
                get: () => 'MacIntel'
            });
            
            // Override hardwareConcurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8
            });
            
            // Override deviceMemory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8
            });
            
            // Override getBattery
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1
                });
            }
            
            // Override connection
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 50,
                    downlink: 10,
                    saveData: false
                })
            });
        """)
        
        page = context.new_page()
        
        return browser, context, page
        
    except Exception as e:
        print(f"❌ Lỗi khi khởi tạo Playwright Browser: {e}")
        print("   Gợi ý: Chạy 'playwright install chromium' để cài đặt browser")
        return None, None, None

def scrape_reviews_from_google_maps(place_id: str, page, max_reviews: int = 150):
    """
    Scrape reviews từ Google Maps bằng Playwright với anti-detection
    
    Args:
        place_id: Place ID của POI
        page: Playwright Page instance
        max_reviews: Số lượng reviews tối đa cần lấy
    
    Returns:
        List các review text
    """
    # URL Google Maps cho place_id
    url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    
    reviews = []
    
    try:
        # Navigate với human-like behavior và retry logic
        max_retries = 3
        retry_count = 0
        navigation_success = False
        
        while retry_count < max_retries and not navigation_success:
            try:
                # Tăng timeout và dùng 'domcontentloaded' thay vì 'networkidle' để nhanh hơn
                page.goto(url, wait_until='domcontentloaded', timeout=60000)
                navigation_success = True
                human_delay(3.0, 5.0)  # Đợi trang load hoàn toàn
            except PlaywrightTimeoutError:
                retry_count += 1
                if retry_count < max_retries:
                    print(f"      ⚠️  Timeout lần {retry_count}, retry...")
                    human_delay(2.0, 4.0)  # Đợi trước khi retry
                else:
                    print(f"      ❌ Timeout sau {max_retries} lần thử")
                    return []
        
        if not navigation_success:
            return []
        
        # Random mouse movement để mô phỏng con người
        page.mouse.move(random.randint(100, 500), random.randint(100, 500))
        human_delay(0.5, 1.0)
        
        # Đợi thêm để đảm bảo trang đã load đầy đủ
        try:
            page.wait_for_load_state('networkidle', timeout=10000)
        except:
            pass  # Bỏ qua nếu timeout, trang có thể đã load đủ
        
        try:
            # Bước 1: Tìm và click vào button "Reviews" hoặc tab "Reviews"
            review_button_selectors = [
                "button[data-value='Reviews']",
                "button:has-text('Reviews')",
                "button[aria-label*='Review']",
                "//button[contains(text(), 'Reviews')]",
                "//span[contains(text(), 'Reviews')]/ancestor::button",
            ]
            
            review_button_clicked = False
            for selector in review_button_selectors:
                try:
                    if selector.startswith("//"):
                        button = page.locator(selector).first
                    else:
                        button = page.locator(selector).first
                    
                    if button.is_visible(timeout=2000):
                        # Human-like click với mouse movement
                        box = button.bounding_box()
                        if box:
                            # Move mouse đến button trước khi click
                            page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                            human_delay(0.2, 0.5)
                            button.click(timeout=5000)
                            review_button_clicked = True
                            human_delay(2.0, 3.5)  # Đợi phần reviews load
                            break
                except:
                    continue
            
            # Bước 2: Scroll xuống để tìm phần reviews nếu chưa click được
            if not review_button_clicked:
                human_scroll(page, steps=3)
                human_delay(1.0, 2.0)
            
            # Bước 3: Tìm phần tử feed chứa reviews (role="feed" hoặc aria-label liên quan đến reviews)
            review_feed = None
            
            # Thử tìm theo role="feed" trước (cách tốt nhất)
            try:
                feed_elements = page.locator('[role="feed"]').all()
                for feed in feed_elements:
                    if feed.is_visible(timeout=1000):
                        # Kiểm tra xem có liên quan đến reviews không
                        aria_label = feed.get_attribute('aria-label') or ''
                        if 'review' in aria_label.lower() or 'đánh giá' in aria_label.lower() or aria_label == '':
                            review_feed = feed
                            break
            except:
                pass
            
            # Nếu không tìm thấy, thử tìm theo aria-label
            if not review_feed:
                try:
                    feed_selectors = [
                        '[aria-label*="Review"]',
                        '[aria-label*="review"]',
                        '[aria-label*="Đánh giá"]',
                        '[aria-label*="đánh giá"]',
                        'div[role="feed"]',
                    ]
                    for selector in feed_selectors:
                        try:
                            feeds = page.locator(selector).all()
                            for feed in feeds:
                                if feed.is_visible(timeout=1000):
                                    review_feed = feed
                                    break
                            if review_feed:
                                break
                        except:
                            continue
                except:
                    pass
            
            # Fallback: Tìm container reviews truyền thống
            if not review_feed:
                review_container_selectors = [
                    "div.m6QErb[aria-label*='Review']",
                    "div[data-section-id='reviews']",
                    "div.m6QErb",
                ]
                
                for selector in review_container_selectors:
                    try:
                        containers = page.locator(selector).all()
                        for container in containers:
                            if container.is_visible(timeout=1000):
                                review_feed = container
                                break
                        if review_feed:
                            break
                    except:
                        continue
            
            # Bước 4: Scroll trong phần reviews feed để load thêm reviews
            scroll_attempts = 0
            max_scroll_attempts = 100  # Tăng lên 100 lần scroll
            last_review_count = 0
            no_change_count = 0
            min_scrolls_before_stop = 30  # Phải scroll ít nhất 30 lần trước khi có thể dừng
            
            while scroll_attempts < max_scroll_attempts and len(reviews) < max_reviews:
                scroll_attempts += 1
                
                # Human-like scroll với random delay
                if review_feed:
                    # Scroll trong feed element bằng JavaScript
                    try:
                        scroll_amount = random.randint(300, 800)  # Tăng scroll amount
                        # Dùng page.evaluate() để scroll phần tử feed
                        page.evaluate("""
                            (feedElement, scrollAmount) => {
                                if (feedElement) {
                                    // Scroll xuống
                                    feedElement.scrollTop += scrollAmount;
                                    
                                    // Hoặc scroll đến cuối nếu gần cuối
                                    const maxScroll = feedElement.scrollHeight - feedElement.clientHeight;
                                    if (feedElement.scrollTop + scrollAmount >= maxScroll * 0.9) {
                                        feedElement.scrollTop = feedElement.scrollHeight;
                                    }
                                }
                            }
                        """, review_feed.element_handle(), scroll_amount)
                    except Exception as e:
                        # Fallback: scroll page
                        try:
                            page.mouse.wheel(0, random.randint(400, 700))
                        except:
                            pass
                else:
                    # Scroll trang nếu không tìm thấy feed
                    human_scroll(page, steps=random.randint(1, 3))
                
                # Random delay để mô phỏng hành vi con người (1.5-3.5 giây)
                human_delay(1.5, 3.5)
                
                # Tìm và lấy reviews sau mỗi lần scroll
                review_texts = set()
                
                # Các selector cho Google Maps reviews
                selectors = [
                    "span.wiI7pd",
                    "div.MyEned span.wiI7pd",
                    "div.jftiEf span.wiI7pd",
                    "div[data-review-id] span.wiI7pd",
                    "span[data-review-id] span.wiI7pd",
                    "div.MyEned",
                ]
                
                for selector in selectors:
                    try:
                        elements = page.locator(selector).all()
                        for elem in elements:
                            try:
                                text = elem.inner_text(timeout=500).strip() if elem.is_visible(timeout=500) else ""
                                # Lọc text hợp lệ
                                if (text and 
                                    len(text) > 15 and 
                                    len(text) < 5000 and
                                    not text.isdigit() and
                                    not text.startswith('★') and
                                    ':' not in text[:15] and
                                    'See more' not in text and
                                    'Show more' not in text and
                                    'Helpful' not in text and
                                    'Translate' not in text):
                                    review_texts.add(text)
                            except:
                                continue
                    except:
                        continue
                
                # Cập nhật reviews
                current_count = len(review_texts)
                if current_count > last_review_count:
                    last_review_count = current_count
                    no_change_count = 0  # Reset counter khi có reviews mới
                else:
                    no_change_count += 1
                    # Chỉ dừng nếu đã scroll ít nhất min_scrolls_before_stop lần VÀ không có thay đổi trong 10 lần liên tiếp
                    if scroll_attempts >= min_scrolls_before_stop and no_change_count >= 10:
                        break
                
                # Cập nhật danh sách reviews
                reviews = list(review_texts)
            
            # Bước 5: Thử click "See more" hoặc "Show more reviews" nếu có
            try:
                see_more_selectors = [
                    "button:has-text('See more')",
                    "button:has-text('Show more')",
                    "//button[contains(text(), 'See more')]",
                    "//button[contains(text(), 'Show more')]",
                    "//button[@aria-label and contains(@aria-label, 'more')]",
                ]
                
                for selector in see_more_selectors:
                    try:
                        if selector.startswith("//"):
                            button = page.locator(selector).first
                        else:
                            button = page.locator(selector).first
                        
                        if button.is_visible(timeout=2000):
                            # Human-like click
                            box = button.bounding_box()
                            if box:
                                page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                                human_delay(0.2, 0.5)
                                button.click(timeout=5000)
                                human_delay(2.0, 3.0)
                                
                                # Scroll thêm sau khi click
                                if review_feed:
                                    for i in range(10):  # Tăng số lần scroll sau khi click
                                        try:
                                            scroll_amount = random.randint(300, 800)
                                            page.evaluate("""
                                                (feedElement, scrollAmount) => {
                                                    if (feedElement) {
                                                        feedElement.scrollTop += scrollAmount;
                                                    }
                                                }
                                            """, review_feed.element_handle(), scroll_amount)
                                            human_delay(0.5, 1.2)
                                        except:
                                            page.mouse.wheel(0, random.randint(400, 700))
                                            human_delay(0.6, 1.3)
                                else:
                                    human_scroll(page, steps=10)
                                
                                # Lấy lại reviews sau khi click
                                review_texts = set()
                                for selector in selectors:
                                    try:
                                        elements = page.locator(selector).all()
                                        for elem in elements:
                                            try:
                                                text = elem.inner_text(timeout=500).strip() if elem.is_visible(timeout=500) else ""
                                                if (text and 
                                                    len(text) > 15 and 
                                                    len(text) < 5000 and
                                                    not text.isdigit() and
                                                    not text.startswith('★') and
                                                    ':' not in text[:15] and
                                                    'See more' not in text and
                                                    'Show more' not in text and
                                                    'Helpful' not in text and
                                                    'Translate' not in text):
                                                    review_texts.add(text)
                                            except:
                                                continue
                                    except:
                                        continue
                                
                                reviews = list(review_texts)
                                break
                    except:
                        continue
            except:
                pass
            
            # Giới hạn số lượng reviews
            reviews = reviews[:max_reviews]
            
        except PlaywrightTimeoutError:
            print(f"      ⚠️  Timeout khi đợi reviews load")
        except Exception as e:
            print(f"      ⚠️  Lỗi: {str(e)[:100]}")
        
    except Exception as e:
        print(f"      ❌ Lỗi: {str(e)[:100]}")
    
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
]

def main():
    """
    Hàm chính để tìm POI và scrape reviews cho 20 thành phố nổi tiếng nhất ở Việt Nam
    """
    print("\n" + "="*60)
    print("SCRAPER POI REVIEWS - Google Places API + Playwright")
    print("Tự động chạy cho 20 thành phố nổi tiếng nhất ở Việt Nam")
    print("="*60)
    
    # Hỏi số lượng POI tối đa cho mỗi thành phố
    print("\n📋 Yêu cầu: Ít nhất 65 POI mỗi thành phố, tối đa 80 POI, mỗi POI có > 100 reviews")
    max_results_input = input("Số lượng POI tối đa cho mỗi thành phố (mặc định 80, nhấn Enter để dùng mặc định): ").strip()
    max_results_per_city = int(max_results_input) if max_results_input.isdigit() else 80
    min_results_per_city = 65  # Yêu cầu tối thiểu 65 POI
    
    # Hỏi có muốn scrape reviews không
    scrape_reviews = input("\nBạn có muốn scrape reviews từ Google Maps không? (y/n, mặc định: n): ").strip().lower()
    scrape_reviews = scrape_reviews == 'y'
    
    # Tạo thư mục reviews nếu chưa có
    os.makedirs('./reviews', exist_ok=True)
    
    # Lưu ý: Mỗi thread sẽ tạo browser riêng với Playwright
    # Điều này giúp tránh conflict và cho phép parallelization
    if scrape_reviews:
        print("\n🚀 Sẽ sử dụng Playwright với parallelization (mỗi thread có browser riêng)")
        print("   ⚡ Anti-detection: Random user agents, viewports, human-like behavior")
        print("   ⚡ Tốc độ sẽ nhanh hơn nhờ chạy song song nhiều browser")
    
    # Tổng hợp dữ liệu từ tất cả thành phố
    all_reviews_data = []
    all_pois_summary = []
    
    # Chạy cho từng thành phố
    for city_idx, city in enumerate(VIETNAM_CITIES, 1):
        print("\n" + "═"*70)
        print(f"🏙️  [{city_idx:2d}/{len(VIETNAM_CITIES)}] {city['name']}")
        print("═"*70)
        
        # Tạo query
        query = f"Địa điểm du lịch và thắng cảnh ở {city['name']}"
        location = f"{city['lat']},{city['lng']}"
        
        print(f"   🔍 Query: {query}")
        print(f"   📍 Location: ({city['lat']}, {city['lng']})")
        print(f"   📋 Yêu cầu: {min_results_per_city}-{max_results_per_city} POI, mỗi POI > 100 reviews")
        
        try:
            # Tìm kiếm POI với pagination
            pois = search_pois_by_text(query, location, min_results=min_results_per_city, max_results=max_results_per_city)
            
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
            
            # Scrape reviews nếu được yêu cầu
            if scrape_reviews:
                num_threads = min(4, len(pois))
                print(f"\n   📝 Scraping reviews cho {len(pois)} POI")
                print(f"   ⚡ Parallelization: {num_threads} threads")
                print(f"   {'─'*66}")
                
                # Thread-safe lock cho việc append vào all_reviews_data
                data_lock = Lock()
                
                def scrape_poi_reviews(poi_data):
                    """Wrapper function để scrape reviews cho một POI với Playwright"""
                    idx, poi = poi_data
                    browser = None
                    context = None
                    page = None
                    
                    try:
                        # Random delay trước khi bắt đầu để tránh rate limiting
                        human_delay(0.5, 2.0)
                        
                        # Tạo browser riêng cho mỗi thread với Playwright
                        with sync_playwright() as playwright:
                            browser, context, page = setup_playwright_browser(playwright)
                            
                            if not browser or not page:
                                print(f"      [{idx:3d}/{len(pois)}] ⚠️  Không thể tạo browser: {poi['name'][:40]}")
                                return []
                            
                            print(f"      [{idx:3d}/{len(pois)}] 🔄 {poi['name'][:45]:<45} | {poi['user_rating_total']:>6} reviews")
                            
                            reviews = scrape_reviews_from_google_maps(poi['place_id'], page, max_reviews=150)
                            
                            # Trả về cả số reviews để xử lý sau
                            review_count = len(reviews) if reviews else 0
                            
                            # Chỉ lưu POI có số reviews > 80
                            if review_count > 80:
                                print(f"      [{idx:3d}/{len(pois)}] ✅ {poi['name'][:45]:<45} | {review_count:>3d} reviews (đủ điều kiện > 80)")
                                return [(poi['place_id'], review_count, review) for review in reviews]
                            elif review_count > 0:
                                print(f"      [{idx:3d}/{len(pois)}] ⏭️  {poi['name'][:45]:<45} | {review_count:>3d} reviews (bỏ qua, < 80)")
                                return [(poi['place_id'], review_count, None)]  # Trả về với review_count nhưng không có reviews
                            else:
                                print(f"      [{idx:3d}/{len(pois)}] ⚠️  {poi['name'][:45]:<45} | 0 reviews")
                                return [(poi['place_id'], 0, None)]
                    except Exception as e:
                        error_msg = str(e)[:50]
                        if "Timeout" in error_msg:
                            print(f"      [{idx:3d}/{len(pois)}] ⏱️  {poi['name'][:45]:<45} | Timeout")
                        else:
                            print(f"      [{idx:3d}/{len(pois)}] ❌ {poi['name'][:45]:<45} | Lỗi: {error_msg}")
                        return []
                    finally:
                        # Cleanup với delay để tránh đóng quá nhanh
                        try:
                            human_delay(0.5, 1.0)
                            if page:
                                page.close()
                            if context:
                                context.close()
                            if browser:
                                browser.close()
                        except:
                            pass
                
                # Sử dụng ThreadPoolExecutor để parallelize
                max_workers = min(4, len(pois))  # Tối đa 4 threads để tránh quá tải
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # Submit tất cả tasks
                    future_to_poi = {
                        executor.submit(scrape_poi_reviews, (idx, poi)): poi 
                        for idx, poi in enumerate(pois, 1)
                    }
                    
                    # Xử lý kết quả khi hoàn thành
                    poi_review_counts = {}  # Đếm số reviews cho mỗi POI
                    for future in as_completed(future_to_poi):
                        poi = future_to_poi[future]
                        try:
                            results = future.result()
                            if results:
                                # Lấy place_id và review_count từ kết quả
                                place_id = results[0][0] if results else None
                                review_count = results[0][1] if results and len(results[0]) > 1 else 0
                                
                                if place_id:
                                    poi_review_counts[place_id] = review_count
                                
                                # Thread-safe append (chỉ append reviews nếu > 80)
                                if review_count > 80:
                                    with data_lock:
                                        for result in results:
                                            if len(result) > 2 and result[2] is not None:  # Có review text
                                                all_reviews_data.append({
                                                    'placeID': result[0],
                                                    'reviews': result[2]
                                                })
                        except Exception as e:
                            print(f"      ❌ Lỗi xử lý kết quả: {str(e)[:50]}")
                    
                    # Cập nhật all_pois_summary: chỉ giữ POI có > 80 reviews
                    filtered_pois_summary = []
                    for poi in pois:
                        place_id = poi['place_id']
                        review_count = poi_review_counts.get(place_id, 0)
                        if review_count > 80:
                            filtered_pois_summary.append({
                                'city': city['name'],
                                'place_id': place_id,
                                'name': poi['name'],
                                'user_rating_total': poi['user_rating_total']
                            })
                    
                    # Cập nhật all_pois_summary với filtered list (chỉ POI có > 80 reviews)
                    with data_lock:
                        all_pois_summary.extend(filtered_pois_summary)
                    
                    # Thống kê
                    total_pois = len(pois)
                    qualified_pois = len(filtered_pois_summary)
                    print(f"\n   ✅ Hoàn tất: {total_pois} POI đã xử lý, {qualified_pois} POI có > 80 reviews (đủ điều kiện)")
            else:
                # Nếu không scrape reviews, không lưu POI nào vào summary
                # (vì không biết số reviews thực tế)
                print(f"\n   ⚠️  Không scrape reviews, không lưu POI vào summary")
            
        except Exception as e:
            print(f"❌ Lỗi khi xử lý {city['name']}: {e}")
            import traceback
            traceback.print_exc()
            continue  # Tiếp tục với thành phố tiếp theo
        
        # Nghỉ giữa các thành phố
        if city_idx < len(VIETNAM_CITIES):
            print(f"\n   ⏳ Đợi 3 giây trước khi chuyển sang thành phố tiếp theo...\n")
            time.sleep(3)
    
    # Không cần đóng driver ở đây vì mỗi thread đã tự đóng driver của nó
    
    # Lưu summary POI
    summary_file = './reviews/pois_summary.csv'
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
    
    # Lưu reviews vào CSV (nếu có)
    if all_reviews_data:
        output_file = './reviews/all_reviews.csv'
        print(f"   📄 Đang lưu {len(all_reviews_data):,} reviews...")
        
        try:
            # Kiểm tra file đã tồn tại chưa để append hoặc tạo mới
            file_exists = os.path.exists(output_file)
            with open(output_file, 'a' if file_exists else 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['placeID', 'reviews'])
                if not file_exists:
                    writer.writeheader()
                writer.writerows(all_reviews_data)
            
            print(f"   ✅ Đã lưu {len(all_reviews_data):,} reviews → {output_file}")
            
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
            
            print(f"\n   📊 Thống kê theo thành phố:")
            print(f"   {'─'*66}")
            for city, stats in sorted(city_stats.items()):
                print(f"   {city:30s} | {stats['pois']:3d} POI | {stats['reviews']:6,} reviews")
            
        except Exception as e:
            print(f"   ❌ Lỗi khi lưu file CSV: {e}")
    else:
        print(f"   ⚠️  Không có reviews nào được scrape")
    
    # Tổng kết
    print(f"\n{'═'*70}")
    print(f"✅ HOÀN TẤT!")
    print(f"{'═'*70}")
    print(f"   🏙️  Thành phố đã xử lý: {len(VIETNAM_CITIES)}")
    print(f"   📍 Tổng số POI: {len(all_pois_summary):,}")
    if all_reviews_data:
        print(f"   📝 Tổng số reviews: {len(all_reviews_data):,}")
    print(f"   💾 File summary: {summary_file}")
    if all_reviews_data:
        print(f"   💾 File reviews: ./reviews/all_reviews.csv")
    print(f"{'═'*70}\n")

if __name__ == "__main__":
    main()

