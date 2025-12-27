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

# Helper function for internal use (not a tool)
def _calculate_distance_helper(point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
    """
    Helper function to calculate distance without @tool decorator.
    Used internally by other functions.
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
def calculate_distance(point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
    """
    Tính khoảng cách giữa 2 điểm theo tọa độ (lat, lng) bằng Haversine formula.
    
    Args:
        point1: (latitude, longitude) của điểm 1
        point2: (latitude, longitude) của điểm 2
        
    Returns:
        float: Khoảng cách tính theo km
    """
    return _calculate_distance_helper(point1, point2)

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
    
    Ưu tiên: 
    1. Google Places API (nếu có place_id) - để lấy thông tin mới nhất
    2. MongoDB - fallback
    
    Args:
        place_id: Google Place ID hoặc MongoDB _id
        place_name: Tên địa điểm (nếu không có place_id)
        
    Returns:
        Dict: Thông tin chi tiết về địa điểm
    """
    try:
        # Try Google Places API first if place_id is provided
        if place_id:
            api_key = os.getenv("GOOGLE_PLACES_API_KEY")
            
            # Check if place_id looks like a Google Place ID (starts with ChIJ or similar)
            if api_key and (place_id.startswith('ChIJ') or place_id.startswith('Ei') or place_id.startswith('Gd')):
                print(f"   → Fetching from Google Places API: {place_id}")
                try:
                    # Google Places API (New) - Place Details
                    url = f"https://places.googleapis.com/v1/places/{place_id}"
                    
                    headers = {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': api_key,
                        'X-Goog-FieldMask': (
                            'id,displayName,formattedAddress,location,rating,userRatingCount,'
                            'priceLevel,regularOpeningHours,internationalPhoneNumber,websiteUri,'
                            'editorialSummary,reviews,types,photos'
                        )
                    }
                    
                    response = requests.get(url, headers=headers, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        print(f"   ✅ Got details from Google Places API")
                        
                        # Extract opening hours
                        opening_hours = {}
                        if data.get('regularOpeningHours'):
                            hours_data = data['regularOpeningHours']
                            opening_hours = {
                                'open_now': hours_data.get('openNow', False),
                                'weekday_text': hours_data.get('weekdayDescriptions', [])
                            }
                        
                        # Extract reviews
                        reviews = []
                        if data.get('reviews'):
                            for review in data['reviews'][:5]:  # Get top 5 reviews
                                reviews.append({
                                    'rating': review.get('rating', 0),
                                    'text': review.get('text', {}).get('text', ''),
                                    'author': review.get('authorAttribution', {}).get('displayName', 'Anonymous'),
                                    'time': review.get('publishTime', '')
                                })
                        
                        # Format response
                        details = {
                            'place_id': place_id,
                            'google_place_id': place_id,
                            'name': data.get('displayName', {}).get('text', 'Unknown'),
                            'description': data.get('editorialSummary', {}).get('text', ''),
                            'editorial_summary': data.get('editorialSummary', {}).get('text', ''),
                            'address': data.get('formattedAddress', ''),
                            'formatted_address': data.get('formattedAddress', ''),
                            'type': data.get('types', [])[0] if data.get('types') else '',
                            'types': data.get('types', []),
                            'rating': data.get('rating', 0),
                            'user_ratings_total': data.get('userRatingCount', 0),
                            'price_level': data.get('priceLevel'),
                            'opening_hours': opening_hours,
                            'phone_number': data.get('internationalPhoneNumber', ''),
                            'website': data.get('websiteUri', ''),
                            'reviews': reviews,
                            'location': {
                                'lat': data.get('location', {}).get('latitude'),
                                'lng': data.get('location', {}).get('longitude')
                            },
                            'source': 'google_places_api'
                        }
                        
                        return details
                    else:
                        print(f"   ⚠️ Google Places API error: {response.status_code}, falling back to MongoDB")
                
                except Exception as e:
                    print(f"   ⚠️ Error calling Google Places API: {e}, falling back to MongoDB")
        
        # Fallback to MongoDB
        print(f"   → Fetching from MongoDB")
        query = {}
        
        if place_id:
            # Try both googlePlaceId and _id
            from bson import ObjectId
            try:
                query = {'$or': [
                    {'googlePlaceId': place_id},
                    {'google_place_id': place_id},
                    {'place_id': place_id},
                    {'_id': ObjectId(place_id)}
                ]}
            except:
                query = {'$or': [
                    {'googlePlaceId': place_id},
                    {'google_place_id': place_id},
                    {'place_id': place_id}
                ]}
        elif place_name:
            query = {'name': {'$regex': place_name, '$options': 'i'}}
        else:
            return {}
        
        place = places_collection.find_one(query, {"_id": 0})
        
        if not place:
            return {'error': 'Place not found'}
        
        # Format detailed info from MongoDB
        details = {
            'place_id': place.get('googlePlaceId') or place.get('google_place_id') or place.get('place_id', ''),
            'google_place_id': place.get('googlePlaceId') or place.get('google_place_id') or place.get('place_id', ''),
            'name': place.get('name', 'Unknown'),
            'description': place.get('description', ''),
            'address': place.get('formatted_address') or place.get('address', ''),
            'formatted_address': place.get('formatted_address') or place.get('address', ''),
            'type': place.get('type', ''),
            'rating': place.get('rating'),
            'user_ratings_total': place.get('user_ratings_total'),
            'price_level': place.get('priceLevel'),
            'budget_range': place.get('budgetRange', 'mid-range'),
            'opening_hours': place.get('openingHours', {}),
            'phone_number': place.get('phone', ''),
            'website': place.get('website', ''),
            'photos': place.get('photos', []),
            'emotional_tags': place.get('emotionalTags', {}),
            'visit_duration_minutes': place.get('visit_duration_minutes', 90),
            'source': 'mongodb'
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
def get_weather_forecast(current_location: Dict[str, float], days: int = 5) -> Dict:
    """
    Lấy dự báo thời tiết 5 ngày tới và gợi ý hoạt động phù hợp.
    
    Args:
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
        days: Số ngày dự báo (mặc định 5, tối đa 5)
    
    Returns:
        Dict với current weather, forecast 5 days, alerts và suggestions
    """
    try:
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        
        if not lat or not lng:
            return {"error": "Invalid location"}
        
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            print("   ⚠️ OPENWEATHER_API_KEY not found, using fallback")
            return {
                "weather": "Unknown",
                "temperature": 25,
                "alerts": [],
                "suggestions": ["Mang theo nước uống", "Thoa kem chống nắng"],
                "forecast": []
            }
        
        # Get current weather
        current_url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={api_key}&units=metric&lang=vi"
        current_response = requests.get(current_url, timeout=5)
        
        # Get 5-day forecast
        forecast_url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lng}&appid={api_key}&units=metric&lang=vi"
        forecast_response = requests.get(forecast_url, timeout=5)
        
        if current_response.status_code != 200:
            print(f"   ❌ Weather API error: {current_response.status_code}")
            return {"error": "Weather API unavailable"}
        
        current_data = current_response.json()
        
        # Extract current weather info
        temp = round(current_data['main']['temp'])
        feels_like = round(current_data['main']['feels_like'])
        humidity = current_data['main']['humidity']
        weather_main = current_data['weather'][0]['main']
        weather_desc = current_data['weather'][0]['description']
        wind_speed = current_data.get('wind', {}).get('speed', 0)
        
        # Process forecast data
        forecast_list = []
        if forecast_response.status_code == 200:
            forecast_data = forecast_response.json()
            # Group by day (take midday forecast ~12:00)
            daily_forecasts = {}
            for item in forecast_data['list']:
                date = datetime.fromtimestamp(item['dt']).date()
                hour = datetime.fromtimestamp(item['dt']).hour
                
                # Take midday forecast (closest to 12:00)
                if date not in daily_forecasts or abs(hour - 12) < abs(daily_forecasts[date]['hour'] - 12):
                    daily_forecasts[date] = {
                        'hour': hour,
                        'temp': round(item['main']['temp']),
                        'condition': item['weather'][0]['main'],
                        'description': item['weather'][0]['description'],
                        'rain_probability': item.get('pop', 0) * 100  # Probability of precipitation
                    }
            
            # Convert to list and limit to requested days
            for date in sorted(daily_forecasts.keys())[:days]:
                forecast_list.append({
                    'date': date.strftime('%d/%m/%Y'),
                    'day_name': date.strftime('%A'),
                    **daily_forecasts[date]
                })
        
        # Generate alerts based on weather
        alerts = []
        suggestions = []
        indoor_needed = False
        
        # Temperature alerts
        if temp > 35:
            alerts.append("🔥 Nhiệt độ rất cao! Hạn chế hoạt động ngoài trời.")
            suggestions.extend([
                "Tìm quán cà phê có điều hòa",
                "Ghé trung tâm thương mại",
                "Tránh ra ngoài 11h-15h"
            ])
            indoor_needed = True
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
                "Tham quan bảo tàng, viện bảo tàng",
                "Đi trung tâm mua sắm",
                "Tham quan thủy cung",
                "Thư giãn tại spa"
            ])
            indoor_needed = True
        
        # Wind alerts
        if wind_speed > 10:
            alerts.append("💨 Gió mạnh, cẩn thận khi di chuyển")
        
        # Humidity alerts
        if humidity > 80:
            alerts.append("💧 Độ ẩm cao, có thể khó chịu")
            suggestions.append("Chọn địa điểm có điều hòa")
            indoor_needed = True
        
        # Check forecast for rain in next few days
        upcoming_rain = [f for f in forecast_list if f.get('condition') in ['Rain', 'Drizzle', 'Thunderstorm']]
        if upcoming_rain:
            dates = ", ".join([f['date'] for f in upcoming_rain[:2]])
            alerts.append(f"📅 Dự báo có mưa: {dates}")
            # Also mark indoor as needed if rain is forecasted soon
            indoor_needed = True
        
        return {
            "temperature": temp,
            "feels_like": feels_like,
            "humidity": humidity,
            "wind_speed": wind_speed,
            "condition": weather_main,
            "description": weather_desc,
            "alerts": alerts,
            "suggestions": suggestions,
            "indoor_needed": indoor_needed,
            "forecast": forecast_list,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"   ❌ Error getting weather: {e}")
        return {
            "error": str(e),
            "alerts": [],
            "suggestions": ["Kiểm tra thời tiết trên điện thoại"],
            "forecast": []
        }

