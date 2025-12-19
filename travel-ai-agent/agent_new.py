"""
Travel AI Agent - Companion Mode Only
=====================================
Focus on real-time travel assistance while on a trip.
No itinerary creation - users bring their own itinerary.

Features:
- Nearby search (restaurants, attractions, services)
- Emergency services & utilities finder
- Food & travel tips
- Photo spot suggestions
- Place information & recommendations
"""

import os
from typing import Dict, List, TypedDict, Annotated, Optional
from datetime import datetime, timedelta
import json
import re
import requests

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from tools import (
    search_nearby_places, get_place_details, get_travel_tips, 
    find_emergency_services,
    # Enhanced features
    get_weather_forecast,
    search_indoor_places,
    get_smart_directions,
    get_time_based_activity_suggestions,
    # Itinerary integration
    get_itinerary_details,
    get_place_from_itinerary,
    suggest_additional_places,
    add_place_to_itinerary_backend
)

load_dotenv()

# =====================================
# LLM INITIALIZATION
# =====================================

def get_llm():
    """Initialize OpenAI LLM"""
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,
        api_key=os.getenv("OPENAI_API_KEY")
    )

llm = get_llm()

# =====================================
# STATE DEFINITION
# =====================================

class TravelState(TypedDict):
    """Conversation state for companion mode"""
    messages: Annotated[list, add_messages]
    current_location: Optional[Dict]  # {'lat': float, 'lng': float}
    active_place_id: Optional[str]    # Current place user is at
    itinerary: Optional[List[Dict]]   # User's itinerary (reference only)

# =====================================
# GRAPH NODES
# =====================================

def companion_assistant_node(state: TravelState) -> TravelState:
    """
    Main node: Handle real-time travel questions
    Supports: nearby search, emergency services, food tips, photo spots, place info
    """
    print("🧭 CompanionAssistant: Processing travel question...")
    
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    user_text = last_message.lower()
    
    current_location = state.get("current_location")
    active_place_id = state.get("active_place_id")
    
    print(f"   📍 Current location: {current_location}")
    print(f"   🏛️ Active place: {active_place_id}")
    
    response_text = "🤔 Xin lỗi, tôi chưa hiểu câu hỏi của bạn.\n\n💡 Bạn có thể hỏi:\n• Quán cà phê gần đây\n• Nhà hàng xung quanh\n• Ăn gì ở đây ngon?\n• Chỗ nào chụp ảnh đẹp?"
    
    try:
        # PRIORITY -1: ITINERARY QUERIES (highest priority for itinerary context)
        # Works with both saved and draft (being created) itineraries
        itinerary_data = state.get("itinerary")
        if itinerary_data and any(word in user_text for word in [
            "lộ trình", "itinerary", "hành trình", "kế hoạch", 
            "địa điểm trong", "ngày", "thêm địa điểm", "thêm vào",
            "gợi ý thêm", "nên thêm", "có nên", "nên đi",
            # Additional keywords for draft mode
            "địa điểm này", "chỗ này", "nơi này",
            # Keywords for showing all places or specific place info
            "các địa điểm", "tất cả địa điểm", "giới thiệu", "cho tôi biết", "kể về", "thông tin về", "danh sách"
        ]):
            is_draft = itinerary_data.get('status') == 'DRAFT' or not itinerary_data.get('route_id')
            print(f"   📋 Type: Itinerary query ({'Draft' if is_draft else 'Saved'})")
            response_text = _handle_itinerary_query(user_text, itinerary_data, current_location)
        
        # PRIORITY 0: SMART FEATURES (weather, directions, time-based)
        elif any(word in user_text for word in ["thời tiết", "weather", "trời", "nắng", "mưa", "nhiệt độ", "dự báo", "forecast"]):
            print("   🌤️ Type: Weather check")
            response_text = _handle_weather_check(user_text, current_location, state.get("itinerary"))
        
        elif any(word in user_text for word in ["chỉ đường", "đường đi", "directions", "đi như thế nào", "đi đến", "đến đây", "từ đây", "traffic", "kẹt xe", "giao thông", "muốn đến", "đi tới", "đông người", "đông đúc", "tắc đường", "tình trạng đường", "có đông không", "có kẹt không"]):
            print("   🚗 Type: Smart directions / Traffic check")
            print(f"   🔍 User text for directions: '{user_text}'")
            # Check if user is asking specifically about traffic
            is_traffic_query = any(word in user_text for word in ["kẹt xe", "đông người", "đông đúc", "tắc đường", "traffic", "có đông", "có kẹt"])
            response_text = _handle_smart_directions(user_text, current_location, state.get("itinerary"), is_traffic_focus=is_traffic_query)
        
        elif any(word in user_text for word in ["nên làm gì", "làm gì bây giờ", "hoạt động", "activity", "suggest", "gợi ý hoạt động"]):
            print("   ⏰ Type: Time-based suggestions")
            response_text = _handle_time_suggestions(user_text, current_location)
        
        # PRIORITY 1: PLACE INTRODUCTION (specific place queries)
        elif any(word in user_text for word in ["giới thiệu", "cho tôi biết", "kể về", "tell me about", "thông tin về", "tìm hiểu về", "về địa điểm"]):
            print("   📍 Type: Place introduction")
            # Check if asking about place in itinerary
            if itinerary_data:
                response_text = _handle_place_introduction_with_itinerary(user_text, itinerary_data, current_location)
            else:
                response_text = _handle_place_introduction(user_text, current_location)
        
        # PRIORITY 2: EMERGENCY SERVICES & UTILITIES
        elif any(word in user_text for word in [
            # Y tế
            "bệnh viện", "hospital", "pharmacy", "nhà thuốc", "hiệu thuốc",
            # Tài chính
            "atm", "ngân hàng", "bank", "rút tiền",
            # An ninh
            "khẩn cấp", "emergency", "cấp cứu", "công an", "cảnh sát", "police", "cứu hỏa", "fire",
            # Tiện ích
            "bãi đỗ xe", "parking", "đỗ xe", "chỗ đỗ", "bãi giữ xe",
            "cửa hàng tiện lợi", "convenience store", "siêu thị", "supermarket",
            "nhà vệ sinh", "toilet", "restroom", "wc",
            "trạm xăng", "gas station", "xăng", "petrol",
            "trạm xe buýt", "bus station", "xe buýt", "tàu điện", "subway", "metro",
            "bưu điện", "post office"
        ]):
            print("   🚨 Type: Emergency/Utility services")
            response_text = _handle_emergency_services(user_text, current_location)
        
        # PRIORITY 3: NEARBY SEARCH
        elif any(word in user_text for word in ["gần đây", "nearby", "xung quanh", "quanh đây", "gần"]):
            print("   🔍 Type: Nearby search")
            response_text = _handle_nearby_search(user_text, current_location)
        
        # PRIORITY 4: FOOD QUESTIONS
        elif any(word in user_text for word in ["ăn gì", "món gì", "đặc sản", "food", "eat", "quán ăn", "món ăn", "gợi ý món", "nên ăn"]):
            print("   🍽️ Type: Food suggestions")
            response_text = _handle_contextual_food_suggestions(user_text, current_location)
        
        # PRIORITY 5: PHOTO/CHECK-IN TIPS
        elif any(word in user_text for word in ["check-in", "checkin", "chụp ảnh", "photo", "sống ảo"]):
            print("   📸 Type: Photo tips")
            response_text = _handle_photo_tips(user_text, active_place_id)
        
        # PRIORITY 6: PLACE INFORMATION (current place)
        elif any(word in user_text for word in ["địa điểm này", "chỗ này", "đây", "place", "here", "thông tin", "info"]):
            print("   ℹ️ Type: Place info")
            response_text = _handle_place_info(user_text, active_place_id)
        
        # DEFAULT: General travel question or first-time greeting
        else:
            # Check if this is first message
            if len(state.get("messages", [])) <= 1 and any(word in user_text for word in ["xin chào", "hello", "hi", "chào", "hey"]):
                print("   👋 Type: Greeting / First time user")
                response_text = _handle_greeting(current_location)
            else:
                # Check if travel-related before processing
                if not _is_travel_related(user_text):
                    print("   🚫 Non-travel question detected in default case")
                    response_text = """🧳 Xin lỗi, tôi là **trợ lý du lịch AI** và chỉ có thể hỗ trợ các câu hỏi liên quan đến du lịch.

💡 **Tôi có thể giúp bạn:**
• Tìm địa điểm gần đây (nhà hàng, quán café, bảo tàng...)
• Kiểm tra thời tiết và gợi ý hoạt động
• Chỉ đường và thông tin giao thông
• Gợi ý món ăn địa phương
• Tìm dịch vụ khẩn cấp (bệnh viện, ATM, công an...)
• Thông tin về địa điểm tham quan
• Tips chụp ảnh và check-in

❓ **Hãy hỏi tôi về du lịch nhé!**
Ví dụ: "Quán cà phê gần đây", "Thời tiết hôm nay", "Đặc sản ở đây là gì?"""
                else:
                    print("   💬 Type: General travel question")
                    response_text = _handle_general_question(user_text)
    
    except Exception as e:
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        response_text = "😔 Xin lỗi, tôi gặp lỗi khi xử lý câu hỏi.\n\n💡 Bạn có thể thử hỏi lại không?"
    
    print(f"   ✅ Response ({len(response_text)} chars): {response_text[:150]}...")
    
    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=response_text)]
    }

# =====================================
# HANDLER FUNCTIONS
# =====================================

def _get_gps_permission_guide(feature_name: str = "tính năng này") -> str:
    """Generate GPS permission guide message"""
    return f"""📍 **Cần bật GPS để sử dụng {feature_name}!**

🔧 **Hướng dẫn bật GPS:**

**📱 iPhone/iPad:**
1. Mở **Cài đặt**
2. Cuộn xuống và chọn tên app
3. Chọn **Vị trí** → **Khi Đang Sử Dụng App**

**🤖 Android:**
1. Mở **Cài đặt**
2. **Vị trí** → Bật **Sử dụng vị trí**
3. **Quyền của ứng dụng** → Chọn app → **Cho phép**

**⚡ Cách nhanh:** Vuốt xuống từ trên màn hình → Nhấn biểu tượng **Vị trí**

🔄 Sau khi bật, app sẽ tự động cập nhật vị trí của bạn!"""

