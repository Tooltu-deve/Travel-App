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
import heapq
from sklearn.cluster import KMeans

# --- 1. KHỞI TẠO VÀ CẤU HÌNH ---
load_dotenv()
app = FastAPI(title="AI Optimizer Service")

# Debug logging config (set to True to see detailed opening hours checks)
DEBUG_LOGGING = True

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
    """
    Parse ISO datetime string trực tiếp như Vietnam time.
    Frontend gửi thời gian local (Vietnam time) dạng YYYY-MM-DDTHH:mm:ss (không có Z).
    Backend pass through, AI optimizer parse trực tiếp không cần convert timezone.
    """
    if not dt_str:
        return None
    dt_candidate = dt_str.strip()
    if not dt_candidate:
        return None
    # Nếu có Z hoặc +00:00 thì loại bỏ (legacy support)
    if dt_candidate.endswith('Z'):
        dt_candidate = dt_candidate[:-1]
    if '+' in dt_candidate:
        dt_candidate = dt_candidate.split('+')[0]
    try:
        # Parse trực tiếp như Vietnam time, không cần convert
        dt_vietnam = datetime.fromisoformat(dt_candidate)
        print(f"  🕐 Parse datetime: {dt_candidate} → Vietnam {dt_vietnam.isoformat()}")
        return dt_vietnam
    except ValueError:
        try:
            dt_vietnam = datetime.fromisoformat(dt_candidate.replace(' ', 'T'))
            print(f"  🕐 Parse datetime: {dt_candidate} → Vietnam {dt_vietnam.isoformat()}")
            return dt_vietnam
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