@tool
def search_indoor_places(current_location: Dict[str, float], limit: int = 10) -> List[Dict]:
    """
    Tìm các địa điểm trong nhà phù hợp khi thời tiết xấu (mưa, nắng nóng).
    Ưu tiên Google Places API để có kết quả chính xác và realtime.
    
    Args:
        current_location: Vị trí hiện tại {'lat': float, 'lng': float}
        limit: Số lượng địa điểm tối đa
    
    Returns:
        List các địa điểm trong nhà gần nhất
    """
    try:
        lat = current_location.get('lat')
        lng = current_location.get('lng')
        user_coords = (lat, lng)
        
        unique_places = []
        seen_names = set()
        
        # Search directly in MongoDB (Google Places API not enabled for legacy APIs)
        print(f"   🔍 Searching indoor places in MongoDB at ({lat}, {lng})...")
        
        # Search terms for indoor places (both Vietnamese and English)
        indoor_search_terms = [
            # Shopping
            'trung tâm thương mại', 'shopping mall', 'vincom', 'aeon', 'lotte',
            # Museum & Culture
            'bảo tàng', 'museum', 'viện bảo tàng', 'art gallery', 'phòng tranh',
            # Food & Beverage
            'cafe', 'cà phê', 'coffee', 'nhà hàng', 'restaurant', 
            # Entertainment
            'rạp chiếu phim', 'cinema', 'cgv', 'galaxy',
            # Wellness & Spa
            'spa', 'massage',
            # Aquarium
            'thủy cung', 'aquarium',
        ]
        
        # Search with each term directly in MongoDB
        for search_term in indoor_search_terms:
            if len(unique_places) >= limit * 2:  # Get more candidates
                break
            
            try:
                # Direct MongoDB query with regex
                places = list(places_collection.find({
                    "$or": [
                        {"name": {"$regex": search_term, "$options": "i"}},
                        {"description": {"$regex": search_term, "$options": "i"}},
                        {"type": {"$regex": search_term, "$options": "i"}}
                    ]
                }, {"_id": 0}).limit(5))
                
                for place in places:
                    name = place.get('name', '')
                    if name and name not in seen_names:
                        if 'location' in place and 'coordinates' in place['location']:
                            lng_db, lat_db = place['location']['coordinates']
                            distance = _calculate_distance_helper(user_coords, (lat_db, lng_db))
                            
                            # Include places within 10km (wider radius)
                            if distance <= 10.0:
                                place['distance_km'] = distance
                                place['source'] = 'mongodb'
                                
                                # Ensure rating fields exist
                                if 'rating' not in place:
                                    place['rating'] = None
                                if 'user_ratings_total' not in place:
                                    place['user_ratings_total'] = 0
                                
                                unique_places.append(place)
                                seen_names.add(name)
                                print(f"      • {name} - {distance:.1f}km")
                                
                                if len(unique_places) >= limit * 2:
                                    break
                                    
            except Exception as e:
                print(f"   ⚠️ Error searching '{search_term}': {e}")
                continue
        
        # If still not enough, try searching by common types
        if len(unique_places) < limit:
            print(f"   🔍 Broadening search with common types...")
            common_types = ['cafe', 'restaurant', 'museum', 'shopping', 'cinema']
            
            for place_type in common_types:
                if len(unique_places) >= limit * 2:
                    break
                
                try:
                    places = list(places_collection.find({
                        "type": {"$regex": place_type, "$options": "i"}
                    }, {"_id": 0}).limit(10))
                    
                    for place in places:
                        name = place.get('name', '')
                        if name and name not in seen_names:
                            if 'location' in place and 'coordinates' in place['location']:
                                lng_db, lat_db = place['location']['coordinates']
                                distance = _calculate_distance_helper(user_coords, (lat_db, lng_db))
                                
                                if distance <= 10.0:
                                    place['distance_km'] = distance
                                    place['source'] = 'mongodb'
                                    
                                    if 'rating' not in place:
                                        place['rating'] = None
                                    if 'user_ratings_total' not in place:
                                        place['user_ratings_total'] = 0
                                    
                                    unique_places.append(place)
                                    seen_names.add(name)
                                    print(f"      • {name} - {distance:.1f}km")
                                    
                                    if len(unique_places) >= limit * 2:
                                        break
                except Exception as e:
                    print(f"   ⚠️ Error searching type '{place_type}': {e}")
                    continue
        
        # Sort by distance and return top results
        unique_places.sort(key=lambda x: x.get('distance_km', 999))
        
        result = unique_places[:limit]
        print(f"   ✅ Returning {len(result)} indoor places from MongoDB")
        return result
    
    except Exception as e:
        print(f"   ❌ Error searching indoor places: {e}")
        import traceback
        traceback.print_exc()
        return []

