"""
Tools for Travel AI Agent
========================
Các tools cốt lõi để Agent có thể:
1. Tìm kiếm địa điểm (RAG)
2. Tính khoảng cách tối ưu 
3. Kiểm tra giờ mở cửa
4. Kiểm tra thời tiết
"""

import os
import math
import requests
from typing import List, Dict, Optional, Tuple
from datetime import datetime, time
import numpy as np
from pymongo import MongoClient
from dotenv import load_dotenv
from langchain.tools import tool
from sentence_transformers import SentenceTransformer

load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DATABASE_NAME")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
places_collection = db["places"]

# Load embedding model for similarity search
# embedding_model = SentenceTransformer('all-MiniLM-L6-v2')  # Commented out to save RAM

@tool
def search_places(query: str, location_filter: Optional[str] = None, category_filter: Optional[str] = None, limit: int = 50) -> List[Dict]:
    """
    Tìm kiếm địa điểm dựa trên query và filters.
    
    Args:
        query: Mô tả địa điểm muốn tìm ("quán cà phê yên tĩnh", "bảo tàng lịch sử")
        location_filter: Khu vực cụ thể ("Quận 1", "Hà Nội")  
        category_filter: Loại hình ("restaurant", "museum", "park")
        limit: Số lượng kết quả tối đa (default: 50, supports up to 7-day trips)
        
    Returns:
        List[Dict]: Danh sách địa điểm với thông tin chi tiết
    """
    try:
        # Build MongoDB filter
        mongo_filter = {}
        
        if location_filter:
            mongo_filter["$or"] = [
                {"address": {"$regex": location_filter, "$options": "i"}},
                {"location": {"$regex": location_filter, "$options": "i"}}
            ]
            
        if category_filter:
            mongo_filter["type"] = category_filter
            
        # Get all matching places first (fetch 3x limit to have enough candidates after filtering)
        places = list(places_collection.find(mongo_filter, {"_id": 0}).limit(limit * 3))
        
        if not places:
            return []
            
        # If query is provided, use keyword-based search (semantic search disabled to save RAM)
        if query.strip():
            # Use keyword matching instead of embeddings
            query_lower = query.lower()
            query_keywords = set(query_lower.split())
            
            # Calculate similarity for each place based on keyword matching
            scored_places = []
            for place in places:
                # Create text representation of place
                place_text = f"{place.get('name', '')} {place.get('description', '')} {place.get('type', '')}".lower()
                place_keywords = set(place_text.split())
                
                # Calculate keyword overlap similarity
                common_keywords = query_keywords & place_keywords
                similarity = len(common_keywords) / len(query_keywords) if query_keywords else 0
                
                place['similarity_score'] = float(similarity)
                scored_places.append(place)
                
            # Sort by similarity and return top results
            scored_places.sort(key=lambda x: x['similarity_score'], reverse=True)
            return scored_places[:limit]
        else:
            # Return first results if no semantic search needed
            return places[:limit]
            
    except Exception as e:
        print(f"Error in search_places: {e}")
        return []