def _handle_emergency_services(user_text: str, current_location: Optional[Dict]) -> str:
    """Handle emergency and utility services"""
    
    service_type = "hospital"
    
    # Determine service type
    if any(word in user_text for word in ["pharmacy", "nhà thuốc", "hiệu thuốc", "thuốc"]):
        service_type = "pharmacy"
    elif any(word in user_text for word in ["atm", "ngân hàng", "bank", "rút tiền"]):
        service_type = "atm"
    elif any(word in user_text for word in ["police", "công an", "cảnh sát"]):
        service_type = "police"
    elif any(word in user_text for word in ["cứu hỏa", "fire"]):
        service_type = "fire_station"
    elif any(word in user_text for word in ["bãi đỗ xe", "parking", "đỗ xe"]):
        service_type = "parking"
    elif any(word in user_text for word in ["cửa hàng tiện lợi", "convenience"]):
        service_type = "convenience_store"
    elif any(word in user_text for word in ["siêu thị", "supermarket"]):
        service_type = "supermarket"
    elif any(word in user_text for word in ["nhà vệ sinh", "toilet", "restroom", "wc"]):
        service_type = "restroom"
    elif any(word in user_text for word in ["trạm xăng", "gas station", "xăng"]):
        service_type = "gas_station"
    elif any(word in user_text for word in ["trạm xe buýt", "bus station", "xe buýt"]):
        service_type = "bus_station"
    elif any(word in user_text for word in ["tàu điện", "subway", "metro"]):
        service_type = "subway_station"
    elif any(word in user_text for word in ["bưu điện", "post office"]):
        service_type = "post_office"
    
    if not current_location:
        response = "🚨 **⚠️ KHẨN CẤP - Cần bật GPS ngay!**\n\n"
        response += "📍 **Cách bật GPS nhanh:**\n"
        response += "1. Vuốt xuống từ trên màn hình\n"
        response += "2. Nhấn biểu tượng **Vị trí/Location**\n"
        response += "3. Quay lại app và thử lại\n\n"
        response += "📞 **SỐ ĐIỆN THOẠI KHẨN CẤP:**\n"
        response += "• Cấp cứu: **115**\n"
        response += "• Công an: **113**\n"
        response += "• Cứu hỏa: **114**\n"
        response += "• Tổng đài du lịch: **1800-1008**\n\n"
        response += "⚡ Với GPS, tôi sẽ tìm dịch vụ gần nhất trong vòng 5km!"
        return response
    
    try:
        services = find_emergency_services.invoke({
            "current_location": current_location,
            "service_type": service_type
        })
        
        if services and len(services) > 0:
            service_label = {
                "hospital": "Bệnh viện/Phòng khám",
                "pharmacy": "Nhà thuốc",
                "atm": "ATM/Ngân hàng",
                "police": "Công an",
                "fire_station": "Trạm cứu hỏa",
                "parking": "Bãi đỗ xe",
                "convenience_store": "Cửa hàng tiện lợi",
                "supermarket": "Siêu thị",
                "restroom": "Nhà vệ sinh công cộng",
                "gas_station": "Trạm xăng",
                "bus_station": "Trạm xe buýt",
                "subway_station": "Trạm tàu điện",
                "post_office": "Bưu điện"
            }.get(service_type, "Dịch vụ")
            
            response = f"🚨 **{service_label} gần nhất:**\n\n"
            for i, service in enumerate(services[:5], 1):
                name = service.get('name', 'Unknown')
                distance = service.get('distance_km', 0)
                response += f"{i}. **{name}** ({distance:.1f}km)\n"
                if service.get('address'):
                    response += f"   📍 {service.get('address')}\n"
                response += "\n"
            return response
        else:
            service_label_vn = {
                "hospital": "bệnh viện",
                "pharmacy": "nhà thuốc",
                "atm": "ATM",
                "police": "đồn công an",
                "fire_station": "trạm cứu hỏa",
                "parking": "bãi đỗ xe",
                "convenience_store": "cửa hàng tiện lợi",
                "supermarket": "siêu thị",
                "restroom": "nhà vệ sinh công cộng",
                "gas_station": "trạm xăng",
                "bus_station": "trạm xe buýt",
                "subway_station": "trạm tàu điện",
                "post_office": "bưu điện"
            }.get(service_type, "dịch vụ")
            
            response = f"😔 Xin lỗi, không tìm thấy {service_label_vn} trong cơ sở dữ liệu.\n\n"
            response += "🚨 **Số điện thoại khẩn cấp:**\n"
            response += "• Cấp cứu: 115\n"
            response += "• Công an: 113\n"
            response += "• Cứu hỏa: 114"
            return response
    
    except Exception as e:
        print(f"   ❌ Error finding emergency services: {e}")
        response = "🚨 **Số điện thoại khẩn cấp:**\n\n"
        response += "• Cấp cứu: 115\n"
        response += "• Công an: 113\n"
        response += "• Cứu hỏa: 114"
        return response

