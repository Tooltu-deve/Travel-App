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
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

@tool
def search_places(query: str, location_filter: Optional[str] = None, category_filter: Optional[str] = None, limit: int = 10) -> List[Dict]:
    """
    Tìm kiếm địa điểm dựa trên query và filters.
    
    Args:
        query: Mô tả địa điểm muốn tìm ("quán cà phê yên tĩnh", "bảo tàng lịch sử")
        location_filter: Khu vực cụ thể ("Quận 1", "Hà Nội")  
        category_filter: Loại hình ("restaurant", "museum", "park")
        limit: Số lượng kết quả tối đa
        
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
            
        # Get all matching places first
        places = list(places_collection.find(mongo_filter, {"_id": 0}).limit(limit * 2))
        
        if not places:
            return []
            
        # If query is provided, use semantic search
        if query.strip():
            # Create embeddings for search
            query_embedding = embedding_model.encode(query)
            
            # Calculate similarity for each place
            scored_places = []
            for place in places:
                # Create text representation of place
                place_text = f"{place.get('name', '')} {place.get('description', '')} {place.get('type', '')}"
                place_embedding = embedding_model.encode(place_text)
                
                # Calculate cosine similarity
                similarity = np.dot(query_embedding, place_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(place_embedding)
                )
                
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
            
            poi = {
                'google_place_id': place.get('googlePlaceId') or str(place.get('_id')),
                'name': place.get('name', 'Unknown'),
                'emotional_tags': emotional_tags,
                'location': {'lat': lat, 'lng': lng},
                'opening_hours': opening_hours,
                'visit_duration_minutes': place.get('visit_duration_minutes', 90)
            }
            poi_list.append(poi)
        
        if not poi_list:
            print("⚠️ No valid POIs to optimize")
            return {'optimized_route': []}
        
        # Prepare request payload
        payload = {
            'poi_list': poi_list,
            'user_mood': user_mood,
            'duration_days': duration_days,
            'current_location': current_location,
            'start_datetime': start_datetime,
            'ecs_score_threshold': ecs_score_threshold
        }
        
        print(f"🔄 Calling AI Optimizer Service with {len(poi_list)} POIs...")
        print(f"   → User mood: {user_mood}")
        print(f"   → Duration: {duration_days} days")
        print(f"   → ECS threshold: {ecs_score_threshold}")
        
        # Call AI Optimizer Service
        response = requests.post(
            f"{AI_OPTIMIZER_URL}/optimize-route",
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

# Export all tools for LangGraph
TOOLS = [
    search_places,
    calculate_distance, 
    optimize_route,
    optimize_route_with_ecs,  # NEW: AI Optimizer Service integration
    check_opening_status,
    check_weather,
    calculate_budget_estimate
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