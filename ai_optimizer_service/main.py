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

# Bộ não của ECS: Định nghĩa trọng số cho mỗi Mood

# --- 2. ĐỊNH NGHĨA DATA MODELS (PYDANTIC) ---
# Đây là "hợp đồng" dữ liệu mà NestJS PHẢI tuân theo khi gọi API này


class OptimizerRequest(BaseModel):
    """ Input cho API tối ưu lộ trình """
    poi_list: List[Dict[str, Any]]  # POI chưa có ecs_score (cần có: google_place_id, emotional_tags, location)
    user_mood: str  # Mood để tính ECS
    duration_days: int  # Số ngày du lịch
    current_location: Dict[str, float]  # { lat, lng } - vị trí hiện tại của user
    start_datetime: Optional[str] = None  # ISO 8601 datetime bắt đầu chuyến đi
    # Ngưỡng ECS tối thiểu (chỉ giữ POI có ecs_score > threshold này)
    ecs_score_threshold: float = 0.15
    # Ma trận ETA (phút) giữa các POIs, ví dụ: { "poiA": { "poiB": 12, ... }, ... }
    eta_matrix: Optional[Dict[str, Dict[str, float]]] = None
    # ETA từ vị trí hiện tại đến từng POI, ví dụ: { "poiA": 8, "poiB": 15 }
    eta_from_current: Optional[Dict[str, float]] = None




# --- Helpers: Google APIs ---
# Lưu ý: Hàm get_city_from_location đã được di chuyển sang Backend (NestJS)
# AI Optimizer Service chỉ tập trung vào tính ECS, kiểm tra giờ mở cửa, và tối ưu lộ trình

def fetch_distance_matrix_minutes(origin: Dict[str, float], destinations: List[Dict[str, Any]]) -> Dict[str, float]:
    """Return {poi_id: minutes} using Google Distance Matrix for origin -> each destination."""
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
        "&mode=driving&units=metric"
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