def is_poi_open_at_datetime(poi: Dict[str, Any], arrival_dt: datetime, strict_mode: bool = False) -> bool:
    """
    Kiểm tra POI có mở cửa tại thời điểm arrival_dt không.
    
    Args:
        poi: Thông tin POI
        arrival_dt: Thời gian dự kiến đến
        strict_mode: Nếu True, POI không có opening_hours sẽ được kiểm tra theo giờ mặc định (6h-22h)
                    Nếu False (default), POI không có opening_hours sẽ được cho phép
    
    Fallback order (ƯU TIÊN periods TRƯỚC vì có cấu trúc rõ ràng):
        1. opening_hours.periods (từ Google Places API - dữ liệu có cấu trúc)
        2. opening_hours.weekdayDescriptions (dạng text, khó parse hơn)
        3. regularOpeningHours / openingHours 
        4. weekdayDescriptions trực tiếp từ POI (fallback cuối)
        5. strict_mode check (6h-22h) nếu không có data
    
    QUAN TRỌNG: Nếu có opening_hours data nhưng giờ không khớp → return False (đóng cửa)
    """
    poi_name = poi.get('name', 'Unknown POI')
    
    # === TÌM OPENING DATA ===
    # Ưu tiên 1: opening_hours object
    opening_data = poi.get('opening_hours')
    if not opening_data or not isinstance(opening_data, dict):
        opening_data = poi.get('regularOpeningHours') or poi.get('openingHours')
    
    # Ưu tiên 2: Fallback sang weekdayDescriptions trực tiếp từ POI nếu không có opening_hours
    if not opening_data or not isinstance(opening_data, dict):
        # Thử lấy weekdayDescriptions trực tiếp từ POI
        weekday_descriptions_fallback = poi.get('weekdayDescriptions')
        if weekday_descriptions_fallback and isinstance(weekday_descriptions_fallback, list):
            if DEBUG_LOGGING:
                print(f"    ℹ️  {poi_name}: Dùng weekdayDescriptions fallback từ POI")
            # Tạo opening_data giả với weekdayDescriptions
            opening_data = {'weekdayDescriptions': weekday_descriptions_fallback}
    
    # Không có bất kỳ dữ liệu giờ mở cửa nào
    if not opening_data or not isinstance(opening_data, dict):
        if strict_mode:
            # Strict mode: Giả định POI mở cửa từ 6h-22h (giờ hợp lý cho du lịch)
            arrival_hour = arrival_dt.hour
            if arrival_hour < 6 or arrival_hour >= 22:
                if DEBUG_LOGGING:
                    print(f"    ❌ {poi_name}: Không có opening_hours, giờ {arrival_hour}h ngoài khung 6h-22h → Loại")
                return False
            if DEBUG_LOGGING:
                print(f"    ✅ {poi_name}: Không có opening_hours, giờ {arrival_hour}h trong khung 6h-22h → Cho phép")
            return True
        else:
            # Non-strict mode: Mặc định cho phép
            return True

    arrival_minutes = minutes_since_midnight(arrival_dt)
    arrival_day = arrival_dt.weekday()  # Python: Monday=0, Sunday=6
    
    # DEBUG: Log dữ liệu opening_hours nhận được
    if DEBUG_LOGGING:
        periods_data = opening_data.get('periods') if opening_data else None
        weekday_data = opening_data.get('weekdayDescriptions') if opening_data else None
        print(f"    🔍 {poi_name}: arrival={arrival_dt.strftime('%A %H:%M')} (day={arrival_day})")
        print(f"       periods={len(periods_data) if periods_data else 0} entries, weekdayDescriptions={len(weekday_data) if weekday_data else 0} entries")
        if periods_data and len(periods_data) > 0:
            print(f"       First period: {periods_data[0]}")
    
    # Flag để theo dõi xem đã tìm thấy data hợp lệ chưa
    has_valid_opening_data = False

    # ✅ BƯỚC 1: ƯU TIÊN kiểm tra periods TRƯỚC (dữ liệu có cấu trúc, dễ xử lý)
    periods = opening_data.get('periods') or opening_data.get('regularPeriods')
    if isinstance(periods, list) and periods:
        for period in periods:
            if not isinstance(period, dict):
                continue
            open_info = period.get('open') or {}
            close_info = period.get('close') or {}
            
            # Google API dùng: 0=Sunday, 1=Monday, ..., 6=Saturday
            # Python weekday(): Monday=0, ..., Sunday=6
            # Cần convert Google format sang Python format
            google_open_day = open_info.get('day')
            google_close_day = close_info.get('day')
            
            # Convert Google day (0=Sun, 1=Mon) sang Python day (0=Mon, 6=Sun)
            if google_open_day is not None:
                open_day = (google_open_day - 1) % 7 if google_open_day > 0 else 6
            else:
                open_day = None
                
            if google_close_day is not None:
                close_day = (google_close_day - 1) % 7 if google_close_day > 0 else 6
            else:
                close_day = None
            
            open_hour = open_info.get('hour')
            open_minute = open_info.get('minute', 0)
            close_hour = close_info.get('hour')
            close_minute = close_info.get('minute', 0)

            if open_day is None and close_day is None:
                continue
            
            # Đánh dấu có data hợp lệ
            has_valid_opening_data = True

            open_minutes = (open_hour or 0) * 60 + open_minute
            if close_hour is not None:
                close_minutes = close_hour * 60 + close_minute
            else:
                close_minutes = 24 * 60

            if close_day is None:
                close_day = open_day

            if open_day is None:
                open_day = close_day if close_day is not None else arrival_day

            if open_day is None:
                continue

            if close_day == open_day:
                # Cùng ngày
                if arrival_day == open_day and open_minutes <= arrival_minutes < close_minutes:
                    if DEBUG_LOGGING:
                        print(f"    ✅ {poi_name}: Mở cửa (periods): {open_hour}:{open_minute:02d} - {close_hour}:{close_minute:02d}, arrival={arrival_dt.strftime('%H:%M')}")
                    return True
            else:
                # Thời gian vượt qua nửa đêm
                if arrival_day == open_day and arrival_minutes >= open_minutes:
                    if DEBUG_LOGGING:
                        print(f"    ✅ {poi_name}: Mở cửa (qua đêm - open day): từ {open_hour}:{open_minute:02d}")
                    return True
                if arrival_day == close_day and arrival_minutes < close_minutes:
                    if DEBUG_LOGGING:
                        print(f"    ✅ {poi_name}: Mở cửa (qua đêm - close day): đến {close_hour}:{close_minute:02d}")
                    return True
                span = (close_day - open_day) % 7
                diff = (arrival_day - open_day) % 7
                if span > 1 and diff < span:
                    if DEBUG_LOGGING:
                        print(f"    ✅ {poi_name}: Mở cửa (nhiều ngày liên tiếp)")
                    return True
        
        # Đã check hết periods nhưng không match → ĐÓNG CỬA
        if has_valid_opening_data:
            if DEBUG_LOGGING:
                print(f"    ❌ {poi_name}: Có periods nhưng không match, arrival={arrival_dt.strftime('%A %H:%M')} (day={arrival_day}) → Đóng cửa")
            return False

    # ✅ BƯỚC 2: FALLBACK sang weekdayDescriptions nếu không có periods hoặc periods rỗng
    weekday_descriptions = opening_data.get('weekdayDescriptions') or opening_data.get('weekdayDescriptionsText')
    if isinstance(weekday_descriptions, list) and weekday_descriptions:
        # Map tiếng Anh và tiếng Việt
        arrival_day_name_en = arrival_dt.strftime('%A').lower()  # monday, tuesday...
        arrival_day_name_vi_map = {
            'monday': 'thứ hai', 'tuesday': 'thứ ba', 'wednesday': 'thứ tư',
            'thursday': 'thứ năm', 'friday': 'thứ sáu', 'saturday': 'thứ bảy',
            'sunday': 'chủ nhật'
        }
        arrival_day_name_vi = arrival_day_name_vi_map.get(arrival_day_name_en, arrival_day_name_en)
        
        for desc in weekday_descriptions:
            if not isinstance(desc, str) or ':' not in desc:
                continue
            
            # Split "Monday: 8:00 AM – 5:00 PM" thành ["Monday", "8:00 AM – 5:00 PM"]
            parts = desc.split(':', 1)
            if len(parts) != 2:
                continue
            
            day_part = parts[0].strip().lower()
            hours_part = parts[1].strip()
            
            # Kiểm tra khớp ngày (hỗ trợ cả EN và VI)
            if day_part not in [arrival_day_name_en, arrival_day_name_vi]:
                continue
            
            # Đã tìm thấy mô tả cho ngày này
            has_valid_opening_data = True
            
            # Format 1: "Closed" → đóng cửa
            if not hours_part or hours_part.lower() == 'closed':
                if DEBUG_LOGGING:
                    print(f"    ❌ {poi_name}: {day_part} = Closed → Loại")
                return False
            
            # Format 2: "Open 24 hours" → mở cửa cả ngày
            if 'open 24 hours' in hours_part.lower() or '24 hours' in hours_part.lower():
                if DEBUG_LOGGING:
                    print(f"    ✅ {poi_name}: {day_part} = Open 24 hours → Cho phép")
                return True
            
            # Format 3: "8:00 AM – 5:00 PM" hoặc nhiều khoảng thời gian
            normalized_hours = hours_part.replace('–', '-').replace('—', '-').replace('−', '-')
            intervals = [segment.strip() for segment in normalized_hours.split(',') if segment.strip()]
            
            for interval in intervals:
                if '-' not in interval:
                    continue
                
                time_parts = interval.split('-', 1)
                if len(time_parts) != 2:
                    continue
                
                start_str = time_parts[0].strip()
                end_str = time_parts[1].strip()
                
                start_minutes = parse_time_string(start_str)
                end_minutes = parse_time_string(end_str)
                
                if start_minutes is None or end_minutes is None:
                    if DEBUG_LOGGING:
                        print(f"    ⚠️  {poi_name}: Không parse được: '{interval}'")
                    continue
                
                # Kiểm tra xem arrival_minutes có nằm trong khoảng [start, end) không
                if end_minutes <= start_minutes:
                    # Qua nửa đêm (ví dụ: 10:00 PM - 2:00 AM)
                    if arrival_minutes >= start_minutes or arrival_minutes < end_minutes:
                        if DEBUG_LOGGING:
                            print(f"    ✅ {poi_name}: Mở cửa (qua đêm): {start_str} - {end_str}, arrival={arrival_minutes}min")
                        return True
                else:
                    # Trong ngày (ví dụ: 8:00 AM - 5:00 PM)
                    if start_minutes <= arrival_minutes < end_minutes:
                        if DEBUG_LOGGING:
                            print(f"    ✅ {poi_name}: Mở cửa: {start_str} - {end_str}, arrival={arrival_minutes}min")
                        return True
            
            # Đã tìm thấy mô tả ngày nhưng không match giờ → ĐÓNG CỬA
            if DEBUG_LOGGING:
                print(f"    ❌ {poi_name}: {day_part} mở {hours_part}, arrival={arrival_dt.strftime('%H:%M')} ({arrival_minutes}min) → Ngoài giờ mở cửa")
            return False
        
        # Không tìm thấy ngày trong weekdayDescriptions → đánh dấu không có data
        # (có thể POI đóng cửa ngày đó hoặc data không đầy đủ)
        if has_valid_opening_data:
            if DEBUG_LOGGING:
                print(f"    ❌ {poi_name}: weekdayDescriptions không có thông tin cho {arrival_day_name_en} → Đóng cửa")
            return False

    # ❗ CÓ opening_hours object nhưng không có periods/weekdayDescriptions hợp lệ
    # Fallback: kiểm tra theo giờ hợp lý (6h-22h)
    arrival_hour = arrival_dt.hour
    if arrival_hour < 6 or arrival_hour >= 22:
        if DEBUG_LOGGING:
            print(f"    ❌ {poi_name}: opening_hours không parse được, giờ {arrival_hour}h ngoài khung 6h-22h → Loại")
        return False
    
    if DEBUG_LOGGING:
        print(f"    ✅ {poi_name}: opening_hours không parse được, giờ {arrival_hour}h trong khung 6h-22h → Cho phép")
    return True