@tool
def get_weather_alerts_and_suggestions(current_location: Dict[str, float]) -> Dict:
    """
    DEPRECATED: Use get_weather_forecast() instead.
    Kept for backward compatibility.
    """
    return get_weather_forecast(current_location, days=1)

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

@tool
def get_itinerary_details(itinerary_data: Dict) -> Dict:
    """
    Lấy thông tin chi tiết về itinerary của user.
    
    Args:
        itinerary_data: Dictionary chứa thông tin itinerary từ frontend/backend
        
    Returns:
        Dict: Thông tin chi tiết về lộ trình bao gồm:
        - title: Tiêu đề lộ trình
        - destination: Điểm đến
        - duration_days: Số ngày
        - route_data: Dữ liệu chi tiết từng ngày và địa điểm
    """
    try:
        if not itinerary_data:
            return {"error": "No itinerary data provided"}
        
        # Parse itinerary structure
        result = {
            "route_id": itinerary_data.get("route_id", ""),
            "title": itinerary_data.get("title", ""),
            "destination": itinerary_data.get("destination", ""),
            "duration_days": itinerary_data.get("duration_days", 0),
            "start_datetime": itinerary_data.get("start_datetime"),
            "total_places": 0,
            "days": []
        }
        
        # Extract route data
        route_data = itinerary_data.get("route_data_json", {})
        
        # Debug log
        print(f"[get_itinerary_details] Parsing itinerary...")
        print(f"   Has route_data_json: {bool(route_data)}")
        print(f"   Has optimized_route: {bool(route_data.get('optimized_route'))}")
        print(f"   Has days: {bool(route_data.get('days'))}")
        
        # Handle both "days" and "optimized_route" structures
        days = route_data.get("days", []) or route_data.get("optimized_route", [])
        print(f"   Total days found: {len(days)}")
        
        for day_idx, day in enumerate(days):
            day_info = {
                "day_number": day.get("day", day_idx + 1),
                "date": day.get("date"),
                "places": []
            }
            
            activities = day.get("activities", [])
            print(f"   Day {day_info['day_number']}: {len(activities)} activities")
            
            for act_idx, activity in enumerate(activities):
                # Handle both structures:
                # 1. Nested: activity.place.name (old structure with saved itineraries)
                # 2. Direct: activity.name (new structure with optimized_route)
                place = activity.get("place", {})
                
                # Debug first activity of first day
                if day_idx == 0 and act_idx == 0:
                    print(f"   First activity structure:")
                    print(f"      Has 'place' key: {bool(place)}")
                    print(f"      Has 'name' in activity: {bool(activity.get('name'))}")
                    print(f"      Has 'name' in place: {bool(place.get('name') if place else False)}")
                
                if not place or not place.get("name"):
                    # Try to get place data directly from activity (optimized_route structure)
                    place = activity
                
                # Skip if no name found
                if not place.get("name"):
                    print(f"      ⚠️ Skipping activity without name")
                    continue
                
                # Get address - prefer provided address, fallback to fetch from Google Places
                address = place.get("address", "")
                place_id = place.get("place_id", "") or place.get("google_place_id", "")
                
                if not address and place_id:
                    # Try to get address from Google Places using place_id
                    try:
                        place_details = get_place_details.invoke({"place_id": place_id})
                        if place_details and not place_details.get("error"):
                            address = place_details.get("address", "")
                            # Also update rating if not present
                            if not place.get("rating"):
                                place["rating"] = place_details.get("rating", 0)
                            # Update description if not present
                            if not place.get("description"):
                                place["description"] = place_details.get("description", "")
                    except Exception as e:
                        print(f"      ⚠️ Failed to fetch place details for {place_id}: {e}")
                
                # Fallback to coordinates if no address found
                if not address and place.get("location"):
                    loc = place.get("location", {})
                    if isinstance(loc, dict):
                        lat = loc.get('lat')
                        lng = loc.get('lng')
                        if lat and lng:
                            address = f"Lat: {lat}, Lng: {lng}"
                
                place_info = {
                    "place_id": place.get("place_id", "") or place.get("google_place_id", ""),
                    "name": place.get("name", ""),
                    "type": place.get("type", ""),
                    "address": address,
                    "rating": place.get("rating", 0),
                    "description": place.get("description", ""),
                    "location": place.get("location", {}),
                    "time": activity.get("time", activity.get("estimated_arrival", "")),
                    "duration": activity.get("duration", activity.get("visit_duration_minutes", ""))
                }
                day_info["places"].append(place_info)
                result["total_places"] += 1
            
            result["days"].append(day_info)
        
        print(f"   ✅ Parsed {result['total_places']} total places across {len(result['days'])} days")
        
        return result
        
    except Exception as e:
        print(f"Error in get_itinerary_details: {e}")
        return {"error": str(e)}


