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
    add_place_to_itinerary_backend,
    # Core search tool
    search_places,
    # Save Google Places to DB
    save_google_place_to_db,
    # DB Helper
    find_place_by_id_db
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
    last_suggestions: Optional[List[Dict]]  # Last place suggestions shown to user

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
            # Near place in itinerary (NOT GPS-based)
            "gần địa điểm",
            # Additional keywords for draft mode
            "địa điểm này", "chỗ này", "nơi này",
            # Keywords for showing all places or specific place info
            "các địa điểm", "tất cả địa điểm", "giới thiệu", "cho tôi biết", "kể về", "thông tin về", "danh sách"
        ]):
            is_draft = itinerary_data.get('status') == 'DRAFT' or not itinerary_data.get('route_id')
            print(f"   📋 Type: Itinerary query ({'Draft' if is_draft else 'Saved'})")
            response_text, new_suggestions = _handle_itinerary_query(user_text, itinerary_data, current_location, state)
            # Update state with new suggestions if returned
            if new_suggestions is not None:
                state["last_suggestions"] = new_suggestions
                print(f"   💾 Updated last_suggestions: {len(new_suggestions)} places")
        
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

def _format_place_type(place_type: str) -> str:
    """Format place type with icon"""
    type_map = {
        # Điểm tham quan
        'tourist_attraction': '🏛️ Điểm tham quan',
        'point_of_interest': '📍 Điểm tham quan',
        'establishment': '📍 Địa điểm',
        'museum': '🏛️ Bảo tàng',
        'art_gallery': '🎨 Phòng tranh',
        'park': '🌳 Công viên',
        'natural_feature': '🏞️ Thắng cảnh thiên nhiên',
        'amusement_park': '🎢 Công viên giải trí',
        'zoo': '🦁 Vườn thú',
        'aquarium': '🐠 Thủy cung',
        'stadium': '🏟️ Sân vận động',
        # Ăn uống
        'restaurant': '🍽️ Nhà hàng',
        'cafe': '☕ Quán cà phê',
        'bar': '🍸 Bar',
        'bakery': '🥐 Tiệm bánh',
        'food': '🍜 Ẩm thực',
        'meal_delivery': '🍱 Giao đồ ăn',
        'meal_takeaway': '🥡 Đồ ăn mang đi',
        # Mua sắm
        'shopping_mall': '🏬 Trung tâm mua sắm',
        'store': '🏪 Cửa hàng',
        'department_store': '🏬 Cửa hàng bách hóa',
        'supermarket': '🛒 Siêu thị',
        'convenience_store': '🏪 Cửa hàng tiện lợi',
        'clothing_store': '👗 Cửa hàng thời trang',
        'jewelry_store': '💎 Tiệm trang sức',
        'book_store': '📚 Nhà sách',
        # Lưu trú
        'hotel': '🏨 Khách sạn',
        'lodging': '🛏️ Nơi lưu trú',
        'campground': '⛺ Khu cắm trại',
        # Giải trí
        'night_club': '🎶 Hộp đêm',
        'casino': '🎰 Sòng bài',
        'movie_theater': '🎬 Rạp chiếu phim',
        'bowling_alley': '🎳 Sân bowling',
        # Sức khỏe & Làm đẹp
        'spa': '💆 Spa',
        'gym': '🏋️ Phòng gym',
        'beauty_salon': '💇 Salon làm đẹp',
        'hair_care': '💇 Tiệm tóc',
        # Tôn giáo
        'church': '⛪ Nhà thờ',
        'temple': '🛕 Đền / Chùa',
        'hindu_temple': '🛕 Đền Hindu',
        'mosque': '🕌 Nhà thờ Hồi giáo',
        'synagogue': '🕍 Giáo đường Do Thái',
        'place_of_worship': '🙏 Nơi thờ phượng',
        # Thiên nhiên & Biển
        'beach': '🏖️ Bãi biển',
        'lake': '🏊 Hồ',
        'mountain': '⛰️ Núi',
        # Chợ búa
        'market': '🏪 Chợ',
        'grocery_or_supermarket': '🛒 Siêu thị',
        # Giao thông
        'airport': '✈️ Sân bay',
        'bus_station': '🚌 Bến xe',
        'train_station': '🚆 Ga tàu',
        'subway_station': '🚇 Ga metro',
        'taxi_stand': '🚕 Bến taxi',
        'transit_station': '🚉 Trạm trung chuyển',
        # Mặc định
        'default': '📍 Địa điểm'
    }
    return type_map.get(place_type, type_map['default'])


def _format_emotional_tags(tags: list) -> str:
    """Map emotional tags to Vietnamese"""
    tag_map = {
        # English tags - Basic emotions
        'adventurous': 'Mạo hiểm',
        'adventure': 'Mạo hiểm',
        'family-friendly': 'Gia đình',
        'family_friendly': 'Gia đình',
        'family': 'Gia đình',
        'kid-friendly': 'Thân thiện trẻ em',
        'kid_friendly': 'Thân thiện trẻ em',
        'festive': 'Lễ hội',
        'historical': 'Lịch sử',
        'historic': 'Lịch sử',
        'lively': 'Sôi động',
        'romantic': 'Lãng mạn',
        'peaceful': 'Yên tĩnh',
        'quiet': 'Yên tĩnh',
        'scenic': 'Cảnh đẹp',
        'cultural': 'Văn hóa',
        'culture': 'Văn hóa',
        'spiritual': 'Tâm linh',
        'religious': 'Tôn giáo',
        'relaxing': 'Thư giãn',
        'relaxed': 'Thư giãn',
        'chill': 'Thư giãn',
        'exciting': 'Hứng thú',
        'educational': 'Giáo dục',
        'luxurious': 'Sang trọng',
        'luxury': 'Sang trọng',
        'upscale': 'Cao cấp',
        'trendy': 'Hiện đại',
        'modern': 'Hiện đại',
        'authentic': 'Chân thật',
        'traditional': 'Truyền thống',
        'local': 'Địa phương',
        'vibrant': 'Năng động',
        'serene': 'Tĩnh lặng',
        'bustling': 'Nhộn nhịp',
        'busy': 'Đông đúc',
        'charming': 'Quyến rũ',
        'cozy': 'Ấm cúng',
        'beautiful': 'Tuyệt đẹp',
        'instagram-worthy': 'Đáng check-in',
        'instagrammable': 'Đáng check-in',
        'photogenic': 'Đáng chụp ảnh',
        'iconic': 'Biểu tượng',
        'famous': 'Nổi tiếng',
        'popular': 'Phổ biến',
        'hidden-gem': 'Địa điểm ẩn',
        'hidden gem': 'Địa điểm ẩn',
        'outdoor': 'Ngoài trời',
        'indoor': 'Trong nhà',
        'nature': 'Thiên nhiên',
        'natural': 'Thiên nhiên',
        'food': 'Ẩm thực',
        'foodie': 'Ẩm thực',
        'nightlife': 'Về đêm',
        'artsy': 'Nghệ thuật',
        'artistic': 'Nghệ thuật',
        'creative': 'Sáng tạo',
        'fun': 'Vui nhộn',
        'entertaining': 'Giải trí',
        'free': 'Miễn phí',
        'budget-friendly': 'Bình dân',
        'affordable': 'Giá rẻ',
        'exclusive': 'Độc quyền',
        'unique': 'Độc đáo',
        'special': 'Đặc biệt',
        # Vietnamese tags (keep as is)
        'mạo hiểm': 'Mạo hiểm',
        'gia đình': 'Gia đình',
        'lễ hội': 'Lễ hội',
        'lịch sử': 'Lịch sử',
        'sôi động': 'Sôi động',
        'lãng mạn': 'Lãng mạn',
        'yên tĩnh': 'Yên tĩnh',
        'đẹp': 'Đẹp',
        'văn hóa': 'Văn hóa',
        'tâm linh': 'Tâm linh',
        'thư giãn': 'Thư giãn',
        'truyền thống': 'Truyền thống',
        'hiện đại': 'Hiện đại',
        'thiên nhiên': 'Thiên nhiên'
    }
    
    mapped_tags = []
    for tag in tags:
        tag_lower = tag.lower().strip()
        mapped = tag_map.get(tag_lower, tag)  # Keep original if not found
        if mapped not in mapped_tags:  # Avoid duplicates
            mapped_tags.append(mapped)
    
    return ', '.join(mapped_tags[:5])  # Limit to 5 tags


def _format_place_type(place_type: str) -> str:
    """Map place types to Vietnamese labels with emojis"""
    type_map = {
        'restaurant': ('🍽️ Nhà hàng', '🍽️'),
        'cafe': ('☕ Quán cà phê', '☕'),
        'coffee': ('☕ Quán cà phê', '☕'),
        'museum': ('🏛️ Bảo tàng', '🏛️'),
        'park': ('🌳 Công viên', '🌳'),
        'temple': ('⛩️ Đền thờ', '⛩️'),
        'church': ('⛪ Nhà thờ', '⛪'),
        'shopping': ('🛍️ Mua sắm', '🛍️'),
        'market': ('🏪 Chợ', '🏪'),
        'entertainment': ('🎭 Giải trí', '🎭'),
        'beach': ('🏖️ Bãi biển', '🏖️'),
        'mountain': ('⛰️ Núi', '⛰️'),
        'tourist_attraction': ('📍 Điểm tham quan', '📍'),
        'attraction': ('📍 Điểm tham quan', '📍'),
        'hotel': ('🏨 Khách sạn', '🏨'),
        'accommodation': ('🏨 Chỗ ở', '🏨'),
    }
    
    if not place_type:
        return '📍 Địa điểm'
    
    place_type_lower = place_type.lower().strip()
    
    # Try exact match first
    if place_type_lower in type_map:
        return type_map[place_type_lower][0]
    
    # Try partial match
    for key, (label, icon) in type_map.items():
        if key in place_type_lower or place_type_lower in key:
            return label
    
    # Default
    return f'📍 {place_type}'


def _format_datetime(datetime_str: str) -> str:
    """Format ISO datetime to readable format"""
    if not datetime_str:
        return 'N/A'
    
    try:
        from datetime import datetime
        # Parse ISO format: 2025-12-21T08:05:53.859529
        dt = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        # Format: "08:05 - 21/12"
        return dt.strftime("%H:%M - %d/%m")
    except:
        return datetime_str