def _handle_nearby_search(user_text: str, current_location: Optional[Dict]) -> str:
    """Handle nearby place search with free-text query support"""
    
    if not current_location:
        response = "📍 **Cần bật GPS để tìm địa điểm gần bạn!**\n\n"
        response += "🔧 **Hướng dẫn bật GPS:**\n\n"
        response += "**iPhone/iPad:**\n"
        response += "1. Mở **Cài đặt**\n"
        response += "2. Chọn tên app\n"
        response += "3. Chọn **Vị trí** → **Khi Đang Sử Dụng App**\n\n"
        response += "**Android:**\n"
        response += "1. Mở **Cài đặt**\n"
        response += "2. **Vị trí** → Bật **Sử dụng vị trí**\n"
        response += "3. **Quyền của ứng dụng** → Chọn app → **Cho phép**\n\n"
        response += "🔄 Sau khi bật, hãy thử lại: 'Quán cà phê gần đây'\n\n"
        response += "💡 GPS giúp tôi tìm địa điểm trong bán kính 2-5km từ bạn!"
        return response
    
    # STEP 1: Try to extract specific place query (e.g., "quán chè", "quán phở", "tiệm bánh")
    search_query = None
    
    # Pattern to extract place type: "quán X", "tiệm X", "nhà hàng X", etc.
    patterns = [
        r"(quán|tiệm|cửa hàng|nhà hàng|hiệu)\s+(\w+(?:\s+\w+)?)",  # "quán chè", "tiệm bánh"
        r"(\w+(?:\s+\w+)?)\s+(gần đây|nearby|xung quanh)"  # "chè gần đây", "phở xung quanh"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, user_text, re.IGNORECASE)
        if match:
            if len(match.groups()) >= 2:
                # Extract both parts and combine
                search_query = f"{match.group(1)} {match.group(2)}".strip()
                print(f"   🔍 Extracted query from pattern: '{search_query}'")
                break
    
    # STEP 2: Detect category for fallback
    category = None
    if any(word in user_text for word in ["ăn", "quán ăn", "nhà hàng", "food", "restaurant"]):
        category = "restaurant"
    elif any(word in user_text for word in ["cà phê", "cafe", "coffee"]):
        category = "cafe"
    elif any(word in user_text for word in ["mua sắm", "shop", "chợ"]):
        category = "shopping"
    elif any(word in user_text for word in ["tham quan", "du lịch", "attraction"]):
        category = "attraction"
    
    try:
        nearby_places = []
        search_method = None
        
        # STEP 3: Try Google Places Text Search if we have a specific query
        if search_query and len(search_query) > 2:
            try:
                api_key = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_DIRECTIONS_API_KEY")
                if api_key:
                    print(f"   🌐 Using Google Places Text Search for: '{search_query}'")
                    url = "https://places.googleapis.com/v1/places:searchText"
                    headers = {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": api_key,
                        "X-Goog-FieldMask": "places.displayName,places.location,places.id,places.formattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours"
                    }
                    body = {
                        "textQuery": search_query,
                        "locationBias": {
                            "circle": {
                                "center": {
                                    "latitude": current_location['lat'],
                                    "longitude": current_location['lng']
                                },
                                "radius": 2000.0  # 2km
                            }
                        },
                        "languageCode": "vi",
                        "maxResultCount": 5
                    }
                    
                    response_api = requests.post(url, headers=headers, json=body, timeout=10)
                    data = response_api.json()
                    
                    if response_api.status_code == 200 and data.get("places"):
                        print(f"   ✅ Found {len(data['places'])} places via Text Search")
                        # Convert to standard format
                        for place in data["places"]:
                            loc = place["location"]
                            # Calculate distance
                            from math import radians, sin, cos, sqrt, atan2
                            lat1, lon1 = radians(current_location['lat']), radians(current_location['lng'])
                            lat2, lon2 = radians(loc['latitude']), radians(loc['longitude'])
                            dlat = lat2 - lat1
                            dlon = lon2 - lon1
                            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                            c = 2 * atan2(sqrt(a), sqrt(1-a))
                            distance_km = 6371 * c
                            
                            nearby_places.append({
                                'name': place.get('displayName', {}).get('text', 'Unknown'),
                                'distance_km': distance_km,
                                'rating': place.get('rating', 0),
                                'user_ratings_total': place.get('userRatingCount', 0),
                                'address': place.get('formattedAddress', ''),
                                'opening_hours': {
                                    'open_now': place.get('currentOpeningHours', {}).get('openNow', None)
                                } if place.get('currentOpeningHours') else None,
                                'source': 'google_places_text_search'
                            })
                        search_method = "text_search"
                    else:
                        print(f"   ⚠️ Text Search failed or no results: {response_api.status_code}")
            except Exception as e:
                print(f"   ⚠️ Text Search error: {e}")
        
        # STEP 4: Fallback to category search
        if not nearby_places:
            print(f"   🔄 Falling back to category search: {category}")
            nearby_places = search_nearby_places.invoke({
                "current_location": current_location,
                "radius_km": 2.0,
                "category": category,
                "limit": 5
            })
            search_method = "category_search"
        
        # STEP 5: Format response
        if nearby_places and len(nearby_places) > 0:
            source_icon = "🌍"
            
            # Determine label
            if search_query and search_method == "text_search":
                place_label = search_query
            else:
                place_label = {
                    'restaurant': 'nhà hàng',
                    'cafe': 'quán cà phê',
                    'shopping': 'địa điểm mua sắm',
                    'attraction': 'điểm tham quan'
                }.get(category, 'địa điểm')
            
            response = f"{source_icon} **{place_label.capitalize()} gần bạn:**\n\n"
            for i, place in enumerate(nearby_places[:5], 1):
                name = place.get('name', 'Unknown')
                distance = place.get('distance_km', 0)
                rating = place.get('rating', 0)
                response += f"{i}. **{name}** ({distance:.1f}km)\n"
                
                if rating and rating > 0:
                    total_ratings = place.get('user_ratings_total', 0)
                    response += f"   ⭐ {rating}"
                    if total_ratings > 0:
                        response += f" ({total_ratings} đánh giá)"
                    response += "\n"
                
                if place.get('address'):
                    response += f"   📍 {place.get('address')}\n"
                
                opening_hours = place.get('opening_hours')
                if opening_hours and opening_hours.get('open_now') is not None:
                    status = "🟢 Đang mở cửa" if opening_hours.get('open_now') else "🔴 Đã đóng cửa"
                    response += f"   {status}\n"
                
                response += "\n"
            
            return response
        else:
            response = f"😔 Không tìm thấy **{search_query or 'địa điểm'}** nào trong bán kính 2km.\n\n"
            response += "💡 **Gợi ý:**\n"
            response += "• Thử tìm kiếm tổng quát hơn (VD: 'nhà hàng gần đây')\n"
            response += "• Kiểm tra kết nối internet\n"
            response += "• Đảm bảo GPS đã được bật\n"
            return response
    
    except Exception as e:
        print(f"   ❌ Error in nearby search: {e}")
        import traceback
        traceback.print_exc()
        return "😔 Xin lỗi, tôi gặp lỗi khi tìm kiếm địa điểm gần bạn."

def _handle_food_tips(user_text: str, current_location: Optional[Dict]) -> str:
    """Handle food-related questions"""
    
    if not current_location:
        response = "🍽️ **Cần bật GPS để tìm quán ăn ngon gần bạn!**\n\n"
        response += "🔧 Vui lòng bật **Dịch vụ định vị**.\n\n"
        response += "💡 Hoặc cho tôi biết bạn đang ở đâu để gợi ý!"
        return response
    
    try:
        nearby = search_nearby_places.invoke({
            "current_location": current_location,
            "category": "restaurant",
            "radius_km": 2.0,
            "limit": 5
        })
        
        if nearby and len(nearby) > 0:
            source_icon = "🌍" if nearby[0].get('source') == 'google_places_api' else "💾"
            
            response = f"{source_icon} **Nhà hàng gần bạn:**\n\n"
            for i, restaurant in enumerate(nearby, 1):
                name = restaurant.get('name', 'Unknown')
                distance = restaurant.get('distance_km', 0)
                rating = restaurant.get('rating', 'N/A')
                response += f"{i}. **{name}** ({distance:.1f}km)\n"
                
                if rating != 'N/A' and rating > 0:
                    total_ratings = restaurant.get('user_ratings_total', 0)
                    response += f"   ⭐ {rating}"
                    if total_ratings > 0:
                        response += f" ({total_ratings} đánh giá)"
                    response += "\n"
                
                if restaurant.get('address'):
                    response += f"   📍 {restaurant.get('address')}\n"
                
                price_level = restaurant.get('price_level')
                if price_level:
                    price_symbols = "💰" * price_level
                    response += f"   {price_symbols}\n"
                
                opening_hours = restaurant.get('opening_hours')
                if opening_hours and opening_hours.get('open_now') is not None:
                    status = "🟢 Đang mở cửa" if opening_hours.get('open_now') else "🔴 Đã đóng cửa"
                    response += f"   {status}\n"
                
                response += "\n"
            
            response += "💡 **Tip:** Hỏi người địa phương về đặc sản nhé!"
            return response
        else:
            response = "😔 Không tìm thấy nhà hàng nào trong bán kính 2km.\n\n"
            response += "💡 Thử 'quán cà phê gần đây' để tìm quán khác."
            return response
    
    except Exception as e:
        print(f"   ❌ Error in food tips: {e}")
        return "😔 Xin lỗi, tôi gặp lỗi khi tìm nhà hàng."

def _handle_contextual_food_suggestions(user_text: str, current_location: Optional[Dict]) -> str:
    """
    Gợi ý món ăn dựa trên thời tiết và địa điểm hiện tại
    
    Logic:
    - Lấy thời tiết hiện tại từ OpenWeatherMap
    - Phân tích nhiệt độ, điều kiện thời tiết
    - Xác định thành phố/vùng miền (nếu có GPS)
    - Gợi ý món ăn phù hợp với ngữ cảnh
    """
    
    if not current_location:
        return (
            "📍 **GPS chưa bật**\n\n"
            "Để tôi gợi ý món ăn phù hợp với thời tiết và địa điểm, "
            "vui lòng bật GPS nhé!\n\n"
            "💡 **Một số gợi ý chung:**\n"
            "• ☀️ Trời nóng: Chè, trà đá, sinh tố\n"
            "• 🌧️ Trời mưa: Phở, bún, lẩu\n"
            "• 🌤️ Trời mát: Cà phê, bánh mì\n"
            "• 🌙 Buổi tối: BBQ, ốc, nhậu"
        )
    
    try:
        lat = current_location["lat"]
        lng = current_location["lng"]
        
        print(f"   🍽️ Getting food suggestions for location: {lat}, {lng}")
        
        # Get weather data
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            print("   ❌ OPENWEATHER_API_KEY not found")
            raise Exception("Missing OPENWEATHER_API_KEY")
        
        weather_url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={api_key}&units=metric&lang=vi"
        print(f"   🌐 Calling OpenWeatherMap API...")
        weather_response = requests.get(weather_url, timeout=10)
        
        if weather_response.status_code != 200:
            print(f"   ❌ OpenWeatherMap API error: {weather_response.status_code}")
            print(f"   Response: {weather_response.text}")
            raise Exception(f"Weather API error: {weather_response.status_code}")
        
        weather_data = weather_response.json()
        print(f"   ✅ Weather data received: {weather_data.get('name')}, {weather_data['main']['temp']}°C")
        
        temp = weather_data["main"]["temp"]
        feels_like = weather_data["main"]["feels_like"]
        weather_condition = weather_data["weather"][0]["main"].lower()
        weather_desc = weather_data["weather"][0]["description"]
        city_name = weather_data.get("name", "")
        
        # Temperature-based food recommendations
        temp_recommendations = []
        if temp < 18:
            temp_category = "lạnh"
            temp_emoji = "❄️"
            temp_recommendations = [
                "🍲 **Lẩu** - Lẩu gà lá é, lẩu hải sản, lẩu Thái",
                "🍜 **Phở** - Phở bò tái, phở gà nóng hổi",
                "🥘 **Bún riêu/Bún bò Huế** - Nóng, đậm đà",
                "☕ **Cà phê sữa nóng** - Ấm bụng, tỉnh táo",
                "🍵 **Trà gừng mật ong** - Ấm người, tốt cho sức khỏe"
            ]
        elif temp < 25:
            temp_category = "mát mẻ"
            temp_emoji = "🌤️"
            temp_recommendations = [
                "☕ **Cà phê** - Cà phê phin, cappuccino",
                "🥖 **Bánh mì** - Bánh mì thịt, bánh mì pate",
                "🍜 **Bún chả/Bún thịt nướng**",
                "🥗 **Gỏi cuốn** - Nhẹ nhàng, thanh mát",
                "🍰 **Bánh ngọt & trà** - Thư giãn, nghỉ ngơi"
            ]
        else:
            temp_category = "nóng"
            temp_emoji = "🔥"
            temp_recommendations = [
                "🧊 **Chè** - Chè thập cẩm, chè đậu đỏ",
                "🥤 **Sinh tố/Nước ép trái cây** - Mát lạnh, bổ dưỡng",
                "🍧 **Kem/Yogurt đá** - Giải nhiệt tức thì",
                "🥗 **Gỏi/Salad** - Nhẹ bụng, dễ ăn",
                "🍜 **Bún/Mì lạnh** - Bún thịt nướng, mì trộn"
            ]
        
        # Rain-based recommendations
        if weather_condition in ["rain", "drizzle", "thunderstorm"]:
            temp_recommendations.insert(0, "🍲 **Lẩu/Nướng** - Ấm áp, vui vẻ cùng bạn bè")
            temp_recommendations.insert(1, "🍜 **Món nước nóng** - Phở, bún, hủ tiếu")
        
        # Location-based specialties
        location_specialties = []
        city_lower = city_name.lower()
        
        if "ha noi" in city_lower or "hà nội" in city_lower or "hanoi" in city_lower:
            location_specialties = [
                "🦆 **Bún chả** - Đặc sản Hà Nội",
                "🍜 **Phở** - Phở Hà Nội chính gốc",
                "🥖 **Bánh mì pate** - Hà Nội style",
                "☕ **Cà phê trứng** - Độc đáo Hà Nội"
            ]
        elif "sai gon" in city_lower or "ho chi minh" in city_lower or "hcm" in city_lower:
            location_specialties = [
                "🥖 **Bánh mì Sài Gòn** - Đa dạng, phong phú",
                "🍜 **Hủ tiếu Nam Vang** - Đặc sản miền Nam",
                "🥘 **Cơm tấm** - Cơm tấm sườn bì chả",
                "☕ **Cà phê đá** - Văn hóa cà phê Sài Gòn"
            ]
        elif "da lat" in city_lower or "đà lạt" in city_lower:
            location_specialties = [
                "🍲 **Lẩu gà lá é** - Must-try Đà Lạt",
                "🥘 **Bánh canh** - Ấm bụng, ngon miệng",
                "🍓 **Dâu tây** - Tươi ngon, đặc sản",
                "🌽 **Ngô nướng bơ** - Ăn vặt Đà Lạt"
            ]
        elif "hue" in city_lower or "huế" in city_lower:
            location_specialties = [
                "🍜 **Bún bò Huế** - Cay nồng, đậm đà",
                "🥘 **Cơm hến** - Đặc sản xứ Huế",
                "🍚 **Bánh bèo/Bánh nậm** - Tinh tế Huế"
            ]
        elif "da nang" in city_lower or "đà nẵng" in city_lower:
            location_specialties = [
                "🍜 **Mì Quảng** - Đặc sản Đà Nẵng",
                "🦞 **Hải sản** - Tươi ngon, giá tốt",
                "🥖 **Bánh mì Madame Khanh** - Nổi tiếng"
            ]
        
        # Build response
        response = f"🍽️ **Gợi ý món ăn cho bạn**\n\n"
        response += f"📍 **Vị trí:** {city_name}\n"
        response += f"{temp_emoji} **Thời tiết:** {temp:.1f}°C - {weather_desc} ({temp_category})\n\n"
        
        response += f"💡 **Phù hợp với thời tiết hiện tại:**\n"
        for rec in temp_recommendations[:4]:  # Top 4 recommendations
            response += f"{rec}\n"
        
        if location_specialties:
            response += f"\n🏙️ **Đặc sản địa phương:**\n"
            for spec in location_specialties:
                response += f"{spec}\n"
        
        response += f"\n✨ **Mẹo:** Hỏi 'Quán [món ăn] gần đây' để tìm địa chỉ cụ thể!"
        
        return response
        
    except Exception as e:
        print(f"Error getting contextual food suggestions: {e}")
        import traceback
        traceback.print_exc()
        return (
            "🍽️ **Một số gợi ý chung:**\n\n"
            "• ☀️ **Trời nóng:** Chè, sinh tố, kem, gỏi\n"
            "• 🌧️ **Trời mưa:** Lẩu, phở, bún, đồ nướng\n"
            "• ❄️ **Trời lạnh:** Lẩu gà lá é, cà phê nóng, trà gừng\n"
            "• 🌤️ **Trời mát:** Cà phê, bánh mì, bún chả\n\n"
            "💬 Hỏi tôi 'Quán [món] gần đây' để tìm địa chỉ!"
        )

def _handle_place_introduction(user_text: str, current_location: Optional[Dict]) -> str:
    """
    Handle place introduction requests
    Extract place name, search for it, and provide detailed introduction
    """
    
    # Extract place name from user text
    place_name = None
    import re
    
    # Pattern matching for place introduction
    patterns = [
        r"giới thiệu (?:cho tôi |về )?(.+)",
        r"cho tôi biết về (.+)",
        r"kể về (.+)",
        r"thông tin về (.+)",
        r"tìm hiểu về (.+)",
        r"tell me about (.+)"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, user_text, re.IGNORECASE)
        if match:
            place_name = match.group(1).strip()
            # Clean up common suffixes
            place_name = place_name.replace(" không", "").replace(" nhé", "").replace(" nha", "").strip()
            print(f"   🔍 Extracted place name: '{place_name}'")
            break
    
    if not place_name or len(place_name) < 3:
        return (
            "🏛️ **Bạn muốn biết về địa điểm nào?**\n\n"
            "💡 Hãy hỏi cụ thể hơn, ví dụ:\n"
            "• 'Giới thiệu về Dinh Độc Lập'\n"
            "• 'Cho tôi biết về Chùa Một Cột'\n"
            "• 'Kể về Bảo tàng Chứng tích Chiến tranh'\n"
            "• 'Thông tin về Phố cổ Hội An'"
        )
    
    try:
        # Step 1: Search for the place using Google Places Text Search
        api_key = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_DIRECTIONS_API_KEY")
        if not api_key:
            return "😔 Không thể tìm địa điểm (thiếu API key)"
        
        print(f"   🌐 Searching for place: '{place_name}'")
        url = "https://places.googleapis.com/v1/places:searchText"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.displayName,places.location,places.id,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.editorialSummary,places.primaryType"
        }
        body = {
            "textQuery": place_name,
            "languageCode": "vi"
        }
        
        # Add location bias if available
        if current_location:
            body["locationBias"] = {
                "circle": {
                    "center": {
                        "latitude": current_location['lat'],
                        "longitude": current_location['lng']
                    },
                    "radius": 50000.0  # 50km (max allowed by Places API New)
                }
            }
        
        response_api = requests.post(url, headers=headers, json=body, timeout=10)
        data = response_api.json()
        
        print(f"   🔍 Places API status: {response_api.status_code}")
        print(f"   🔍 Places API response: {data}")
        
        if response_api.status_code != 200 or not data.get("places"):
            error_msg = data.get("error", {}).get("message", "Không tìm thấy")
            print(f"   ❌ Places API error: {error_msg}")
            return f"😔 Xin lỗi, tôi không tìm thấy thông tin về **'{place_name}'**.\n\n💡 Hãy thử:\n• Tên đầy đủ hơn\n• Kiểm tra chính tả\n• Thêm tên thành phố (VD: 'Dinh Độc Lập Sài Gòn')"
        
        # Get the best match
        place = data["places"][0]
        place_display_name = place.get("displayName", {}).get("text", place_name)
        place_address = place.get("formattedAddress", "")
        place_rating = place.get("rating", 0)
        place_total_ratings = place.get("userRatingCount", 0)
        place_types = place.get("types", [])
        place_summary = place.get("editorialSummary", {}).get("text", "")
        
        print(f"   ✅ Found: {place_display_name}")
        
        # Step 2: Build comprehensive introduction
        response = f"🏛️ **{place_display_name}**\n\n"
        
        # Basic info
        response += f"📍 **Địa chỉ:** {place_address}\n"
        
        if place_rating > 0:
            stars = "⭐" * int(place_rating)
            response += f"{stars} **{place_rating}/5** ({place_total_ratings:,} đánh giá)\n"
        
        response += "\n"
        
        # Editorial summary if available
        if place_summary:
            response += f"📖 **Giới thiệu:**\n{place_summary}\n\n"
        
        # Generate detailed information using LLM
        llm_prompt = f"""
Bạn là hướng dẫn viên du lịch chuyên nghiệp. Hãy viết giới thiệu chi tiết về địa điểm sau:

Tên: {place_display_name}
Địa chỉ: {place_address}
Loại: {', '.join(place_types[:3]) if place_types else 'Địa điểm du lịch'}

YÊU CẦU FORMAT (QUAN TRỌNG):
- KHÔNG dùng ####, ###, ## headers
- Dùng emoji + **bold** thay vì headers
- Mỗi bullet point NGẮN GỌN (tối đa 1-2 dòng)
- Dễ đọc trên điện thoại

Hãy bao gồm:

✨ **Điểm đặc biệt:**
• [2-3 điểm ngắn gọn, mỗi điểm 1 dòng]

🎯 **Nên làm gì ở đây:**
• [3-4 hoạt động, mỗi hoạt động 1 dòng]

📸 **Góc chụp đẹp:**
• [2-3 vị trí, mỗi vị trí 1 dòng]

⏰ **Thời gian phù hợp:**
• [Khuyến nghị thời gian ngắn gọn]

💡 **Lưu ý:**
• [2-3 tips quan trọng, mỗi tip 1 dòng]

Trả lời bằng tiếng Việt, NGẮN GỌN, súc tích.
"""
        
        try:
            llm_response = llm.invoke([HumanMessage(content=llm_prompt)])
            response += llm_response.content
        except Exception as e:
            print(f"   ⚠️ LLM generation failed: {e}")
            # Fallback response
            response += "✨ **Điểm đặc biệt:**\n"
            response += f"• Đây là một địa điểm {place_types[0] if place_types else 'du lịch'} nổi tiếng\n"
            response += f"• Được {place_total_ratings:,} người đánh giá {place_rating}/5 sao\n\n"
            
            response += "🎯 **Nên làm gì ở đây:**\n"
            response += "• Tham quan và tìm hiểu lịch sử\n"
            response += "• Chụp ảnh lưu niệm\n"
            response += "• Khám phá kiến trúc độc đáo\n\n"
            
            response += "💡 **Lưu ý:**\n"
            response += "• Kiểm tra giờ mở cửa trước khi đến\n"
            response += "• Mặc trang phục lịch sự\n"
            response += "• Chuẩn bị tiền mặt cho vé vào cửa"
        
        # Add call-to-action
        response += "\n\n🗺️ **Muốn đi đến đây?**\n"
        response += f"Hỏi tôi: 'Chỉ đường đến {place_display_name}'"
        
        return response
        
    except Exception as e:
        print(f"   ❌ Error in place introduction: {e}")
        import traceback
        traceback.print_exc()
        return f"😔 Xin lỗi, tôi gặp lỗi khi tìm thông tin về **'{place_name}'**.\n\n💡 Hãy thử lại hoặc hỏi cụ thể hơn."