# --- 4. API DUY NHẤT: TÍNH ECS + TỐI ƯU LỘ TRÌNH ---
# Gộp 2 tác vụ (tính ECS và tối ưu lộ trình) vào cùng một endpoint
@app.post("/optimize-route")
async def optimize_route_endpoint(request: OptimizerRequest):
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
    
    def calculate_ecs_score(poi: Dict[str, Any], mood: str) -> float:
        """Tính ECS score cho một POI dựa trên mood"""
        weights = MOOD_WEIGHTS.get(mood, {})
        tags = poi.get('emotional_tags', {})
        ecs_score = 0.0
        for tag_name, weight in weights.items():
            ecs_score += tags.get(tag_name, 0.0) * weight
        return ecs_score

    # BƯỚC 1: Lọc POIs đang mở cửa tại thời điểm khởi hành (TỐI ƯU: lọc TRƯỚC khi tính ECS để giảm số lượng POI cần tính)
    print(f"Bước 1: Lọc POI đang mở cửa tại thời điểm khởi hành ({start_datetime.isoformat()})...")
    open_pois = []
    for poi in request.poi_list:
        # Sử dụng hàm is_poi_open_at_datetime để kiểm tra giờ mở cửa tại thời điểm khởi hành
        if is_poi_open_at_datetime(poi, start_datetime):
            open_pois.append(poi)
    print(f"  → Còn lại {len(open_pois)} POI sau khi lọc mở cửa (từ {len(request.poi_list)} POI)")

    # BƯỚC 2: Tính ECS cho các POI đã lọc (sau khi lọc mở cửa - ít POI hơn)
    print(f"Bước 2: Tính ECS cho {len(open_pois)} POI với mood '{request.user_mood}'...")
    scored_pois: List[Dict[str, Any]] = []
    for poi in open_pois:
        ecs_score = calculate_ecs_score(poi, request.user_mood)
        poi_with_score = poi.copy()
        poi_with_score['ecs_score'] = ecs_score
        scored_pois.append(poi_with_score)
    print(f"  → Đã tính ECS cho {len(scored_pois)} POI")

    # BƯỚC 3: Lọc POI có ecs_score > threshold
    print(f"Bước 3: Lọc POI có ecs_score > {request.ecs_score_threshold}...")
    high_score_pois: List[Dict[str, Any]] = []
    for poi in scored_pois:
        if poi.get('ecs_score', 0) > request.ecs_score_threshold:
            high_score_pois.append(poi)
    print(f"  → Còn lại {len(high_score_pois)} POI sau khi lọc theo ECS threshold")

    # Nếu thiếu eta_from_current, tính bằng Distance Matrix (sau khi lọc ECS)
    eta_from_current = request.eta_from_current or fetch_distance_matrix_minutes(
        request.current_location, high_score_pois
    )

    # BƯỚC 4: Sắp xếp theo điểm ECS (giảm dần) để ưu tiên POI phù hợp nhất
    candidates = sorted(high_score_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
    print(f"Bước 4: Sắp xếp {len(candidates)} POI theo ECS score...")

    # BƯỚC 5: Chọn toàn bộ POI và gom nhóm bằng K-means
    print(f"Bước 5: Gom nhóm tất cả {len(candidates)} POI bằng K-means sau khi áp dụng ECS threshold...")
    pois_per_day = 3
    total_pois_needed = request.duration_days * pois_per_day
    radius_limit_km = 10.0

    # Lọc POI theo bán kính 10km từ vị trí bắt đầu
    pois_within_radius: List[Dict[str, Any]] = []
    for poi in candidates:
        if within_start_radius(poi, radius_limit_km):
            pois_within_radius.append(poi)
    print(f"  → {len(pois_within_radius)} POI nằm trong bán kính {radius_limit_km}km từ vị trí bắt đầu.")

    if not pois_within_radius:
        print("❌ Không có POI nào trong bán kính yêu cầu. Không thể tạo lộ trình.")
        return {"optimized_route": []}

    selected_pois = pois_within_radius

    poi_coordinates: List[List[float]] = []
    poi_indices: List[int] = []
    for idx, poi in enumerate(selected_pois):
        location = poi.get('location', {})
        lat = location.get('lat')
        lng = location.get('lng')
        if lat is not None and lng is not None:
            poi_coordinates.append([lat, lng])
            poi_indices.append(idx)

    if not poi_coordinates:
        print("❌ Không có POI nào có tọa độ hợp lệ sau khi lọc bán kính.")
        return {"optimized_route": []}

    num_clusters = min(max(request.duration_days, 1), len(poi_coordinates))
    print(f"  → Thực hiện K-means với {num_clusters} cluster.")
    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(np.array(poi_coordinates))

    clusters: Dict[int, List[Dict[str, Any]]] = {}
    for cluster_id, poi_idx in zip(cluster_labels, poi_indices):
        clusters.setdefault(cluster_id, []).append(selected_pois[poi_idx])

    sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]), reverse=True)

    cluster_sequences: List[Tuple[int, List[Dict[str, Any]]]] = []
    for cluster_id, cluster_pois in sorted_clusters:
        non_restaurant_pois = [p for p in cluster_pois if not is_restaurant_poi(p)]
        if not non_restaurant_pois:
            print(f"  ⚠️  Cluster {cluster_id} chỉ toàn nhà hàng. Bỏ qua.")
            continue
        sorted_list = sorted(non_restaurant_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
        cluster_sequences.append((cluster_id, sorted_list))
        print(f"  → Cluster {cluster_id} có {len(sorted_list)} POI (loại nhà hàng).")

    global_pool = sorted(
        [p for p in selected_pois if not is_restaurant_poi(p)],
        key=lambda p: p.get('ecs_score', 0),
        reverse=True,
    )
    global_pointer = 0
    used_poi_ids: set = set()

    def pick_from_global() -> Optional[Dict[str, Any]]:
        nonlocal global_pointer
        while global_pointer < len(global_pool):
            poi = global_pool[global_pointer]
            global_pointer += 1
            pid = get_poi_id(poi)
            if pid and pid not in used_poi_ids:
                return poi
        return None

    cluster_pointers: Dict[int, int] = {cluster_id: 0 for cluster_id, _ in cluster_sequences}
    daily_poi_groups: List[List[Dict[str, Any]]] = []
    cluster_count = len(cluster_sequences)

    for day in range(request.duration_days):
        day_pois: List[Dict[str, Any]] = []
        if cluster_count > 0:
            attempts = 0
            start_idx = day % cluster_count
            while len(day_pois) < pois_per_day and attempts < cluster_count * pois_per_day:
                cluster_id, cluster_list = cluster_sequences[(start_idx + attempts) % cluster_count]
                ptr = cluster_pointers[cluster_id]
                while ptr < len(cluster_list):
                    poi = cluster_list[ptr]
                    ptr += 1
                    pid = get_poi_id(poi)
                    if pid and pid not in used_poi_ids:
                        day_pois.append(poi)
                        used_poi_ids.add(pid)
                        break
                cluster_pointers[cluster_id] = ptr
                if len(day_pois) >= pois_per_day:
                    break
                attempts += 1

        while len(day_pois) < pois_per_day:
            fallback_poi = pick_from_global()
            if not fallback_poi:
                break
            pid = get_poi_id(fallback_poi)
            if pid and pid not in used_poi_ids:
                day_pois.append(fallback_poi)
                used_poi_ids.add(pid)

        if day_pois:
            daily_poi_groups.append(day_pois)
            print(f"  → Ngày {day + 1}: {len(day_pois)} POI được chọn.")
        else:
            print(f"  ⚠️  Ngày {day + 1}: Không có POI nào được phân bổ.")
            daily_poi_groups.append([])

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

            visit_duration = poi.get('visit_duration_minutes') or poi.get('estimated_visit_minutes') or DEFAULT_VISIT_DURATION_MINUTES
            if not isinstance(visit_duration, (int, float)) or visit_duration <= 0:
                visit_duration = DEFAULT_VISIT_DURATION_MINUTES

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



# --- 5. LỆNH CHẠY SERVER ---
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


