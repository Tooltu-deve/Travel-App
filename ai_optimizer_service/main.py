import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple
import os
import requests
from dotenv import load_dotenv
import math
from datetime import datetime, timedelta
from copy import deepcopy
import time
import numpy as np
from sklearn.cluster import KMeans

# --- 1. KHỞI TẠO VÀ CẤU HÌNH ---
load_dotenv()
app = FastAPI(title="AI Optimizer Service")

GOOGLE_DISTANCE_MATRIX_API_KEY = os.getenv("GOOGLE_DISTANCE_MATRIX_API_KEY", "")
GOOGLE_GEOCODING_API_KEY = os.getenv("GOOGLE_GEOCODING_API_KEY", "") or os.getenv("GOOGLE_DISTANCE_MATRIX_API_KEY", "")

MOOD_WEIGHTS = {
    "Yên tĩnh & Thư giãn": {
        "peaceful": 1.0, "scenic": 0.8, "seaside": 0.7,
        "lively": -0.9, "festive": -0.8, "touristy": -0.7
    },
    "Náo nhiệt & Xã hội": {
        "lively": 1.0, "festive": 0.9, "touristy": 0.7,
        "peaceful": -0.9, "spiritual": -0.6
    },
    "Lãng mạn & Riêng tư": {
        "romantic": 1.0, "scenic": 0.8, "peaceful": 0.7,
        "lively": -0.9, "festive": -0.8, "touristy": -0.7
    },
    "Điểm thu hút khách du lịch": {
        "touristy": 1.0, "lively": 0.8, "festive": 0.7,
        "local_gem": -0.8, "spiritual": -0.6
    },
    "Mạo hiểm & Thú vị": {
        "adventurous": 1.0, "scenic": 0.8, "seaside": 0.7,
        "peaceful": -0.9, "spiritual": -0.7
    },
    "Gia đình & Thoải mái": {
        "family-friendly": 1.0, "scenic": 0.8, "peaceful": 0.7,
        "adventurous": -0.8, "festive": -0.6
    },
    "Hiện đại & Sáng tạo": {
        "modern": 1.0, "lively": 0.7, "adventurous": 0.5,
        "historical": -1.0, "spiritual": -0.8, "local_gem": -0.7
    },
    "Tâm linh & Tôn giáo": {
        "spiritual": 1.0, "historical": 0.8, "peaceful": 0.7,
        "modern": -1.0, "adventurous": -0.7, "lively": -0.6
    },
    "Địa phương & Đích thực": {
        "local_gem": 1.0, "historical": 0.8, "peaceful": 0.7,
        "touristy": -1.0, "modern": -0.8, "lively": -0.7
    },
    "Cảnh quan thiên nhiên": {
        "scenic": 1.0, "peaceful": 0.9, "seaside": 0.8,
        "lively": -0.7, "festive": -0.6, "touristy": -0.5
    },
    "Lễ hội & Sôi động": {
        "festive": 1.0, "lively": 0.9, "touristy": 0.7,
        "peaceful": -1.0, "scenic": -0.8, "spiritual": -0.6
    },
    "Ven biển & Nghỉ dưỡng": {
        "seaside": 1.0, "scenic": 0.9, "peaceful": 0.8,
        "historical": -0.6, "spiritual": -0.5
    },
}

DEFAULT_VISIT_DURATION_MINUTES = 120
DAY_NAME_TO_INDEX = {
    "MONDAY": 0,
    "TUESDAY": 1,
    "WEDNESDAY": 2,
    "THURSDAY": 3,
    "FRIDAY": 4,
    "SATURDAY": 5,
    "SUNDAY": 6,
}

# Thời gian tham quan ước tính dựa trên loại địa điểm (phút)
VISIT_DURATION_BY_TYPE = {
    # Bảo tàng, di tích lịch sử - thời gian dài
    'museum': 90,
    'art_gallery': 90,
    'historical': 120,
    'cultural_center': 90,
    
    # Công viên, thiên nhiên - thời gian trung bình đến dài
    'park': 60,
    'natural_feature': 90,
    'scenic': 75,
    'hiking_area': 120,
    
    # Chùa, đền, di tích tâm linh - thời gian ngắn đến trung bình
    'church': 45,
    'temple': 45,
    'place_of_worship': 45,
    'spiritual': 45,
    
    # Điểm tham quan du lịch - thời gian trung bình
    'tourist_attraction': 75,
    'point_of_interest': 60,
    'landmark': 60,
    
    # Mua sắm - thời gian trung bình
    'shopping_mall': 90,
    'market': 60,
    'store': 45,
    
    # Giải trí - thời gian dài
    'amusement_park': 180,
    'zoo': 120,
    'aquarium': 120,
    
    # Biển, bãi tắm - thời gian dài
    'beach': 120,
    'seaside': 120,
    
    # Cafe, quán - thời gian ngắn
    'cafe': 45,
    'coffee_shop': 45,
    'bar': 60,
    
    # Nhà hàng - thời gian trung bình
    'restaurant': 60,
    'food': 60,
}