def _handle_photo_tips(user_text: str, active_place_id: Optional[str]) -> str:
    """Handle photo spot suggestions"""
    
    if active_place_id:
        try:
            place = get_place_details.invoke({"place_id": active_place_id})
            tips = get_travel_tips.invoke({"place": place, "tip_type": "photo"})
            
            response = f"📸 **Góc check-in đẹp tại {tips.get('place_name', 'đây')}:**\n\n"
            for suggestion in tips.get('suggestions', []):
                response += f"• {suggestion}\n"
            
            if tips.get('best_time'):
                response += f"\n⏰ **Thời gian đẹp nhất:** {tips['best_time']}\n"
            
            return response
        except Exception as e:
            print(f"   ❌ Error getting photo tips: {e}")
            return "📸 Xin lỗi, tôi không thể lấy góc chụp cho địa điểm này."
    else:
        return "📸 Bạn đang ở địa điểm nào? Cho tôi biết để gợi ý góc chụp đẹp nhé!"

def _handle_place_info(user_text: str, active_place_id: Optional[str]) -> str:
    """Handle place information requests"""
    
    if active_place_id:
        try:
            place = get_place_details.invoke({"place_id": active_place_id})
            
            if place:
                response = f"ℹ️ **Thông tin về {place.get('name', 'địa điểm này')}:**\n\n"
                
                if place.get('description'):
                    response += f"📝 {place['description']}\n\n"
                
                if place.get('rating'):
                    response += f"⭐ **Đánh giá:** {place['rating']}/5 ({place.get('user_ratings_total', 0)} reviews)\n"
                
                if place.get('opening_hours'):
                    response += f"🕐 **Giờ mở cửa:** Đang mở\n"
                
                if place.get('budget_range'):
                    budget_label = {
                        'budget': '💰 Bình dân',
                        'mid-range': '💰💰 Trung bình',
                        'expensive': '💰💰💰 Cao cấp'
                    }.get(place['budget_range'], place['budget_range'])
                    response += f"💵 **Mức giá:** {budget_label}\n"
                
                response += "\n💡 **Bạn muốn biết thêm gì?**\n"
                response += "• Ăn gì ngon?\n"
                response += "• Chụp ảnh ở đâu đẹp?\n"
                response += "• Nên làm gì tại đây?\n"
                
                return response
            else:
                return "❌ Không tìm thấy thông tin về địa điểm này."
        except Exception as e:
            print(f"   ❌ Error getting place info: {e}")
            return "ℹ️ Xin lỗi, tôi không thể lấy thông tin về địa điểm này."
    else:
        return "📍 Bạn đang ở địa điểm nào? Cho tôi biết để tìm thông tin nhé!"