@tool
def get_place_from_itinerary(itinerary_data: Dict, place_name: str = None, day_number: int = None) -> List[Dict]:
    """
    Lấy thông tin chi tiết về một hoặc nhiều địa điểm trong itinerary.
    
    Args:
        itinerary_data: Dictionary chứa thông tin itinerary
        place_name: Tên địa điểm cần tìm (tìm kiếm không phân biệt hoa thường)
        day_number: Số ngày trong lộ trình (1, 2, 3...)
        
    Returns:
        List[Dict]: Danh sách địa điểm matching với search criteria
    """
    try:
        if not itinerary_data:
            return []
        
        route_data = itinerary_data.get("route_data_json", {})
        
        # Handle both "days" and "optimized_route" structures
        days = route_data.get("days", []) or route_data.get("optimized_route", [])
        
        matching_places = []
        
        for day in days:
            # Filter by day if specified
            if day_number and day.get("day") != day_number:
                continue
            
            activities = day.get("activities", [])
            for activity in activities:
                # Handle both structures:
                # 1. Nested: activity.place.name (old structure)
                # 2. Direct: activity.name (optimized_route structure)
                place = activity.get("place", {})
                if not place or not place.get("name"):
                    # Try to get place data directly from activity (optimized_route structure)
                    place = activity
                
                # Filter by place name if specified
                if place_name:
                    place_name_lower = place_name.lower()
                    current_place_name = place.get("name", "").lower()
                    if place_name_lower not in current_place_name:
                        continue
                
                # Build place info
                # Note: optimized_route might not have address, so we construct it if needed
                address = place.get("address", "")
                if not address and place.get("location"):
                    # Fallback: construct location string from coordinates if no address provided
                    loc = place.get("location", {})
                    if isinstance(loc, dict) and ("lat" in loc or "lng" in loc):
                        address = f"Lat: {loc.get('lat', 'N/A')}, Lng: {loc.get('lng', 'N/A')}"
                
                # Extract emotional tags - handle both list and dict formats
                emotional_tags = place.get("emotional_tags", [])
                if isinstance(emotional_tags, dict):
                    emotional_tags = list(emotional_tags.keys())
                elif not isinstance(emotional_tags, list):
                    emotional_tags = []
                
                place_info = {
                    "day": day.get("day"),
                    "date": day.get("date"),
                    "place_id": place.get("place_id", "") or place.get("google_place_id", ""),
                    "name": place.get("name", ""),
                    "type": place.get("type", ""),
                    "address": address,
                    "rating": place.get("rating", 0),
                    "description": place.get("description", ""),
                    "location": place.get("location", {}),
                    "opening_hours": place.get("opening_hours", {}),
                    "time": activity.get("time", activity.get("estimated_arrival", "")),
                    "duration": activity.get("duration", activity.get("visit_duration_minutes", "")),
                    "emotional_tags": emotional_tags,
                    "price_level": place.get("price_level", "")
                }
                matching_places.append(place_info)
        
        return matching_places
        
    except Exception as e:
        print(f"Error in get_place_from_itinerary: {e}")
        return []