def _format_duration(minutes: any) -> str:
    """Format duration in minutes to readable format"""
    if not minutes:
        return 'N/A'
    
    try:
        mins = int(minutes) if isinstance(minutes, (int, float)) else 0
        if mins < 60:
            return f'{mins} phút'
        else:
            hours = mins // 60
            remaining_mins = mins % 60
            if remaining_mins == 0:
                return f'{hours} giờ'
            else:
                return f'{hours}h {remaining_mins}m'
    except:
        return str(minutes)


def _generate_basic_travel_tips(destination: str, place_names: List[str], place_types: List[str]) -> tuple:
    """
    Generate basic travel tips when LLM is unavailable
    """
    response = f"💡 **Lời khuyên khi du lịch {destination}:**\n\n"
    
    response += "**🕐 Thời điểm:**\n"
    response += "• Nên đến các địa điểm nổi tiếng sớm (7-8h sáng) để tránh đông\n"
    response += "• Các quán cafe/nhà hàng vui nhất từ 17-21h\n\n"
    
    response += "**👕 Trang phục:**\n"
    response += "• Mặc thoải mái, giày đi bộ êm chân\n"
    response += "• Nếu vào chùa/đền: mặc kín đáo\n"
    response += "• Mang theo áo khoác mỏng phòng máy lạnh\n\n"
    
    response += "**🍜 Ẩm thực:**\n"
    response += "• Thử các món đặc sản địa phương\n"
    response += "• Hỏi người dân về quán ăn ngon\n"
    response += "• Uống đủ nước trong ngày\n\n"
    
    response += "**⚠️ Lưu ý:**\n"
    response += "• Mang theo tiền mặt, nhiều nơi không nhận thẻ\n"
    response += "• Giữ đồ đạc cá nhân cẩn thận\n"
    response += "• Lưu số điện thoại khẩn cấp\n\n"
    
    if place_names:
        response += f"**📍 Địa điểm của bạn:** {', '.join(place_names[:5])}\n\n"
    
    response += "---\n💬 Hỏi 'Giới thiệu [tên địa điểm]' để biết chi tiết hơn!"
    
    return (response, None)


def _format_itinerary_display(details: Dict, is_draft: bool = False, show_title: bool = True) -> str:
    """
    Format itinerary details for beautiful display
    """
    from datetime import datetime
    
    response = ""
    
    # Header with title
    if show_title:
        title_suffix = " _(Đang tạo)_" if is_draft else ""
        title = details.get('title', 'Chưa đặt tên')
        response += f"📋 **{title}{title_suffix}**\n"
        response += f"📍 **{details.get('destination', 'N/A')}** • {details.get('duration_days', 0)} ngày • {details.get('total_places', 0)} địa điểm\n\n"
    
    # Days and places
    for day in details.get('days', []):
        day_number = day.get('day_number', 1)
        day_date = day.get('date', '')
        
        # Try to parse date for better formatting
        try:
            if day_date:
                dt = datetime.fromisoformat(day_date.replace('Z', '+00:00')) if 'T' in str(day_date) else None
                if dt:
                    formatted_date = dt.strftime("%d/%m/%Y")
                else:
                    formatted_date = day_date
            else:
                formatted_date = ""
        except:
            formatted_date = day_date
        
        response += f"📅 **NGÀY {day_number}**"
        if formatted_date:
            response += f" • {formatted_date}"
        response += "\n"
        
        places = day.get('places', [])
        if not places:
            response += "_Chưa có địa điểm_\n\n"
            continue
        
        for i, place in enumerate(places, 1):
            place_type = place.get('type', 'Địa điểm')
            place_name = place['name']
            
            # Format type with emoji
            type_label = _format_place_type(place_type)
            
            response += f"**{i}. {place_name}**\n"
            response += f"{type_label}\n"
            
            # Time and duration on same line
            time_parts = []
            if place.get('time'):
                formatted_time = _format_datetime(place.get('time'))
                time_parts.append(f"🕐 {formatted_time}")
            
            if place.get('duration'):
                formatted_duration = _format_duration(place.get('duration'))
                time_parts.append(f"⏳ {formatted_duration}")
            
            if time_parts:
                response += " • ".join(time_parts) + "\n"
            
            # Address
            address = place.get('address', '')
            if address:
                response += f"📍 {address}\n"
            
            # Rating
            rating = place.get('rating', 0)
            if rating and rating > 0:
                response += f"⭐ {rating}/5.0\n"
            
            # Spacing between items (except last one)
            if i < len(places):
                response += "\n"
        
        response += "\n"
    
    # Footer note
    if is_draft:
        response += "💡 Hỏi tôi để tìm hiểu chi tiết về từng địa điểm!"
    
    return response