def _is_travel_related(user_text: str) -> bool:
    """Check if the question is related to travel"""
    
    # Travel-related keywords
    travel_keywords = [
        # Du lịch chung
        "du lịch", "travel", "trip", "tour", "chuyến đi", "hành trình",
        # Địa điểm
        "địa điểm", "place", "destination", "visit", "tham quan", "đi", "đến",
        "gần", "nearby", "xung quanh", "quanh đây",
        # Ăn uống
        "ăn", "eat", "food", "quán", "nhà hàng", "restaurant", "cafe", "món", "đặc sản",
        # Khách sạn/Lưu trú
        "hotel", "khách sạn", "resort", "homestay", "lưu trú", "ở", "nghỉ",
        # Di chuyển
        "đường", "road", "direction", "taxi", "xe", "bus", "train", "flight",
        "chỉ đường", "đi như thế nào", "giao thông", "traffic",
        # Hoạt động du lịch
        "chụp ảnh", "photo", "check-in", "checkin", "sống ảo",
        "mua sắm", "shopping", "market", "chợ",
        # Thời tiết (liên quan du lịch)
        "thời tiết", "weather", "trời", "mưa", "nắng", "lạnh", "nóng",
        # Tips du lịch
        "tip", "gợi ý", "suggest", "recommend", "nên", "advice",
        # Dịch vụ
        "bệnh viện", "hospital", "pharmacy", "atm", "bank",
        "khẩn cấp", "emergency", "cấp cứu",
        # Văn hóa/Lịch sử
        "văn hóa", "culture", "lịch sử", "history", "bảo tàng", "museum",
        "chùa", "temple", "đền", "đình", "phố cổ",
        # Tên thành phố phổ biến ở VN
        "hà nội", "sài gòn", "hồ chí minh", "đà nẵng", "hội an", "huế",
        "nha trang", "đà lạt", "phú quốc", "hạ long", "sa pa", "vũng tàu",
        "cần thơ", "phan thiết", "ninh bình", "hải phòng",
        # Loại địa điểm
        "bãi biển", "beach", "núi", "mountain", "công viên", "park",
        "hồ", "lake", "sông", "river", "thác", "waterfall"
    ]
    
    user_text_lower = user_text.lower()
    
    # Check if any travel keyword is in the text
    for keyword in travel_keywords:
        if keyword in user_text_lower:
            return True
    
    # Check for question patterns about locations/directions
    location_patterns = [
        "ở đâu", "where", "làm sao", "how to", "có gì", "what",
        "bao xa", "how far", "mất bao lâu", "how long",
        "giờ mở cửa", "opening hours", "có mở", "open"
    ]
    
    for pattern in location_patterns:
        if pattern in user_text_lower:
            return True
    
    return False

def _handle_general_question(user_text: str) -> str:
    """Handle general travel questions - only travel-related questions"""
    
    # First, check if the question is travel-related
    if not _is_travel_related(user_text):
        print("   🚫 Non-travel question detected")
        return """🧳 Xin lỗi, tôi là **trợ lý du lịch AI** và chỉ có thể hỗ trợ các câu hỏi liên quan đến du lịch.

💡 **Tôi có thể giúp bạn:**
• Tìm địa điểm gần đây (nhà hàng, quán café, bảo tàng...)
• Kiểm tra thời tiết và gợi ý hoạt động
• Chỉ đường và thông tin giao thông
• Gợi ý món ăn địa phương
• Tìm dịch vụ khẩn cấp (bệnh viện, ATM, công an...)
• Thông tin về địa điểm tham quan
• Tips chụp ảnh và check-in

❓ **Hãy hỏi tôi về du lịch nhé!**
Ví dụ: "Quán cà phê gần đây", "Thời tiết hôm nay", "Đặc sản ở đây là gì?"""
    
    system_prompt = """
    Bạn là travel companion AI đang hỗ trợ du khách TRONG LÚC đi du lịch.
    
    QUAN TRỌNG: Chỉ trả lời câu hỏi liên quan đến du lịch, địa điểm, ẩm thực, văn hóa, di chuyển.
    
    Trả lời câu hỏi ngắn gọn, thực tế, hữu ích.
    
    Trả lời bằng tiếng Việt, thân thiện (3-5 câu).
    """
    
    try:
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_text)
        ])
        return response.content
    
    except Exception as e:
        print(f"   ❌ Error in general question: {e}")
        return "😔 Xin lỗi, tôi gặp lỗi khi xử lý câu hỏi. Bạn có thể thử lại không?"

def _handle_weather_check(user_text: str, current_location: Optional[Dict], itinerary: Optional[List] = None) -> str:
    """Handle weather check with forecast, alerts, and indoor place suggestions when it rains"""
    
    if not current_location:
        response = "🌤️ **Cần bật GPS để kiểm tra thời tiết chính xác!**\n\n"
        response += "📍 **Cách bật GPS:**\n"
        response += "1. Mở **Cài đặt** trên điện thoại\n"
        response += "2. Vào **Quyền riêng tư** → **Dịch vụ định vị**\n"
        response += "3. Bật **Dịch vụ định vị** cho ứng dụng này\n\n"
        response += "🔄 Sau khi bật, hãy thử hỏi lại: 'Thời tiết bây giờ thế nào?'\n\n"
        response += "💡 Hoặc bạn có thể cho tôi biết bạn đang ở **thành phố nào**!"
        return response
    
    try:
        # Check if user asks for forecast
        is_forecast_request = any(word in user_text for word in ["dự báo", "forecast", "mấy ngày", "tuần sau", "mai"])
        
        weather_data = get_weather_forecast.invoke({
            "current_location": current_location,
            "days": 5
        })
        
        if weather_data.get('error'):
            return f"😔 Không thể lấy thông tin thời tiết: {weather_data['error']}"
        
        temp = weather_data.get('temperature', 'N/A')
        feels_like = weather_data.get('feels_like', 'N/A')
        condition = weather_data.get('description', 'N/A')
        humidity = weather_data.get('humidity', 'N/A')
        wind_speed = weather_data.get('wind_speed', 0)
        
        response = f"🌤️ **Thời tiết hiện tại:**\n\n"
        response += f"🌡️ Nhiệt độ: **{temp}°C** (cảm giác như {feels_like}°C)\n"
        response += f"☁️ Tình trạng: **{condition}**\n"
        response += f"💧 Độ ẩm: **{humidity}%**\n"
        if wind_speed > 5:
            response += f"💨 Gió: **{wind_speed:.1f} m/s**\n"
        
        # Show forecast if requested or if there are important weather changes
        forecast = weather_data.get('forecast', [])
        if (is_forecast_request or len(forecast) > 0) and forecast:
            response += f"\n📅 **Dự báo 5 ngày tới:**\n"
            for day in forecast[:5]:
                date = day.get('date', '')
                temp_forecast = day.get('temp', 'N/A')
                condition_forecast = day.get('description', '')
                rain_prob = day.get('rain_probability', 0)
                
                response += f"\n• **{date}**: {temp_forecast}°C - {condition_forecast}"
                if rain_prob > 30:
                    response += f" (☔ {rain_prob:.0f}% mưa)"
        
        # Add alerts
        alerts = weather_data.get('alerts', [])
        if alerts:
            response += f"\n\n⚠️ **Cảnh báo:**\n"
            for alert in alerts:
                response += f"• {alert}\n"
        
        # Add suggestions
        suggestions = weather_data.get('suggestions', [])
        if suggestions:
            response += f"\n💡 **Gợi ý:**\n"
            for i, suggestion in enumerate(suggestions[:3], 1):
                response += f"{i}. {suggestion}\n"
        
        # If it's raining or will rain, AUTOMATICALLY suggest indoor places
        is_rainy = weather_data.get('condition') in ['Rain', 'Drizzle', 'Thunderstorm']
        indoor_needed = weather_data.get('indoor_needed', False)
        
        # ALWAYS show indoor places when it's raining or too hot
        if is_rainy or indoor_needed:
            response += f"\n\n🏠 **Địa điểm trong nhà gần bạn:**\n"
            response += "_(Phù hợp khi trời mưa hoặc nắng nóng)_\n"
            
            try:
                indoor_places = search_indoor_places.invoke({
                    "current_location": current_location,
                    "limit": 5
                })
                
                if indoor_places:
                    for i, place in enumerate(indoor_places[:5], 1):
                        name = place.get('name', 'Unknown')
                        distance = place.get('distance_km', 0)
                        place_type = place.get('type', '').replace('_', ' ').title()
                        
                        response += f"\n{i}. **{name}** ({distance:.1f}km)"
                        
                        rating = place.get('rating')
                        if rating and rating > 0:
                            total_ratings = place.get('user_ratings_total', 0)
                            response += f"\n   ⭐ {rating}"
                            if total_ratings > 0:
                                response += f" ({total_ratings} đánh giá)"
                        
                        if place.get('address'):
                            response += f"\n   📍 {place.get('address')}"
                        
                        response += "\n"
                    
                    response += "\n💡 **Tip:** Những địa điểm này đều có mái che, phù hợp cho ngày mưa!"
                else:
                    response += "\n(Không tìm thấy địa điểm trong nhà gần bạn)\n"
            except Exception as e:
                print(f"   ⚠️ Could not get indoor places: {e}")
        
        return response
    
    except Exception as e:
        print(f"   ❌ Error checking weather: {e}")
        import traceback
        traceback.print_exc()
        return "😔 Xin lỗi, tôi gặp lỗi khi kiểm tra thời tiết."