def get_estimated_visit_duration(poi: Dict[str, Any]) -> int:
    """
    Tính thời gian tham quan ước tính dựa trên loại địa điểm.
    Ưu tiên: visit_duration_minutes từ DB > estimated_visit_minutes > tính theo type > default
    """
    # Ưu tiên 1: Nếu đã có visit_duration_minutes trong DB
    if poi.get('visit_duration_minutes'):
        return int(poi['visit_duration_minutes'])
    
    # Ưu tiên 2: Nếu có estimated_visit_minutes
    if poi.get('estimated_visit_minutes'):
        return int(poi['estimated_visit_minutes'])
    
    # Ưu tiên 3: Tính dựa trên types
    types = []
    if isinstance(poi.get('type'), str):
        types.append(poi['type'].lower())
    if isinstance(poi.get('types'), list):
        types.extend([str(t).lower() for t in poi['types']])
    
    # Tìm duration phù hợp nhất dựa trên types
    for poi_type in types:
        if poi_type in VISIT_DURATION_BY_TYPE:
            return VISIT_DURATION_BY_TYPE[poi_type]
    
    # Ưu tiên 4: Default dựa trên category chung
    if any(t in types for t in ['museum', 'art_gallery', 'historical', 'cultural']):
        return 90
    if any(t in types for t in ['park', 'natural', 'scenic', 'beach', 'seaside']):
        return 75
    if any(t in types for t in ['church', 'temple', 'spiritual', 'place_of_worship']):
        return 45
    if any(t in types for t in ['shopping', 'market', 'store']):
        return 60
    
    # Default fallback
    return DEFAULT_VISIT_DURATION_MINUTES

# Bộ não của ECS: Định nghĩa trọng số cho mỗi Mood

# --- 2. ĐỊNH NGHĨA DATA MODELS (PYDANTIC) ---
# Đây là "hợp đồng" dữ liệu mà NestJS PHẢI tuân theo khi gọi API này


class OptimizerRequest(BaseModel):
    """ Input cho API tối ưu lộ trình """
    poi_list: List[Dict[str, Any]]  # POI chưa có ecs_score (cần có: google_place_id, emotional_tags, location)
    user_mood: List[str]  # Mood để tính ECS (có thể nhiều mood)
    duration_days: int  # Số ngày du lịch
    current_location: Dict[str, float]  # { lat, lng } - vị trí hiện tại của user
    start_datetime: Optional[str] = None  # ISO 8601 datetime bắt đầu chuyến đi
    # Ngưỡng ECS tối thiểu (chỉ giữ POI có ecs_score > threshold này)
    ecs_score_threshold: float = 0.3
    # Ma trận ETA (phút) giữa các POIs, ví dụ: { "poiA": { "poiB": 12, ... }, ... }
    eta_matrix: Optional[Dict[str, Dict[str, float]]] = None
    # ETA từ vị trí hiện tại đến từng POI, ví dụ: { "poiA": 8, "poiB": 15 }
    eta_from_current: Optional[Dict[str, float]] = None
    # Travel mode cho Distance Matrix (driving/walking/bicycling/transit)
    travel_mode: Optional[str] = "driving"
    # Số POI mỗi ngày (fallback 3 nếu không truyền)
    poi_per_day: Optional[int] = 3




# --- Helpers: Google APIs ---
# Lưu ý: Hàm get_city_from_location đã được di chuyển sang Backend (NestJS)
# AI Optimizer Service chỉ tập trung vào tính ECS, kiểm tra giờ mở cửa, và tối ưu lộ trình

def fetch_distance_matrix_minutes(origin: Dict[str, float], destinations: List[Dict[str, Any]], mode: str = "driving") -> Dict[str, float]:
    """Return {poi_id: minutes} using Google Distance Matrix for origin -> each destination. Supports travel mode."""
    if not GOOGLE_DISTANCE_MATRIX_API_KEY or not destinations:
        return {}
    origins_param = f"{origin['lat']},{origin['lng']}"
    dest_param_list = []
    poi_ids: List[str] = []
    for d in destinations:
        loc = d.get('location') or {}
        lat, lng = loc.get('lat'), loc.get('lng')
        pid = d.get('google_place_id') or d.get('id') or d.get('_id')
        if lat is None or lng is None or not pid:
            continue
        dest_param_list.append(f"{lat},{lng}")
        poi_ids.append(pid)
    if not dest_param_list:
        return {}
    url = (
        "https://maps.googleapis.com/maps/api/distancematrix/json"
        f"?origins={origins_param}"
        f"&destinations={'|'.join(dest_param_list)}"
        f"&mode={mode or 'driving'}&units=metric"
        f"&key={GOOGLE_DISTANCE_MATRIX_API_KEY}"
    )
    try:
        res = requests.get(url, timeout=15)
        data = res.json()
        result: Dict[str, float] = {}
        rows = data.get('rows', [])
        if rows and 'elements' in rows[0]:
            elements = rows[0]['elements']
            for i, el in enumerate(elements):
                if i >= len(poi_ids):
                    break
                if el.get('status') == 'OK' and 'duration' in el:
                    minutes = float(el['duration']['value']) / 60.0
                    result[poi_ids[i]] = minutes
        return result
    except Exception:
        return {}


def parse_iso_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    dt_candidate = dt_str.strip()
    if not dt_candidate:
        return None
    if dt_candidate.endswith('Z'):
        dt_candidate = dt_candidate[:-1] + '+00:00'
    try:
        return datetime.fromisoformat(dt_candidate)
    except ValueError:
        try:
            return datetime.fromisoformat(dt_candidate.replace(' ', 'T'))
        except ValueError:
            print(f"⚠️  Không thể parse datetime từ chuỗi: {dt_str}")
            return None


def to_day_index(day_value: Any) -> Optional[int]:
    if day_value is None:
        return None
    if isinstance(day_value, int):
        return max(0, min(6, day_value))
    if isinstance(day_value, str):
        upper = day_value.strip().upper()
        return DAY_NAME_TO_INDEX.get(upper)
    return None


def minutes_since_midnight(dt: datetime) -> int:
    return dt.hour * 60 + dt.minute