@tool
def add_place_to_itinerary_backend(place_data: Dict, itinerary_data: Dict, day_number: int, time: str = "TBD", duration: str = "2 hours") -> Dict:
    """
    Thêm địa điểm mới vào itinerary. Hỗ trợ cả saved + draft itinerary.
    Note: Frontend sẽ handle actual API call - function này chuẩn bị data.
    
    Args:
        place_data: Dictionary chứa thông tin địa điểm (name, google_place_id, etc.)
        itinerary_data: Dictionary chứa thông tin itinerary hiện tại
        day_number: Ngày muốn thêm địa điểm (1, 2, 3...)
        time: Thời gian dự kiến (VD: "09:00", "14:30")
        duration: Thời gian dự kiến ở địa điểm (VD: "2 hours", "90 minutes")
        
    Returns:
        Dict: Thông tin xác nhận thêm địa điểm (frontend sẽ xử lý actual save)
    """
    try:
        if not place_data or not itinerary_data:
            return {"success": False, "error": "Missing place or itinerary data"}
        
        # Validate day number
        duration_days = itinerary_data.get("duration_days", 1)
        if day_number > duration_days or day_number < 1:
            return {
                "success": False,
                "error": f"Ngày {day_number} không hợp lệ. Lộ trình có {duration_days} ngày."
            }
        
        # Prepare place data to add
        place_to_add = {
            "google_place_id": place_data.get("google_place_id") or place_data.get("place_id"),
            "name": place_data.get("name", ""),
            "type": place_data.get("type", "tourist_attraction"),
            "address": place_data.get("address", ""),
            "rating": place_data.get("rating", 0),
            "description": place_data.get("description", ""),
            "location": place_data.get("location", {}),
            "time": time,
            "duration": duration
        }
        
        return {
            "success": True,
            "message": f"✅ Thêm '{place_data.get('name')}' vào ngày {day_number} lúc {time}",
            "place_to_add": place_to_add,
            "day_number": day_number,
            "route_id": itinerary_data.get("route_id"),
            "instruction": "Frontend sẽ gọi API backend để lưu thay đổi này vào itinerary."
        }
        
    except Exception as e:
        print(f"Error in add_place_to_itinerary_backend: {e}")
        return {"success": False, "error": str(e)}