def _handle_smart_directions(user_text: str, current_location: Optional[Dict], itinerary: Optional[List], is_traffic_focus: bool = False) -> str:
    """Handle directions with traffic info
    
    Args:
        user_text: User's question
        current_location: Current GPS location
        itinerary: Current itinerary (if any)
        is_traffic_focus: True if user is specifically asking about traffic/congestion
    """
    
    if not current_location:
        response = "🚗 **Cần bật GPS để chỉ đường và kiểm tra giao thông!**\n\n"
        response += "📍 **Cách bật GPS:**\n"
        response += "• **iOS:** Cài đặt → Quyền riêng tư → Dịch vụ định vị → Bật cho app\n"
        response += "• **Android:** Cài đặt → Vị trí → Bật định vị → Cho phép app\n\n"
        response += "🔄 Sau khi bật GPS:\n"
        response += "1. Quay lại app này\n"
        response += "2. App sẽ tự động cập nhật vị trí\n"
        response += "3. Hỏi lại: 'Đi đến [tên địa điểm] có kẹt xe không?'\n\n"
        response += "⚡ **Lưu ý:** Cần GPS để:\n"
        response += "• Chỉ đường chính xác từ vị trí của bạn\n"
        response += "• Kiểm tra tình trạng giao thông realtime\n"
        response += "• Tính thời gian di chuyển chính xác"
        return response
    
    try:
        # Try to extract destination from text or use next place in itinerary
        destination = None
        dest_name = None
        
        # PRIORITY 1: Check if user asks for next place in itinerary
        if itinerary and any(word in user_text for word in ["tiếp theo", "next", "kế tiếp", "địa điểm tiếp"]):
            # Find next place
            for place in itinerary:
                if place.get('location'):
                    loc = place['location']
                    if isinstance(loc, dict) and loc.get('lat') and loc.get('lng'):
                        destination = {"lat": loc['lat'], "lng": loc['lng']}
                        dest_name = place.get('name', 'địa điểm tiếp theo')
                        break
        
        # PRIORITY 2: Extract place name from user text and search for it
        if not destination:
            # Try simple pattern matching first
            place_name = None
            
            # Pattern 1: "đến [place]", "đi đến [place]", "chỉ đường đến [place]"
            patterns = [
                r"(?:đi |chỉ đường )?(?:đến|tới) (.+)",
                r"muốn đến (.+)",
                r"đường đi đến (.+)",
            ]
            
            import re
            for pattern in patterns:
                match = re.search(pattern, user_text, re.IGNORECASE)
                if match:
                    place_name = match.group(1).strip()
                    print(f"   🔍 Pattern matched: '{place_name}'")
                    break
            
            # If pattern doesn't work, use LLM
            if not place_name or len(place_name) < 2:
                extract_prompt = f"""
                Trích xuất TÊN ĐỊA ĐIỂM từ câu hỏi sau.
                Chỉ trả về TÊN ĐỊA ĐIỂM, KHÔNG giải thích.
                
                Ví dụ:
                "Chỉ đường đến Chùa Linh Ứng" → "Chùa Linh Ứng"
                "Đi đến bảo tàng Đà Nẵng" → "Bảo tàng Đà Nẵng"
                "Muốn đến Highlands Coffee" → "Highlands Coffee"
                "Đường đi đến bãi biển Mỹ Khê" → "Bãi biển Mỹ Khê"
                
                Câu hỏi: "{user_text}"
                Tên địa điểm:
                """
                
                try:
                    place_name_response = llm.invoke([HumanMessage(content=extract_prompt)])
                    place_name = place_name_response.content.strip().strip('"').strip("'")
                    print(f"   🔍 LLM extracted: '{place_name}'")
                except Exception as e:
                    print(f"   ❌ Error extracting with LLM: {e}")
            
            # Search for this place using Google Places Text Search
            if place_name and len(place_name) > 2:
                try:
                    import os
                    import requests
                    
                    api_key = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_DIRECTIONS_API_KEY")
                    if not api_key:
                        return "😔 Không thể tìm địa điểm (thiếu API key)"
                    
                    # Use Google Places API (New) - Text Search
                    url = "https://places.googleapis.com/v1/places:searchText"
                    headers = {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": api_key,
                        "X-Goog-FieldMask": "places.displayName,places.location,places.id,places.formattedAddress"
                    }
                    body = {
                        "textQuery": place_name,
                        "locationBias": {
                            "circle": {
                                "center": {
                                    "latitude": current_location['lat'],
                                    "longitude": current_location['lng']
                                },
                                "radius": 50000.0  # 50km
                            }
                        },
                        "languageCode": "vi"
                    }
                    
                    response = requests.post(url, headers=headers, json=body, timeout=10)
                    data = response.json()
                    
                    print(f"   🔍 Google Places (New) API status: {response.status_code}")
                    print(f"   🔍 Places count: {len(data.get('places', []))}")
                    if data.get('places'):
                        print(f"   🔍 First place: {data['places'][0].get('displayName', {}).get('text')}")
                    
                    if response.status_code == 200 and data.get("places"):
                        best_match = data["places"][0]
                        location = best_match["location"]
                        destination = {
                            "lat": location["latitude"],
                            "lng": location["longitude"]
                        }
                        dest_name = best_match.get("displayName", {}).get("text", place_name)
                        print(f"   ✅ Found destination: {dest_name} at {destination}")
                    else:
                        error_msg = data.get("error", {}).get("message", "No results")
                        print(f"   ❌ Places (New) API failed: {response.status_code} - {error_msg}")
                        return f"😔 Xin lỗi, tôi không tìm thấy địa điểm **'{place_name}'** gần bạn.\n\n💡 Hãy thử:\n• Tên đầy đủ hơn (VD: 'Chùa Linh Ứng Đà Nẵng')\n• Kiểm tra chính tả\n• Hoặc hỏi: 'Tìm [loại địa điểm] gần đây'"
                except Exception as e:
                    print(f"   ❌ Error searching place: {e}")
        
        if not destination:
            return "📍 Bạn muốn đi đâu? Hãy cho tôi biết tên địa điểm.\n\n💡 Ví dụ:\n• 'Chỉ đường đến Chùa Linh Ứng'\n• 'Đi đến Highlands Coffee'\n• 'Đường đi đến Bảo tàng Đà Nẵng'"
        
        # Get directions with traffic
        directions = get_smart_directions.invoke({
            "origin": current_location,
            "destination": destination,
            "mode": "driving"
        })
        
        if directions.get('error'):
            return f"😔 Không thể tìm đường: {directions['error']}"
        
        distance = directions.get('distance', 'N/A')
        duration = directions.get('traffic_duration', directions.get('duration', 'N/A'))
        traffic_status = directions.get('traffic_status', 'normal')
        delay = directions.get('delay_minutes', 0)
        
        # Traffic icon
        traffic_icons = {
            'normal': '🟢',
            'moderate': '🟡',
            'heavy': '🔴'
        }
        traffic_icon = traffic_icons.get(traffic_status, '🟢')
        
        # Generate Google Maps deep link
        origin_str = f"{current_location['lat']},{current_location['lng']}"
        dest_str = f"{destination['lat']},{destination['lng']}"
        maps_url = f"https://www.google.com/maps/dir/?api=1&origin={origin_str}&destination={dest_str}&travelmode=driving"
        
        # Build response based on user intent
        if is_traffic_focus:
            # User is asking about traffic/congestion - emphasize traffic status
            response = f"🚦 **Tình trạng giao thông đến {dest_name if 'dest_name' in locals() else 'đích'}:**\n\n"
            
            # Traffic status with detailed explanation
            if traffic_status == 'normal':
                response += f"🟢 **Giao thông tốt** - Không kẹt xe\n"
                response += f"✅ Bạn có thể đi ngay, đường thông thoáng!\n\n"
            elif traffic_status == 'moderate':
                response += f"🟡 **Giao thông hơi đông** - Có chút đông đúc\n"
                response += f"⚠️ Lưu ý: Có thể chậm hơn một chút, nên dự phòng thêm thời gian\n\n"
            else:  # heavy
                response += f"🔴 **Đang kẹt xe** - Rất đông đúc\n"
                response += f"⛔ Cảnh báo: Giao thông đang rất tắc nghẽn!\n\n"
            
            response += f"📏 Khoảng cách: **{distance}**\n"
            response += f"⏱️ Thời gian di chuyển: **{duration}**\n"
            
            if delay > 0:
                response += f"🕐 Chậm hơn bình thường: **+{delay} phút** (do kẹt xe)\n"
        else:
            # User is asking for directions - standard format
            response = f"🚗 **Chỉ đường đến {dest_name if 'dest_name' in locals() else 'đích'}:**\n\n"
            response += f"📏 Khoảng cách: **{distance}**\n"
            response += f"⏱️ Thời gian: **{duration}**\n"
            response += f"{traffic_icon} Giao thông: **{traffic_status}**\n"
            
            if delay > 0:
                response += f"⚠️ Chậm hơn dự kiến: **{delay} phút**\n"
        
        # Add suggestions
        suggestions = directions.get('suggestions', [])
        if suggestions:
            response += f"\n💡 **Gợi ý:**\n"
            for suggestion in suggestions:
                response += f"• {suggestion}\n"
        
        # Add action metadata marker for frontend to parse
        response += f"\n\n[ACTION:OPEN_MAPS:{maps_url}]"
        response += f"\n🗺️ **Nhấn để mở Google Maps và xem đường đi.**"
        
        return response
    
    except Exception as e:
        print(f"   ❌ Error getting directions: {e}")
        import traceback
        traceback.print_exc()
        return "😔 Xin lỗi, tôi gặp lỗi khi tìm đường."

def _handle_time_suggestions(user_text: str, current_location: Optional[Dict]) -> str:
    """Handle time-based activity suggestions"""
    
    try:
        suggestions = get_time_based_activity_suggestions.invoke({
            "current_location": current_location
        })
        
        if suggestions.get('error'):
            return f"😔 Không thể lấy gợi ý: {suggestions['error']}"
        
        time_period = suggestions.get('time_period', 'Hiện tại')
        activities = suggestions.get('activities', [])
        tips = suggestions.get('tips', [])
        nearby_places = suggestions.get('nearby_places', [])
        
        response = f"⏰ **{time_period}**\n\n"
        response += f"✨ **Hoạt động phù hợp:**\n"
        for i, activity in enumerate(activities, 1):
            response += f"{i}. {activity}\n"
        
        if tips:
            response += f"\n💡 **Lưu ý:**\n"
            for tip in tips:
                response += f"• {tip}\n"
        
        if nearby_places:
            response += f"\n📍 **Địa điểm gần bạn:**\n"
            for i, place in enumerate(nearby_places[:3], 1):
                name = place.get('name', 'Unknown')
                distance = place.get('distance_km', 0)
                response += f"{i}. **{name}** ({distance:.1f}km)\n"
        
        return response
    
    except Exception as e:
        print(f"   ❌ Error getting time suggestions: {e}")
        return "😔 Xin lỗi, tôi gặp lỗi khi lấy gợi ý hoạt động."