def parse_time_string(time_str: str) -> Optional[int]:
    time_candidate = time_str.strip()
    if not time_candidate:
        return None
    normalized = time_candidate.replace('–', '-').replace('—', '-').strip()
    formats = ["%I:%M %p", "%I %p", "%H:%M", "%H.%M"]
    for fmt in formats:
        try:
            parsed = datetime.strptime(normalized, fmt)
            return parsed.hour * 60 + parsed.minute
        except ValueError:
            continue
    return None


def is_poi_open_at_datetime(poi: Dict[str, Any], arrival_dt: datetime) -> bool:
    opening_data = poi.get('opening_hours')
    if not opening_data or not isinstance(opening_data, dict):
        opening_data = poi.get('regularOpeningHours') or poi.get('openingHours')
    if not opening_data or not isinstance(opening_data, dict):
        # Không có dữ liệu giờ mở cửa → mặc định cho phép
        return True

    arrival_minutes = minutes_since_midnight(arrival_dt)
    arrival_day = arrival_dt.weekday()

    periods = opening_data.get('periods') or opening_data.get('regularPeriods')
    if isinstance(periods, list) and periods:
        for period in periods:
            if not isinstance(period, dict):
                continue
            open_info = period.get('open') or {}
            close_info = period.get('close') or {}
            open_day = to_day_index(open_info.get('day'))
            close_day = to_day_index(close_info.get('day'))
            open_hour = open_info.get('hour')
            open_minute = open_info.get('minute', 0)
            close_hour = close_info.get('hour')
            close_minute = close_info.get('minute', 0)

            if open_day is None and close_day is None:
                continue

            open_minutes = (open_hour or 0) * 60 + open_minute
            if close_hour is not None:
                close_minutes = close_hour * 60 + close_minute
            else:
                close_minutes = 24 * 60  # Mặc định đến hết ngày nếu không có close

            if close_day is None:
                close_day = open_day

            if open_day is None:
                open_day = close_day if close_day is not None else arrival_day

            if open_day is None:
                continue

            if close_day == open_day:
                if arrival_day == open_day and open_minutes <= arrival_minutes < close_minutes:
                    return True
            else:
                # Thời gian vượt qua nửa đêm
                if arrival_day == open_day and arrival_minutes >= open_minutes:
                    return True
                if arrival_day == close_day and arrival_minutes < close_minutes:
                    return True
                # Trường hợp mở nhiều ngày liên tiếp (ví dụ open thứ 6, đóng thứ 7)
                span = (close_day - open_day) % 7
                diff = (arrival_day - open_day) % 7
                if span > 1 and diff < span:
                    return True

    weekday_descriptions = opening_data.get('weekdayDescriptions') or opening_data.get('weekdayDescriptionsText')
    if isinstance(weekday_descriptions, list) and weekday_descriptions:
        arrival_day_name = arrival_dt.strftime('%A').lower()
        for desc in weekday_descriptions:
            if not isinstance(desc, str) or ':' not in desc:
                continue
            day_part, hours_part = desc.split(':', 1)
            if day_part.strip().lower() != arrival_day_name:
                continue
            hours_text = hours_part.strip()
            if not hours_text or hours_text.lower() == 'closed':
                continue
            intervals = [segment.strip() for segment in hours_text.replace('–', '-').split(',') if segment.strip()]
            for interval in intervals:
                if '-' not in interval:
                    continue
                start_str, end_str = [p.strip() for p in interval.split('-', 1)]
                start_minutes = parse_time_string(start_str)
                end_minutes = parse_time_string(end_str)
                if start_minutes is None or end_minutes is None:
                    continue
                if end_minutes <= start_minutes:
                    # Qua nửa đêm
                    if arrival_minutes >= start_minutes or arrival_minutes < end_minutes:
                        return True
                else:
                    if start_minutes <= arrival_minutes < end_minutes:
                        return True
    # Không xác định được giờ mở cửa → giả định có thể tới
    return True




# --- 3. HEALTH CHECK ENDPOINTS ---
# Render sẽ health check bằng GET /, cần endpoint này để tránh 404
@app.get("/")
async def root():
    """Root endpoint cho health check"""
    return {
        "status": "ok",
        "service": "AI Optimizer Service",
        "message": "Service is running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "AI Optimizer Service"
    }

# --- 4. API ENDPOINTS ---