@tool  
def suggest_additional_places(itinerary_data: Dict, preferences: Dict) -> List[Dict]:
    """
    Gợi ý các địa điểm bổ sung phù hợp với itinerary hiện tại.
    
    Args:
        itinerary_data: Dictionary chứa thông tin itinerary hiện tại
        preferences: Dictionary chứa preferences của user:
            - category: Loại địa điểm (restaurant, cafe, museum...)
            - emotional_tags: Tags cảm xúc mong muốn
            - day_number: Ngày muốn thêm địa điểm
            - near_place: Tìm gần địa điểm nào trong itinerary
            
    Returns:
        List[Dict]: Danh sách địa điểm gợi ý
    """
    try:
        if not itinerary_data:
            return []
        
        # Get destination from itinerary
        destination = itinerary_data.get("destination", "")
        
        # Get existing places to avoid duplicates
        route_data = itinerary_data.get("route_data_json", {})
        # Handle both "days" and "optimized_route" structures
        days = route_data.get("days", []) or route_data.get("optimized_route", [])
        existing_place_ids = set()
        
        for day in days:
            for activity in day.get("activities", []):
                # Handle both structures
                place = activity.get("place", {})
                if not place or not place.get("place_id"):
                    # Try to get place data directly from activity (optimized_route structure)
                    place = activity
                
                place_id = place.get("place_id") or place.get("google_place_id")
                if place_id:
                    existing_place_ids.add(place_id)
        
        # Build search query
        category = preferences.get("category", "")
        emotional_tags = preferences.get("emotional_tags", [])
        
        # Search for places - ONLY from database (not Google Places API)
        # This ensures all suggestions can be added to itinerary
        query = f"{category} {destination}"
        if emotional_tags:
            query += f" {' '.join(emotional_tags)}"
        
        print(f"   🔍 Searching database for: '{query}'")
        print(f"   📂 Category filter: {category if category else 'None'}")
        print(f"   🎯 Location: {destination}")
        
        suggestions = search_places.invoke({
            "query": query,
            "location_filter": destination,
            "category_filter": category if category else None,
            "limit": 20  # Get more to filter duplicates
        })
        
        print(f"   ✅ Found {len(suggestions)} places in database")
        
        # Filter out existing places
        new_suggestions = []
        for place in suggestions:
            if place.get("place_id") not in existing_place_ids:
                new_suggestions.append(place)
        
        # Calculate distance from itinerary center (average of all places) for better ranking
        if new_suggestions and days:
            # Calculate center point of itinerary
            all_coords = []
            for day in days:
                for activity in day.get("activities", []):
                    # Handle both structures
                    place = activity.get("place", {})
                    if not place or not place.get("location"):
                        place = activity
                    
                    loc = place.get("location", {})
                    if loc.get("coordinates"):
                        all_coords.append(loc["coordinates"])
            
            if all_coords:
                # Calculate average lat/lng
                avg_lat = sum(coord[0] for coord in all_coords) / len(all_coords)
                avg_lng = sum(coord[1] for coord in all_coords) / len(all_coords)
                
                # Calculate distance from center for each suggestion
                for suggestion in new_suggestions:
                    loc = suggestion.get("location", {})
                    if loc.get("coordinates"):
                        lat, lng = loc["coordinates"]
                        distance = _calculate_distance_helper((avg_lat, avg_lng), (lat, lng))
                        suggestion["distance_from_reference"] = round(distance, 2)
                
                # Sort by combination of rating and distance (prefer high rating + closer)
                def score_suggestion(s):
                    rating = s.get("rating", 0) or 0
                    distance = s.get("distance_from_reference", 999)
                    # Normalize: higher rating is better, lower distance is better
                    # Score = rating * 2 - distance * 0.5 (adjust weights as needed)
                    return rating * 2.0 - distance * 0.3
                
                new_suggestions.sort(key=score_suggestion, reverse=True)
        
        # If near_place specified, prioritize places near it
        near_place = preferences.get("near_place")
        if near_place and new_suggestions:
            # Find the reference place in itinerary
            for day in days:
                for activity in day.get("activities", []):
                    # Handle both structures
                    place = activity.get("place", {})
                    if not place or not place.get("name"):
                        # Try to get place data directly from activity (optimized_route structure)
                        place = activity
                    
                    if place.get("name") == near_place or place.get("place_id") == near_place or place.get("google_place_id") == near_place:
                        ref_location = place.get("location", {})
                        if ref_location.get("coordinates"):
                            ref_lat, ref_lng = ref_location["coordinates"]
                            
                            # Recalculate distances from this specific place
                            for suggestion in new_suggestions:
                                loc = suggestion.get("location", {})
                                if loc.get("coordinates"):
                                    lat, lng = loc["coordinates"]
                                    distance = _calculate_distance_helper((ref_lat, ref_lng), (lat, lng))
                                    suggestion["distance_from_reference"] = round(distance, 2)
                            
                            # Sort by distance only when near_place is specified
                            new_suggestions.sort(key=lambda x: x.get("distance_from_reference", float('inf')))
                        break
        
        return new_suggestions[:10]  # Return top 10 suggestions
        
    except Exception as e:
        print(f"Error in suggest_additional_places: {e}")
        return []


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
    # NEW: Itinerary Integration Tools
    get_itinerary_details,
    get_place_from_itinerary,
    suggest_additional_places,
    add_place_to_itinerary_backend,
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