def _handle_itinerary_query(user_text: str, itinerary_data: Dict, current_location: Optional[Dict]) -> str:
    """
    Handle queries related to user's itinerary.
    Supports: viewing itinerary, adding places, getting place info from itinerary
    Works with both saved itineraries and draft itineraries (being created)
    """
    import re
    try:
        # Check if this is a draft (being created) or saved itinerary
        is_draft = itinerary_data.get('status') == 'DRAFT' or not itinerary_data.get('route_id')
        
        # View itinerary overview
        if any(word in user_text for word in ["xem lộ trình", "lộ trình của tôi", "cho tôi xem", "show", "hiển thị"]):
            print("      → View itinerary overview")
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            
            if details.get("error"):
                return f"❌ Không thể lấy thông tin lộ trình: {details['error']}"
            
            # Add draft indicator if needed
            title_suffix = " (Đang tạo)" if is_draft else ""
            response = f"📋 **Lộ trình của bạn: {details.get('title', 'Chưa đặt tên')}{title_suffix}**\n\n"
            response += f"📍 **Điểm đến:** {details.get('destination', 'N/A')}\n"
            response += f"⏱️ **Thời gian:** {details.get('duration_days', 0)} ngày\n"
            response += f"🏛️ **Tổng số địa điểm:** {details.get('total_places', 0)}\n\n"
            
            for day in details.get('days', []):
                response += f"**📅 Ngày {day['day_number']}** ({day.get('date', 'N/A')}):\n"
                for i, place in enumerate(day['places'], 1):
                    response += f"  {i}. **{place['name']}** ({place['type']})\n"
                    response += f"     ⏰ {place.get('time', 'N/A')} | 🕐 {place.get('duration', 'N/A')}\n"
                response += "\n"
            
            if is_draft:
                response += "💡 **Lưu ý:** Đây là lộ trình đang tạo. Bạn có thể hỏi tôi về bất kỳ địa điểm nào trong danh sách!"
            
            return response
        
        # Ask about all places in itinerary (show all places)
        elif any(word in user_text for word in ["các địa điểm", "tất cả", "danh sách", "tất cả địa điểm"]):
            print("      → Show all places in itinerary")
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            
            if details.get("error"):
                return f"❌ Không thể lấy thông tin lộ trình: {details['error']}"
            
            # Add draft indicator if needed
            title_suffix = " (Đang tạo)" if is_draft else ""
            response = f"📋 **Tất cả địa điểm trong lộ trình{title_suffix}:**\n\n"
            response += f"📍 **Điểm đến:** {details.get('destination', 'N/A')}\n"
            response += f"⏱️ **Thời gian:** {details.get('duration_days', 0)} ngày\n"
            response += f"🏛️ **Tổng số địa điểm:** {details.get('total_places', 0)}\n\n"
            
            for day in details.get('days', []):
                response += f"**📅 Ngày {day['day_number']}** ({day.get('date', 'N/A')}):\n"
                for i, place in enumerate(day['places'], 1):
                    response += f"  {i}. **{place['name']}** ({place['type']})\n"
                    response += f"     ⏰ {place.get('time', 'N/A')} | 🕐 {place.get('duration', 'N/A')}\n"
                response += "\n"
            
            if is_draft:
                response += "💡 **Lưu ý:** Đây là lộ trình đang tạo. Bạn có thể hỏi tôi chi tiết về bất kỳ địa điểm nào!"
            
            return response
        
        # Ask about specific place in itinerary (works for both draft and saved)
        elif any(word in user_text for word in ["giới thiệu", "cho tôi biết", "kể về", "thông tin về"]):
            print("      → Place info from itinerary (draft/saved)")
            # Try to extract place name from user text
            # Simple heuristic: look for words after the trigger
            place_name = None
            for trigger in ["giới thiệu", "cho tôi biết", "kể về", "thông tin về"]:
                if trigger in user_text:
                    parts = user_text.split(trigger)
                    if len(parts) > 1:
                        place_name = parts[1].strip()
                        # Remove common words
                        place_name = place_name.replace("về", "").replace("địa điểm", "").replace("các", "").replace("tất cả", "").strip()
                        break
            
            # Check if no specific place name extracted (means asking about all places in different phrasing)
            if not place_name or len(place_name) < 2:
                print("      → No specific place name extracted, showing all places")
                details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
                
                if details.get("error"):
                    return f"❌ Không thể lấy thông tin lộ trình: {details['error']}"
                
                title_suffix = " (Đang tạo)" if is_draft else ""
                response = f"📋 **Tất cả địa điểm trong lộ trình{title_suffix}:**\n\n"
                response += f"📍 **Điểm đến:** {details.get('destination', 'N/A')}\n"
                response += f"⏱️ **Thời gian:** {details.get('duration_days', 0)} ngày\n"
                response += f"🏛️ **Tổng số địa điểm:** {details.get('total_places', 0)}\n\n"
                
                for day in details.get('days', []):
                    response += f"**📅 Ngày {day['day_number']}** ({day.get('date', 'N/A')}):\n"
                    for i, place in enumerate(day['places'], 1):
                        response += f"  {i}. **{place['name']}** ({place['type']})\n"
                        response += f"     ⏰ {place.get('time', 'N/A')} | 🕐 {place.get('duration', 'N/A')}\n"
                    response += "\n"
                
                if is_draft:
                    response += "💡 **Lưu ý:** Đây là lộ trình đang tạo. Bạn có thể hỏi tôi chi tiết về bất kỳ địa điểm nào!"
                
                return response
            
            if place_name:
                places = get_place_from_itinerary.invoke({
                    "itinerary_data": itinerary_data,
                    "place_name": place_name
                })
                
                if places:
                    place = places[0]  # Get first match
                    
                    # Check if this is a draft itinerary
                    draft_note = " _(trong lộ trình đang tạo)_" if is_draft else " _(trong lộ trình của bạn)_"
                    
                    response = f"📍 **{place['name']}**{draft_note}\n\n"
                    response += f"📅 **Ngày {place['day']}** - {place.get('date', 'N/A')}\n"
                    response += f"⏰ **Thời gian:** {place.get('time', 'N/A')}\n"
                    response += f"🕐 **Dự kiến:** {place.get('duration', 'N/A')}\n\n"
                    
                    if place.get('description'):
                        response += f"📝 **Mô tả:**\n{place['description']}\n\n"
                    
                    response += f"⭐ **Đánh giá:** {place.get('rating', 'N/A')}/5\n"
                    response += f"📍 **Địa chỉ:** {place.get('address', 'N/A')}\n"
                    
                    if place.get('emotional_tags'):
                        tags = ', '.join(place['emotional_tags'])
                        response += f"💭 **Cảm xúc:** {tags}\n"
                    
                    if place.get('price_level'):
                        response += f"\n💰 **Mức giá:** {place['price_level']}\n"
                    
                    if is_draft:
                        response += "\n\n💡 **Tip:** Bạn có thể hỏi tôi về bất kỳ địa điểm nào khác trong lộ trình!"
                    
                    return response
                else:
                    return f"❌ Không tìm thấy địa điểm '{place_name}' trong lộ trình.\n\n💡 Hãy kiểm tra lại tên địa điểm hoặc hỏi: 'Xem lộ trình' để xem danh sách đầy đủ."
            else:
                return "❓ Bạn muốn biết thông tin về địa điểm nào trong lộ trình?"
        
        # Suggest adding places or confirm adding a specific place
        elif any(word in user_text for word in ["thêm", "add", "gợi ý thêm", "nên thêm", "có nên"]):
            print("      → Handle place suggestion/addition")
            
            # Check if trying to add a specific place (contains place name + day number)
            place_name_pattern = r'thêm (.+?)( vào ngày|\\s+ngày|$)'
            place_match = re.search(place_name_pattern, user_text)
            day_match = re.search(r'ngày (\d+)', user_text)
            
            if place_match and day_match:
                # User wants to add a specific place
                print("      → User requesting to add specific place")
                place_name = place_match.group(1).strip()
                day_number = int(day_match.group(1))
                
                # Validate day number
                duration_days = itinerary_data.get("duration_days", 1)
                if day_number > duration_days or day_number < 1:
                    return f"❌ Ngày {day_number} không hợp lệ. Lộ trình có {duration_days} ngày."
                
                # Try to find place in suggestions (via search)
                suggestions = search_places.invoke({
                    "query": place_name,
                    "location_filter": itinerary_data.get("destination", ""),
                    "limit": 1
                })
                
                if suggestions:
                    place = suggestions[0]
                    # Call add_place_to_itinerary_backend
                    result = add_place_to_itinerary_backend.invoke({
                        "place_data": place,
                        "itinerary_data": itinerary_data,
                        "day_number": day_number,
                        "time": "TBD",
                        "duration": "2 hours"
                    })
                    
                    if result.get("success"):
                        response = f"✅ {result['message']}\n\n"
                        response += f"📍 **{place.get('name')}**\n"
                        response += f"📝 {place.get('address', 'N/A')}\n"
                        response += f"⭐ {place.get('rating', 'N/A')}/5\n\n"
                        response += "💾 **Lưu ý**: Thay đổi này sẽ được lưu vào lộ trình của bạn.\n"
                        response += "💡 Bạn muốn thêm địa điểm khác không?"
                        return response
                    else:
                        return f"❌ Lỗi: {result.get('error', 'Không thể thêm địa điểm')}"
                else:
                    return f"❌ Không tìm thấy địa điểm '{place_name}' ở {itinerary_data.get('destination', 'đây')}."
            else:
                # User asking for suggestions only
                print("      → Suggest additional places")
                
                # Extract preferences from user text
                preferences = {}
                
                # Detect category
                category_map = {
                    "quán cà phê": "cafe",
                    "cà phê": "cafe",
                    "café": "cafe",
                    "nhà hàng": "restaurant",
                    "quán ăn": "restaurant",
                    "bảo tàng": "museum",
                    "chùa": "temple",
                    "đền": "temple",
                    "chợ": "market",
                    "công viên": "park",
                    "bar": "bar",
                    "pub": "bar"
                }
                
                for key, value in category_map.items():
                    if key in user_text:
                        preferences["category"] = value
                        break
                
                # Extract day number if mentioned
                if day_match:
                    preferences["day_number"] = int(day_match.group(1))
                
                # Get suggestions
                suggestions = suggest_additional_places.invoke({
                    "itinerary_data": itinerary_data,
                    "preferences": preferences
                })
                
                if suggestions:
                    response = "💡 **Gợi ý địa điểm bổ sung cho lộ trình:**\n\n"
                    for i, place in enumerate(suggestions[:5], 1):
                        response += f"{i}. **{place.get('name', 'Unknown')}**\n"
                        response += f"   📍 {place.get('address', 'N/A')}\n"
                        response += f"   ⭐ {place.get('rating', 'N/A')}/5\n"
                        
                        if place.get('distance_from_reference'):
                            response += f"   📏 {place['distance_from_reference']}km từ địa điểm tham khảo\n"
                        
                        if place.get('description'):
                            desc = place['description'][:100] + "..." if len(place['description']) > 100 else place['description']
                            response += f"   📝 {desc}\n"
                        response += "\n"
                    
                    response += "**💡 Bạn có thể:**\n"
                    if day_match:
                        response += f"• Hỏi: 'Thêm [tên địa điểm] vào ngày {day_match.group(1)}'\n"
                    response += "• Hỏi chi tiết về địa điểm nào đó\n"
                    response += "• Yêu cầu gợi ý thêm loại hình khác"
                    return response
                else:
                    return "😔 Xin lỗi, không tìm thấy địa điểm phù hợp để gợi ý."
        
        # List places by day
        elif any(word in user_text for word in ["ngày", "day"]):
            print("      → List places by day")
            day_match = re.search(r'ngày (\d+)', user_text)
            
            if day_match:
                day_number = int(day_match.group(1))
                places = get_place_from_itinerary.invoke({
                    "itinerary_data": itinerary_data,
                    "day_number": day_number
                })
                
                if places:
                    response = f"📅 **Ngày {day_number}** ({places[0].get('date', 'N/A')}):\n\n"
                    for i, place in enumerate(places, 1):
                        response += f"{i}. **{place['name']}**"
                        if place.get('type'):
                            response += f" ({place.get('type')})"
                        response += "\n"
                        response += f"   ⏰ {place.get('time', 'N/A')} | 🕐 {place.get('duration', 'N/A')} phút\n"
                        
                        # Only show address if it exists and is not just coordinates
                        address = place.get('address', '')
                        if address and not address.startswith('Lat:'):
                            response += f"   📍 {address}\n"
                        
                        # Show rating if available
                        rating = place.get('rating', 0)
                        if rating > 0:
                            response += f"   ⭐ {rating}/5\n"
                        
                        # Show emotional tags if available
                        if place.get('emotional_tags'):
                            tags = ', '.join(place['emotional_tags'][:3])  # Show first 3 tags
                            response += f"   💭 {tags}\n"
                        
                        response += "\n"
                    
                    return response
                else:
                    return f"❌ Không tìm thấy thông tin cho ngày {day_number}."
            else:
                return "❓ Bạn muốn xem lịch trình ngày mấy? (VD: 'ngày 1', 'ngày 2')"
        
        # Default: show overview
        else:
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            if details.get("error"):
                return "❓ Bạn muốn biết gì về lộ trình? (VD: 'xem lộ trình', 'giới thiệu địa điểm X', 'gợi ý thêm quán cà phê')"
            
            return f"📋 Bạn có lộ trình **{details.get('title', 'Chưa đặt tên')}** ({details.get('duration_days', 0)} ngày) với {details.get('total_places', 0)} địa điểm.\n\n💡 Bạn muốn:\n• Xem chi tiết lộ trình\n• Giới thiệu về một địa điểm\n• Gợi ý thêm địa điểm mới"
    
    except Exception as e:
        print(f"      ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return "😔 Xin lỗi, có lỗi khi xử lý thông tin lộ trình."


def _handle_place_introduction_with_itinerary(user_text: str, itinerary_data: Dict, current_location: Optional[Dict]) -> str:
    """
    Handle place introduction, checking itinerary first
    """
    try:
        # Try to extract place name
        place_name = None
        for trigger in ["giới thiệu", "cho tôi biết", "kể về", "thông tin về", "tìm hiểu về"]:
            if trigger in user_text:
                parts = user_text.split(trigger)
                if len(parts) > 1:
                    place_name = parts[1].strip()
                    place_name = place_name.replace("về", "").replace("địa điểm", "").strip()
                    break
        
        # If place name found, search in itinerary first
        if place_name:
            places = get_place_from_itinerary.invoke({
                "itinerary_data": itinerary_data,
                "place_name": place_name
            })
            
            if places:
                # Found in itinerary
                place = places[0]
                response = f"📍 **{place['name']}** _(trong lộ trình của bạn)_\n\n"
                response += f"📅 **Ngày {place['day']}** - {place.get('date', 'N/A')}\n"
                response += f"⏰ **Thời gian:** {place.get('time', 'N/A')}\n"
                response += f"🕐 **Dự kiến:** {place.get('duration', 'N/A')}\n\n"
                
                if place.get('description'):
                    response += f"📝 **Giới thiệu:**\n{place['description']}\n\n"
                
                response += f"⭐ **Đánh giá:** {place.get('rating', 'N/A')}/5\n"
                response += f"📍 **Địa chỉ:** {place.get('address', 'N/A')}\n"
                
                if place.get('emotional_tags'):
                    tags = ', '.join(place['emotional_tags'])
                    response += f"💭 **Cảm xúc:** {tags}\n"
                
                if place.get('price_level'):
                    response += f"💰 **Mức giá:** {place['price_level']}\n"
                
                return response
        
        # If not found in itinerary, use regular handler
        return _handle_place_introduction(user_text, current_location)
    
    except Exception as e:
        print(f"      ❌ Error: {e}")
        return _handle_place_introduction(user_text, current_location)


def _handle_greeting(current_location: Optional[Dict]) -> str:
    """Handle greeting and welcome new users"""
    
    greeting = "👋 **Xin chào! Tôi là Travel Companion AI**\n\n"
    greeting += "🧭 Tôi ở đây để hỗ trợ bạn **trong lúc đi du lịch**!\n\n"
    
    if not current_location:
        greeting += "⚠️ **Quan trọng:** Tôi thấy GPS chưa được bật!\n\n"
        greeting += "📍 **Vui lòng bật GPS để trải nghiệm đầy đủ:**\n"
        greeting += "• Tìm địa điểm gần bạn\n"
        greeting += "• Chỉ đường & kiểm tra traffic\n"
        greeting += "• Thời tiết tại vị trí hiện tại\n"
        greeting += "• Gợi ý hoạt động phù hợp\n\n"
        greeting += "🔧 **Cách bật GPS:**\n"
        greeting += "1. Mở Cài đặt điện thoại\n"
        greeting += "2. Tìm ứng dụng du lịch\n"
        greeting += "3. Bật **Truy cập vị trí**\n\n"
    else:
        greeting += "✅ GPS đã bật! Sẵn sàng hỗ trợ bạn!\n\n"
    
    greeting += "💬 **Tôi có thể giúp gì cho bạn?**\n\n"
    greeting += "**🔍 Tìm kiếm:**\n"
    greeting += "• 'Quán cà phê gần đây'\n"
    greeting += "• 'Nhà hàng xung quanh'\n"
    greeting += "• 'ATM gần nhất'\n\n"
    
    greeting += "**🌤️ Thời tiết & Gợi ý:**\n"
    greeting += "• 'Thời tiết bây giờ thế nào?'\n"
    greeting += "• 'Nên làm gì bây giờ?'\n\n"
    
    greeting += "**🚗 Chỉ đường:**\n"
    greeting += "• 'Chỉ đường đến [địa điểm]'\n"
    greeting += "• 'Giao thông có kẹt không?'\n\n"
    
    greeting += "**🍽️ Ẩm thực:**\n"
    greeting += "• 'Nên ăn gì bây giờ?'\n"
    greeting += "• 'Gợi ý món ăn'\n"
    greeting += "• 'Món đặc sản gì?'\n\n"
    
    greeting += "**🚨 Khẩn cấp:**\n"
    greeting += "• 'Bệnh viện gần nhất'\n"
    greeting += "• 'Công an/Cảnh sát'\n\n"
    
    greeting += "✨ Hãy hỏi tôi bất cứ điều gì!"
    
    return greeting

# =====================================
# GRAPH CONSTRUCTION
# =====================================

def create_travel_companion_graph():
    """Create the LangGraph workflow for companion mode"""
    
    workflow = StateGraph(TravelState)
    
    # Add the single node
    workflow.add_node("companion_assistant", companion_assistant_node)
    
    # Add edges
    workflow.add_edge(START, "companion_assistant")
    workflow.add_edge("companion_assistant", END)
    
    return workflow.compile()

# =====================================
# MAIN AGENT CLASS
# =====================================

class TravelCompanion:
    def __init__(self):
        self.graph = create_travel_companion_graph()
    
    def chat(self, user_message: str, conversation_state: Optional[Dict] = None, 
             current_location: Optional[Dict] = None, active_place_id: Optional[str] = None,
             itinerary: Optional[List[Dict]] = None) -> Dict:
        """
        Main chat interface for the travel companion
        
        Args:
            user_message: User's input message
            conversation_state: Previous conversation state (for memory)
            current_location: Current GPS location {'lat': float, 'lng': float}
            active_place_id: Google Place ID of current location
            itinerary: User's itinerary (reference only)
            
        Returns:
            Dict containing response and updated state
        """
        
        # Initialize or update state
        if conversation_state:
            state = conversation_state.copy()
            state["messages"].append(HumanMessage(content=user_message))
            print(f"   📋 Resuming conversation with {len(state['messages'])} messages")
        else:
            state = {
                "messages": [HumanMessage(content=user_message)],
                "current_location": None,
                "active_place_id": None,
                "itinerary": None
            }
            print(f"   🆕 Starting new conversation")
        
        # Update location and place info (always set to ensure keys exist)
        state["current_location"] = current_location if current_location else state.get("current_location")
        state["active_place_id"] = active_place_id if active_place_id else state.get("active_place_id")
        state["itinerary"] = itinerary if itinerary else state.get("itinerary")
        
        # Debug log
        print(f"   📍 State current_location: {state.get('current_location')}")
        print(f"   🏛️ State active_place_id: {state.get('active_place_id')}")
        print(f"   📋 State itinerary: {state.get('itinerary') is not None}")
        
        # Run the graph
        try:
            final_state = self.graph.invoke(state)
            
            # Extract the latest AI response
            ai_messages = [msg for msg in final_state["messages"] if isinstance(msg, AIMessage)]
            latest_response = ai_messages[-1].content if ai_messages else "Xin lỗi, tôi không thể xử lý yêu cầu của bạn."
            
            print(f"   ✅ Conversation complete with {len(final_state['messages'])} messages")
            
            return {
                "response": latest_response,
                "state": final_state,
                "status": "success"
            }
        
        except Exception as e:
            print(f"❌ Error in travel companion: {e}")
            import traceback
            traceback.print_exc()
            return {
                "response": f"Xin lỗi, đã có lỗi xảy ra: {str(e)}",
                "state": state,
                "status": "error"
            }

# =====================================
# TEST FUNCTION
# =====================================

if __name__ == "__main__":
    companion = TravelCompanion()
    
    print("🧭 Travel Companion started! Type 'quit' to exit.\n")
    
    conversation_state = None
    current_location = None
    active_place_id = None
    
    while True:
        # Allow setting location
        if conversation_state is None:
            print("💡 Tip: Trước khi hỏi, bạn có thể set vị trí GPS:\n")
            print("   Format: 'set location 21.0285 105.8542' (Hà Nội)\n")
            print("   Hoặc hỏi trực tiếp, VD: 'quán cà phê gần đây'\n")
        
        user_input = input("👤 Bạn: ")
        
        if user_input.lower() in ['quit', 'exit', 'thoát']:
            break
        
        # Handle location setting
        if user_input.lower().startswith("set location"):
            parts = user_input.split()
            if len(parts) >= 4:
                try:
                    lat = float(parts[2])
                    lng = float(parts[3])
                    current_location = {"lat": lat, "lng": lng}
                    print(f"✅ Vị trí đã cập nhật: ({lat}, {lng})\n")
                    continue
                except:
                    print("❌ Format sai. Sử dụng: 'set location LAT LNG'\n")
                    continue
        
        result = companion.chat(
            user_input,
            conversation_state=conversation_state,
            current_location=current_location,
            active_place_id=active_place_id
        )
        
        conversation_state = result["state"]
        
        print(f"\n🧭 Companion: {result['response']}\n")
        print("-" * 50)