# 4.1: Endpoint cho CHATBOT (fast, không K-Means, round-robin distribution)
@app.post("/optimize")
async def optimize_for_chatbot(request: OptimizerRequest):
    """
    Tối ưu lộ trình dựa trên ECS score và user mood.
    
    Nhận: 
      - poi_list: danh sách POI đã được Backend lọc (theo thành phố, budget, bán kính)
      - user_mood: mood để tính ECS
      - duration_days: số ngày du lịch
      - current_location: vị trí hiện tại của user { lat, lng }
      - start_datetime: thời gian khởi hành (ISO 8601, optional)
      - ecs_score_threshold: ngưỡng ECS tối thiểu (mặc định: 0.0)
      - eta_matrix: ma trận thời gian di chuyển (phút) giữa các POIs (optional)
      - eta_from_current: thời gian di chuyển (phút) từ vị trí hiện tại đến từng POI (optional)
    
    Quy trình:
      1) Lọc POI đang mở cửa tại thời điểm khởi hành (TỐI ƯU: lọc TRƯỚC khi tính ECS)
      2) Tính ECS cho các POI đã lọc
      3) Lọc POI có ecs_score > threshold
      4) Sắp xếp theo ECS và phân bổ POI theo ngày
      5) Tối ưu thứ tự thăm cho từng ngày bằng heuristic nearest-neighbor dựa trên ETA
    
    Trả về: Lộ trình đã được tối ưu (chưa có encoded_polyline và travel_duration_minutes)
            Backend sẽ enrich với Directions API sau khi nhận kết quả này.
    """
    print(f"Nhận yêu cầu tối ưu cho {request.duration_days} ngày với threshold ECS = {request.ecs_score_threshold}")
    print(f"  → Nhận được {len(request.poi_list)} POI đã được Backend lọc (thành phố, budget, bán kính)")

    start_datetime = parse_iso_datetime(request.start_datetime)
    if not start_datetime:
        print("⚠️  Không nhận được start_datetime hợp lệ. Sử dụng thời gian hiện tại UTC làm mặc định.")
        start_datetime = datetime.utcnow()

    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371.0
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def get_poi_id(p: Dict[str, Any]) -> str:
        return p.get('google_place_id') or p.get('id') or p.get('_id')

    def get_poi_types(poi: Dict[str, Any]) -> List[str]:
        result: List[str] = []
        poi_type = poi.get('type')
        if isinstance(poi_type, str):
            result.append(poi_type.lower())
        types_field = poi.get('types')
        if isinstance(types_field, list):
            result.extend([str(t).lower() for t in types_field])
        elif isinstance(types_field, str):
            result.append(types_field.lower())
        return list({t for t in result if t})

    def is_restaurant_poi(poi: Dict[str, Any]) -> bool:
        """
        Kiểm tra POI có phải là nhà hàng không.
        CHÚ Ý: Cafe/Coffee shop thường là điểm du lịch văn hóa, KHÔNG nên loại!
        Chỉ loại POI có type CHÍNH là restaurant hoặc food establishment.
        """
        types = get_poi_types(poi)
        
        # CHỈ loại nếu POI có các type này và KHÔNG có type du lịch/văn hóa
        strict_restaurant_keywords = {'restaurant', 'food', 'dining', 'meal_takeaway', 'meal_delivery'}
        tourist_keywords = {'tourist_attraction', 'point_of_interest', 'cultural', 'museum', 'park'}
        
        # Nếu có type du lịch/văn hóa → KHÔNG loại (dù có cafe/coffee)
        if any(keyword in types for keyword in tourist_keywords):
            return False
        
        # Chỉ loại nếu có strict restaurant keywords
        return any(keyword in types for keyword in strict_restaurant_keywords)

    def within_start_radius(poi: Dict[str, Any], max_distance_km: float) -> bool:
        location = poi.get('location', {}) or {}
        lat = location.get('lat')
        lng = location.get('lng')
        if lat is None or lng is None:
            return False
        start_lat = request.current_location.get('lat')
        start_lng = request.current_location.get('lng')
        if start_lat is None or start_lng is None:
            return False
        distance = haversine_km(lat, lng, start_lat, start_lng)
        return distance <= max_distance_km
    
    def calculate_ecs_score_single(poi: Dict[str, Any], mood: str) -> float:
        """Tính ECS score cho một POI dựa trên 1 mood"""
        weights = MOOD_WEIGHTS.get(mood, {})
        tags = poi.get('emotional_tags', {})
        ecs_score = 0.0
        for tag_name, weight in weights.items():
            ecs_score += tags.get(tag_name, 0.0) * weight
        return ecs_score

    def calculate_ecs_score(poi: Dict[str, Any], moods: Any) -> float:
        """
        Tính ECS score cho POI dựa trên danh sách mood.
        - Nếu moods là chuỗi: tính theo 1 mood
        - Nếu là list: tính cho từng mood và lấy max để ưu tiên mood phù hợp nhất
        """
        if isinstance(moods, str):
            return calculate_ecs_score_single(poi, moods)
        if isinstance(moods, list):
            scores = [calculate_ecs_score_single(poi, str(m)) for m in moods if m is not None]
            return max(scores) if scores else 0.0
        return 0.0

    # BƯỚC 1: Lọc POIs đang mở cửa tại thời điểm khởi hành (TỐI ƯU: lọc TRƯỚC khi tính ECS để giảm số lượng POI cần tính)
    print(f"Bước 1: Lọc POI đang mở cửa tại thời điểm khởi hành ({start_datetime.isoformat()})...")
    open_pois = []
    for poi in request.poi_list:
        # Sử dụng hàm is_poi_open_at_datetime để kiểm tra giờ mở cửa tại thời điểm khởi hành
        if is_poi_open_at_datetime(poi, start_datetime):
            open_pois.append(poi)
    print(f"  → Còn lại {len(open_pois)} POI sau khi lọc mở cửa (từ {len(request.poi_list)} POI)")

    # BƯỚC 2: Tính ECS cho các POI đã lọc (sau khi lọc mở cửa - ít POI hơn)
    print(f"Bước 2: Tính ECS cho {len(open_pois)} POI với mood {request.user_mood}...")
    scored_pois: List[Dict[str, Any]] = []
    for poi in open_pois:
        ecs_score = calculate_ecs_score(poi, request.user_mood)
        poi_with_score = poi.copy()
        poi_with_score['ecs_score'] = ecs_score
        scored_pois.append(poi_with_score)
    print(f"  → Đã tính ECS cho {len(scored_pois)} POI")

    # BƯỚC 3: Lọc POI có ecs_score >= threshold (đổi từ > thành >= để bao gồm threshold=0.0)
    print(f"Bước 3: Lọc POI có ecs_score >= {request.ecs_score_threshold}...")
    high_score_pois: List[Dict[str, Any]] = []
    for poi in scored_pois:
        if poi.get('ecs_score', 0) >= request.ecs_score_threshold:
            high_score_pois.append(poi)
    print(f"  → Còn lại {len(high_score_pois)} POI sau khi lọc theo ECS threshold")

    # Nếu thiếu eta_from_current, tính bằng Distance Matrix (sau khi lọc ECS)
    # Dùng travel mode mặc định driving (có thể mở rộng lấy từ request nếu cần)
    eta_mode = request.travel_mode or "driving"
    eta_from_current = request.eta_from_current or fetch_distance_matrix_minutes(
        request.current_location, high_score_pois, mode=eta_mode
    )

    # BƯỚC 4: Sắp xếp theo điểm ECS (giảm dần) để ưu tiên POI phù hợp nhất
    candidates = sorted(high_score_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
    print(f"Bước 4: Sắp xếp {len(candidates)} POI theo ECS score...")

    # BƯỚC 5: Phân bổ POI đều cho các ngày (đơn giản và hiệu quả)
    print(f"Bước 5: Phân bổ {len(candidates)} POI đều cho {request.duration_days} ngày...")
    
    # Lọc ra POI không phải nhà hàng
    non_restaurant_pois = []
    restaurants_removed = []
    for p in candidates:
        if is_restaurant_poi(p):
            restaurants_removed.append(p.get('name', 'Unknown'))
        else:
            non_restaurant_pois.append(p)
    
    print(f"  → {len(non_restaurant_pois)} POI sau khi loại nhà hàng (loại {len(restaurants_removed)} POI)")
    if restaurants_removed:
        print(f"  → Nhà hàng đã loại: {', '.join(restaurants_removed[:3])}...")
    
    if not non_restaurant_pois:
        print(f"❌ Không có POI nào sau khi loại nhà hàng. Tất cả {len(candidates)} POI đều là nhà hàng.")
        # Debug: in ra types của một vài POI
        for poi in candidates[:3]:
            types = get_poi_types(poi)
            print(f"  → POI '{poi.get('name')}' có types: {types}")
        return {"optimized_route": []}

    # Kiểm tra số lượng POI tối thiểu
    MIN_POIS_PER_DAY = 3
    required_pois = MIN_POIS_PER_DAY * request.duration_days
    
    if len(non_restaurant_pois) < required_pois:
        print(f"⚠️  Cảnh báo: Chỉ có {len(non_restaurant_pois)} POI cho {request.duration_days} ngày")
        print(f"  → Cần tối thiểu {required_pois} POI ({MIN_POIS_PER_DAY} POI/ngày)")
        print(f"  → Backend cần lọc với bán kính lớn hơn hoặc giảm ECS threshold")
    
    # Phân bổ đều POI cho các ngày (round-robin)
    daily_poi_groups: List[List[Dict[str, Any]]] = [[] for _ in range(request.duration_days)]
    
    for idx, poi in enumerate(non_restaurant_pois):
        day_idx = idx % request.duration_days
        daily_poi_groups[day_idx].append(poi)
    
    # Kiểm tra và cảnh báo cho từng ngày
    for day_idx, day_pois in enumerate(daily_poi_groups, start=1):
        status = "✅" if len(day_pois) >= MIN_POIS_PER_DAY else "⚠️"
        print(f"  {status} Ngày {day_idx}: {len(day_pois)} POI được phân bổ")

    # Hàm helper để tính ETA giữa 2 POI
    def eta_between(a_id: str, b_id: str, fallback_list: Optional[List[Dict[str, Any]]] = None) -> float:
        if request.eta_matrix and a_id in request.eta_matrix and b_id in request.eta_matrix[a_id]:
            return float(request.eta_matrix[a_id][b_id])
        use_list = fallback_list or candidates
        # Fallback: 30 km/h ≈ 2 phút/km
        pa = next((p for p in use_list if get_poi_id(p) == a_id), None)
        pb = next((p for p in use_list if get_poi_id(p) == b_id), None)
        if not pa or not pb:
            return 9999.0
        la, lo = pa.get('location', {}).get('lat'), pa.get('location', {}).get('lng')
        lb, lblo = pb.get('location', {}).get('lat'), pb.get('location', {}).get('lng')
        if la is None or lo is None or lb is None or lblo is None:
            return 9999.0
        km = haversine_km(la, lo, lb, lblo)
        return km * 2.0

    # Hàm helper để tính ETA từ vị trí hiện tại đến POI
    def eta_from_current_for(p: Dict[str, Any]) -> float:
        pid = get_poi_id(p)
        if eta_from_current and pid in eta_from_current:
            return float(eta_from_current[pid])
        # fallback theo khoảng cách
        loc = p.get('location', {})
        plat, plng = loc.get('lat'), loc.get('lng')
        if plat is None or plng is None:
            return 9999.0
        cur_lat = request.current_location.get('lat')
        cur_lng = request.current_location.get('lng')
        if cur_lat is None or cur_lng is None:
            return 9999.0
        km = haversine_km(cur_lat, cur_lng, plat, plng)
        return km * 2.0

    # Hàm tối ưu lộ trình cho một ngày
    def optimize_route_for_day(day_pois: List[Dict[str, Any]], day_number: int, day_start_time: datetime) -> List[Dict[str, Any]]:
        """Tối ưu thứ tự thăm POI cho một ngày bằng Nearest Neighbor heuristic và tính thời gian đến"""
        if not day_pois:
            return []
        
        remaining = day_pois.copy()
        selected_order: List[Dict[str, Any]] = []

        # Bước đầu: chọn POI gần nhất từ vị trí hiện tại (hoặc từ POI cuối của ngày trước)
        start = min(remaining, key=eta_from_current_for)
        selected_order.append(start)
        remaining.remove(start)

        # Lặp lại: chọn POI gần nhất từ POI cuối cùng
        while remaining:
            last = selected_order[-1]
            last_id = get_poi_id(last)
            next_poi = min(remaining, key=lambda p: eta_between(last_id, get_poi_id(p), candidates))
            selected_order.append(next_poi)
            remaining.remove(next_poi)

        # Tính lịch trình dựa trên thứ tự đã chọn
        schedule: List[Dict[str, Any]] = []
        current_time = day_start_time
        previous_poi: Optional[Dict[str, Any]] = None

        for poi in selected_order:
            if previous_poi is None:
                travel_minutes = eta_from_current_for(poi)
            else:
                travel_minutes = eta_between(get_poi_id(previous_poi), get_poi_id(poi), candidates)

            if travel_minutes >= 9999.0:
                print(f"  ⚠️  Không xác định được ETA tới POI {get_poi_id(poi)}. Bỏ qua POI này.")
                continue

            arrival_time = current_time + timedelta(minutes=travel_minutes)

            if not is_poi_open_at_datetime(poi, arrival_time):
                print(f"  ⚠️  POI {get_poi_id(poi)} đóng cửa tại {arrival_time.isoformat()}. Bỏ qua.")
                continue

            poi_with_timing = deepcopy(poi)
            poi_with_timing['estimated_arrival'] = arrival_time.isoformat()

            # Sử dụng hàm mới để tính visit_duration dựa trên place_type
            visit_duration = get_estimated_visit_duration(poi)
            poi_with_timing['visit_duration_minutes'] = visit_duration

            departure_time = arrival_time + timedelta(minutes=visit_duration)
            poi_with_timing['estimated_departure'] = departure_time.isoformat()

            schedule.append(poi_with_timing)
            current_time = departure_time
            previous_poi = poi

        return schedule

    # BƯỚC 7: Tối ưu thứ tự thăm cho từng ngày
    print(f"Bước 7: Tối ưu thứ tự thăm cho từng ngày bằng Nearest Neighbor heuristic...")
    daily_plan: List[Dict[str, Any]] = []
    
    for day_idx, day_pois in enumerate(daily_poi_groups, start=1):
        day_start_time = start_datetime + timedelta(days=day_idx - 1)
        optimized_day_pois = optimize_route_for_day(day_pois, day_idx, day_start_time)
        if optimized_day_pois:
            daily_plan.append(
                {
                    "day": day_idx,
                    "activities": optimized_day_pois,
                    "day_start_time": day_start_time.isoformat(),
                }
            )
            print(f"  → Ngày {day_idx}: {len(optimized_day_pois)} POI (đã tối ưu)")
        else:
            print(
                f"  ⚠️  Ngày {day_idx}: không còn POI nào khả dụng sau khi kiểm tra giờ mở cửa."
            )

    total_pois = sum(len(day.get('activities', [])) for day in daily_plan)
    print(f"✅ Hoàn tất! Tạo lộ trình {len(daily_plan)} ngày với tổng {total_pois} POI")
    print(f"  → Backend sẽ enrich với Directions API sau khi nhận kết quả này")
    
    return {"optimized_route": daily_plan}


# 4.2: Endpoint cho ROUTE PREVIEW (with K-Means clustering, better quality)
@app.post("/optimize-route")
async def optimize_with_kmeans(request: OptimizerRequest):
    """
    Tối ưu lộ trình sử dụng K-Means clustering (cho Route Preview).
    Đây là code gốc với K-Means, phù hợp cho việc tạo route preview chất lượng cao.
    
    Khác với /optimize (dùng cho chatbot):
    - K-Means: Gom nhóm POI theo vị trí địa lý thông minh hơn
    - Phân bổ POI đều hơn theo ngày
    - Chất lượng route tốt hơn nhưng chậm hơn
    
    Chatbot dùng /optimize (fast, round-robin)
    Frontend route preview dùng /optimize-route (K-Means, quality)
    """
    print(f"🔬 K-Means Optimization: Nhận yêu cầu cho {request.duration_days} ngày")
    print(f"  → Nhận được {len(request.poi_list)} POI")
    
    start_datetime = parse_iso_datetime(request.start_datetime)
    if not start_datetime:
        print("⚠️  Không nhận được start_datetime hợp lệ. Sử dụng thời gian hiện tại UTC.")
        start_datetime = datetime.utcnow()

    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371.0
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def get_poi_id(p: Dict[str, Any]) -> str:
        return p.get('google_place_id') or p.get('id') or p.get('_id')

    def get_poi_types(poi: Dict[str, Any]) -> List[str]:
        result: List[str] = []
        poi_type = poi.get('type')
        if isinstance(poi_type, str):
            result.append(poi_type.lower())
        types_field = poi.get('types')
        if isinstance(types_field, list):
            result.extend([str(t).lower() for t in types_field])
        elif isinstance(types_field, str):
            result.append(types_field.lower())
        return list({t for t in result if t})

    def is_restaurant_poi(poi: Dict[str, Any]) -> bool:
        types = get_poi_types(poi)
        restaurant_keywords = {'restaurant', 'food', 'dining', 'cafe', 'coffee', 'bakery'}
        return any(keyword in types for keyword in restaurant_keywords)

    def within_start_radius(poi: Dict[str, Any], max_distance_km: float) -> bool:
        location = poi.get('location', {}) or {}
        lat = location.get('lat')
        lng = location.get('lng')
        if lat is None or lng is None:
            return False
        start_lat = request.current_location.get('lat')
        start_lng = request.current_location.get('lng')
        if start_lat is None or start_lng is None:
            return False
        distance = haversine_km(lat, lng, start_lat, start_lng)
        return distance <= max_distance_km
    
    def calculate_ecs_score_single(poi: Dict[str, Any], mood: str) -> float:
        weights = MOOD_WEIGHTS.get(mood, {})
        tags = poi.get('emotional_tags', {})
        ecs_score = 0.0
        for tag_name, weight in weights.items():
            ecs_score += tags.get(tag_name, 0.0) * weight
        return ecs_score

    def calculate_ecs_score(poi: Dict[str, Any], moods: Any) -> float:
        if isinstance(moods, str):
            return calculate_ecs_score_single(poi, moods)
        if isinstance(moods, list):
            scores = [calculate_ecs_score_single(poi, str(m)) for m in moods if m is not None]
            return max(scores) if scores else 0.0
        return 0.0

    # BƯỚC 1: Lọc mở cửa
    print(f"Bước 1: Lọc POI mở cửa...")
    open_pois = [poi for poi in request.poi_list if is_poi_open_at_datetime(poi, start_datetime)]
    print(f"  → {len(open_pois)} POI mở cửa")

    # BƯỚC 2: Tính ECS
    print(f"Bước 2: Tính ECS...")
    scored_pois = []
    for poi in open_pois:
        poi_copy = poi.copy()
        poi_copy['ecs_score'] = calculate_ecs_score(poi, request.user_mood)
        scored_pois.append(poi_copy)

    # BƯỚC 3: Lọc theo threshold
    print(f"Bước 3: Lọc ECS >= {request.ecs_score_threshold}...")
    high_score_pois = [p for p in scored_pois if p.get('ecs_score', 0) >= request.ecs_score_threshold]
    print(f"  → {len(high_score_pois)} POI đạt threshold")

    eta_from_current = request.eta_from_current or fetch_distance_matrix_minutes(
        request.current_location, high_score_pois
    )

    candidates = sorted(high_score_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)

    # BƯỚC 4: K-MEANS CLUSTERING
    print(f"Bước 4: K-Means clustering...")
    radius_limit_km = 15.0
    pois_within_radius = [poi for poi in candidates if within_start_radius(poi, radius_limit_km)]
    print(f"  → {len(pois_within_radius)} POI trong bán kính {radius_limit_km}km")

    if not pois_within_radius:
        return {"optimized_route": []}

    poi_coordinates = []
    poi_indices = []
    for idx, poi in enumerate(pois_within_radius):
        loc = poi.get('location', {})
        lat, lng = loc.get('lat'), loc.get('lng')
        if lat is not None and lng is not None:
            poi_coordinates.append([lat, lng])
            poi_indices.append(idx)

    if not poi_coordinates:
        return {"optimized_route": []}

    num_clusters = min(max(request.duration_days, 1), len(poi_coordinates))
    print(f"  → Chạy K-Means với {num_clusters} clusters...")
    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(np.array(poi_coordinates))

    clusters: Dict[int, List[Dict[str, Any]]] = {}
    for cluster_id, poi_idx in zip(cluster_labels, poi_indices):
        clusters.setdefault(cluster_id, []).append(pois_within_radius[poi_idx])

    sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]), reverse=True)

    # Danh sách mood (có thể là 1 hoặc nhiều mood)
    moods_list = request.user_mood if isinstance(request.user_mood, list) else [request.user_mood]
    if not moods_list:
        moods_list = ['']  # fallback tránh lỗi chia 0

    cluster_sequences = []
    cluster_mood_rank: Dict[int, Dict[str, List[Dict[str, Any]]]] = {}
    cluster_mood_ptr: Dict[int, Dict[str, int]] = {}
    for cluster_id, cluster_pois in sorted_clusters:
        non_restaurant_pois = [p for p in cluster_pois if not is_restaurant_poi(p)]
        if not non_restaurant_pois:
            continue
        sorted_list = sorted(non_restaurant_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
        cluster_sequences.append((cluster_id, sorted_list))
        # Sắp xếp theo từng mood để lấy POI phù hợp nhất cho mood đó
        cluster_mood_rank[cluster_id] = {}
        cluster_mood_ptr[cluster_id] = {}
        for mood in moods_list:
            ranked = sorted(
                non_restaurant_pois,
                key=lambda p: calculate_ecs_score_single(p, str(mood)),
                reverse=True,
            )
            cluster_mood_rank[cluster_id][str(mood)] = ranked
            cluster_mood_ptr[cluster_id][str(mood)] = 0
        print(f"  → Cluster {cluster_id}: {len(sorted_list)} POI")

    # BƯỚC 5: Phân bổ POI theo ngày từ clusters
    print(f"Bước 5: Phân bổ POI theo ngày từ K-Means clusters...")
    pois_per_day = request.poi_per_day or 3
    base_pool = [p for p in pois_within_radius if not is_restaurant_poi(p)]

    # Global pool sắp xếp theo từng mood
    global_pool_rank: Dict[str, List[Dict[str, Any]]] = {}
    global_pool_ptr: Dict[str, int] = {}
    for mood in moods_list:
        ranked = sorted(
            base_pool,
            key=lambda p: calculate_ecs_score_single(p, str(mood)),
            reverse=True,
        )
        global_pool_rank[str(mood)] = ranked
        global_pool_ptr[str(mood)] = 0
    used_poi_ids = set()

    def pick_from_global(mood: str):
        ptr = global_pool_ptr.get(mood, 0)
        pool = global_pool_rank.get(mood, [])
        while ptr < len(pool):
            poi = pool[ptr]
            ptr += 1
            pid = get_poi_id(poi)
            if pid and pid not in used_poi_ids:
                global_pool_ptr[mood] = ptr
                return poi
        global_pool_ptr[mood] = ptr
        return None

    cluster_pointers = {cluster_id: 0 for cluster_id, _ in cluster_sequences}
    daily_poi_groups = []

    for day in range(request.duration_days):
        day_pois = []
        mood_count = len(moods_list)
        if cluster_sequences:
            attempts = 0
            start_idx = day % len(cluster_sequences)
            while len(day_pois) < pois_per_day and attempts < len(cluster_sequences) * pois_per_day:
                cluster_id, cluster_list = cluster_sequences[(start_idx + attempts) % len(cluster_sequences)]
                # Mood cho slot hiện tại (round-robin moods)
                mood = str(moods_list[len(day_pois) % mood_count])

                # Lấy POI tốt nhất cho mood từ cluster này
                mood_ptr = cluster_mood_ptr[cluster_id][mood]
                mood_rank = cluster_mood_rank[cluster_id][mood]
                chosen = None
                while mood_ptr < len(mood_rank):
                    poi = mood_rank[mood_ptr]
                    mood_ptr += 1
                    pid = get_poi_id(poi)
                    if pid and pid not in used_poi_ids:
                        chosen = poi
                        break
                cluster_mood_ptr[cluster_id][mood] = mood_ptr

                # Nếu chưa chọn được cho mood, fallback sang danh sách chung của cluster
                if not chosen:
                    ptr = cluster_pointers[cluster_id]
                    while ptr < len(cluster_list):
                        poi = cluster_list[ptr]
                        ptr += 1
                        pid = get_poi_id(poi)
                        if pid and pid not in used_poi_ids:
                            chosen = poi
                            cluster_pointers[cluster_id] = ptr
                            break
                    cluster_pointers[cluster_id] = ptr

                if chosen:
                    day_pois.append(chosen)
                    used_poi_ids.add(get_poi_id(chosen))

                if len(day_pois) >= pois_per_day:
                    break
                attempts += 1

        while len(day_pois) < pois_per_day:
            mood = str(moods_list[len(day_pois) % mood_count])
            fallback_poi = pick_from_global(mood)
            if not fallback_poi:
                break
            pid = get_poi_id(fallback_poi)
            if pid and pid not in used_poi_ids:
                day_pois.append(fallback_poi)
                used_poi_ids.add(pid)

        daily_poi_groups.append(day_pois)
        print(f"  → Ngày {day + 1}: {len(day_pois)} POI")

    # Helper functions
    def eta_between(a_id: str, b_id: str) -> float:
        if request.eta_matrix and a_id in request.eta_matrix and b_id in request.eta_matrix[a_id]:
            return float(request.eta_matrix[a_id][b_id])
        pa = next((p for p in candidates if get_poi_id(p) == a_id), None)
        pb = next((p for p in candidates if get_poi_id(p) == b_id), None)
        if not pa or not pb:
            return 9999.0
        la, lo = pa.get('location', {}).get('lat'), pa.get('location', {}).get('lng')
        lb, lblo = pb.get('location', {}).get('lat'), pb.get('location', {}).get('lng')
        if la is None or lo is None or lb is None or lblo is None:
            return 9999.0
        return haversine_km(la, lo, lb, lblo) * 2.0

    def eta_from_current_for(p: Dict[str, Any]) -> float:
        pid = get_poi_id(p)
        if eta_from_current and pid in eta_from_current:
            return float(eta_from_current[pid])
        loc = p.get('location', {})
        plat, plng = loc.get('lat'), loc.get('lng')
        if plat is None or plng is None:
            return 9999.0
        cur_lat, cur_lng = request.current_location.get('lat'), request.current_location.get('lng')
        if cur_lat is None or cur_lng is None:
            return 9999.0
        return haversine_km(cur_lat, cur_lng, plat, plng) * 2.0

    # BƯỚC 6: Tối ưu thứ tự trong ngày
    print(f"Bước 6: Tối ưu thứ tự POI cho từng ngày...")
    
    def optimize_day(day_pois, day_num, day_start):
        if not day_pois:
            return []
        remaining = day_pois.copy()
        ordered = []
        start = min(remaining, key=eta_from_current_for)
        ordered.append(start)
        remaining.remove(start)
        while remaining:
            last_id = get_poi_id(ordered[-1])
            next_poi = min(remaining, key=lambda p: eta_between(last_id, get_poi_id(p)))
            ordered.append(next_poi)
            remaining.remove(next_poi)
        
        schedule = []
        current_time = day_start
        prev_poi = None
        for poi in ordered:
            travel_min = eta_from_current_for(poi) if prev_poi is None else eta_between(get_poi_id(prev_poi), get_poi_id(poi))
            if travel_min >= 9999:
                continue
            arrival = current_time + timedelta(minutes=travel_min)
            if not is_poi_open_at_datetime(poi, arrival):
                continue
            poi_copy = deepcopy(poi)
            poi_copy['estimated_arrival'] = arrival.isoformat()
            duration = poi.get('visit_duration_minutes', DEFAULT_VISIT_DURATION_MINUTES)
            departure = arrival + timedelta(minutes=duration)
            poi_copy['estimated_departure'] = departure.isoformat()
            schedule.append(poi_copy)
            current_time = departure
            prev_poi = poi
        return schedule

    daily_plan = []
    for day_idx, day_pois in enumerate(daily_poi_groups, start=1):
        day_start = start_datetime + timedelta(days=day_idx - 1)
        optimized = optimize_day(day_pois, day_idx, day_start)
        if optimized:
            daily_plan.append({
                "day": day_idx,
                "activities": optimized,
                "day_start_time": day_start.isoformat()
            })
            print(f"  → Ngày {day_idx}: {len(optimized)} POI (optimized)")

    total = sum(len(d.get('activities', [])) for d in daily_plan)
    print(f"✅ K-Means done! {len(daily_plan)} ngày, {total} POI total")
    return {"optimized_route": daily_plan}


# --- 5. LỆNH CHẠY SERVER ---
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