def _handle_itinerary_query(user_text: str, itinerary_data: Dict, current_location: Optional[Dict], state: Optional[Dict] = None) -> tuple:
    """
    Handle queries related to user's itinerary.
    Supports: viewing itinerary, adding places, getting place info from itinerary
    Works with both saved itineraries and draft itineraries (being created)
    
    Returns: tuple (response_text, updated_suggestions)
    """
    import re
    try:
        # Check if this is a draft (being created) or saved itinerary
        is_draft = itinerary_data.get('status') == 'DRAFT' or not itinerary_data.get('route_id')
        
        # Get last suggestions from state (if available)
        last_suggestions = state.get('last_suggestions', []) if state else []
        
        # PRIORITY 1: Itinerary consultation - provide travel tips and advice
        # Must be BEFORE "xem lộ trình" to catch "tư vấn lộ trình"
        if any(word in user_text for word in ["tư vấn", "lời khuyên", "tips", "kinh nghiệm", "nên biết", "cần lưu ý", "advice"]):
            print("      → Itinerary consultation")
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            
            if details.get("error"):
                return (f"❌ Không thể lấy thông tin lộ trình: {details['error']}", None)
            
            # Build place list for AI context
            place_names = []
            place_types = []
            for day_info in details.get("days", []):
                for place in day_info.get("places", []):
                    place_names.append(place.get("name", ""))
                    place_types.append(place.get("type", ""))
            
            destination = itinerary_data.get("destination", "")
            duration = details.get("duration_days", 0)
            
            # Generate advice using LLM with better formatting
            llm = get_llm()
            # Build detailed place info for context
            place_details_str = ""
            for i, name in enumerate(place_names[:20], 1):
                place_type = place_types[i-1] if i-1 < len(place_types) else ""
                place_details_str += f"{i}. {name} ({place_type})\n"
            
            prompt = f"""Bạn là hướng dẫn viên du lịch giàu kinh nghiệm tại {destination}. 

Lộ trình {duration} ngày của khách gồm các địa điểm:
{place_details_str}

Hãy tư vấn CỤ THỂ theo format sau:

📍 **TƯ VẤN TỪNG ĐỊA ĐIỂM:**

{chr(10).join([f"**{i}. {name}:**" + chr(10) + "• Thời điểm đẹp nhất: [giờ cụ thể]" + chr(10) + "• Nên làm gì: [hoạt động cụ thể]" + chr(10) + "• Lưu ý: [tips quan trọng]" + chr(10) for i, name in enumerate(place_names[:10], 1)])}

---

🌟 **LỜI KHUYÊN CHUNG:**

🕐 **Di chuyển:** [Tips di chuyển giữa các điểm]
👕 **Trang phục:** [Nên mặc gì]
🍜 **Ẩm thực:** [Món ngon gần lộ trình]
💡 **Lưu ý:** [Điều hay bị bỏ qua]

Viết ngắn gọn, tập trung vào thông tin THỰC TẾ và CỤ THỂ cho từng địa điểm."""

            try:
                response = llm.invoke([HumanMessage(content=prompt)])
                advice_text = response.content
                
                result = f"✨ **Lời khuyên cho lộ trình {destination} ({duration} ngày):**\n\n"
                result += advice_text
                
                return (result, None)
            except Exception as e:
                print(f"      ❌ LLM error: {e}")
                return _generate_basic_travel_tips(destination, place_names, place_types)
        
        # PRIORITY 2: View itinerary overview
        elif any(word in user_text for word in ["xem lộ trình", "lộ trình của tôi", "cho tôi xem", "show", "hiển thị", "chi tiết lộ trình", "xem chi tiết"]):
            print("      → View itinerary overview")
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            
            if details.get("error"):
                return (f"❌ Không thể lấy thông tin lộ trình: {details['error']}", None)
            
            return (_format_itinerary_display(details, is_draft=is_draft, show_title=True), None)
        
        # Ask about all places in itinerary (show all places)
        elif any(word in user_text for word in ["các địa điểm", "tất cả", "danh sách", "tất cả địa điểm"]):
            print("      → Show all places in itinerary")
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            
            if details.get("error"):
                return (f"❌ Không thể lấy thông tin lộ trình: {details['error']}", None)
            
            return (_format_itinerary_display(details, is_draft=is_draft, show_title=True), None)
        
        # Ask about specific place in itinerary (works for both draft and saved)
        elif any(word in user_text for word in ["giới thiệu", "cho tôi biết", "kể về", "thông tin về"]):
            print("      → Place info request")
            
            # Check if asking about "địa điểm thứ X" pattern
            place_index_match = re.search(r'địa điểm\s+(?:thứ\s+)?(\d+|một|hai|ba|bốn|năm)', user_text)
            if place_index_match:
                # Convert Vietnamese numbers to digits
                vn_numbers = {'một': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'năm': 5}
                index_str = place_index_match.group(1)
                index = vn_numbers.get(index_str, int(index_str) if index_str.isdigit() else 0)
                
                if index > 0:
                    # Priority 1: Check last_suggestions first
                    if last_suggestions and index <= len(last_suggestions):
                        print(f"      → Fetching detailed info for suggestion #{index}")
                        place = last_suggestions[index - 1]
                        place_id = place.get('place_id') or place.get('google_place_id')
                        
                        # Fetch detailed information from Google Places
                        if place_id:
                            try:
                                print(f"      → Calling Google Places API for {place_id}")
                                detailed_info = get_place_details.invoke({"place_id": place_id})
                                if detailed_info and not detailed_info.get("error"):
                                    # Merge with existing place data
                                    place.update(detailed_info)
                                    print(f"      ✅ Fetched details: rating={place.get('rating')}, reviews={len(place.get('reviews', []))}")
                                else:
                                    print(f"      ⚠️ No detailed info returned: {detailed_info.get('error', 'Unknown')}")
                            except Exception as e:
                                print(f"      ❌ Failed to fetch details: {e}")
                        else:
                            print(f"      ⚠️ No place_id found for suggestion #{index}")
                        
                        # Format detailed response
                        response = f"📍 **{place.get('name')}**\n\n"
                        
                        type_label = _format_place_type(place.get('type', ''))
                        response += f"{type_label}\n"
                        
                        if place.get('address'):
                            response += f"📍 {place.get('address')}\n"
                        
                        rating = place.get('rating', 0)
                        if rating and rating > 0:
                            stars = "⭐" * int(rating)
                            response += f"{stars} ({rating}/5.0"
                            if place.get('user_ratings_total'):
                                response += f" • {place['user_ratings_total']} đánh giá"
                            response += ")\n"
                        
                        response += "\n"
                        
                        # Description/Editorial summary
                        desc = place.get('description') or place.get('editorial_summary') or place.get('formatted_address')
                        if desc:
                            # Limit description length to avoid overly long responses
                            if len(desc) > 300:
                                desc = desc[:300] + "..."
                            response += f"**Giới thiệu:**\n{desc}\n\n"
                        
                        # Opening hours
                        if place.get('opening_hours'):
                            hours = place['opening_hours']
                            if isinstance(hours, dict):
                                if hours.get('open_now') is not None:
                                    status = "🟢 Đang mở cửa" if hours['open_now'] else "🔴 Đã đóng cửa"
                                    response += f"{status}\n"
                                if hours.get('weekday_text'):
                                    response += "**Giờ mở cửa:**\n"
                                    # Show only today and tomorrow to keep response concise
                                    for day_hours in hours['weekday_text'][:2]:
                                        response += f"• {day_hours}\n"
                                    if len(hours['weekday_text']) > 2:
                                        response += f"_(Xem đầy đủ khi thêm vào lộ trình)_\n"
                                    response += "\n"
                        
                        # Price level
                        if place.get('price_level'):
                            price_map = {1: '$ Rẻ', 2: '$$ Vừa phải', 3: '$$$ Đắt', 4: '$$$$ Rất đắt'}
                            response += f"💰 {price_map.get(place['price_level'], 'N/A')}\n\n"
                        
                        # Reviews - show only 1 review to keep response concise
                        if place.get('reviews') and len(place['reviews']) > 0:
                            response += "**💬 Đánh giá nổi bật:**\n"
                            review = place['reviews'][0]
                            rating_stars = "⭐" * review.get('rating', 0)
                            text = review.get('text', '')
                            if len(text) > 120:
                                text = text[:120] + "..."
                            response += f"{rating_stars}\n_{text}_\n\n"
                        
                        # Contact info
                        contact_items = []
                        if place.get('phone_number'):
                            contact_items.append(f"📞 {place['phone_number']}")
                        if place.get('website'):
                            website = place['website']
                            if len(website) > 40:
                                website = website[:40] + "..."
                            contact_items.append(f"🌐 {website}")
                        
                        if contact_items:
                            response += " • ".join(contact_items) + "\n\n"
                        
                        # Tips with day suggestion if available
                        response += "💡 **Thêm vào lộ trình:**\n"
                        response += f'Hỏi: _"Thêm {place.get("name")} vào ngày [số ngày]"_'
                        
                        return (response, None)
                    
                    # Priority 2: Check itinerary places
                    else:
                        details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
                        if not details.get("error"):
                            all_places = []
                            for day in details.get('days', []):
                                for place in day.get('places', []):
                                    all_places.append(place)
                            
                            if index <= len(all_places):
                                place = all_places[index - 1]
                                
                                # Fetch detailed info from Google Places API (same as name-based lookup)
                                place_id = place.get('place_id') or place.get('google_place_id')
                                api_details = {}
                                if place_id:
                                    try:
                                        print(f"      → Calling Google Places API for {place_id}")
                                        api_details = get_place_details.invoke({"place_id": place_id})
                                        if api_details and not api_details.get("error"):
                                            print(f"      ✅ Fetched details: rating={api_details.get('rating')}, reviews={len(api_details.get('reviews', []))}")
                                        else:
                                            print(f"      ⚠️ No detailed info returned: {api_details.get('error', 'Unknown')}")
                                            api_details = {}
                                    except Exception as e:
                                        print(f"      ❌ Failed to fetch details: {e}")
                                        api_details = {}
                                
                                draft_note = " _(đang tạo)_" if is_draft else ""
                                response = f"📍 **{place['name']}**{draft_note}\n\n"
                                
                                # Basic info
                                type_label = _format_place_type(place.get('type', ''))
                                response += f"{type_label}\n"
                                
                                # Schedule info
                                response += f"\n📅 **Lịch trình:**\n"
                                response += f"   • Ngày {place.get('day', 'N/A')}"
                                if place.get('date'):
                                    response += f" - {place.get('date')}"
                                response += "\n"
                                if place.get('time'):
                                    formatted_time = _format_datetime(place.get('time'))
                                    response += f"   • Thời gian: {formatted_time}\n"
                                if place.get('duration'):
                                    formatted_duration = _format_duration(place.get('duration'))
                                    response += f"   • Dự kiến: {formatted_duration}\n"
                                
                                response += "\n"
                                
                                # Detailed info from Google Places API
                                if api_details:
                                    # Editorial summary / Description (with multiple fallbacks)
                                    description = (
                                        api_details.get('editorial_summary') or 
                                        api_details.get('description') or 
                                        place.get('description') or
                                        None
                                    )
                                    
                                    # Rating & Reviews
                                    rating = api_details.get('rating') or place.get('rating', 0)
                                    total_ratings = api_details.get('user_ratings_total', 0)
                                    if rating > 0:
                                        stars = "⭐" * int(rating)
                                        response += f"⭐ **Đánh giá:** {stars} {rating}/5"
                                        if total_ratings > 0:
                                            response += f" ({total_ratings:,} đánh giá)"
                                        response += "\n"
                                    
                                    # Address
                                    address = api_details.get('formatted_address') or api_details.get('address') or place.get('address')
                                    if address:
                                        response += f"📍 **Địa chỉ:** {address}\n"
                                    
                                    # Opening hours
                                    if api_details.get('opening_hours'):
                                        hours = api_details['opening_hours']
                                        if hours.get('open_now') is not None:
                                            status = "🟢 Đang mở cửa" if hours['open_now'] else "🔴 Đang đóng cửa"
                                            response += f"🕐 **Trạng thái:** {status}\n"
                                    
                                    # Price level
                                    price_level = api_details.get('price_level')
                                    if price_level:
                                        price_symbols = "$" * price_level if isinstance(price_level, int) else price_level
                                        price_map = {"$": "Rẻ", "$$": "Vừa phải", "$$$": "Đắt", "$$$$": "Rất đắt"}
                                        price_text = price_map.get(price_symbols, price_symbols)
                                        response += f"💰 **Mức giá:** {price_symbols} ({price_text})\n"
                                    
                                    # Contact info
                                    if api_details.get('phone_number'):
                                        response += f"📞 **Điện thoại:** {api_details['phone_number']}\n"
                                    if api_details.get('website'):
                                        response += f"🌐 **Website:** {api_details['website']}\n"
                                    
                                    response += "\n"
                                    
                                    # If editorial summary exists, show it first
                                    if description:
                                        response += f"📖 **Giới thiệu:**\n{description}\n\n"
                                    
                                    # Generate detailed info using LLM for richer content
                                    destination = itinerary_data.get('destination', '')
                                    place_type = place.get('type', 'tourist_attraction')
                                    
                                    llm_prompt = f"""Bạn là hướng dẫn viên du lịch chuyên nghiệp tại {destination}. Hãy viết giới thiệu CHI TIẾT về địa điểm sau:

Tên: {place['name']}
Địa chỉ: {address or 'N/A'}
Loại: {_format_place_type(place_type).replace('📍 ', '').replace('🏛️ ', '').replace('🍽️ ', '').replace('☕ ', '')}
Đánh giá: {rating}/5 ({total_ratings:,} lượt đánh giá)

YÊU CẦU FORMAT (QUAN TRỌNG):
- KHÔNG dùng ####, ###, ## headers
- Dùng emoji + **bold** thay vì headers
- Mỗi bullet point NGẮN GỌN (tối đa 1-2 dòng)
- Dễ đọc trên điện thoại

Hãy bao gồm:

✨ **Điểm đặc biệt:**
• [2-3 điểm nổi bật về địa điểm này]

🎯 **Nên làm gì ở đây:**
• [3-4 hoạt động thú vị, cụ thể]

📸 **Góc chụp đẹp:**
• [2-3 vị trí khuyên chụp ảnh]

⏰ **Thời gian phù hợp:**
• [Khuyến nghị thời gian đẹp nhất]

💡 **Tips du lịch:**
• [2-3 lời khuyên hữu ích]

Trả lời bằng tiếng Việt, thông tin THỰC TẾ và CỤ THỂ."""

                                    try:
                                        llm = get_llm()
                                        llm_response = llm.invoke([HumanMessage(content=llm_prompt)])
                                        response += llm_response.content + "\n"
                                    except Exception as e:
                                        print(f"      ⚠️ LLM generation failed: {e}")
                                        # Fallback response
                                        emotional_tags = place.get('emotional_tags', [])
                                        if emotional_tags:
                                            formatted_tags = _format_emotional_tags(emotional_tags)
                                            response += f"💭 **Phù hợp cho:** {formatted_tags}\n\n"
                                        
                                        response += "✨ **Điểm đặc biệt:**\n"
                                        response += f"• Địa điểm được đánh giá cao với {rating}/5 sao\n"
                                        response += "• Điểm đến phổ biến trong lộ trình du lịch\n\n"
                                        
                                        response += "🎯 **Nên làm gì ở đây:**\n"
                                        response += "• Tham quan và chụp ảnh lưu niệm\n"
                                        response += "• Trải nghiệm không gian độc đáo\n"
                                        response += "• Khám phá văn hóa địa phương\n"
                                    
                                    # Top review at the end
                                    if api_details.get('reviews') and len(api_details['reviews']) > 0:
                                        review = api_details['reviews'][0]
                                        stars = "⭐" * int(review.get('rating', 0))
                                        author = review.get('author', 'Anonymous')
                                        text = review.get('text', '')[:150]
                                        if len(review.get('text', '')) > 150:
                                            text += "..."
                                        response += f"\n💬 **Đánh giá nổi bật:**\n"
                                        response += f"{stars} - {author}\n_{text}_\n"
                                else:
                                    # Fallback: Use LLM to generate detailed info when no API details
                                    # Still show basic info first
                                    
                                    # Rating
                                    rating = place.get('rating', 0)
                                    if rating > 0:
                                        stars = "⭐" * int(rating)
                                        response += f"⭐ **Đánh giá:** {stars} {rating}/5\n"
                                    
                                    # Address
                                    address = place.get('address', '')
                                    if address:
                                        response += f"📍 **Địa chỉ:** {address}\n"
                                    
                                    # Emotional tags with Vietnamese mapping
                                    emotional_tags = place.get('emotional_tags', [])
                                    if emotional_tags:
                                        formatted_tags = _format_emotional_tags(emotional_tags)
                                        response += f"💭 **Phù hợp cho:** {formatted_tags}\n"
                                    
                                    # Price level
                                    if place.get('price_level'):
                                        price_level = place.get('price_level')
                                        price_symbols = "$" * price_level if isinstance(price_level, int) else price_level
                                        price_map = {"$": "Rẻ", "$$": "Vừa phải", "$$$": "Đắt", "$$$$": "Rất đắt"}
                                        price_text = price_map.get(price_symbols, price_symbols)
                                        response += f"💰 **Mức giá:** {price_symbols} ({price_text})\n"
                                    
                                    response += "\n"
                                    
                                    # Description if available
                                    description = place.get('description')
                                    if description:
                                        response += f"📖 **Giới thiệu:**\n{description}\n\n"
                                    
                                    # Generate detailed info using LLM
                                    destination = itinerary_data.get('destination', '')
                                    place_type = place.get('type', 'tourist_attraction')
                                    
                                    llm_prompt = f"""Bạn là hướng dẫn viên du lịch chuyên nghiệp tại {destination}. Hãy viết giới thiệu CHI TIẾT về địa điểm sau:

Tên: {place['name']}
Địa chỉ: {address or 'N/A'}
Loại: {_format_place_type(place_type).replace('📍 ', '').replace('🏛️ ', '').replace('🍽️ ', '').replace('☕ ', '')}
Đánh giá: {rating}/5

YÊU CẦU FORMAT (QUAN TRỌNG):
- KHÔNG dùng ####, ###, ## headers
- Dùng emoji + **bold** thay vì headers
- Mỗi bullet point NGẮN GỌN (tối đa 1-2 dòng)
- Dễ đọc trên điện thoại

Hãy bao gồm:

✨ **Điểm đặc biệt:**
• [2-3 điểm nổi bật về địa điểm này]

🎯 **Nên làm gì ở đây:**
• [3-4 hoạt động thú vị, cụ thể]

📸 **Góc chụp đẹp:**
• [2-3 vị trí khuyên chụp ảnh]

⏰ **Thời gian phù hợp:**
• [Khuyến nghị thời gian đẹp nhất]

💡 **Tips du lịch:**
• [2-3 lời khuyên hữu ích]

Trả lời bằng tiếng Việt, thông tin THỰC TẾ và CỤ THỂ."""

                                    try:
                                        llm = get_llm()
                                        llm_response = llm.invoke([HumanMessage(content=llm_prompt)])
                                        response += llm_response.content + "\n"
                                    except Exception as e:
                                        print(f"      ⚠️ LLM generation failed: {e}")
                                        # Minimal fallback
                                        response += "✨ **Điểm đặc biệt:**\n"
                                        response += f"• Địa điểm được đánh giá cao trong lộ trình\n"
                                        response += "• Điểm đến phổ biến với du khách\n\n"
                                        
                                        response += "🎯 **Nên làm gì ở đây:**\n"
                                        response += "• Tham quan và chụp ảnh lưu niệm\n"
                                        response += "• Trải nghiệm không gian độc đáo\n"
                                        response += "• Khám phá văn hóa địa phương\n"
                                
                                if is_draft:
                                    response += "\n💡 Hỏi tôi về các địa điểm khác trong lộ trình!"
                                
                                return (response, None)
                            else:
                                return (f"❌ Lộ trình chỉ có {len(all_places)} địa điểm.", None)
            
            # Try to extract place name from user text
            place_name = None
            place_index = None
            day_for_index = None
            
            # First, check if user is asking by index (VD: "giới thiệu địa điểm thứ 2 ngày 1")
            index_pattern = r'địa điểm thứ (\d+)'
            index_match = re.search(index_pattern, user_text, re.IGNORECASE)
            if index_match:
                place_index = int(index_match.group(1))
                # Extract day number if mentioned
                day_match = re.search(r'ngày (\d+)', user_text)
                if day_match:
                    day_for_index = int(day_match.group(1))
                print(f"   🔢 User asking about place #{place_index} on day {day_for_index}")
            
            # If not asking by index, try to extract place name
            if not place_index:
                for trigger in ["giới thiệu", "cho tôi biết", "kể về", "thông tin về"]:
                    if trigger in user_text:
                        parts = user_text.split(trigger)
                        if len(parts) > 1:
                            place_name = parts[1].strip()
                            place_name = place_name.replace("về", "").replace("địa điểm", "").replace("các", "").replace("tất cả", "").strip()
                            # Remove index pattern if present
                            place_name = re.sub(r'thứ \d+', '', place_name).strip()
                            place_name = re.sub(r'ngày \d+', '', place_name).strip()
                            break
            
            # Handle query by index
            if place_index:
                print(f"   → Getting place by index: {place_index} (day: {day_for_index})")
                # Get all places or places from specific day
                if day_for_index:
                    # Get places from specific day only
                    places = []
                    if itinerary_data.get("route_data_json", {}).get("days"):
                        for day in itinerary_data["route_data_json"]["days"]:
                            if day.get("day") == day_for_index:
                                for idx, activity in enumerate(day.get("activities", []), 1):
                                    place = activity.get("place", {})
                                    if place.get("name"):
                                        places.append({
                                            "name": place.get("name"),
                                            "day": day.get("day"),
                                            "date": day.get("date"),
                                            "time": activity.get("time"),
                                            "duration": activity.get("duration"),
                                            "place_id": place.get("place_id") or place.get("google_place_id"),
                                            "google_place_id": place.get("google_place_id"),
                                            "type": place.get("type"),
                                            "rating": place.get("rating"),
                                            "address": place.get("address"),
                                            "description": place.get("description"),
                                            "emotional_tags": place.get("emotional_tags", [])
                                        })
                                break
                    
                    if place_index <= len(places):
                        place = places[place_index - 1]
                        print(f"   ✅ Found place #{place_index} on day {day_for_index}: {place['name']}")
                        # Continue with detailed display (will be handled below)
                    else:
                        return (f"❌ Ngày {day_for_index} chỉ có {len(places)} địa điểm. Vui lòng chọn từ 1-{len(places)}.\n\n💡 Hỏi 'Các địa điểm ngày {day_for_index}' để xem danh sách.", None)
                else:
                    # Get all places from all days
                    all_places = []
                    if itinerary_data.get("route_data_json", {}).get("days"):
                        for day in itinerary_data["route_data_json"]["days"]:
                            for activity in day.get("activities", []):
                                place_data = activity.get("place", {})
                                if place_data.get("name"):
                                    all_places.append({
                                        "name": place_data.get("name"),
                                        "day": day.get("day"),
                                        "date": day.get("date"),
                                        "time": activity.get("time"),
                                        "duration": activity.get("duration"),
                                        "place_id": place_data.get("place_id") or place_data.get("google_place_id"),
                                        "google_place_id": place_data.get("google_place_id"),
                                        "type": place_data.get("type"),
                                        "rating": place_data.get("rating"),
                                        "address": place_data.get("address"),
                                        "description": place_data.get("description"),
                                        "emotional_tags": place_data.get("emotional_tags", [])
                                    })
                    
                    if place_index <= len(all_places):
                        place = all_places[place_index - 1]
                        print(f"   ✅ Found place #{place_index} (day {place['day']}): {place['name']}")
                        # Continue with detailed display
                    else:
                        return (f"❌ Lộ trình chỉ có {len(all_places)} địa điểm. Vui lòng chọn từ 1-{len(all_places)}.\n\n💡 Hỏi 'Xem lộ trình' để xem danh sách đầy đủ.", None)
            
            # Check if no specific place name extracted and not querying by index
            if not place_name and not place_index:
                print("      → No specific place name or index extracted, showing all places")
                details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
                
                if details.get("error"):
                    return f"❌ Không thể lấy thông tin lộ trình: {details['error']}"
                
                return _format_itinerary_display(details, is_draft=is_draft, show_title=True)
            
            # If we have place from index query, use it directly
            # Otherwise, search by name
            if not place_index and place_name:
                places = get_place_from_itinerary.invoke({
                    "itinerary_data": itinerary_data,
                    "place_name": place_name
                })
                
                if not places:
                    return (f"❌ Không tìm thấy địa điểm '{place_name}' trong lộ trình.\n\n💡 Hãy hỏi 'Xem lộ trình' để xem danh sách đầy đủ.", None)
                
                place = places[0]  # Get first match
            
            # Now we have 'place' - show detailed info
            if place:
                place_id = place.get('place_id') or place.get('google_place_id')
                
                # Get detailed information from Google Places API
                print(f"   🔍 Getting detailed info for: {place['name']}")
                print(f"   📍 place_id: {place_id}")
                details = get_place_details.invoke({"place_id": place_id}) if place_id else {}
                
                if details:
                    print(f"   ✅ Details received: {len(details)} fields")
                else:
                    print(f"   ⚠️ No details from Google Places API, using itinerary data only")
                    # Enrich place object with available data
                    if not place.get('description'):
                        # Create basic description from type
                        place_type = place.get('type', '')
                        type_desc_map = {
                            'tourist_attraction': 'Điểm tham quan nổi tiếng',
                            'cafe': 'Quán cà phê',
                            'restaurant': 'Nhà hàng',
                            'bar': 'Quán bar/pub',
                            'museum': 'Bảo tàng',
                            'temple': 'Ngôi chùa/đền',
                            'park': 'Công viên',
                            'market': 'Khu chợ'
                        }
                        basic_desc = type_desc_map.get(place_type, 'Địa điểm thú vị')
                        if place.get('rating', 0) >= 4.0:
                            basic_desc += f" được đánh giá cao"
                        place['description'] = basic_desc
                
                draft_note = " _(đang tạo)_" if is_draft else ""
                response = f"📍 **{place['name']}**{draft_note}\n\n"
                
                # Basic info
                type_label = _format_place_type(place.get('type', ''))
                response += f"{type_label}\n"
                
                # Schedule info
                response += f"\n📅 **Lịch trình:**\n"
                response += f"   • Ngày {place['day']}"
                if place.get('date'):
                    response += f" - {place.get('date')}"
                response += "\n"
                if place.get('time'):
                    formatted_time = _format_datetime(place.get('time'))
                    response += f"   • Thời gian: {formatted_time}\n"
                if place.get('duration'):
                    formatted_duration = _format_duration(place.get('duration'))
                    response += f"   • Dự kiến: {formatted_duration}\n"
                
                response += "\n"
                
                # Detailed info from Google Places API
                if details:
                    # Editorial summary / Description (with multiple fallbacks)
                    description = (
                        details.get('editorial_summary') or 
                        details.get('description') or 
                        place.get('description') or
                        None
                    )
                    
                    # If no description available, create a basic one from available info
                    if not description:
                        place_type = place.get('type', '')
                        type_desc_map = {
                            'tourist_attraction': 'Đây là một điểm tham quan nổi tiếng',
                            'cafe': 'Đây là một quán cà phê',
                            'restaurant': 'Đây là một nhà hàng',
                            'bar': 'Đây là một quán bar/pub',
                            'museum': 'Đây là một bảo tàng',
                            'temple': 'Đây là một ngôi chùa/đền',
                            'park': 'Đây là một công viên',
                            'market': 'Đây là một khu chợ'
                        }
                        base_desc = type_desc_map.get(place_type, 'Địa điểm thú vị')
                        
                        # Add rating info if available
                        rating = details.get('rating') or place.get('rating', 0)
                        if rating >= 4.0:
                            base_desc += f" được đánh giá cao với {rating}/5 sao"
                        
                        # Add emotional tags if available
                        emotional_tags = place.get('emotional_tags', [])
                        if emotional_tags:
                            tags_desc = _format_emotional_tags(emotional_tags[:2])
                            base_desc += f", phù hợp cho không khí {tags_desc}"
                        
                        description = base_desc + "."
                    
                    # Always show description
                    response += f"📝 **Giới thiệu:**\n{description}\n\n"
                        
                    # Rating & Reviews
                    rating = details.get('rating') or place.get('rating', 0)
                    total_ratings = details.get('user_ratings_total', 0)
                    if rating > 0:
                        stars = "⭐" * int(rating)
                        response += f"⭐ **Đánh giá:** {stars} {rating}/5"
                        if total_ratings > 0:
                            response += f" ({total_ratings:,} đánh giá)"
                        response += "\n"
                    
                    # Address
                    address = details.get('formatted_address') or details.get('address') or place.get('address')
                    if address:
                        response += f"📍 **Địa chỉ:** {address}\n"
                    
                    # Opening hours
                    if details.get('opening_hours'):
                        hours = details['opening_hours']
                        if hours.get('open_now') is not None:
                            status = "🟢 Đang mở cửa" if hours['open_now'] else "🔴 Đang đóng cửa"
                            response += f"🕐 **Trạng thái:** {status}\n"
                    
                    # Price level
                    price_level = details.get('price_level')
                    if price_level:
                        price_symbols = "$" * price_level if isinstance(price_level, int) else price_level
                        price_map = {"$": "Rẻ", "$$": "Vừa phải", "$$$": "Đắt", "$$$$": "Rất đắt"}
                        price_text = price_map.get(price_symbols, price_symbols)
                        response += f"💰 **Mức giá:** {price_symbols} ({price_text})\n"
                    
                    # Contact info
                    if details.get('phone_number'):
                        response += f"📞 **Điện thoại:** {details['phone_number']}\n"
                    if details.get('website'):
                        response += f"🌐 **Website:** {details['website']}\n"
                        
                    # Emotional tags
                    emotional_tags = place.get('emotional_tags', [])
                    if emotional_tags:
                        formatted_tags = _format_emotional_tags(emotional_tags)
                        response += f"\n💭 **Phù hợp cho:** {formatted_tags}\n"
                    
                    # Top review
                    if details.get('reviews') and len(details['reviews']) > 0:
                        review = details['reviews'][0]
                        stars = "⭐" * int(review.get('rating', 0))
                        author = review.get('author', 'Anonymous')
                        text = review.get('text', '')[:100]
                        if len(review.get('text', '')) > 100:
                            text += "..."
                        response += f"\n💬 **Đánh giá nổi bật:**\n"
                        response += f"{stars} - {author}\n_{text}_\n"
                else:
                    # Fallback to basic info (when Google Places API doesn't return details)
                    # But still maintain similar format for consistency
                    
                    # Description
                    description = place.get('description')
                    if description:
                        response += f"📝 **Giới thiệu:**\n{description}\n\n"
                    
                    # Rating
                    rating = place.get('rating', 0)
                    if rating > 0:
                        stars = "⭐" * int(rating)
                        response += f"⭐ **Đánh giá:** {stars} {rating}/5\n"
                    
                    # Address
                    if place.get('address'):
                        response += f"📍 **Địa chỉ:** {place.get('address')}\n"
                    
                    # Emotional tags with Vietnamese mapping
                    emotional_tags = place.get('emotional_tags', [])
                    if emotional_tags:
                        formatted_tags = _format_emotional_tags(emotional_tags)
                        response += f"\n💭 **Phù hợp cho:** {formatted_tags}\n"
                    
                    # Price level
                    if place.get('price_level'):
                        price_level = place.get('price_level')
                        price_symbols = "$" * price_level if isinstance(price_level, int) else price_level
                        price_map = {"$": "Rẻ", "$$": "Vừa phải", "$$$": "Đắt", "$$$$": "Rất đắt"}
                        price_text = price_map.get(price_symbols, price_symbols)
                        response += f"💰 **Mức giá:** {price_symbols} ({price_text})\n"
                    
                if is_draft:
                    response += "\n💡 Hỏi tôi về các địa điểm khác trong lộ trình!"
                
                return (response, None)
            else:
                return (f"❌ Không tìm thấy địa điểm '{place_name}' trong lộ trình.\n\n💡 Hãy hỏi 'Xem lộ trình' để xem danh sách đầy đủ.", None)
        
        # NEW: Handle "gợi ý [category] gần địa điểm số X" pattern
        # This must be BEFORE the general suggestion handler
        near_place_pattern = r'gợi ý\s+(?:thêm\s+)?(quán ăn|nhà hàng|quán cà phê|cà phê|café|cafe|bảo tàng|chùa|đền|chợ|công viên|bar|pub)\s+gần\s+địa điểm\s+(?:số\s+)?(\d+|một|hai|ba|bốn|năm)'
        near_place_match = re.search(near_place_pattern, user_text.lower())
        
        if near_place_match:
            print("      → Handle suggestion near specific place")
            
            # Extract category
            category_text = near_place_match.group(1)
            category_map = {
                "quán cà phê": "cafe",
                "cà phê": "cafe",
                "café": "cafe",
                "cafe": "cafe",
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
            category = category_map.get(category_text, "restaurant")
            
            # Extract place index
            vn_numbers = {'một': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'năm': 5}
            index_str = near_place_match.group(2)
            place_index = vn_numbers.get(index_str, int(index_str) if index_str.isdigit() else 0)
            
            print(f"      → Category: {category}, Place index: {place_index}")
            
            if place_index > 0:
                # Get the reference place from itinerary by index
                all_places = []
                route_data = itinerary_data.get("route_data_json", {})
                # Support both "days" and "optimized_route" structures
                days = route_data.get("days", []) or route_data.get("optimized_route", [])
                print(f"      → Parsing itinerary: found {len(days)} days")
                
                for day in days:
                    activities = day.get("activities", [])
                    for activity in activities:
                        # Handle both nested (activity.place) and direct (activity.name) structures
                        place = activity.get("place", {})
                        if not place or not place.get("name"):
                            place = activity
                        if place.get("name"):
                            all_places.append({
                                "name": place.get("name"),
                                "place_id": place.get("place_id") or place.get("google_place_id"),
                                "location": place.get("location", {}),
                                "day": day.get("day")
                            })
                
                print(f"      → Total places found: {len(all_places)}")
                
                if place_index <= len(all_places):
                    reference_place = all_places[place_index - 1]
                    print(f"      → Reference place: {reference_place['name']}")
                    
                    # Extract location from reference place
                    ref_location = reference_place.get("location", {})
                    ref_lat = None
                    ref_lng = None
                    
                    # Support both formats: {coordinates: [lng, lat]} and {lat, lng}
                    if ref_location.get("coordinates"):
                        coords = ref_location["coordinates"]
                        if isinstance(coords, list) and len(coords) >= 2:
                            ref_lng, ref_lat = coords[0], coords[1]
                    elif ref_location.get("lat") and ref_location.get("lng"):
                        ref_lat = ref_location["lat"]
                        ref_lng = ref_location["lng"]
                    
                    print(f"      → Reference coordinates: lat={ref_lat}, lng={ref_lng}")
                    
                    if ref_lat and ref_lng:
                        # Use Google Places API to search for places near the reference location
                        suggestions = search_nearby_places.invoke({
                            "current_location": {"lat": ref_lat, "lng": ref_lng},
                            "radius_km": 2.0,  # 2km radius
                            "category": category,
                            "limit": 10
                        })
                    else:
                        # Fallback to database search if no coordinates
                        print(f"      ⚠️ No coordinates found, falling back to database search")
                        preferences = {
                            "category": category,
                            "near_place": reference_place.get("place_id") or reference_place.get("name")
                        }
                        suggestions = suggest_additional_places.invoke({
                            "itinerary_data": itinerary_data,
                            "preferences": preferences
                        })
                    
                    if suggestions and len(suggestions) > 0:
                        limited_suggestions = suggestions[:5]
                        
                        # Format category name for display
                        category_display = {
                            "cafe": "quán cà phê",
                            "restaurant": "nhà hàng/quán ăn",
                            "museum": "bảo tàng",
                            "temple": "chùa/đền",
                            "market": "chợ",
                            "park": "công viên",
                            "bar": "bar/pub"
                        }.get(category, category_text)
                        
                        response = f"💡 **{category_display.capitalize()} gần {reference_place['name']}:**\n\n"
                        
                        for i, place in enumerate(limited_suggestions, 1):
                            response += f"**{i}. {place.get('name', 'Unknown')}**\n"
                            
                            type_label = _format_place_type(place.get('type', ''))
                            response += f"{type_label}"
                            
                            rating = place.get('rating', 0)
                            if rating and rating > 0:
                                response += f" • ⭐ {rating}/5.0"
                            
                            # response += "\n"
                            
                            # Show distance from reference place
                            # Support both distance_km (Google) and distance_from_reference (database)
                            dist = place.get('distance_km') or place.get('distance_from_reference')
                            if dist:
                                response += f"📏 {dist:.1f}km từ {reference_place['name']}\n"
                            elif place.get('address'):
                                addr = place.get('address')
                                if len(addr) > 60:
                                    addr = addr[:60] + "..."
                                response += f"📍 {addr}\n"
                            
                            # response += "\n"
                        
                        # response += "💬 **Bạn có thể hỏi:**\n"
                        # response += f"• _\"Thêm [tên] vào ngày {reference_place.get('day', 'X')}\"_ - Thêm vào lộ trình\n"
                        # response += "• _\"Giới thiệu địa điểm thứ 1\"_ - Xem chi tiết"
                        
                        return (response, limited_suggestions)
                    else:
                        return (f"😔 Không tìm thấy {category_display} nào gần {reference_place['name']}.\n\n💡 Thử: _\"Gợi ý thêm {category_display}\"_ để tìm ở khu vực khác", None)
                else:
                    return (f"❌ Lộ trình chỉ có {len(all_places)} địa điểm. Vui lòng chọn từ 1-{len(all_places)}.\n\n💡 Hỏi 'Xem lộ trình' để xem danh sách.", None)
            else:
                return ("❌ Không xác định được địa điểm. Vui lòng thử lại với format: _\"Gợi ý quán ăn gần địa điểm số 2\"_", None)
        
        # Suggest adding places or confirm adding a specific place
        elif any(word in user_text.lower() for word in ["thêm", "add", "gợi ý thêm", "gợi ý", "nên thêm", "có nên"]):
            print("      → Handle place suggestion/addition")
            
            # Check if trying to add a specific place (contains place name + day number)
            # Use lowercase for pattern matching to handle case-insensitive input
            # Pattern handles: "thêm X vào ngày Y", "thêm X vào đầu ngày Y", "thêm X vào ngày Y sau địa điểm Z"
            place_name_pattern = r'thêm\s+(.+?)\s+vào\s+(?:đầu\s+)?ngày'
            place_match = re.search(place_name_pattern, user_text.lower())
            day_match = re.search(r'ngày\s+(\d+)', user_text.lower())
            
            print(f"      → User text: '{user_text}'")
            print(f"      → Extracted place_name: {place_match.group(1).strip() if place_match else 'None'}")
            print(f"      → Extracted day_number: {day_match.group(1) if day_match else 'None'}")
            
            if place_match and day_match:
                # User wants to add a specific place
                print("      → User requesting to add specific place")
                # Get place name from lowercase match
                place_name_lower = place_match.group(1).strip()
                day_number = int(day_match.group(1))
                
                # Check for [PLACE_ID:xxx] or [place_id:xxx] marker from frontend (case-insensitive)
                place_id_match = re.search(r'\[place_id:([^\]]+)\]', user_text, re.IGNORECASE)
                target_place_id = place_id_match.group(1) if place_id_match else None
                
                # Clean place name (remove PLACE_ID marker if present) - case insensitive
                place_name_lower = re.sub(r'\s*\[place_id:[^\]]+\]', '', place_name_lower, flags=re.IGNORECASE).strip()
                
                print(f"      → Place name (lowercase): '{place_name_lower}'")
                print(f"      → Day number: {day_number}")
                print(f"      → Target place_id: {target_place_id}")
                
                # Validate day number
                duration_days = itinerary_data.get("duration_days", 1)
                if day_number > duration_days or day_number < 1:
                    return (f"❌ Ngày {day_number} không hợp lệ. Lộ trình có {duration_days} ngày.", None)
                
                # Try to find place by place_id first (most accurate)
                place_to_add = None
                print(f"      → last_suggestions: {len(last_suggestions) if last_suggestions else 'None/Empty'}")
                print(f"      → target_place_id: {target_place_id}")
                if target_place_id and last_suggestions:
                    print(f"      → Looking for place_id '{target_place_id}' in {len(last_suggestions)} last_suggestions...")
                    # Debug: print all place_ids in suggestions
                    for idx, suggestion in enumerate(last_suggestions):
                        sugg_id = suggestion.get('place_id') or suggestion.get('google_place_id') or suggestion.get('id', '')
                        print(f"         [{idx}] '{suggestion.get('name')}' -> place_id: '{sugg_id}'")
                        # Check for match
                        if sugg_id == target_place_id:
                            place_to_add = suggestion
                            print(f"      ✅ Found by place_id: {suggestion.get('name')}")
                            break
                
                # Fallback: Try name matching in last_suggestions
                if not place_to_add and last_suggestions:
                    print(f"      → Fallback: Checking {len(last_suggestions)} last_suggestions by name...")
                    for suggestion in last_suggestions:
                        # Case-insensitive matching
                        if place_name_lower in suggestion.get('name', '').lower():
                            place_to_add = suggestion
                            print(f"      ✅ Found in last_suggestions: {suggestion.get('name')}")
                            break
                
                # If not found in suggestions, search database
                if not place_to_add:
                    print(f"      → Searching for '{place_name_lower}' in database...")
                    suggestions = search_places.invoke({
                        "query": place_name_lower,
                        "location_filter": itinerary_data.get("destination", ""),
                        "limit": 10  # Get more results for better matching
                    })
                    
                    if suggestions:
                        print(f"      → Found {len(suggestions)} suggestions from database")
                        
                        # Try multiple matching strategies
                        # Strategy 1: Exact match (all words present)
                        query_words = set(place_name_lower.split())
                        for suggestion in suggestions:
                            sugg_name_lower = suggestion.get('name', '').lower()
                            sugg_words = set(sugg_name_lower.split())
                            
                            # Check if all query words are in suggestion name
                            if query_words.issubset(sugg_words):
                                place_to_add = suggestion
                                print(f"      ✅ Exact match (all words): {suggestion.get('name')}")
                                break
                        
                        # Strategy 2: Partial match (at least 1 key word)
                        if not place_to_add:
                            # Extract key words (remove common words)
                            common_words = {'coffee', 'cafe', 'cà', 'phê', '&', 'and', 'lounge', 'the'}
                            key_words = query_words - common_words
                            
                            if key_words:
                                for suggestion in suggestions:
                                    sugg_name_lower = suggestion.get('name', '').lower()
                                    # Check if any key word is in suggestion
                                    if any(word in sugg_name_lower for word in key_words):
                                        place_to_add = suggestion
                                        print(f"      ✅ Partial match (key words): {suggestion.get('name')}")
                                        break
                        
                        # Strategy 3: Substring match
                        if not place_to_add:
                            for suggestion in suggestions:
                                sugg_name_lower = suggestion.get('name', '').lower()
                                if place_name_lower in sugg_name_lower or sugg_name_lower in place_name_lower:
                                    place_to_add = suggestion
                                    print(f"      ✅ Substring match: {suggestion.get('name')}")
                                    break
                
                # Strategy 4: If we have place_id, check DB or fetch from Google Places API
                if not place_to_add and target_place_id:
                    # 4.1 Check DB first (case-insensitive lookup logic handled in find_place_by_id_db)
                    print(f"      → Checking MongoDB for place_id: {target_place_id}...")
                    db_place = find_place_by_id_db(target_place_id)
                    
                    if db_place:
                         place_to_add = db_place
                         print(f"      ✅ Found in MongoDB by ID: {db_place.get('name')} (ID case corrected)")
                         # Update target_place_id to correct case for downstream usage if needed
                         target_place_id = db_place.get('googlePlaceId') or db_place.get('google_place_id') or target_place_id

                    # 4.2 If not in DB, fetch from Google API
                    if not place_to_add:
                        print(f"      → Fetching place by place_id from Google Places API...")
                    try:
                        place_details = get_place_details.invoke({"place_id": target_place_id})
                        if place_details and place_details.get('name'):
                            place_to_add = place_details
                            print(f"      ✅ Found via Google Places API: {place_details.get('name')}")
                            
                            # Save to database for future lookups
                            try:
                                save_result = save_google_place_to_db(place_to_add)
                                if save_result.get("success"):
                                    print(f"      💾 Saved to DB: {place_to_add.get('name')}")
                            except Exception as e:
                                print(f"      ⚠️ Failed to save to DB: {e}")
                        else:
                            print(f"      ⚠️ Google API returned no details for place_id: {target_place_id}")
                    except Exception as e:
                        print(f"      ⚠️ Error fetching from Google API: {e}")
                
                # Last resort: Ask user to confirm
                if not place_to_add:
                    if suggestions and len(suggestions) > 0:
                        print(f"      ⚠️ No good match found, would need user confirmation")
                        # Return suggestion list instead of auto-picking
                        response = f"❓ Không tìm thấy '{place_name_lower}' chính xác.\n\n"
                        response += "💡 **Có phải bạn muốn thêm một trong những địa điểm này?**\n\n"
                        for i, sugg in enumerate(suggestions[:3], 1):
                            response += f"{i}. **{sugg.get('name')}**\n"
                            if sugg.get('address'):
                                addr = sugg.get('address')
                                if len(addr) > 50:
                                    addr = addr[:50] + "..."
                                response += f"   📍 {addr}\n"
                            rating = sugg.get('rating', 0)
                            if rating > 0:
                                response += f"   ⭐ {rating}/5\n"
                            response += "\n"
                        response += f"💬 Hãy nói: _\"Thêm [tên chính xác] vào ngày {day_number}\"_"
                        return (response, suggestions[:3])
                
                if place_to_add:
                    # Check if place already exists in itinerary
                    existing_places = get_place_from_itinerary.invoke({
                        "itinerary_data": itinerary_data
                    })
                    
                    place_id = place_to_add.get('place_id') or place_to_add.get('google_place_id')
                    for existing in existing_places:
                        existing_id = existing.get('place_id')
                        if existing_id and existing_id == place_id:
                            return (f"⚠️ Địa điểm **{place_to_add.get('name')}** đã có trong lộ trình (Ngày {existing.get('day')}).\n\n💡 Bạn muốn thêm địa điểm khác không?", None)
                    
                    # If place is from Google API (has 'source' = 'google_places_api_new'), save to database first
                    if place_to_add.get('source') == 'google_places_api_new':
                        print(f"      → Saving Google API place to database first...")
                        save_result = save_google_place_to_db(place_to_add)
                        if save_result.get("success"):
                            print(f"      ✅ Place saved to DB: {save_result.get('name')}")
                        else:
                            print(f"      ⚠️ Could not save to DB: {save_result.get('error')}")
                    
                    # Call add_place_to_itinerary_backend
                    result = add_place_to_itinerary_backend.invoke({
                        "place_data": place_to_add,
                        "itinerary_data": itinerary_data,
                        "day_number": day_number,
                        "time": "TBD",
                        "duration": "2 hours"
                    })
                    
                    if result.get("success"):
                        # UPDATE STATE: Add place to itinerary_data immediately
                        place_added = result.get("place_to_add")
                        route_data = itinerary_data.get("route_data_json", {})
                        days = route_data.get("days") or route_data.get("optimized_route")
                        
                        if place_added and days:
                            for day in days:
                                if day.get("day") == day_number:
                                    # Add new activity with place (Full schema)
                                    new_activity = {
                                        "time": place_added.get("time", "TBD"),
                                        "duration": place_added.get("duration", "2 hours"),
                                        "place": {
                                            "place_id": place_added.get("google_place_id"),
                                            "google_place_id": place_added.get("google_place_id"),
                                            "name": place_added.get("name"),
                                            "type": place_added.get("type"),
                                            "address": place_added.get("address"),
                                            "rating": place_added.get("rating"),
                                            "description": place_added.get("description"),
                                            "location": place_added.get("location"),
                                            # Enhanced fields
                                            "opening_hours": place_added.get("opening_hours"),
                                            "price_level": place_added.get("price_level"),
                                            "phone": place_added.get("phone"),
                                            "website": place_added.get("website"),
                                            "photos": place_added.get("photos", []),
                                            "emotional_tags": place_added.get("emotional_tags")
                                        }
                                    }
                                    if "activities" not in day:
                                        day["activities"] = []
                                    day["activities"].append(new_activity)
                                    print(f"      ✅ Updated state: Added to day {day_number} activities")
                                    break
                        
                        # Build action marker with place data for frontend to update itinerary
                        import json
                        place_action_data = {
                            "day_number": day_number,
                            "place": {
                                "place_id": place_to_add.get("google_place_id") or place_to_add.get("place_id"),
                                "google_place_id": place_to_add.get("google_place_id") or place_to_add.get("place_id"),
                                "name": place_to_add.get("name"),
                                "type": place_to_add.get("type"),
                                "address": place_to_add.get("address"),
                                "rating": place_to_add.get("rating"),
                                "location": place_to_add.get("location"),
                                "description": place_to_add.get("description"),
                                # Enhanced fields from source (DB or API)
                                "opening_hours": place_to_add.get("opening_hours") or place_to_add.get("openingHours"),
                                "price_level": place_to_add.get("price_level") or place_to_add.get("budgetRange"),
                                "phone": place_to_add.get("formatted_phone_number") or place_to_add.get("contactNumber") or place_to_add.get("phone"),
                                "website": place_to_add.get("website") or place_to_add.get("websiteUri"),
                                "photos": place_to_add.get("photos", []),
                                "emotional_tags": place_to_add.get("emotional_tags", {})
                            },
                            "time": "TBD",
                            "duration": "2 hours"
                        }
                        action_marker = f"[ACTION:PLACE_ADDED:{json.dumps(place_action_data)}]"
                        
                        response = f"{action_marker}\n✅ {result['message']}\n\n"
                        response += f"📍 **{place_to_add.get('name')}**\n"
                        if place_to_add.get('type'):
                            type_label = _format_place_type(place_to_add.get('type'))
                            response += f"{type_label}\n"
                        if place_to_add.get('address'):
                            response += f"📝 {place_to_add.get('address')}\n"
                        rating = place_to_add.get('rating', 0)
                        if rating > 0:
                            response += f"⭐ {rating}/5\n"
                        response += "\n"
                        response += "💾 **Lưu ý**: Thay đổi này sẽ được lưu vào lộ trình của bạn.\n\n"
                        
                        # Show updated list of places for this day
                        response += f"📅 **Địa điểm Ngày {day_number}** (đã cập nhật):\n\n"
                        current_day_activities = []
                        route_data = itinerary_data.get("route_data_json", {})
                        days = route_data.get("days") or route_data.get("optimized_route") or []
                        for day in days:
                            if day.get("day") == day_number:
                                current_day_activities = day.get("activities", [])
                                break
                        
                        # Prepare description for display (Handling both nested and flat structures)
                        for i, activity in enumerate(current_day_activities, 1):
                            # Try nested place first
                            place = activity.get("place", {})
                            place_name = place.get("name")
                            
                            # Fallback to direct name (flat structure)
                            if not place_name:
                                place_name = activity.get("name", "N/A")
                                # If flat structure, treat activity as the place object for other properties
                                if place_name != "N/A":
                                    place = activity
                            
                            response += f"{i}. **{place_name}**\n"
                            
                            # Helper to safely get property
                            def get_prop(key):
                                return place.get(key)
                                
                            item_type = get_prop('type')
                            if item_type:
                                type_icon = _format_place_type(item_type)
                                response += f"   {type_icon}\n"
                                
                            item_time = activity.get('time') or get_prop('time')
                            if item_time and item_time != "TBD":
                                response += f"   ⏰ {item_time}\n"
                                
                            rating = get_prop('rating')
                            if rating and isinstance(rating, (int, float)) and rating > 0:
                                response += f"   ⭐ {rating}/5\n"
                            response += "\n"
                        
                        response += "💡 Bạn muốn thêm địa điểm khác không?"
                        return (response, None)
                    else:
                        error_msg = result.get('error', 'Không thể thêm địa điểm')
                        print(f"      ❌ Error from backend: {error_msg}")
                        return (f"❌ Lỗi: {error_msg}", None)
                else:
                    print(f"      ❌ Place not found: '{place_name_lower}'")
                    return (f"❌ Không tìm thấy địa điểm '{place_name_lower}' ở {itinerary_data.get('destination', 'đây')}.\n\n💡 Thử: _\"Gợi ý thêm [loại hình]\"_ để xem danh sách gợi ý", None)
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
                
                # Get itinerary center location for Google API search
                route_data = itinerary_data.get("route_data_json", {})
                days = route_data.get("days", []) or route_data.get("optimized_route", [])
                
                # Try to get center location from first place in itinerary
                center_lat = None
                center_lng = None
                if days:
                    for day in days:
                        for activity in day.get("activities", []):
                            place = activity.get("place", {}) or activity
                            loc = place.get("location", {})
                            if loc.get("coordinates"):
                                coords = loc["coordinates"]
                                if isinstance(coords, list) and len(coords) >= 2:
                                    center_lng, center_lat = coords[0], coords[1]
                                    break
                            elif loc.get("lat") and loc.get("lng"):
                                center_lat = loc["lat"]
                                center_lng = loc["lng"]
                                break
                        if center_lat:
                            break
                
                # If we have a center location, use Google API
                if center_lat and center_lng:
                    print(f"      → Using Google Places API with center: {center_lat}, {center_lng}")
                    suggestions = search_nearby_places.invoke({
                        "current_location": {"lat": center_lat, "lng": center_lng},
                        "radius_km": 5.0,  # 5km radius for general suggestions
                        "category": preferences.get("category"),
                        "limit": 10
                    })
                    print(f"      → Got {len(suggestions) if suggestions else 0} suggestions from Google API")
                    
                    # Save Google Places results to database immediately
                    # This ensures they can be found by name search even if session is lost
                    if suggestions:
                        for place in suggestions:
                            if place.get('place_id'):
                                try:
                                    save_result = save_google_place_to_db(place)
                                    if save_result.get("success"):
                                        print(f"      💾 Saved to DB: {place.get('name')}")
                                except Exception as e:
                                    print(f"      ⚠️ Failed to save {place.get('name')}: {e}")
                else:
                    # Fallback to database search
                    print(f"      → Fallback to database search (no center location)")
                    suggestions = suggest_additional_places.invoke({
                        "itinerary_data": itinerary_data,
                        "preferences": preferences
                    })
                
                if suggestions and len(suggestions) > 0:
                    # Parse requested count from user text (e.g., "10 quán", "5 nhà hàng")
                    count_match = re.search(r'(\d+)\s*(?:quán|địa điểm|chỗ|nơi|tiệm|nhà hàng|bảo tàng|chùa|đền|chợ|công viên|bar|pub|cafe|cà phê)', user_text.lower())
                    requested_count = int(count_match.group(1)) if count_match else 5
                    # Limit to max 10 suggestions
                    requested_count = min(max(requested_count, 1), 10)
                    
                    limited_suggestions = suggestions[:requested_count]
                    print(f"      → Showing {len(limited_suggestions)} suggestions (requested: {requested_count})")
                    
                    category_name = preferences.get("category", "địa điểm")
                    category_display = {
                        "cafe": "quán cà phê",
                        "restaurant": "nhà hàng/quán ăn",
                        "museum": "bảo tàng",
                        "temple": "chùa/đền",
                        "market": "chợ",
                        "park": "công viên",
                        "bar": "bar/pub"
                    }.get(category_name, "địa điểm")
                    
                    response = f"💡 **{len(limited_suggestions)} {category_display} gợi ý cho bạn:**\n\n"
                    
                    for i, place in enumerate(limited_suggestions, 1):
                        response += f"**{i}. {place.get('name', 'Unknown')}**\n"
                        
                        type_label = _format_place_type(place.get('type', ''))
                        response += f"{type_label}"
                        
                        rating = place.get('rating', 0)
                        if rating and rating > 0:
                            response += f" • ⭐ {rating}/5.0"
                        
                        response += "\n"
                        
                        # Show either address or distance, not both (to reduce length)
                        if place.get('distance_from_reference'):
                            dist = place['distance_from_reference']
                            response += f"📏 {dist:.1f}km từ trung tâm\n"
                        elif place.get('address'):
                            addr = place.get('address')
                            # Shorten address if too long
                            if len(addr) > 60:
                                addr = addr[:60] + "..."
                            response += f"📍 {addr}\n"
                        
                        # Show brief description only if available
                        if place.get('description'):
                            desc = place['description']
                            if len(desc) > 70:
                                desc = desc[:70] + "..."
                            response += f"📝 {desc}\n"
                        
                        response += "\n"
                    
                    # if len(suggestions) > 5:
                    #     response += f"_(Và {len(suggestions) - 5} địa điểm khác)_\n\n"
                    
                    response += "💬 **Bạn có thể hỏi:**\n"
                    # # response += "• _\"Giới thiệu địa điểm thứ 1\"_ - Xem chi tiết\n"
                    # if day_match:
                    #     response += f"• _\"Thêm [tên] vào ngày {day_match.group(1)}\"_ - Thêm vào lộ trình\n"
                    # else:
                    #     response += "• _\"Thêm [tên] vào ngày X\"_ - Thêm vào lộ trình\n"
                    response += "• _\"Gợi ý thêm [loại hình]\"_ - Gợi ý khác"
                    
                    return (response, limited_suggestions)
                else:
                    return ("😔 Xin lỗi, không tìm thấy địa điểm phù hợp để gợi ý.\n\n💡 Thử cụ thể hơn, ví dụ: \"Gợi ý thêm quán cà phê\" hoặc \"Gợi ý thêm nhà hàng\"", None)
        
        # List places by day
        elif any(word in user_text for word in ["ngày", "day"]):
            print("      → List places by day")
            day_match = re.search(r'ngày (\d+)', user_text)
            
            if day_match:
                day_number = int(day_match.group(1))
                
                # Read directly from state.itinerary (already updated)
                places = []
                day_date = "N/A"
                if itinerary_data.get("route_data_json", {}).get("days"):
                    for day in itinerary_data["route_data_json"]["days"]:
                        if day.get("day") == day_number:
                            day_date = day.get("date", "N/A")
                            for activity in day.get("activities", []):
                                place = activity.get("place", {})
                                if place.get("name"):
                                    places.append({
                                        "name": place.get("name"),
                                        "type": place.get("type"),
                                        "time": activity.get("time", "N/A"),
                                        "duration": activity.get("duration", "N/A"),
                                        "address": place.get("address", ""),
                                        "rating": place.get("rating", 0),
                                        "emotional_tags": place.get("emotional_tags", [])
                                    })
                            break
                
                if places:
                    response = f"📅 **Ngày {day_number}** ({day_date}):\n\n"
                    for i, place in enumerate(places, 1):
                        response += f"{i}. **{place['name']}**"
                        if place.get('type'):
                            response += f" ({place.get('type')})"
                        response += "\n"
                        response += f"   ⏰ {place.get('time', 'N/A')} | 🕐 {place.get('duration', 'N/A')}\n"
                        
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
                    
                    return (response, None)
                else:
                    return (f"❌ Không tìm thấy thông tin cho ngày {day_number}.", None)
            else:
                return ("❓ Bạn muốn xem lịch trình ngày mấy? (VD: 'ngày 1', 'ngày 2')", None)
        
        # Default: show overview
        else:
            details = get_itinerary_details.invoke({"itinerary_data": itinerary_data})
            if details.get("error"):
                return ("❓ Bạn muốn biết gì về lộ trình? (VD: 'xem lộ trình', 'giới thiệu địa điểm X', 'gợi ý thêm quán cà phê')", None)
            
            return (f"📋 Bạn có lộ trình **{details.get('title', 'Chưa đặt tên')}** ({details.get('duration_days', 0)} ngày) với {details.get('total_places', 0)} địa điểm.\n\n💡 Bạn muốn:\n• Xem chi tiết lộ trình\n• Giới thiệu về một địa điểm\n• Gợi ý thêm địa điểm mới", None)
    
    except Exception as e:
        print(f"      ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return ("😔 Xin lỗi, có lỗi khi xử lý thông tin lộ trình.", None)


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
                place_id = place.get('place_id') or place.get('google_place_id')
                
                # Get detailed information from Google Places API
                print(f"   🔍 Getting detailed info for: {place['name']}")
                details = get_place_details.invoke({"place_id": place_id}) if place_id else {}
                
                # Build comprehensive response
                response = f"📍 **{place['name']}** _(trong lộ trình của bạn)_\n\n"
                
                # Itinerary info
                response += f"📅 **Lịch trình:**\n"
                response += f"   • Ngày {place['day']}" 
                if place.get('date'):
                    response += f" - {place.get('date')}"
                response += "\n"
                response += f"   • Thời gian: {place.get('time', 'TBD')}\n"
                response += f"   • Dự kiến: {place.get('duration', 'N/A')}\n\n"
                
                # Detailed info from Google Places API
                if details:
                    # Editorial summary / Description (with multiple fallbacks)
                    description = (
                        details.get('editorial_summary') or 
                        details.get('description') or 
                        place.get('description') or
                        None
                    )
                    
                    # If no description available, create a basic one from available info
                    if not description:
                        place_type = place.get('type', '')
                        type_desc_map = {
                            'tourist_attraction': 'Đây là một điểm tham quan nổi tiếng',
                            'cafe': 'Đây là một quán cà phê',
                            'restaurant': 'Đây là một nhà hàng',
                            'bar': 'Đây là một quán bar/pub',
                            'museum': 'Đây là một bảo tàng',
                            'temple': 'Đây là một ngôi chùa/đền',
                            'park': 'Đây là một công viên',
                            'market': 'Đây là một khu chợ'
                        }
                        base_desc = type_desc_map.get(place_type, 'Địa điểm thú vị')
                        
                        # Add rating info if available
                        rating = details.get('rating') or place.get('rating', 0)
                        if rating >= 4.0:
                            base_desc += f" được đánh giá cao với {rating}/5 sao"
                        
                        # Add emotional tags if available
                        emotional_tags = place.get('emotional_tags', [])
                        if emotional_tags:
                            tags_desc = _format_emotional_tags(emotional_tags[:2])
                            base_desc += f", phù hợp cho không khí {tags_desc}"
                        
                        description = base_desc + "."
                    
                    # Always show description
                    response += f"📝 **Giới thiệu:**\n{description}\n\n"
                    
                    # Rating & Reviews
                    rating = details.get('rating') or place.get('rating', 0)
                    total_ratings = details.get('user_ratings_total', 0)
                    if rating > 0:
                        stars = "⭐" * int(rating)
                        response += f"⭐ **Đánh giá:** {stars} {rating}/5"
                        if total_ratings > 0:
                            response += f" ({total_ratings:,} đánh giá)"
                        response += "\n"
                    
                    # Address
                    address = details.get('formatted_address') or details.get('address') or place.get('address')
                    if address:
                        response += f"📍 **Địa chỉ:** {address}\n"
                    
                    # Opening hours
                    if details.get('opening_hours'):
                        hours = details['opening_hours']
                        if hours.get('open_now') is not None:
                            status = "🟢 Đang mở cửa" if hours['open_now'] else "🔴 Đang đóng cửa"
                            response += f"🕐 **Giờ mở cửa:** {status}\n"
                        if hours.get('weekday_text'):
                            response += f"\n**Giờ hoạt động:**\n"
                            for day_hours in hours['weekday_text'][:3]:  # Show first 3 days
                                response += f"   • {day_hours}\n"
                            if len(hours['weekday_text']) > 3:
                                response += "   • ...\n"
                    
                    # Price level
                    price_level = details.get('price_level')
                    if price_level:
                        price_symbols = "$" * price_level if isinstance(price_level, int) else price_level
                        price_map = {"$": "Rẻ", "$$": "Vừa phải", "$$$": "Đắt", "$$$$": "Rất đắt"}
                        price_text = price_map.get(price_symbols, price_symbols)
                        response += f"💰 **Mức giá:** {price_symbols} ({price_text})\n"
                    
                    # Contact info
                    if details.get('phone_number'):
                        response += f"📞 **Điện thoại:** {details['phone_number']}\n"
                    if details.get('website'):
                        response += f"🌐 **Website:** {details['website']}\n"
                    
                    # Emotional tags
                    emotional_tags = place.get('emotional_tags', [])
                    if emotional_tags:
                        tags = ', '.join(emotional_tags[:5])
                        response += f"\n💭 **Phù hợp cho:** {tags}\n"
                    
                    # Top reviews
                    if details.get('reviews'):
                        response += f"\n💬 **Đánh giá từ du khách:**\n"
                        for i, review in enumerate(details['reviews'][:2], 1):  # Show top 2 reviews
                            stars = "⭐" * int(review.get('rating', 0))
                            author = review.get('author', 'Anonymous')
                            text = review.get('text', '')[:150]  # Limit to 150 chars
                            if len(review.get('text', '')) > 150:
                                text += "..."
                            response += f"\n{i}. {stars} - {author}\n"
                            response += f"   _{text}_\n"
                else:
                    # Fallback to basic info if no details available
                    if place.get('description'):
                        response += f"📝 **Giới thiệu:**\n{place['description']}\n\n"
                    
                    rating = place.get('rating', 0)
                    if rating > 0:
                        response += f"⭐ **Đánh giá:** {rating}/5\n"
                    
                    if place.get('address'):
                        response += f"📍 **Địa chỉ:** {place.get('address')}\n"
                    
                    if place.get('emotional_tags'):
                        tags = ', '.join(place['emotional_tags'][:5])
                        response += f"💭 **Phù hợp cho:** {tags}\n"
                
                response += "\n💡 _Hỏi tôi về các địa điểm khác trong lộ trình!_"
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
                "itinerary": None,
                "last_suggestions": None
            }
            print(f"   🆕 Starting new conversation")
        
        # Update location and place info (always set to ensure keys exist)
        state["current_location"] = current_location if current_location else state.get("current_location")
        state["active_place_id"] = active_place_id if active_place_id else state.get("active_place_id")
        state["itinerary"] = itinerary if itinerary else state.get("itinerary")
        
        # Ensure last_suggestions key exists for new states
        if "last_suggestions" not in state:
            state["last_suggestions"] = None
        
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
                "suggestions": final_state.get("last_suggestions"),
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