def get_earliest_opening_time(poi: Dict[str, Any], after_time: datetime) -> Optional[datetime]:
    """
    Tìm thời điểm mở cửa sớm nhất của POI sau after_time.
    
    Returns:
        datetime: Thời điểm mở cửa sớm nhất (cùng ngày hoặc ngày sau)
        None: Không tìm thấy opening hours hoặc không parse được
    """
    opening_data = poi.get('opening_hours') or poi.get('regularOpeningHours') or poi.get('openingHours')
    if not opening_data or not isinstance(opening_data, dict):
        return None
    
    # Ưu tiên periods
    periods = opening_data.get('periods') or opening_data.get('regularPeriods')
    if isinstance(periods, list) and periods:
        earliest_opens = []
        
        for period in periods:
            if not isinstance(period, dict):
                continue
            open_info = period.get('open') or {}
            google_open_day = open_info.get('day')
            open_hour = open_info.get('hour')
            open_minute = open_info.get('minute', 0)
            
            if google_open_day is None or open_hour is None:
                continue
            
            # Convert Google day sang Python day
            if google_open_day > 0:
                open_day = (google_open_day - 1) % 7
            else:
                open_day = 6
            
            # Tính toán datetime cho ngày mở cửa
            after_day = after_time.weekday()
            
            # Tìm ngày gần nhất có open_day
            days_until_open = (open_day - after_day) % 7
            if days_until_open == 0:
                # Cùng ngày - kiểm tra giờ
                opening_datetime = after_time.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0)
                if opening_datetime > after_time:
                    earliest_opens.append(opening_datetime)
                else:
                    # Đã qua giờ mở cửa hôm nay, lấy tuần sau
                    opening_datetime = opening_datetime + timedelta(days=7)
                    earliest_opens.append(opening_datetime)
            else:
                # Ngày khác trong tuần
                opening_datetime = after_time.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0)
                opening_datetime = opening_datetime + timedelta(days=days_until_open)
                earliest_opens.append(opening_datetime)
        
        if earliest_opens:
            return min(earliest_opens)
    
    # Fallback: weekdayDescriptions
    weekday_descriptions = opening_data.get('weekdayDescriptions')
    if isinstance(weekday_descriptions, list) and weekday_descriptions:
        # Parse first available time from descriptions
        for desc in weekday_descriptions:
            if not isinstance(desc, str) or ':' not in desc:
                continue
            
            parts = desc.split(':', 1)
            if len(parts) != 2:
                continue
            
            hours_part = parts[1].strip()
            if 'closed' in hours_part.lower():
                continue
            
            # Try to parse opening time
            if '-' in hours_part or '–' in hours_part:
                normalized = hours_part.replace('–', '-').replace('—', '-')
                intervals = normalized.split(',')
                for interval in intervals:
                    if '-' in interval:
                        start_str = interval.split('-')[0].strip()
                        start_minutes = parse_time_string(start_str)
                        if start_minutes is not None:
                            open_hour = start_minutes // 60
                            open_minute = start_minutes % 60
                            opening_datetime = after_time.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0)
                            if opening_datetime > after_time:
                                return opening_datetime
    
    # Không parse được → giả định mở 6h
    return after_time.replace(hour=6, minute=0, second=0, microsecond=0) + timedelta(days=1)




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

    # BƯỚC 1: Lọc POIs đang mở cửa tại thời điểm khởi hành
    # Sử dụng strict_mode nếu giờ khởi hành ngoài khung giờ hợp lý (6h-22h)
    start_hour = start_datetime.hour
    use_strict_mode = start_hour < 6 or start_hour >= 22
    if use_strict_mode:
        print(f"⚠️  Giờ khởi hành {start_hour}h ngoài khung 6h-22h → Bật strict_mode để lọc POI không có opening_hours")
    
    open_pois = []
    for poi in request.poi_list:
        # Sử dụng hàm is_poi_open_at_datetime để kiểm tra giờ mở cửa tại thời điểm khởi hành
        if is_poi_open_at_datetime(poi, start_datetime, strict_mode=use_strict_mode):
            open_pois.append(poi)
    filtered_count = len(request.poi_list) - len(open_pois)
    print(f"Bước 1: Lọc giờ mở cửa → Giữ {len(open_pois)}, loại {filtered_count} POI")

    # BƯỚC 2: Tính ECS cho các POI đã lọc (sau khi lọc mở cửa - ít POI hơn)
    print(f"Bước 2: Tính ECS (mood: {request.user_mood})...")
    scored_pois: List[Dict[str, Any]] = []
    for poi in open_pois:
        ecs_score = calculate_ecs_score(poi, request.user_mood)
        poi_with_score = poi.copy()
        poi_with_score['ecs_score'] = ecs_score
        scored_pois.append(poi_with_score)
    print(f"  → {len(scored_pois)} POI đã tính ECS")

    # BƯỚC 3: Lọc POI có ecs_score >= threshold (đổi từ > thành >= để bao gồm threshold=0.0)
    print(f"Bước 3: Lọc ECS >= {request.ecs_score_threshold}...")
    high_score_pois: List[Dict[str, Any]] = []
    for poi in scored_pois:
        if poi.get('ecs_score', 0) >= request.ecs_score_threshold:
            high_score_pois.append(poi)
    print(f"  → {len(high_score_pois)} POI đạt threshold")

    # Nếu thiếu eta_from_current, tính bằng Distance Matrix (sau khi lọc ECS)
    # Dùng travel mode mặc định driving (có thể mở rộng lấy từ request nếu cần)
    eta_mode = request.travel_mode or "driving"
    eta_from_current = request.eta_from_current or fetch_distance_matrix_minutes(
        request.current_location, high_score_pois, mode=eta_mode
    )

    # BƯỚC 4: Sắp xếp theo điểm ECS (giảm dần) để ưu tiên POI phù hợp nhất
    candidates = sorted(high_score_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
    print(f"Bước 4: Sắp xếp theo ECS...")

    # BƯỚC 5: Phân bổ POI đều cho các ngày với SMART ALLOCATION
    print(f"Bước 5: Smart allocation cho {len(candidates)} POI...")
    
    # Lọc POI theo includeInDailyRoute (từ classification script)
    # CHÚ Ý: Chỉ lấy POI đã được classified VÀ có includeInDailyRoute=True
    daily_pois = []
    not_classified = 0
    excluded_accommodation = 0
    
    for p in candidates:
        func = p.get('function')
        if not func:
            # POI chưa được classify → skip
            not_classified += 1
            continue
        
        # Loại ACCOMMODATION (khách sạn/nhà nghỉ)
        if func == 'ACCOMMODATION':
            excluded_accommodation += 1
            continue
        
        # Loại RESORT nếu là nơi lưu trú (check types có 'lodging' hoặc 'hotel')
        if func == 'RESORT':
            poi_types = get_poi_types(p)
            if 'lodging' in poi_types or 'hotel' in poi_types or 'motel' in poi_types:
                excluded_accommodation += 1
                continue
            
        if p.get('includeInDailyRoute', False):
            daily_pois.append(p)
    
    print(f"  → {len(daily_pois)} POI phù hợp")
    print(f"  → Loại {not_classified} POI chưa classified")
    print(f"  → Loại {excluded_accommodation} ACCOMMODATION")
    print(f"  → Loại {len(candidates) - len(daily_pois) - not_classified - excluded_accommodation} POI khác")
    
    if not daily_pois:
        print(f"❌ Không có POI nào phù hợp cho lộ trình")
        return {"optimized_route": []}

    # === DYNAMIC CONSTRAINTS dựa trên duration ===
    def get_constraints(duration: int, total_pois: int) -> Dict[str, int]:
        """Điều chỉnh constraints linh hoạt theo số ngày và số POI"""
        avg_pois_available = total_pois // max(duration, 1)
        
        if duration == 1:
            # 1 ngày: tối đa 5-6 POI (8 tiếng du lịch)
            return {'core_min': 2, 'core_max': 3, 'activity_max': 1, 'resort_max': 1, 'fb_max': 1}
        elif duration <= 3:
            # Ngắn ngày: cân bằng
            return {'core_min': 2, 'core_max': 3, 'activity_max': 2, 'resort_max': 1, 'fb_max': 1}
        else:
            # Dài ngày: giảm tải
            return {'core_min': 2, 'core_max': 2, 'activity_max': 1, 'resort_max': 1, 'fb_max': 1}
    
    constraints = get_constraints(request.duration_days, len(daily_pois))
    
    # === GEOGRAPHIC CLUSTERING (nhóm POI theo khoảng cách) ===
    def cluster_by_distance(pois: List[Dict[str, Any]], n_clusters: int) -> List[List[Dict[str, Any]]]:
        """Nhóm POI theo khoảng cách địa lý bằng simple K-means"""
        if len(pois) <= n_clusters:
            return [[p] for p in pois]
        
        # Lấy tọa độ
        coords = []
        valid_pois = []
        for p in pois:
            loc = p.get('location', {})
            lat, lng = loc.get('lat'), loc.get('lng')
            if lat is not None and lng is not None:
                coords.append([lat, lng])
                valid_pois.append(p)
        
        if len(coords) < n_clusters:
            return [[p] for p in valid_pois]
        
        # Simple K-means
        from sklearn.cluster import KMeans
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(np.array(coords))
        
        clusters = [[] for _ in range(n_clusters)]
        for poi, label in zip(valid_pois, labels):
            clusters[label].append(poi)
        
        return clusters
    
    # Phân loại POI theo function
    pois_by_function = {
        'CORE_ATTRACTION': [],
        'ACTIVITY': [],
        'RESORT': [],
        'FOOD_BEVERAGE': [],
        'DINING': [],
        'OTHER': []
    }
    
    for poi in daily_pois:
        func = poi.get('function', 'OTHER')
        if func in pois_by_function:
            pois_by_function[func].append(poi)
        else:
            pois_by_function['OTHER'].append(poi)
    
    print(f"  → CORE: {len(pois_by_function['CORE_ATTRACTION'])}, ACTIVITY: {len(pois_by_function['ACTIVITY'])}, RESORT: {len(pois_by_function['RESORT'])}, F&B: {len(pois_by_function['FOOD_BEVERAGE']) + len(pois_by_function['DINING'])}")
    
    # === MOOD-AWARE SCORING (tính điểm riêng cho từng mood) ===
    moods_list = request.user_mood if isinstance(request.user_mood, list) else [request.user_mood]
    if not moods_list:
        moods_list = ['']
    
    def score_for_mood(poi: Dict[str, Any], mood_idx: int) -> float:
        """Tính ECS score cho mood cụ thể"""
        if mood_idx >= len(moods_list):
            return poi.get('ecs_score', 0)
        mood = moods_list[mood_idx]
        weights = MOOD_WEIGHTS.get(mood, {})
        tags = poi.get('emotional_tags', {})
        score = sum(tags.get(tag, 0) * weight for tag, weight in weights.items())
        return score
    
    # === GEOGRAPHIC-BASED ALLOCATION ===
    # Nhóm CORE_ATTRACTION theo khoảng cách
    core_clusters = cluster_by_distance(pois_by_function['CORE_ATTRACTION'], request.duration_days)
    
    # Khởi tạo daily groups
    daily_poi_groups: List[List[Dict[str, Any]]] = [[] for _ in range(request.duration_days)]
    used_poi_ids = set()
    
    def add_poi_to_day(poi: Dict[str, Any], day_idx: int) -> bool:
        """Thêm POI vào ngày nếu chưa được sử dụng"""
        pid = get_poi_id(poi)
        if pid in used_poi_ids:
            return False
        daily_poi_groups[day_idx].append(poi)
        used_poi_ids.add(pid)
        return True
    
    # === TIME WINDOW CHECK HELPER ===
    def poi_likely_open_in_day_window(poi: Dict[str, Any], day_start: datetime) -> bool:
        """
        Kiểm tra xem POI có khả năng mở cửa trong time window của ngày không.
        Time window: [day_start, day_start + 12h] (giả định tour kéo dài tối đa 12h/ngày)
        Nếu POI không có opening_hours → cho phép (fallback)
        """
        opening_data = poi.get('opening_hours') or poi.get('regularOpeningHours') or poi.get('openingHours')
        if not opening_data or not isinstance(opening_data, dict):
            # Không có data → cho phép (sẽ check lại ở optimize_route_for_day)
            return True
        
        # Kiểm tra trong khung giờ 8h-20h của ngày (reasonable tour hours)
        # Thử 3 thời điểm: 8h, 12h, 16h
        test_hours = [8, 12, 16]
        for hour in test_hours:
            test_time = day_start.replace(hour=hour, minute=0, second=0)
            if is_poi_open_at_datetime(poi, test_time, strict_mode=False):
                return True
        
        # Không mở trong cả 3 thời điểm → có thể không phù hợp
        if DEBUG_LOGGING:
            print(f"    ⚠️  {poi.get('name', 'Unknown')}: Không mở trong time window của ngày")
        return False
    
    # === BƯỚC 1: Phân bổ CORE_ATTRACTION theo cluster địa lý với TIME WINDOW CHECK ===
    # Mỗi cluster tương ứng với 1 ngày, đảm bảo POI cùng khu vực VÀ phù hợp giờ
    for day_idx in range(request.duration_days):
        cluster_idx = day_idx % len(core_clusters)
        cluster = core_clusters[cluster_idx]
        day_start = start_datetime + timedelta(days=day_idx)
        
        # Sắp xếp cluster theo mood của ngày (xen kẽ mood)
        mood_idx = day_idx % len(moods_list)
        cluster.sort(key=lambda p: score_for_mood(p, mood_idx), reverse=True)
        
        # Lấy 2-3 CORE cho ngày này, ƯU TIÊN POI có khả năng mở cửa
        count = 0
        # Lần 1: Thử với POI có time window match
        for poi in cluster:
            if count >= constraints['core_max']:
                break
            if poi_likely_open_in_day_window(poi, day_start):
                if add_poi_to_day(poi, day_idx):
                    count += 1
        
        # Lần 2: Nếu chưa đủ, thử POI còn lại (không check time window)
        if count < constraints['core_min']:
            for poi in cluster:
                if count >= constraints['core_max']:
                    break
                if add_poi_to_day(poi, day_idx):
                    count += 1
    
    # Phân bổ CORE còn lại (nếu có) cho ngày thiếu
    remaining_core = [p for p in pois_by_function['CORE_ATTRACTION'] if get_poi_id(p) not in used_poi_ids]
    remaining_core.sort(key=lambda p: p.get('ecs_score', 0), reverse=True)
    
    # Dùng heap để luôn thêm vào ngày có ít CORE nhất
    day_core_count = [(sum(1 for p in daily_poi_groups[i] if p.get('function') == 'CORE_ATTRACTION'), i) 
                      for i in range(request.duration_days)]
    heapq.heapify(day_core_count)
    
    for poi in remaining_core:
        count, day_idx = heapq.heappop(day_core_count)
        if count < constraints['core_max'] + 1:  # Cho phép vượt 1
            add_poi_to_day(poi, day_idx)
            count += 1
        heapq.heappush(day_core_count, (count, day_idx))
    
    # === BƯỚC 2: Phân bổ RESORT (max 1/ngày, ưu tiên ngày có ít POI) ===
    resort_pois = [p for p in pois_by_function['RESORT'] if get_poi_id(p) not in used_poi_ids]
    resort_pois.sort(key=lambda p: p.get('ecs_score', 0), reverse=True)
    
    # Dùng heap để cân bằng
    day_poi_count = [(len(daily_poi_groups[i]), i) for i in range(request.duration_days)]
    heapq.heapify(day_poi_count)
    
    for poi in resort_pois[:request.duration_days]:  # Max 1 resort/ngày
        _, day_idx = heapq.heappop(day_poi_count)
        add_poi_to_day(poi, day_idx)
        heapq.heappush(day_poi_count, (len(daily_poi_groups[day_idx]), day_idx))
    
    # === BƯỚC 3: Phân bổ ACTIVITY (max 2/ngày, cân bằng địa lý + time window) ===
    activity_pois = [p for p in pois_by_function['ACTIVITY'] if get_poi_id(p) not in used_poi_ids]
    
    for day_idx in range(request.duration_days):
        day_start = start_datetime + timedelta(days=day_idx)
        
        # Lấy vị trí trung tâm của ngày hiện tại
        day_lats = [p.get('location', {}).get('lat', 0) for p in daily_poi_groups[day_idx] if p.get('location')]
        day_lngs = [p.get('location', {}).get('lng', 0) for p in daily_poi_groups[day_idx] if p.get('location')]
        
        if day_lats and day_lngs:
            center_lat = sum(day_lats) / len(day_lats)
            center_lng = sum(day_lngs) / len(day_lngs)
            
            # Sắp xếp ACTIVITY theo khoảng cách đến center của ngày
            activity_pois.sort(key=lambda p: (
                haversine_km(
                    p.get('location', {}).get('lat', 0),
                    p.get('location', {}).get('lng', 0),
                    center_lat, center_lng
                ) - p.get('ecs_score', 0) * 5  # ECS bonus
            ))
        
        count = 0
        # Ưu tiên ACTIVITY mở cửa trong time window
        for poi in activity_pois[:]:
            if count >= constraints['activity_max']:
                break
            if poi_likely_open_in_day_window(poi, day_start):
                if add_poi_to_day(poi, day_idx):
                    activity_pois.remove(poi)
                    count += 1
        
        # Nếu chưa đủ, lấy bất kỳ
        if count < constraints['activity_max']:
            for poi in activity_pois[:]:
                if count >= constraints['activity_max']:
                    break
                if add_poi_to_day(poi, day_idx):
                    activity_pois.remove(poi)
                    count += 1
    
    # === BƯỚC 4: Phân bổ F&B/DINING (max 1/ngày, gần cluster + time window) ===
    fb_dining = [p for p in (pois_by_function['FOOD_BEVERAGE'] + pois_by_function['DINING']) 
                 if get_poi_id(p) not in used_poi_ids]
    
    for day_idx in range(request.duration_days):
        if not fb_dining:
            break
        
        day_start = start_datetime + timedelta(days=day_idx)
            
        # Tìm F&B gần nhất với các POI đã chọn trong ngày
        day_lats = [p.get('location', {}).get('lat', 0) for p in daily_poi_groups[day_idx] if p.get('location')]
        day_lngs = [p.get('location', {}).get('lng', 0) for p in daily_poi_groups[day_idx] if p.get('location')]
        
        if day_lats and day_lngs:
            center_lat = sum(day_lats) / len(day_lats)
            center_lng = sum(day_lngs) / len(day_lngs)
            
            # Chọn F&B gần nhất VÀ mở cửa trong time window
            fb_dining.sort(key=lambda p: haversine_km(
                p.get('location', {}).get('lat', 0),
                p.get('location', {}).get('lng', 0),
                center_lat, center_lng
            ))
        
        # Ưu tiên F&B mở cửa trong time window (giờ ăn: 11h-14h, 17h-21h)
        added = False
        for poi in fb_dining[:]:
            if poi_likely_open_in_day_window(poi, day_start):
                if add_poi_to_day(poi, day_idx):
                    fb_dining.remove(poi)
                    added = True
                    break
        
        # Nếu không có F&B nào mở, lấy bất kỳ
        if not added and fb_dining:
            if add_poi_to_day(fb_dining[0], day_idx):
                fb_dining.pop(0)
    
    # === BƯỚC 5: Phân bổ OTHER cho ngày thiếu POI (heap-based, với constraint check) ===
    other_pois = [p for p in pois_by_function['OTHER'] if get_poi_id(p) not in used_poi_ids]
    other_pois.sort(key=lambda p: p.get('ecs_score', 0), reverse=True)
    
    # Target POI per day (dynamic)
    target_per_day = max(3, min(6, len(daily_pois) // request.duration_days))
    
    # Helper function để check constraints của ngày
    def day_violates_constraints(day_pois: List[Dict[str, Any]]) -> bool:
        """Check xem ngày có vi phạm constraints về số lượng POI mỗi loại không"""
        fb_count = sum(1 for p in day_pois if p.get('function') in ['FOOD_BEVERAGE', 'DINING'])
        resort_count = sum(1 for p in day_pois if p.get('function') == 'RESORT')
        activity_count = sum(1 for p in day_pois if p.get('function') == 'ACTIVITY')
        
        # Enforce constraints (soft limits + 1 để linh hoạt)
        if fb_count > constraints['fb_max'] + 1:  # Max 2 F&B per day
            return True
        if resort_count > constraints['resort_max'] + 1:  # Max 2 RESORT per day
            return True
        if activity_count > constraints['activity_max'] + 1:  # Max 3 ACTIVITY per day
            return True
        return False
    
    day_poi_count = [(len(daily_poi_groups[i]), i) for i in range(request.duration_days)]
    heapq.heapify(day_poi_count)
    
    for poi in other_pois:
        count, day_idx = heapq.heappop(day_poi_count)
        if count < target_per_day:
            # Check xem thêm POI này có vi phạm constraints không
            test_pois = daily_poi_groups[day_idx] + [poi]
            if not day_violates_constraints(test_pois):
                add_poi_to_day(poi, day_idx)
        heapq.heappush(day_poi_count, (len(daily_poi_groups[day_idx]), day_idx))
    
    # === KIỂM TRA VÀ CÂN BẰNG CUỐI ===
    for day_idx in range(request.duration_days):
        day_pois = daily_poi_groups[day_idx]
        core_count = sum(1 for p in day_pois if p.get('function') == 'CORE_ATTRACTION')
        activity_count = sum(1 for p in day_pois if p.get('function') == 'ACTIVITY')
        resort_count = sum(1 for p in day_pois if p.get('function') == 'RESORT')
        fb_count = sum(1 for p in day_pois if p.get('function') in ['FOOD_BEVERAGE', 'DINING'])
        other_count = sum(1 for p in day_pois if p.get('function') == 'OTHER')
        
        if core_count < constraints['core_min'] and len(day_pois) > 0:
            print(f"⚠️  Ngày {day_idx+1}: chỉ có {core_count} CORE (cần ≥{constraints['core_min']})")
        
        print(f"  📅 Ngày {day_idx+1}: {len(day_pois)} POI (CORE:{core_count}, ACT:{activity_count}, RESORT:{resort_count}, F&B:{fb_count}, OTHER:{other_count})")

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
        """
        Tối ưu thứ tự thăm POI cho một ngày bằng Nearest Neighbor heuristic và tính thời gian đến.
        
        Cải tiến: POI không mở cửa sẽ được defer để thử lại sau thay vì skip ngay.
        Ví dụ: Chợ mở 8h, arrival 6h → defer → sau khi visit các POI khác, thử lại lúc 9h.
        """
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
        deferred_pois: List[Dict[str, Any]] = []  # POI chưa mở cửa, defer để thử lại
        current_time = day_start_time
        previous_poi: Optional[Dict[str, Any]] = None

        # PASS 1: Xử lý POI theo thứ tự Nearest Neighbor
        for poi in selected_order:
            if previous_poi is None:
                travel_minutes = eta_from_current_for(poi)
            else:
                travel_minutes = eta_between(get_poi_id(previous_poi), get_poi_id(poi), candidates)

            if travel_minutes >= 9999.0:
                continue

            arrival_time = current_time + timedelta(minutes=travel_minutes)

            # Sử dụng strict_mode nếu arrival_time ngoài khung giờ hợp lý
            arrival_hour = arrival_time.hour
            check_strict = arrival_hour < 6 or arrival_hour >= 22
            
            if not is_poi_open_at_datetime(poi, arrival_time, strict_mode=check_strict):
                if DEBUG_LOGGING:
                    print(f"    ⏸️  Defer {poi.get('name', 'Unknown')}: không mở cửa lúc {arrival_time.strftime('%H:%M')}, sẽ thử lại sau")
                deferred_pois.append(poi)
                continue

            poi_with_timing = deepcopy(poi)
            # Return Vietnam time trực tiếp (frontend sẽ parse trực tiếp)
            poi_with_timing['estimated_arrival'] = arrival_time.isoformat()

            # Sử dụng hàm mới để tính visit_duration dựa trên place_type
            visit_duration = get_estimated_visit_duration(poi)
            poi_with_timing['visit_duration_minutes'] = visit_duration

            departure_time = arrival_time + timedelta(minutes=visit_duration)
            poi_with_timing['estimated_departure'] = departure_time.isoformat()

            schedule.append(poi_with_timing)
            current_time = departure_time
            previous_poi = poi

        # PASS 2: Retry deferred POI (có thể đã mở cửa với current_time mới)
        if deferred_pois and DEBUG_LOGGING:
            print(f"    🔄 Retry {len(deferred_pois)} deferred POI với current_time = {current_time.strftime('%H:%M')}")
        
        max_retries = 3  # Tối đa 3 lần retry
        max_time_jumps = 2  # Tối đa 2 lần jump thời gian
        time_jumps_used = 0
        
        for retry_round in range(max_retries):
            if not deferred_pois:
                break
            
            still_deferred = []
            prev_current_time = current_time  # Lưu lại để detect nếu không progress
            
            for poi in deferred_pois:
                # Tính travel time từ POI cuối trong schedule (hoặc current_location nếu schedule rỗng)
                if schedule:
                    last_poi = schedule[-1]
                    travel_minutes = eta_between(get_poi_id(last_poi), get_poi_id(poi), candidates)
                else:
                    travel_minutes = eta_from_current_for(poi)
                
                if travel_minutes >= 9999.0:
                    still_deferred.append(poi)
                    continue
                
                arrival_time = current_time + timedelta(minutes=travel_minutes)
                arrival_hour = arrival_time.hour
                check_strict = arrival_hour < 6 or arrival_hour >= 22
                
                if not is_poi_open_at_datetime(poi, arrival_time, strict_mode=check_strict):
                    if DEBUG_LOGGING:
                        print(f"    ⏸️  {poi.get('name', 'Unknown')}: vẫn chưa mở lúc {arrival_time.strftime('%H:%M')}")
                    still_deferred.append(poi)
                    continue
                
                # POI đã mở! Thêm vào schedule
                if DEBUG_LOGGING:
                    print(f"    ✅ {poi.get('name', 'Unknown')}: đã mở lúc {arrival_time.strftime('%H:%M')} (retry thành công)")
                
                poi_with_timing = deepcopy(poi)
                poi_with_timing['estimated_arrival'] = arrival_time.isoformat()
                visit_duration = get_estimated_visit_duration(poi)
                poi_with_timing['visit_duration_minutes'] = visit_duration
                departure_time = arrival_time + timedelta(minutes=visit_duration)
                poi_with_timing['estimated_departure'] = departure_time.isoformat()
                
                schedule.append(poi_with_timing)
                current_time = departure_time
            
            deferred_pois = still_deferred
            
            # Nếu vẫn còn deferred POI và current_time không đổi (không progress)
            # → Nhảy current_time đến giờ mở cửa sớm nhất
            if deferred_pois and current_time == prev_current_time and time_jumps_used < max_time_jumps:
                # Tìm thời gian mở cửa sớm nhất trong các POI deferred
                earliest_opening = None
                for poi in deferred_pois:
                    opening_time = get_earliest_opening_time(poi, current_time)
                    if opening_time:
                        if earliest_opening is None or opening_time < earliest_opening:
                            earliest_opening = opening_time
                
                if earliest_opening and earliest_opening > current_time:
                    # Giới hạn jump: không nhảy quá 4 tiếng (để tránh jump đến ngày hôm sau)
                    max_jump_hours = 4
                    if (earliest_opening - current_time).total_seconds() / 3600 <= max_jump_hours:
                        if DEBUG_LOGGING:
                            print(f"    ⏰ Jump time: {current_time.strftime('%H:%M')} → {earliest_opening.strftime('%H:%M')} (chờ POI mở cửa)")
                        current_time = earliest_opening
                        time_jumps_used += 1
                        # Không break, tiếp tục retry với thời gian mới
                    else:
                        if DEBUG_LOGGING:
                            print(f"    ⚠️  Earliest opening quá xa ({earliest_opening.strftime('%H:%M')}), dừng retry")
                        break
                else:
                    # Không tìm thấy opening time hợp lệ
                    break
        
        # Log POI vẫn không thể visit sau retry
        if deferred_pois and DEBUG_LOGGING:
            print(f"    ❌ {len(deferred_pois)} POI không thể visit (không mở cửa trong khoảng thời gian hợp lý):")
            for poi in deferred_pois:
                print(f"       - {poi.get('name', 'Unknown')}")

        return schedule

    # BƯỚC 7: Tối ưu thứ tự thăm cho từng ngày
    print(f"Bước 6: Tối ưu thứ tự POI...")
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
    print(f"✅ Tạo lộ trình: {len(daily_plan)} ngày, {total_pois} POI")
    
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
    print(f"🔬 K-Means: {request.duration_days} ngày, {len(request.poi_list)} POI")
    
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

    def should_include_in_route(poi: Dict[str, Any]) -> bool:
        """Kiểm tra POI có nên được thêm vào lộ trình ngày không (dựa vào function)"""
        return poi.get('includeInDailyRoute', True)

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
    # Sử dụng strict_mode nếu giờ khởi hành ngoài khung giờ hợp lý (6h-22h)
    start_hour = start_datetime.hour
    use_strict_mode = start_hour < 6 or start_hour >= 22
    if use_strict_mode:
        print(f"⚠️  Giờ khởi hành {start_hour}h ngoài khung 6h-22h → Bật strict_mode để lọc POI không có opening_hours")
    
    open_pois = [poi for poi in request.poi_list if is_poi_open_at_datetime(poi, start_datetime, strict_mode=use_strict_mode)]
    filtered_count = len(request.poi_list) - len(open_pois)
    print(f"Bước 1: Lọc giờ mở cửa → Giữ {len(open_pois)}, loại {filtered_count} POI")

    # BƯỚC 2: Tính ECS
    print(f"Bước 2: Tính ECS...")
    scored_pois = []
    for poi in open_pois:
        poi_copy = poi.copy()
        poi_copy['ecs_score'] = calculate_ecs_score(poi, request.user_mood)
        scored_pois.append(poi_copy)

    # BƯỚC 3: Lọc theo threshold
    high_score_pois = [p for p in scored_pois if p.get('ecs_score', 0) >= request.ecs_score_threshold]
    print(f"→ {len(high_score_pois)} POI đạt threshold")

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
        route_pois = [p for p in cluster_pois if should_include_in_route(p)]
        if not route_pois:
            continue
        sorted_list = sorted(route_pois, key=lambda p: p.get('ecs_score', 0), reverse=True)
        cluster_sequences.append((cluster_id, sorted_list))
        # Sắp xếp theo từng mood để lấy POI phù hợp nhất cho mood đó
        cluster_mood_rank[cluster_id] = {}
        cluster_mood_ptr[cluster_id] = {}
        for mood in moods_list:
            ranked = sorted(
                route_pois,
                key=lambda p: calculate_ecs_score_single(p, str(mood)),
                reverse=True,
            )
            cluster_mood_rank[cluster_id][str(mood)] = ranked
            cluster_mood_ptr[cluster_id][str(mood)] = 0
        pass

    # BƯỚC 5: Phân bổ POI theo ngày từ clusters

    pois_per_day = request.poi_per_day or 3
    base_pool = [p for p in pois_within_radius if should_include_in_route(p)]

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
        pass

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
            
            # Sử dụng strict_mode nếu arrival ngoài khung giờ hợp lý
            arrival_hour = arrival.hour
            check_strict = arrival_hour < 6 or arrival_hour >= 22
            
            if not is_poi_open_at_datetime(poi, arrival, strict_mode=check_strict):
                if DEBUG_LOGGING:
                    print(f"    ⏭️  Skip {poi.get('name', 'Unknown')}: không mở cửa lúc {arrival.strftime('%H:%M')}")
                continue
            poi_copy = deepcopy(poi)
            # Return Vietnam time directly
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
            pass

    total = sum(len(d.get('activities', [])) for d in daily_plan)
    print(f"✅ K-Means: {len(daily_plan)} ngày, {total} POI")
    return {"optimized_route": daily_plan}


# --- 5. LỆNH CHẠY SERVER ---
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