@tool  
def calculate_distance(point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
    """
    Tính khoảng cách giữa 2 điểm theo tọa độ (lat, lng) bằng Haversine formula.
    
    Args:
        point1: (latitude, longitude) của điểm 1
        point2: (latitude, longitude) của điểm 2
        
    Returns:
        float: Khoảng cách tính theo km
    """
    try:
        lat1, lon1 = point1
        lat2, lon2 = point2
        
        # Convert latitude and longitude from degrees to radians
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        # Radius of earth in kilometers
        r = 6371
        
        return round(c * r, 2)
        
    except Exception as e:
        print(f"Error calculating distance: {e}")
        return float('inf')

@tool
def optimize_route(places: List[Dict], start_location: Optional[Tuple[float, float]] = None) -> List[Dict]:
    """
    Tối ưu hóa thứ tự các địa điểm để tối thiểu hóa quãng đường di chuyển.
    Sử dụng thuật toán Nearest Neighbor đơn giản.
    
    DEPRECATED: Hàm này đang được giữ lại cho backward compatibility.
    Sử dụng optimize_route_with_ecs() để tận dụng AI Optimizer Service.
    
    Args:
        places: List các địa điểm cần sắp xếp
        start_location: Điểm bắt đầu (lat, lng). Nếu None, bắt đầu từ địa điểm đầu tiên
        
    Returns:
        List[Dict]: Các địa điểm đã được sắp xếp theo thứ tự tối ưu
    """
    try:
        if len(places) <= 1:
            return places
            
        # Extract coordinates from places
        coords = []
        for place in places:
            if 'location' in place and 'coordinates' in place['location']:
                # GeoJSON format [lng, lat] -> convert to [lat, lng]
                lng, lat = place['location']['coordinates']
                coords.append((lat, lng))
            elif 'latitude' in place and 'longitude' in place:
                coords.append((place['latitude'], place['longitude']))
            else:
                # Fallback: put at end
                coords.append((None, None))
        
        # Start from specified location or first place
        if start_location:
            current_pos = start_location
        else:
            current_pos = coords[0]
            
        optimized_order = []
        remaining_indices = list(range(len(places)))
        
        # If we started from first place, add it to result
        if not start_location:
            optimized_order.append(0)
            remaining_indices.remove(0)
            
        # Greedy nearest neighbor algorithm
        while remaining_indices:
            min_distance = float('inf')
            next_index = None
            
            for idx in remaining_indices:
                if coords[idx] == (None, None):
                    # Place without coordinates goes to end
                    continue
                    
                dist = calculate_distance(current_pos, coords[idx])
                if dist < min_distance:
                    min_distance = dist
                    next_index = idx
                    
            if next_index is not None:
                optimized_order.append(next_index)
                remaining_indices.remove(next_index)
                current_pos = coords[next_index]
            else:
                # Add remaining places without coordinates at the end
                optimized_order.extend(remaining_indices)
                break
                
        # Return places in optimized order
        return [places[i] for i in optimized_order]
        
    except Exception as e:
        print(f"Error optimizing route: {e}")
        return places

@tool
def optimize_route_with_ecs(
    places: List[Dict],
    user_mood: str,
    duration_days: int,
    current_location: Dict[str, float],
    start_datetime: Optional[str] = None,
    ecs_score_threshold: float = 0.0
) -> Dict:
    """
    Tối ưu hóa lộ trình sử dụng AI Optimizer Service với ECS scoring.
    
    Args:
        places: List các địa điểm (POI) từ MongoDB
        user_mood: Mood của user (map từ travel_style + group_type)
        duration_days: Số ngày du lịch
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
        start_datetime: Thời gian bắt đầu (ISO 8601), optional
        ecs_score_threshold: Ngưỡng ECS tối thiểu (default: 0.0)
        
    Returns:
        Dict: {
            'optimized_route': List[Dict] - Lộ trình đã tối ưu theo ngày
        }
    """
    try:
        AI_OPTIMIZER_URL = os.getenv("AI_OPTIMIZER_SERVICE_URL", "http://localhost:8000")
        
        # Convert places to AI Optimizer format
        poi_list = []
        for place in places:
            # Extract coordinates
            if 'location' in place and 'coordinates' in place['location']:
                lng, lat = place['location']['coordinates']
            elif 'latitude' in place and 'longitude' in place:
                lat, lng = place['latitude'], place['longitude']
            else:
                continue  # Skip places without coordinates
            
            # Convert emotional tags from Map to Dict if needed
            emotional_tags = {}
            if 'emotionalTags' in place:
                if isinstance(place['emotionalTags'], dict):
                    emotional_tags = place['emotionalTags']
                else:
                    # If it's a MongoDB Map, convert to dict
                    emotional_tags = dict(place['emotionalTags'])
            
            # Format opening hours
            opening_hours = place.get('openingHours') or place.get('regularOpeningHours') or {}
            
            # Keep all original fields from place
            poi = place.copy()
            
            # Convert any datetime objects to ISO strings (for JSON serialization)
            for key, value in poi.items():
                if hasattr(value, 'isoformat'):
                    poi[key] = value.isoformat()
            
            # Update/override specific fields for AI Optimizer
            poi.update({
                'google_place_id': place.get('googlePlaceId') or str(place.get('_id')),
                'name': place.get('name', 'Unknown'),
                'emotional_tags': emotional_tags,
                'location': {'lat': lat, 'lng': lng},
                'opening_hours': opening_hours,
                'visit_duration_minutes': place.get('visit_duration_minutes', 90)
            })
            poi_list.append(poi)
        
        if not poi_list:
            print("⚠️ No valid POIs to optimize")
            return {'optimized_route': []}
        
        # Prepare request payload
        # Convert datetime to ISO string if it's not already a string
        start_datetime_str = start_datetime
        if hasattr(start_datetime, 'isoformat'):
            start_datetime_str = start_datetime.isoformat()
        
        payload = {
            'poi_list': poi_list,
            'user_mood': [user_mood],  # Convert string to list as expected by AI Optimizer
            'duration_days': duration_days,
            'current_location': current_location,
            'start_datetime': start_datetime_str,
            'ecs_score_threshold': ecs_score_threshold
        }
        
        print(f"🔄 Calling AI Optimizer Service with {len(poi_list)} POIs...")
        print(f"   → User mood: {user_mood}")
        print(f"   → Duration: {duration_days} days")
        print(f"   → ECS threshold: {ecs_score_threshold}")
        
        # Call AI Optimizer Service (/optimize with K-Means clustering + adaptive ECS)
        response = requests.post(
            f"{AI_OPTIMIZER_URL}/optimize",
            json=payload,
            timeout=60  # 60 seconds timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ AI Optimizer returned {len(result.get('optimized_route', []))} days")
            return result
        else:
            print(f"❌ AI Optimizer error: {response.status_code} - {response.text}")
            return {'optimized_route': []}
            
    except requests.exceptions.Timeout:
        print("⏱️ AI Optimizer Service timeout")
        return {'optimized_route': []}
    except requests.exceptions.ConnectionError:
        print("🔌 Cannot connect to AI Optimizer Service")
        return {'optimized_route': []}
    except Exception as e:
        print(f"Error calling AI Optimizer Service: {e}")
        return {'optimized_route': []}

@tool
def check_opening_status(place: Dict, target_time: Optional[str] = None) -> Dict:
    """
    Kiểm tra trạng thái mở cửa của một địa điểm.
    
    Args:
        place: Dict chứa thông tin địa điểm với opening_hours
        target_time: Thời gian cần check (format: "HH:MM" hoặc "YYYY-MM-DD HH:MM")
                    Nếu None thì check thời điểm hiện tại
        
    Returns:
        Dict: {
            "is_open": bool,
            "opening_hours_today": str,
            "next_open_time": str (nếu đang đóng),
            "next_close_time": str (nếu đang mở)
        }
    """
    try:
        result = {
            "is_open": True,  # Default assume open
            "opening_hours_today": "Không có thông tin giờ mở cửa",
            "next_open_time": None,
            "next_close_time": None
        }
        
        if 'openingHours' not in place:
            return result
            
        opening_hours = place['openingHours']
        
        # Get target datetime
        if target_time:
            if len(target_time) == 5:  # Just time "HH:MM"
                now = datetime.now()
                target_dt = datetime.combine(now.date(), time.fromisoformat(target_time))
            else:  # Full datetime
                target_dt = datetime.fromisoformat(target_time)
        else:
            target_dt = datetime.now()
            
        # Get day of week (0=Monday, 6=Sunday)
        weekday = target_dt.weekday()
        
        # Check if we have weekday descriptions
        if 'weekdayDescriptions' in opening_hours:
            descriptions = opening_hours['weekdayDescriptions']
            if weekday < len(descriptions):
                result["opening_hours_today"] = descriptions[weekday]
                
                # Simple parsing to check if open
                desc = descriptions[weekday].lower()
                if 'closed' in desc or 'đóng cửa' in desc:
                    result["is_open"] = False
                    
        # Check periods if available
        if 'periods' in opening_hours:
            periods = opening_hours['periods']
            
            # Find today's period
            today_period = None
            for period in periods:
                if 'open' in period and period['open']['day'] == weekday:
                    today_period = period
                    break
                    
            if today_period:
                open_time = today_period['open']
                close_time = today_period.get('close')
                
                open_hour = open_time['hour']
                open_minute = open_time['minute']
                
                if close_time:
                    close_hour = close_time['hour']
                    close_minute = close_time['minute']
                    
                    # Check if current time is within opening hours
                    current_minutes = target_dt.hour * 60 + target_dt.minute
                    open_minutes = open_hour * 60 + open_minute
                    close_minutes = close_hour * 60 + close_minute
                    
                    result["is_open"] = open_minutes <= current_minutes <= close_minutes
                    
                    if not result["is_open"]:
                        if current_minutes < open_minutes:
                            result["next_open_time"] = f"{open_hour:02d}:{open_minute:02d}"
                    else:
                        result["next_close_time"] = f"{close_hour:02d}:{close_minute:02d}"
        
        return result
        
    except Exception as e:
        print(f"Error checking opening status: {e}")
        return {"is_open": True, "opening_hours_today": "Không thể kiểm tra giờ mở cửa", 
                "next_open_time": None, "next_close_time": None}

@tool
def check_weather(date: Optional[str] = None, location: str = "Hanoi,VN") -> Dict:
    """
    Kiểm tra thời tiết cho ngày cụ thể.
    
    Args:
        date: Ngày cần check (format: "YYYY-MM-DD") - optional, default to today
        location: Địa điểm (default: "Hanoi,VN")
        
    Returns:
        Dict: Thông tin thời tiết bao gồm nhiệt độ, mô tả, khả năng mưa
    """
    try:
        # If no date provided, use today
        if date is None:
            from datetime import datetime
            date = datetime.now().strftime("%Y-%m-%d")
        # OpenWeatherMap API (free tier)
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return {
                "weather": "Không thể lấy thông tin thời tiết - thiếu API key",
                "temperature": "N/A",
                "description": "N/A",
                "rain_probability": 0,
                "is_rainy": False,
                "recommendation": "Không có dữ liệu thời tiết"
            }
        
        # For simplicity, use current weather (free tier limitation)
        url = f"http://api.openweathermap.org/data/2.5/weather?q={location}&appid={api_key}&units=metric&lang=vi"
        
        response = requests.get(url, timeout=5)
        data = response.json()
        
        if response.status_code == 200:
            weather = data['weather'][0]
            main = data['main']
            
            description = weather['description']
            temp = main['temp']
            humidity = main['humidity']
            
            # Check if rainy conditions
            weather_main = weather['main'].lower()
            is_rainy = 'rain' in weather_main or 'drizzle' in weather_main
            rain_prob = humidity if is_rainy else 0
            
            # Generate recommendation
            if is_rainy:
                recommendation = "Nên chọn các hoạt động trong nhà (bảo tàng, trung tâm thương mại, quán cà phê)"
            elif temp > 35:
                recommendation = "Thời tiết nóng, nên chọn các hoạt động trong nhà hoặc có bóng mát"
            elif temp < 15:
                recommendation = "Thời tiết mát, phù hợp cho các hoạt động ngoài trời"
            else:
                recommendation = "Thời tiết đẹp, phù hợp cho mọi hoạt động"
            
            return {
                "weather": description,
                "temperature": f"{temp}°C",
                "description": description,
                "rain_probability": rain_prob,
                "is_rainy": is_rainy,
                "recommendation": recommendation
            }
        else:
            return {
                "weather": "Không thể lấy thông tin thời tiết",
                "temperature": "N/A",
                "description": "N/A", 
                "rain_probability": 0,
                "is_rainy": False,
                "recommendation": "Không có dữ liệu thời tiết"
            }
            
    except Exception as e:
        print(f"Error checking weather: {e}")
        return {
            "weather": "Lỗi khi lấy thông tin thời tiết",
            "temperature": "N/A",
            "description": "N/A",
            "rain_probability": 0,
            "is_rainy": False,
            "recommendation": "Không có dữ liệu thời tiết"
        }

@tool
def calculate_budget_estimate(places: List[Dict], person_count: int = 1) -> Dict:
    """
    Ước tính ngân sách cho lộ trình dựa trên price range của các địa điểm.
    
    Args:
        places: List các địa điểm trong lộ trình
        person_count: Số người đi
        
    Returns:
        Dict: Ước tính chi phí tổng và chi tiết
    """
    try:
        # Price mapping (VND)
        price_ranges = {
            'free': 0,
            'budget': 50000,      # < 50k
            'mid-range': 150000,  # 50k-300k  
            'expensive': 500000,  # 300k-1M
            'luxury': 1500000     # > 1M
        }
        
        total_cost = 0
        breakdown = []
        
        for place in places:
            place_name = place.get('name', 'Unknown')
            budget_range = place.get('budgetRange', place.get('budget_range', 'mid-range'))
            
            # Get estimated cost per person
            cost_per_person = price_ranges.get(budget_range, price_ranges['mid-range'])
            place_total = cost_per_person * person_count
            
            total_cost += place_total
            breakdown.append({
                'name': place_name,
                'budget_range': budget_range,
                'cost_per_person': cost_per_person,
                'total_cost': place_total
            })
        
        # Format currency
        def format_vnd(amount):
            if amount >= 1_000_000:
                return f"{amount/1_000_000:.1f} triệu VNĐ"
            elif amount >= 1_000:
                return f"{amount/1_000:.0f}k VNĐ"
            else:
                return f"{amount:.0f} VNĐ"
        
        return {
            'total_cost': total_cost,
            'total_cost_formatted': format_vnd(total_cost),
            'cost_per_person': total_cost / person_count if person_count > 0 else total_cost,
            'cost_per_person_formatted': format_vnd(total_cost / person_count) if person_count > 0 else format_vnd(total_cost),
            'breakdown': breakdown,
            'person_count': person_count,
            'currency': 'VND'
        }
        
    except Exception as e:
        print(f"Error calculating budget: {e}")
        return {
            'total_cost': 0,
            'total_cost_formatted': '0 VNĐ',
            'cost_per_person': 0,
            'cost_per_person_formatted': '0 VNĐ',
            'breakdown': [],
            'person_count': person_count,
            'currency': 'VND'
        }

# =====================================
# LIVE TRAVEL COMPANION TOOLS
# =====================================

@tool
def search_nearby_places(
    current_location: Dict[str, float],
    radius_km: float = 2.0,
    category: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """
    Tìm các địa điểm gần vị trí hiện tại của user (LIVE COMPANION) - sử dụng Google Places API.
    
    Args:
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
        radius_km: Bán kính tìm kiếm (km)
        category: Loại địa điểm ('restaurant', 'cafe', 'attraction', 'shopping', 'hospital', 'atm')
        limit: Số lượng kết quả tối đa
        
    Returns:
        List[Dict]: Danh sách địa điểm gần nhất từ Google Places API
    """
    try:
        import os
        import requests
        
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            print("   ⚠️ Missing location coordinates")
            return []
        
        # Get Google Places API key
        api_key = os.getenv("GOOGLE_PLACES_API_KEY")
        if not api_key:
            print("   ⚠️ GOOGLE_PLACES_API_KEY not found, falling back to database")
            return _search_nearby_from_database(current_location, radius_km, category, limit)
        
        # Map categories to Google Places types (New API)
        type_map = {
            'restaurant': 'restaurant',
            'cafe': 'cafe',
            'attraction': 'tourist_attraction',
            'shopping': 'shopping_mall',
            'hospital': 'hospital',
            'atm': 'atm',
            'pharmacy': 'pharmacy',
            'museum': 'museum',
            'park': 'park'
        }
        
        place_type = type_map.get(category.lower() if category else None, None)
        
        # Google Places API (New) - Nearby Search endpoint
        url = "https://places.googleapis.com/v1/places:searchNearby"
        
        # Build request body for Places API (New)
        request_body = {
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng
                    },
                    "radius": radius_km * 1000  # Convert km to meters
                }
            },
            "maxResultCount": limit,
            "languageCode": "vi"
        }
        
        # Add type filter if specified
        if place_type:
            request_body["includedTypes"] = [place_type]
        
        # Headers for Places API (New)
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.photos,places.currentOpeningHours,places.priceLevel"
        }
        
        print(f"   🌍 Calling Google Places API (New): radius={radius_km}km, type={place_type or 'all'}")
        
        response = requests.post(url, json=request_body, headers=headers, timeout=10)
        
        if response.status_code != 200:
            print(f"   ⚠️ Google Places API (New) error: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return _search_nearby_from_database(current_location, radius_km, category, limit)
        
        data = response.json()
        
        # Check if we have places in the response
        if not data.get('places'):
            print(f"   ⚠️ No places found in response")
            return _search_nearby_from_database(current_location, radius_km, category, limit)
        
        places = data.get('places', [])
        
        # Format results for Places API (New)
        nearby_places = []
        for place in places:
            # Get location from new API format
            location = place.get('location', {})
            place_lat = location.get('latitude')
            place_lng = location.get('longitude')
            
            if not place_lat or not place_lng:
                continue
            
            # Calculate distance
            import math
            lat1, lon1 = lat, lng
            lat2, lon2 = place_lat, place_lng
            lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance = round(c * 6371, 2)  # Earth radius in km
            
            # Extract display name (new API format)
            display_name = place.get('displayName', {})
            name = display_name.get('text', 'Unknown') if isinstance(display_name, dict) else 'Unknown'
            
            # Extract opening hours
            opening_hours = place.get('currentOpeningHours', {})
            open_now = opening_hours.get('openNow') if opening_hours else None
            
            formatted_place = {
                'name': name,
                'place_id': place.get('id', '').replace('places/', ''),  # Remove 'places/' prefix
                'address': place.get('formattedAddress', ''),
                'rating': place.get('rating', 0),
                'user_ratings_total': place.get('userRatingCount', 0),
                'types': place.get('types', []),
                'location': {
                    'type': 'Point',
                    'coordinates': [place_lng, place_lat]
                },
                'distance_km': distance,
                'photo_reference': place.get('photos', [{}])[0].get('name') if place.get('photos') else None,
                'opening_hours': {
                    'open_now': open_now
                } if open_now is not None else None,
                'price_level': place.get('priceLevel'),
                'source': 'google_places_api_new'
            }
            
            nearby_places.append(formatted_place)
        
        print(f"   ✅ Found {len(nearby_places)} places from Google Places API (New)")
        return nearby_places
        
    except Exception as e:
        print(f"   ❌ Error calling Google Places API: {e}")
        print(f"   🔄 Falling back to database search")
        return _search_nearby_from_database(current_location, radius_km, category, limit)


def _search_nearby_from_database(
    current_location: Dict[str, float],
    radius_km: float = 2.0,
    category: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """
    Fallback: Tìm địa điểm từ database khi Google API không khả dụng.
    """
    try:
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            return []
        
        # Get all places from database
        query_filter = {}
        if category:
            # Map common categories to database types
            category_map = {
                'restaurant': ['restaurant', 'food'],
                'cafe': ['cafe', 'coffee_shop'],
                'attraction': ['tourist_attraction', 'museum', 'park'],
                'shopping': ['shopping_mall', 'store', 'market'],
                'hospital': ['hospital', 'pharmacy'],
                'atm': ['atm', 'bank']
            }
            types = category_map.get(category.lower(), [category])
            query_filter['type'] = {'$in': types}
        
        places = list(places_collection.find(query_filter, {"_id": 0}))
        
        if not places:
            return []
        
        # Calculate distance for each place
        nearby_places = []
        for place in places:
            if 'location' not in place or 'coordinates' not in place['location']:
                continue
            
            place_lng, place_lat = place['location']['coordinates']
            # Calculate distance directly (Haversine formula)
            import math
            lat1, lon1 = lat, lng
            lat2, lon2 = place_lat, place_lng
            lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance = round(c * 6371, 2)  # Earth radius in km
            
            if distance <= radius_km:
                place['distance_km'] = distance
                place['source'] = 'database'
                nearby_places.append(place)
        
        # Sort by distance
        nearby_places.sort(key=lambda x: x['distance_km'])
        
        print(f"   ✅ Found {len(nearby_places[:limit])} places from database (fallback)")
        return nearby_places[:limit]
        
    except Exception as e:
        print(f"   ❌ Error searching database: {e}")
        return []

@tool
def get_place_details(place_id: str = None, place_name: str = None) -> Dict:
    """
    Lấy thông tin chi tiết về một địa điểm (LIVE COMPANION).
    User hỏi: "Địa điểm này có gì?", "Chỗ này ăn gì ngon?"
    
    Args:
        place_id: Google Place ID hoặc MongoDB _id
        place_name: Tên địa điểm (nếu không có place_id)
        
    Returns:
        Dict: Thông tin chi tiết về địa điểm
    """
    try:
        query = {}
        
        if place_id:
            # Try both googlePlaceId and _id
            from bson import ObjectId
            try:
                query = {'$or': [
                    {'googlePlaceId': place_id},
                    {'_id': ObjectId(place_id)}
                ]}
            except:
                query = {'googlePlaceId': place_id}
        elif place_name:
            query = {'name': {'$regex': place_name, '$options': 'i'}}
        else:
            return {}
        
        place = places_collection.find_one(query, {"_id": 0})
        
        if not place:
            return {}
        
        # Format detailed info
        details = {
            'name': place.get('name', 'Unknown'),
            'description': place.get('description', ''),
            'address': place.get('formatted_address') or place.get('address', ''),
            'type': place.get('type', ''),
            'rating': place.get('rating'),
            'user_ratings_total': place.get('user_ratings_total'),
            'price_level': place.get('priceLevel'),
            'budget_range': place.get('budgetRange', 'mid-range'),
            'opening_hours': place.get('openingHours', {}),
            'phone': place.get('phone', ''),
            'website': place.get('website', ''),
            'photos': place.get('photos', []),
            'emotional_tags': place.get('emotionalTags', {}),
            'visit_duration_minutes': place.get('visit_duration_minutes', 90),
        }
        
        return details
        
    except Exception as e:
        print(f"Error getting place details: {e}")
        return {}

@tool
def get_travel_tips(
    place: Dict,
    tip_type: str = "food"
) -> Dict:
    """
    Lấy travel tips cho một địa điểm (LIVE COMPANION).
    User hỏi: "Ăn gì ngon?", "Chỗ check-in đẹp?", "Nên làm gì?"
    
    Args:
        place: Dict thông tin địa điểm
        tip_type: Loại tips ('food', 'photo', 'activity', 'warning')
        
    Returns:
        Dict: Travel tips và suggestions
    """
    try:
        place_name = place.get('name', 'Unknown')
        place_type = place.get('type', '')
        emotional_tags = place.get('emotionalTags', {})
        
        tips = {
            'place_name': place_name,
            'tip_type': tip_type,
            'suggestions': [],
            'best_time': '',
            'warnings': []
        }
        
        # Generate tips based on type
        if tip_type == 'food':
            # Food recommendations based on place type
            if 'restaurant' in place_type or 'food' in place_type:
                tips['suggestions'].append(f"Đặc sản tại {place_name}")
                tips['suggestions'].append("Món ăn được đánh giá cao nhất")
            else:
                # Find nearby restaurants
                if 'location' in place and 'coordinates' in place['location']:
                    lng, lat = place['location']['coordinates']
                    nearby = search_nearby_places.invoke({
                        'current_location': {'lat': lat, 'lng': lng},
                        'category': 'restaurant',
                        'radius_km': 1.0,
                        'limit': 3
                    })
                    for restaurant in nearby[:3]:
                        tips['suggestions'].append(
                            f"{restaurant.get('name')} ({restaurant.get('distance_km', 0):.1f}km)"
                        )
        
        elif tip_type == 'photo':
            # Photo spot recommendations
            tips['suggestions'].append(f"Góc check-in đẹp nhất tại {place_name}")
            if 'Lãng mạn' in emotional_tags or 'Cảnh quan thiên nhiên' in emotional_tags:
                tips['best_time'] = "Hoàng hôn (5:00 PM - 6:30 PM)"
            else:
                tips['best_time'] = "Sáng sớm (7:00 AM - 9:00 AM) hoặc chiều muộn"
            tips['suggestions'].append("Nên chụp từ góc nào?")
            tips['suggestions'].append("Best lighting time")
        
        elif tip_type == 'activity':
            # Activity recommendations
            if 'museum' in place_type:
                tips['suggestions'].append("Tham quan triển lãm chính")
                tips['suggestions'].append("Nghe audio guide")
            elif 'park' in place_type:
                tips['suggestions'].append("Đi bộ thư giãn")
                tips['suggestions'].append("Ngồi thư giãn bên hồ")
            elif 'temple' in place_type or 'church' in place_type:
                tips['suggestions'].append("Cầu nguyện/thắp hương")
                tips['suggestions'].append("Tìm hiểu lịch sử")
                tips['warnings'].append("⚠️ Ăn mặc lịch sự khi vào điện thờ")
        
        elif tip_type == 'warning':
            # Safety warnings
            if 'busy' in emotional_tags or 'Náo nhiệt' in emotional_tags:
                tips['warnings'].append("⚠️ Đông người, cẩn thận túi xách")
            if 'expensive' in place.get('budgetRange', ''):
                tips['warnings'].append("💰 Giá cao, nên kiểm tra menu trước")
        
        return tips
        
    except Exception as e:
        print(f"Error getting travel tips: {e}")
        return {'place_name': '', 'tip_type': tip_type, 'suggestions': [], 'best_time': '', 'warnings': []}

@tool
def find_emergency_services(
    current_location: Dict[str, float],
    service_type: str = "hospital",
    radius_km: float = 5.0
) -> List[Dict]:
    """
    Tìm dịch vụ tiện ích & khẩn cấp gần nhất (LIVE COMPANION) - sử dụng Google Places API (New).
    User hỏi: "Tìm bệnh viện", "Pharmacy gần đây", "ATM ở đâu?", "Cửa hàng tiện lợi gần nhất", "Nhà vệ sinh công cộng"
    
    Args:
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
        service_type: Loại dịch vụ (xem service_type_map bên dưới)
        radius_km: Bán kính tìm kiếm (km, default: 5.0)
        
    Returns:
        List[Dict]: Danh sách dịch vụ gần nhất (top 5)
    """
    try:
        import os
        import requests
        
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            print("   ⚠️ Missing location coordinates")
            return []
        
        # Get Google Places API key
        api_key = os.getenv("GOOGLE_PLACES_API_KEY")
        if not api_key:
            print("   ⚠️ GOOGLE_PLACES_API_KEY not found, falling back to database")
            return _find_emergency_from_database(current_location, service_type, radius_km)
        
        # Map service types to Google Places API (New) types
        service_type_map = {
            # Dịch vụ y tế
            'hospital': 'hospital',
            'clinic': 'hospital',
            'pharmacy': 'pharmacy',
            'drug_store': 'pharmacy',
            
            # Dịch vụ tài chính
            'atm': 'atm',
            'bank': 'bank',
            
            # Dịch vụ an ninh & khẩn cấp
            'police': 'police',
            'fire_station': 'fire_station',
            
            # Trạm xăng & giao thông
            'gas_station': 'gas_station',
            'petrol': 'gas_station',
            'parking': 'parking',
            'bus_station': 'bus_station',
            'transit_station': 'transit_station',
            'subway_station': 'subway_station',
            'train_station': 'train_station',
            
            # Cửa hàng tiện lợi & siêu thị
            'convenience_store': 'convenience_store',
            'supermarket': 'supermarket',
            'grocery_store': 'grocery_store',
            
            # Dịch vụ công cộng
            'restroom': 'restroom',
            'toilet': 'restroom',
            'public_restroom': 'restroom',
            'post_office': 'post_office',
            
            # Dịch vụ khác
            'laundry': 'laundry',
            'car_wash': 'car_wash',
            'ev_charging': 'electric_vehicle_charging_station'
        }
        
        place_type = service_type_map.get(service_type.lower(), service_type)
        
        # Google Places API (New) - Nearby Search endpoint
        url = "https://places.googleapis.com/v1/places:searchNearby"
        
        # Build request body
        request_body = {
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng
                    },
                    "radius": radius_km * 1000  # Convert km to meters
                }
            },
            "includedTypes": [place_type],
            "maxResultCount": 10,
            "languageCode": "vi"
        }
        
        # Headers for Places API (New)
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.currentOpeningHours"
        }
        
        print(f"   🚨 Calling Google Places API (New) for {service_type}: radius={radius_km}km")
        
        response = requests.post(url, json=request_body, headers=headers, timeout=10)
        
        if response.status_code != 200:
            print(f"   ⚠️ Google Places API (New) error: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return _find_emergency_from_database(current_location, service_type, radius_km)
        
        data = response.json()
        
        # Check if we have places in the response
        if not data.get('places'):
            print(f"   ⚠️ No emergency services found")
            return _find_emergency_from_database(current_location, service_type, radius_km)
        
        places = data.get('places', [])
        
        # Format results for Places API (New)
        services = []
        for place in places:
            # Get location from new API format
            location = place.get('location', {})
            place_lat = location.get('latitude')
            place_lng = location.get('longitude')
            
            if not place_lat or not place_lng:
                continue
            
            # Calculate distance
            import math
            lat1, lon1 = lat, lng
            lat2, lon2 = place_lat, place_lng
            lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance = round(c * 6371, 2)  # Earth radius in km
            
            # Extract display name (new API format)
            display_name = place.get('displayName', {})
            name = display_name.get('text', 'Unknown') if isinstance(display_name, dict) else 'Unknown'
            
            # Extract opening hours
            opening_hours = place.get('currentOpeningHours', {})
            open_now = opening_hours.get('openNow') if opening_hours else None
            
            formatted_service = {
                'name': name,
                'place_id': place.get('id', '').replace('places/', ''),
                'address': place.get('formattedAddress', ''),
                'rating': place.get('rating', 0),
                'user_ratings_total': place.get('userRatingCount', 0),
                'types': place.get('types', []),
                'location': {
                    'type': 'Point',
                    'coordinates': [place_lng, place_lat]
                },
                'distance_km': distance,
                'opening_hours': {
                    'open_now': open_now
                } if open_now is not None else None,
                'service_type': service_type,
                'source': 'google_places_api_new'
            }
            
            services.append(formatted_service)
        
        # Sort by distance
        services.sort(key=lambda x: x['distance_km'])
        
        print(f"   ✅ Found {len(services[:5])} emergency services from Google Places API (New)")
        return services[:5]
        
    except Exception as e:
        print(f"   ❌ Error calling Google Places API: {e}")
        print(f"   🔄 Falling back to database search")
        return _find_emergency_from_database(current_location, service_type, radius_km)


def _find_emergency_from_database(
    current_location: Dict[str, float],
    service_type: str = "hospital",
    radius_km: float = 5.0
) -> List[Dict]:
    """
    Fallback: Tìm dịch vụ tiện ích & khẩn cấp từ database khi Google Places API không khả dụng.
    """
    try:
        # Map service types to database place types
        service_map = {
            # Dịch vụ y tế
            'hospital': ['hospital', 'clinic'],
            'pharmacy': ['pharmacy', 'drug_store'],
            
            # Dịch vụ tài chính
            'atm': ['atm', 'bank'],
            
            # Dịch vụ an ninh
            'police': ['police'],
            'fire_station': ['fire_station'],
            
            # Trạm xăng & giao thông
            'gas_station': ['gas_station'],
            'parking': ['parking'],
            'bus_station': ['bus_station', 'transit_station'],
            'subway_station': ['subway_station'],
            'train_station': ['train_station'],
            
            # Cửa hàng tiện lợi
            'convenience_store': ['convenience_store', 'supermarket'],
            'supermarket': ['supermarket'],
            
            # Dịch vụ công cộng
            'public_restroom': ['restroom', 'toilet'],
            'post_office': ['post_office']
        }
        
        types = service_map.get(service_type.lower(), [service_type])
        
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            return []
        
        # Get places matching service types from database
        query = {'type': {'$in': types}}
        places = list(places_collection.find(query, {"_id": 0}))
        
        # Calculate distance and filter
        services = []
        for place in places:
            if 'location' not in place or 'coordinates' not in place['location']:
                continue
            
            place_lng, place_lat = place['location']['coordinates']
            
            # Calculate distance (Haversine formula)
            import math
            lat1, lon1 = lat, lng
            lat2, lon2 = place_lat, place_lng
            lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance = round(c * 6371, 2)  # Earth radius in km
            
            if distance <= radius_km:
                place['distance_km'] = distance
                place['service_type'] = service_type
                place['source'] = 'database'
                services.append(place)
        
        # Sort by distance
        services.sort(key=lambda x: x['distance_km'])
        
        print(f"   ✅ Found {len(services[:5])} emergency services from database (fallback)")
        return services[:5]
        
    except Exception as e:
        print(f"   ❌ Error searching database: {e}")
        return []

@tool
def get_weather_alerts_and_suggestions(current_location: Dict[str, float]) -> Dict:
    """
    Lấy cảnh báo thời tiết realtime và gợi ý hoạt động phù hợp.
    
    Args:
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
    
    Returns:
        Dict với weather data, alerts và activity suggestions
    """
    try:
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            return {"error": "Invalid location"}
        
        # Call OpenWeatherMap API for real-time weather
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            print("   ⚠️ OPENWEATHER_API_KEY not found, using fallback")
            return {
                "weather": "Unknown",
                "temperature": 25,
                "alerts": [],
                "suggestions": ["Mang theo nước uống", "Thoa kem chống nắng"]
            }
        
        # Current weather + forecast
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={api_key}&units=metric&lang=vi"
        response = requests.get(url, timeout=5)
        
        if response.status_code != 200:
            print(f"   ❌ Weather API error: {response.status_code}")
            return {"error": "Weather API unavailable"}
        
        data = response.json()
        
        # Extract weather info
        temp = round(data['main']['temp'])
        feels_like = round(data['main']['feels_like'])
        humidity = data['main']['humidity']
        weather_main = data['weather'][0]['main']
        weather_desc = data['weather'][0]['description']
        
        # Generate alerts based on weather
        alerts = []
        suggestions = []
        
        # Temperature alerts
        if temp > 35:
            alerts.append("🔥 Nhiệt độ rất cao! Hạn chế hoạt động ngoài trời.")
            suggestions.extend([
                "Tìm quán cà phê có điều hòa",
                "Ghé trung tâm thương mại",
                "Tránh ra ngoài 11h-15h"
            ])
        elif temp > 30:
            alerts.append("☀️ Trời nắng nóng, cần bảo vệ da")
            suggestions.extend([
                "Mang theo nước uống đủ",
                "Thoa kem chống nắng",
                "Đội mũ/dùng ô"
            ])
        elif temp < 15:
            alerts.append("🥶 Trời lạnh, mặc ấm khi ra ngoài")
            suggestions.extend([
                "Mang theo áo khoác",
                "Uống đồ nóng để giữ ấm"
            ])
        
        # Rain alerts
        if weather_main in ['Rain', 'Drizzle', 'Thunderstorm']:
            alerts.append("🌧️ Có mưa! Mang theo ô/áo mưa")
            suggestions.extend([
                "Ghé quán cà phê trong nhà",
                "Tham quan bảo tàng/trung tâm mua sắm",
                "Tránh hoạt động ngoài trời"
            ])
        
        # Humidity alerts
        if humidity > 80:
            alerts.append("💧 Độ ẩm cao, có thể khó chịu")
            suggestions.append("Chọn địa điểm có điều hòa")
        
        return {
            "temperature": temp,
            "feels_like": feels_like,
            "humidity": humidity,
            "condition": weather_main,
            "description": weather_desc,
            "alerts": alerts,
            "suggestions": suggestions,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"   ❌ Error getting weather: {e}")
        return {
            "error": str(e),
            "alerts": [],
            "suggestions": ["Kiểm tra thời tiết trên điện thoại"]
        }

@tool
def get_smart_directions(
    origin: Dict[str, float],
    destination: Dict[str, float],
    mode: str = "driving"
) -> Dict:
    """
    Lấy chỉ đường thông minh với thông tin traffic realtime.
    
    Args:
        origin: Điểm xuất phát {'lat': float, 'lng': float}
        destination: Điểm đến {'lat': float, 'lng': float}
        mode: Phương tiện ("driving", "walking", "transit", "bicycling")
    
    Returns:
        Dict với route info, duration, traffic status
    """
    try:
        api_key = os.getenv("GOOGLE_DIRECTIONS_API_KEY")
        if not api_key:
            print("   ⚠️ GOOGLE_DIRECTIONS_API_KEY not found")
            return {"error": "API key not configured"}
        
        origin_str = f"{origin['lat']},{origin['lng']}"
        dest_str = f"{destination['lat']},{destination['lng']}"
        
        # Call Google Directions API with traffic model
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": origin_str,
            "destination": dest_str,
            "mode": mode,
            "departure_time": "now",  # For real-time traffic
            "traffic_model": "best_guess",
            "key": api_key,
            "language": "vi"
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code != 200:
            print(f"   ❌ Directions API error: {response.status_code}")
            return {"error": "Directions API unavailable"}
        
        data = response.json()
        
        if data.get('status') != 'OK' or not data.get('routes'):
            return {"error": f"No route found: {data.get('status')}"}
        
        route = data['routes'][0]
        leg = route['legs'][0]
        
        # Extract route info
        distance = leg['distance']['text']
        distance_value = leg['distance']['value']  # meters
        
        duration = leg['duration']['text']
        duration_value = leg['duration']['value']  # seconds
        
        # Traffic info (if available)
        traffic_duration = leg.get('duration_in_traffic', {})
        traffic_duration_value = traffic_duration.get('value', duration_value)
        
        # Calculate traffic delay
        delay_seconds = traffic_duration_value - duration_value
        delay_minutes = round(delay_seconds / 60)
        
        # Traffic status
        traffic_status = "normal"
        if delay_minutes > 15:
            traffic_status = "heavy"
        elif delay_minutes > 5:
            traffic_status = "moderate"
        
        # Generate suggestions
        suggestions = []
        if traffic_status == "heavy":
            suggestions.extend([
                "⚠️ Giao thông đông, cân nhắc đi lúc khác",
                "Thử phương tiện khác (xe máy/grab bike)",
                "Hoãn 30-60 phút nếu không gấp"
            ])
        elif traffic_status == "moderate":
            suggestions.append("ℹ️ Giao thông hơi đông, dự phòng thêm thời gian")
        
        # Mode-specific tips
        if mode == "walking" and distance_value > 2000:
            suggestions.append("🚶 Quãng đường hơi xa, cân nhắc dùng xe")
        
        return {
            "distance": distance,
            "distance_meters": distance_value,
            "duration": duration,
            "duration_seconds": duration_value,
            "traffic_duration": traffic_duration.get('text', duration),
            "traffic_duration_seconds": traffic_duration_value,
            "delay_minutes": delay_minutes,
            "traffic_status": traffic_status,
            "polyline": route.get('overview_polyline', {}).get('points'),
            "suggestions": suggestions,
            "start_address": leg['start_address'],
            "end_address": leg['end_address']
        }
    
    except Exception as e:
        print(f"   ❌ Error getting directions: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@tool
def get_time_based_activity_suggestions(
    current_time: Optional[str] = None,
    current_location: Optional[Dict[str, float]] = None
) -> Dict:
    """
    Gợi ý hoạt động dựa trên thời gian trong ngày.
    
    Args:
        current_time: Thời gian hiện tại (HH:MM), None = auto-detect
        current_location: Vị trí hiện tại (optional)
    
    Returns:
        Dict với activity suggestions và nearby places
    """
    try:
        # Parse current time
        if current_time:
            hour = int(current_time.split(':')[0])
        else:
            hour = datetime.now().hour
        
        # Time-based suggestions
        suggestions = {
            "time_period": "",
            "activities": [],
            "place_types": [],
            "tips": []
        }
        
        if 5 <= hour < 8:
            suggestions["time_period"] = "Buổi sáng sớm"
            suggestions["activities"] = [
                "Tập thể dục tại công viên",
                "Chụp ảnh bình minh",
                "Ăn sáng phở/bánh mì"
            ]
            suggestions["place_types"] = ["park", "breakfast_place", "cafe"]
            suggestions["tips"] = ["Không khí mát mẻ, thích hợp tản bộ"]
        
        elif 8 <= hour < 12:
            suggestions["time_period"] = "Buổi sáng"
            suggestions["activities"] = [
                "Tham quan bảo tàng/chùa",
                "Khám phá chợ địa phương",
                "Uống cà phê thư giãn"
            ]
            suggestions["place_types"] = ["museum", "temple", "market", "cafe"]
            suggestions["tips"] = ["Thời điểm tốt để tham quan địa điểm đông người"]
        
        elif 12 <= hour < 14:
            suggestions["time_period"] = "Buổi trưa"
            suggestions["activities"] = [
                "Ăn trưa đặc sản địa phương",
                "Nghỉ ngơi tại quán cà phê",
                "Tránh nắng nóng"
            ]
            suggestions["place_types"] = ["restaurant", "cafe"]
            suggestions["tips"] = ["Tránh hoạt động ngoài trời, nắng nóng đỉnh điểm"]
        
        elif 14 <= hour < 17:
            suggestions["time_period"] = "Buổi chiều"
            suggestions["activities"] = [
                "Mua sắm quà lưu niệm",
                "Tham quan điểm du lịch",
                "Uống trà chiều"
            ]
            suggestions["place_types"] = ["shopping_mall", "tourist_attraction", "cafe"]
            suggestions["tips"] = ["Thời điểm tốt để mua sắm và tham quan"]
        
        elif 17 <= hour < 19:
            suggestions["time_period"] = "Hoàng hôn"
            suggestions["activities"] = [
                "Ngắm hoàng hôn",
                "Chụp ảnh golden hour",
                "Dạo biển/hồ"
            ]
            suggestions["place_types"] = ["viewpoint", "beach", "rooftop_bar"]
            suggestions["tips"] = ["Thời điểm chụp ảnh đẹp nhất trong ngày"]
        
        elif 19 <= hour < 22:
            suggestions["time_period"] = "Buổi tối"
            suggestions["activities"] = [
                "Ăn tối tại nhà hàng view đẹp",
                "Dạo chợ đêm",
                "Tham quan phố đi bộ"
            ]
            suggestions["place_types"] = ["restaurant", "night_market", "bar"]
            suggestions["tips"] = ["Khám phá ẩm thực và cuộc sống về đêm"]
        
        else:  # 22-5h
            suggestions["time_period"] = "Đêm khuya"
            suggestions["activities"] = [
                "Nghỉ ngơi tại khách sạn",
                "Bar/club (nếu thích)",
                "Ăn đêm"
            ]
            suggestions["place_types"] = ["bar", "late_night_food"]
            suggestions["tips"] = ["Hạn chế di chuyển, cẩn thận an toàn"]
        
        # If location provided, search nearby places matching time
        if current_location:
            try:
                nearby_suggestions = []
                for place_type in suggestions["place_types"][:2]:  # Top 2 types
                    places = search_nearby_places.invoke({
                        "current_location": current_location,
                        "category": place_type,
                        "radius_km": 2.0,
                        "limit": 3
                    })
                    if places:
                        nearby_suggestions.extend(places[:2])
                
                suggestions["nearby_places"] = nearby_suggestions
            except Exception as e:
                print(f"   ⚠️ Could not fetch nearby places: {e}")
        
        return suggestions
    
    except Exception as e:
        print(f"   ❌ Error getting time-based suggestions: {e}")
        return {
            "error": str(e),
            "activities": ["Nghỉ ngơi", "Ăn uống", "Tham quan"]
        }

# Export all tools for LangGraph
TOOLS = [
    search_places,
    calculate_distance, 
    optimize_route,
    optimize_route_with_ecs,  # NEW: AI Optimizer Service integration
    check_opening_status,
    check_weather,
    calculate_budget_estimate,
    # Live Travel Companion tools
    search_nearby_places,
    get_place_details,
    get_travel_tips,
    find_emergency_services,
    # NEW: Enhanced Companion Features
    get_weather_alerts_and_suggestions,
    get_smart_directions,
    get_time_based_activity_suggestions,
]

if __name__ == "__main__":
    # Test tools
    print("Testing search_places...")
    results = search_places.invoke({"query": "quán cà phê yên tĩnh", "limit": 3})
    for place in results[:3]:
        print(f"- {place.get('name', 'Unknown')}")
    
    print("\nTesting calculate_distance...")
    dist = calculate_distance.invoke({"point1": [21.0285, 105.8542], "point2": [21.0245, 105.8412]})
    print(f"Distance: {dist} km")
    
    print("\nTesting check_weather...")
    weather = check_weather.invoke({"date": "2025-11-25", "location": "Hanoi,VN"})
    print(f"Weather: {weather}")