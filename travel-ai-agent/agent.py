"""
Travel AI Agent with LangGraph
=============================
Intelligent travel itinerary planner that acts as an "Experience Architect"

Features:
- Interactive user profiling (preferences collection)  
- Smart day-by-day itinerary generation
- Route optimization for minimal travel distance
- Opening hours & weather feasibility checks
- Budget estimation & dynamic replanning
- Reasoning explanation for each recommendation
"""

import os
from typing import Dict, List, TypedDict, Annotated, Optional
from datetime import datetime, timedelta
import json

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from tools import TOOLS, search_places, optimize_route, optimize_route_with_ecs, check_opening_status, check_weather, calculate_budget_estimate

load_dotenv()

# =====================================
# MOOD MAPPING FOR ECS SCORING
# =====================================

def map_preferences_to_mood(travel_style: str, group_type: str) -> str:
    """
    Map travel_style và group_type sang user_mood cho AI Optimizer Service.
    
    Mood options:
    - Yên tĩnh & Thư giãn
    - Náo nhiệt & Xã hội
    - Lãng mạn & Riêng tư
    - Điểm thu hút khách du lịch
    - Mạo hiểm & Thú vị
    - Gia đình & Thoải mái
    - Hiện đại & Sáng tạo
    - Tâm linh & Tôn giáo
    - Địa phương & Đích thực
    - Cảnh quan thiên nhiên
    - Lễ hội & Sôi động
    - Ven biển & Nghỉ dưỡng
    """
    # Map based on travel_style
    if travel_style == "chill":
        if group_type == "couple":
            return "Lãng mạn & Riêng tư"
        elif group_type == "family":
            return "Gia đình & Thoải mái"
        else:
            return "Yên tĩnh & Thư giãn"
    
    elif travel_style == "adventure":
        return "Mạo hiểm & Thú vị"
    
    elif travel_style == "cultural":
        if group_type == "solo":
            return "Địa phương & Đích thực"
        else:
            return "Điểm thu hút khách du lịch"
    
    elif travel_style == "foodie":
        if group_type == "friends":
            return "Náo nhiệt & Xã hội"
        else:
            return "Địa phương & Đích thực"
    
    # Default fallback
    if group_type == "couple":
        return "Lãng mạn & Riêng tư"
    elif group_type == "family":
        return "Gia đình & Thoải mái"
    elif group_type == "friends":
        return "Náo nhiệt & Xã hội"
    else:
        return "Điểm thu hút khách du lịch"

# =====================================
# STATE MANAGEMENT
# =====================================

class UserPreferences(BaseModel):
    """User travel preferences collected through conversation"""
    travel_style: Optional[str] = None  # "chill", "adventure", "cultural", "foodie"
    group_type: Optional[str] = None    # "solo", "couple", "family", "friends"
    budget_range: Optional[str] = None  # "budget", "mid-range", "luxury"
    interests: List[str] = []           # ["history", "food", "nature", "shopping"]
    mobility: Optional[str] = "normal"  # "limited", "normal", "high"
    duration: Optional[str] = None      # "half_day", "full_day", "2_days", "3_days"
    start_location: Optional[str] = None # "Hà Nội", "Quận 1", hotel address
    special_requests: List[str] = []     # ["vegetarian", "wheelchair_accessible"]
    user_mood: Optional[str] = None     # Mood for ECS scoring (mapped from travel_style + group_type)

class TravelState(TypedDict):
    """Overall conversation and planning state"""
    messages: Annotated[list, add_messages]
    user_preferences: UserPreferences
    current_itinerary: List[Dict]
    optimization_applied: bool
    weather_checked: bool
    budget_calculated: bool
    session_stage: str  # "profiling", "planning", "optimizing", "finalizing"
    user_location: Optional[str]
    travel_date: Optional[str]

# =====================================
# LLM INITIALIZATION
# =====================================

def get_llm():
    """Initialize OpenAI LLM with function calling"""
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,  # Slightly creative but mostly deterministic
        api_key=os.getenv("OPENAI_API_KEY")
    )

llm = get_llm()

# =====================================
# GRAPH NODES
# =====================================

def profile_collector_node(state: TravelState) -> TravelState:
    """
    Node 1: Collect user preferences through smart questioning
    """
    print("🔍 ProfileCollector: Analyzing user input and preferences...")
    
    messages = state["messages"]
    preferences = state.get("user_preferences", UserPreferences())
    last_message = messages[-1].content if messages else ""
    
    # Determine what information we're still missing
    missing_info = []
    if not preferences.start_location:
        missing_info.append("destination")
    if not preferences.travel_style:
        missing_info.append("travel_style")
    if not preferences.group_type:
        missing_info.append("group_type") 
    if not preferences.budget_range:
        missing_info.append("budget_range")
    if not preferences.duration:
        missing_info.append("duration")
    
    # Analyze user's latest message for preferences
    system_prompt = f"""
    Bạn là một AI travel assistant thông minh. Nhiệm vụ của bạn là thu thập thông tin về sở thích du lịch của khách hàng một cách tự nhiên.
    
    Thông tin hiện tại về khách hàng:
    - Địa điểm: {preferences.start_location or "Chưa biết"}
    - Phong cách du lịch: {preferences.travel_style or "Chưa biết"}
    - Nhóm đi: {preferences.group_type or "Chưa biết"}  
    - Ngân sách: {preferences.budget_range or "Chưa biết"}
    - Thời gian: {preferences.duration or "Chưa biết"}
    - Sở thích: {preferences.interests or "Chưa biết"}
    
    Tin nhắn mới nhất của khách: "{last_message}"
    
    Hãy:
    1. Phân tích tin nhắn để trích xuất thông tin sở thích (nếu có), đặc biệt chú ý đến TÊN ĐỊA ĐIỂM/THÀNH PHỐ
    2. Nếu thiếu thông tin quan trọng ({missing_info}), hỏi 1-2 câu hỏi một cách tự nhiên
    3. Nếu đã đủ thông tin, chuyển sang giai đoạn lập kế hoạch lộ trình
    
    Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp.
    """
    
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=last_message)
    ])
    
    # Update preferences based on user input (simple keyword detection)
    updated_preferences = preferences.copy()
    
    # Extract info from user message
    user_text = last_message.lower()
    
    # Destination detection (IMPORTANT!)
    destination_keywords = {
        "vũng tàu": ["vũng tàu", "vung tau", "vùng tàu", "vùng tau"],
        "đà lạt": ["đà lạt", "da lat", "đà lat"],
        "nha trang": ["nha trang"],
        "đà nẵng": ["đà nẵng", "da nang"],
        "hội an": ["hội an", "hoi an"],
        "phú quốc": ["phú quốc", "phu quoc"],
        "sapa": ["sapa", "sa pa"],
        "hà nội": ["hà nội", "ha noi", "hanoi"],
        "hồ chí minh": ["hồ chí minh", "ho chi minh", "sài gòn", "saigon", "tp.hcm", "tphcm"],
        "huế": ["huế", "hue"],
        "hạ long": ["hạ long", "ha long", "halong"],
        "cần thơ": ["cần thơ", "can tho"],
        "ninh bình": ["ninh bình", "ninh binh"],
    }
    
    for destination, keywords in destination_keywords.items():
        if any(keyword in user_text for keyword in keywords):
            updated_preferences.start_location = destination
            print(f"   ✅ Detected destination: {destination}")
            break
    
    # Travel style detection
    if any(word in user_text for word in ["chill", "nghỉ dưỡng", "thư giãn", "yên tĩnh"]):
        updated_preferences.travel_style = "chill"
    elif any(word in user_text for word in ["phiêu lưu", "khám phá", "mạo hiểm", "vận động"]):
        updated_preferences.travel_style = "adventure"
    elif any(word in user_text for word in ["văn hóa", "lịch sử", "truyền thống", "bảo tàng"]):
        updated_preferences.travel_style = "cultural"
    elif any(word in user_text for word in ["ăn uống", "ẩm thực", "quán ăn", "món ngon"]):
        updated_preferences.travel_style = "foodie"
    
    # Group type detection
    # Detect based on number of people first
    import re
    people_match = re.search(r'(\d+)\s*(người|people)', user_text)
    if people_match:
        num_people = int(people_match.group(1))
        if num_people == 1:
            updated_preferences.group_type = "solo"
        elif num_people == 2:
            updated_preferences.group_type = "couple"
        elif num_people >= 3:
            # Check if family context
            if any(word in user_text for word in ["gia đình", "bố mẹ", "con cái", "family"]):
                updated_preferences.group_type = "family"
            else:
                updated_preferences.group_type = "friends"
        print(f"   ✅ Detected {num_people} người → group_type: {updated_preferences.group_type}")
    # Fallback to keyword detection
    elif any(word in user_text for word in ["một mình", "solo", "tự túc"]):
        updated_preferences.group_type = "solo"
    elif any(word in user_text for word in ["cặp đôi", "bạn trai", "bạn gái", "vợ chồng", "2 người"]):
        updated_preferences.group_type = "couple"
    elif any(word in user_text for word in ["gia đình", "bố mẹ", "con cái", "family"]):
        updated_preferences.group_type = "family"
    elif any(word in user_text for word in ["bạn bè", "nhóm", "đồng nghiệp"]):
        updated_preferences.group_type = "friends"
        
    # Budget detection
    if any(word in user_text for word in ["tiết kiệm", "rẻ", "bình dân", "sinh viên"]):
        updated_preferences.budget_range = "budget"
    elif any(word in user_text for word in ["cao cấp", "sang", "luxury", "đắt tiền"]):
        updated_preferences.budget_range = "luxury"
    else:
        updated_preferences.budget_range = "mid-range"
        
    # Duration detection
    if any(word in user_text for word in ["nửa ngày", "sáng", "chiều"]):
        updated_preferences.duration = "half_day"
    elif any(word in user_text for word in ["một ngày", "cả ngày"]):
        updated_preferences.duration = "full_day"
    elif any(word in user_text for word in ["2 ngày", "hai ngày"]):
        updated_preferences.duration = "2_days"
    elif any(word in user_text for word in ["3 ngày", "ba ngày"]):
        updated_preferences.duration = "3_days"
    
    # Determine next stage
    is_info_complete = all([
        updated_preferences.start_location,  # MUST have destination!
        updated_preferences.travel_style,
        updated_preferences.group_type, 
        updated_preferences.budget_range,
        updated_preferences.duration
    ])
    
    next_stage = "planning" if is_info_complete else "profiling"
    
    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=response.content)],
        "user_preferences": updated_preferences,
        "session_stage": next_stage
    }

def itinerary_planner_node(state: TravelState) -> TravelState:
    """
    Node 2: Generate initial itinerary based on preferences using AI Optimizer Service
    """
    print("📋 ItineraryPlanner: Creating optimized itinerary with AI Optimizer Service...")
    
    preferences = state["user_preferences"]
    
    # Map travel_style + group_type to user_mood for ECS scoring
    user_mood = map_preferences_to_mood(
        preferences.travel_style or "cultural",
        preferences.group_type or "solo"
    )
    preferences.user_mood = user_mood
    
    print(f"   → Mapped mood: {user_mood}")
    
    # Get destination (location filter)
    destination = preferences.start_location or "Hà Nội"  # Default to Hanoi if not specified
    print(f"   → Searching for places in: {destination}")
    
    # Search for places based on preferences WITH location filter
    search_queries = []
    
    if preferences.travel_style == "cultural":
        search_queries = ["bảo tàng lịch sử", "đình chùa", "di tích văn hóa"]
    elif preferences.travel_style == "foodie":
        search_queries = ["quán ăn ngon", "món đặc sản", "chợ ẩm thực"]
    elif preferences.travel_style == "adventure":
        search_queries = ["công viên", "leo núi", "hoạt động ngoài trời"]
    elif preferences.travel_style == "chill":
        search_queries = ["quán cà phê yên tĩnh", "công viên", "hồ nước", "bãi biển"]
    else:
        search_queries = ["địa điểm tham quan", "quán ăn", "công viên"]
    
    # Collect places from multiple searches with location filter
    all_places = []
    for query in search_queries:
        # Add location filter to search
        places = search_places.invoke({
            "query": query, 
            "location_filter": destination,
            "limit": 10
        })
        all_places.extend(places[:5])  # Take top 5 from each search
    
    print(f"   → Found {len(all_places)} places before deduplication")
    
    # Remove duplicates
    seen_ids = set()
    unique_places = []
    for place in all_places:
        place_id = place.get('googlePlaceId') or place.get('_id') or place.get('name')
        if place_id not in seen_ids:
            seen_ids.add(place_id)
            unique_places.append(place)
    
    if not unique_places:
        # Fallback if no places found
        return {
            **state,
            "current_itinerary": [],
            "session_stage": "planning",
            "messages": state["messages"] + [AIMessage(content="❌ Xin lỗi, không tìm thấy địa điểm phù hợp. Vui lòng thử lại với sở thích khác.")]
        }
    
    # Parse duration to days
    duration_map = {
        "half_day": 1,
        "full_day": 1,
        "2_days": 2,
        "3_days": 3
    }
    duration_days = duration_map.get(preferences.duration, 1)
    
    # Get current location (default to Hanoi center if not provided)
    current_location = {"lat": 21.0285, "lng": 105.8542}  # Hanoi center
    if state.get("user_location"):
        # Parse user_location if provided (format: "lat,lng" or location name)
        try:
            parts = state["user_location"].split(",")
            if len(parts) == 2:
                current_location = {"lat": float(parts[0]), "lng": float(parts[1])}
        except:
            pass
    
    # Get start datetime (default to tomorrow 9 AM)
    start_datetime = state.get("travel_date")
    if not start_datetime:
        tomorrow = datetime.now() + timedelta(days=1)
        start_datetime = tomorrow.replace(hour=9, minute=0, second=0).isoformat()
    
    # Call AI Optimizer Service
    print(f"   → Calling AI Optimizer with {len(unique_places)} places, {duration_days} days")
    
    optimizer_result = optimize_route_with_ecs.invoke({
        "places": unique_places,
        "user_mood": user_mood,
        "duration_days": duration_days,
        "current_location": current_location,
        "start_datetime": start_datetime,
        "ecs_score_threshold": 0.0  # Accept all places for now
    })
    
    # Extract optimized route
    optimized_route = optimizer_result.get("optimized_route", [])
    
    if not optimized_route:
        # Fallback to simple itinerary if optimizer fails
        print("   ⚠️  AI Optimizer returned empty result, using fallback")
        itinerary = []
        for i, place in enumerate(unique_places[:5]):
            itinerary.append({
                "day": 1,
                "time": f"{9 + i * 2}:00",
                "activity": "Tham quan",
                "place": place
            })
    else:
        # Convert optimizer result to itinerary format
        itinerary = []
        for day_data in optimized_route:
            day_num = day_data.get("day", 1)
            for activity in day_data.get("activities", []):
                itinerary.append({
                    "day": day_num,
                    "time": activity.get("estimated_arrival", "09:00").split("T")[1][:5] if "T" in activity.get("estimated_arrival", "") else "09:00",
                    "activity": "Tham quan",
                    "place": activity,
                    "estimated_arrival": activity.get("estimated_arrival"),
                    "estimated_departure": activity.get("estimated_departure"),
                    "ecs_score": activity.get("ecs_score")
                })
    
    # Generate explanation
    total_places = len(itinerary)
    days_count = len(optimized_route) if optimized_route else 1
    
    explanation = f"""
    🎯 **Lộ trình được tối ưu hóa bởi AI dựa trên:**
    - 📍 Địa điểm: {destination}
    - 🎨 Phong cách: {preferences.travel_style} → Mood: {user_mood}
    - 👥 Nhóm: {preferences.group_type}
    - 💰 Ngân sách: {preferences.budget_range}
    - ⏱️ Thời gian: {preferences.duration} ({duration_days} ngày)
    
    📍 **Tôi đã tạo lộ trình {days_count} ngày tại {destination} với {total_places} địa điểm được tối ưu theo:**
    ✅ ECS Score (phù hợp với mood của bạn)
    ✅ Khoảng cách di chuyển (nearest-neighbor optimization)
    ✅ Giờ mở cửa của các địa điểm
    
    ⏰ **Lộ trình chi tiết tại {destination}:**
    """
    
    current_day = 0
    for item in itinerary:
        if item.get("day", 1) != current_day:
            current_day = item.get("day", 1)
            explanation += f"\n\n**🗓️ NGÀY {current_day}:**"
        
        if item.get("place"):
            place_name = item["place"].get("name", "Unknown")
            time_str = item.get("time", "TBD")
            ecs = item.get("ecs_score")
            ecs_str = f" (ECS: {ecs:.2f})" if ecs else ""
            explanation += f"\n• {time_str} - {place_name}{ecs_str}"
    
    explanation += "\n\n💡 Lộ trình này đã được kiểm tra và tối ưu hóa. Tiếp theo tôi sẽ kiểm tra thời tiết và tính chi phí!"
    
    return {
        **state,
        "current_itinerary": itinerary,
        "user_preferences": preferences,  # Update with mood
        "optimization_applied": True,  # Mark as optimized
        "session_stage": "optimizing",
        "messages": state["messages"] + [AIMessage(content=explanation)]
    }

def route_optimizer_node(state: TravelState) -> TravelState:
    """
    Node 3: Skip optimization (already done by AI Optimizer Service in planner)
    """
    print("🗺️ RouteOptimizer: Skipping (already optimized by AI Optimizer Service)")
    
    # Check if already optimized
    if state.get("optimization_applied"):
        print("   ✅ Route already optimized with ECS scoring + nearest-neighbor")
        return {
            **state,
            "session_stage": "finalizing"
        }
    
    # Fallback: if not optimized yet, apply simple optimization
    itinerary = state["current_itinerary"]
    if not itinerary:
        return {**state, "optimization_applied": True, "session_stage": "finalizing"}
    
    # Extract places from itinerary
    places = []
    for item in itinerary:
        if item.get("place"):
            places.append(item["place"])
    
    if len(places) <= 1:
        return {**state, "optimization_applied": True, "session_stage": "finalizing"}
    
    # Optimize route using simple nearest-neighbor
    optimized_places = optimize_route.invoke({"places": places})
    
    # Rebuild itinerary with optimized order
    optimized_itinerary = []
    for i, original_item in enumerate(itinerary):
        if original_item.get("place") and i < len(optimized_places):
            optimized_item = original_item.copy()
            optimized_item["place"] = optimized_places[i]
            optimized_itinerary.append(optimized_item)
        else:
            optimized_itinerary.append(original_item)
    
    optimization_message = """
    🔄 **Đã tối ưu hóa lộ trình (fallback)!**
    
    Tôi đã sắp xếp lại thứ tự các địa điểm để giảm thiểu thời gian di chuyển. 
    Các địa điểm gần nhau sẽ được ghép lại để bạn đi lại thuận tiện hơn.
    """
    
    return {
        **state,
        "current_itinerary": optimized_itinerary,
        "optimization_applied": True,
        "session_stage": "finalizing",
        "messages": state["messages"] + [AIMessage(content=optimization_message)]
    }

def feasibility_checker_node(state: TravelState) -> TravelState:
    """
    Node 4: Check opening hours and weather feasibility
    """
    print("✅ FeasibilityChecker: Checking opening hours and weather...")
    
    itinerary = state["current_itinerary"]
    travel_date = state.get("travel_date", datetime.now().strftime("%Y-%m-%d"))
    
    # Check weather
    weather_info = check_weather.invoke({"date": travel_date, "location": "Hanoi,VN"})
    
    # Check opening hours for each place
    issues = []
    for item in itinerary:
        if item.get("place"):
            place = item["place"]
            target_time = item.get("time", "10:00")
            opening_status = check_opening_status.invoke({"place": place, "target_time": target_time})
            
            if not opening_status.get("is_open", True):
                issues.append(f"⚠️ {place.get('name', 'Unknown')} có thể đóng cửa vào {target_time}")
    
    # Generate feasibility report
    feasibility_message = f"""
    🌤️ **Thông tin thời tiết:** {weather_info.get('recommendation', 'Không có dữ liệu')}
    
    🕐 **Kiểm tra giờ mở cửa:**
    """
    
    if issues:
        feasibility_message += "\n" + "\n".join(issues)
        feasibility_message += "\n\n💡 Tôi sẽ điều chỉnh lịch trình nếu cần!"
    else:
        feasibility_message += "\n✅ Tất cả địa điểm đều mở cửa phù hợp với lịch trình."
    
    return {
        **state,
        "weather_checked": True,
        "session_stage": "finalizing",
        "messages": state["messages"] + [AIMessage(content=feasibility_message)]
    }

def budget_calculator_node(state: TravelState) -> TravelState:
    """
    Node 5: Calculate budget estimate and provide alternatives
    """
    print("💰 BudgetCalculator: Calculating cost estimates...")
    
    itinerary = state["current_itinerary"]
    preferences = state["user_preferences"]
    
    # Extract places for budget calculation
    places = []
    for item in itinerary:
        if item.get("place"):
            places.append(item["place"])
    
    if not places:
        return {**state, "budget_calculated": True}
    
    # Calculate budget for different group sizes
    person_count = 2 if preferences.group_type == "couple" else 1
    if preferences.group_type == "family":
        person_count = 4
    elif preferences.group_type == "friends":
        person_count = 3
    
    budget_info = calculate_budget_estimate.invoke({"places": places, "person_count": person_count})
    
    budget_message = f"""
    💰 **Ước tính chi phí cho {person_count} người:**
    
    📊 **Tổng chi phí:** {budget_info.get('total_cost_formatted', '0 VNĐ')}
    📊 **Chi phí/người:** {budget_info.get('cost_per_person_formatted', '0 VNĐ')}
    
    📋 **Chi tiết:**
    """
    
    for item in budget_info.get('breakdown', []):
        budget_message += f"\n• {item['name']}: {item['cost_per_person']:,.0f} VNĐ/người"
    
    # Provide budget adjustment suggestions
    if budget_info.get('total_cost', 0) > 1_000_000:
        budget_message += "\n\n💡 **Gợi ý tiết kiệm:** Có thể chọn các quán ăn bình dân hơn để giảm chi phí."
    
    return {
        **state,
        "budget_calculated": True,
        "session_stage": "complete",
        "messages": state["messages"] + [AIMessage(content=budget_message)]
    }

def final_response_node(state: TravelState) -> TravelState:
    """
    Node 6: Format final response with complete itinerary
    """
    print("📝 FinalResponse: Formatting complete itinerary...")
    
    itinerary = state["current_itinerary"]
    preferences = state["user_preferences"]
    
    # Create comprehensive final response
    final_message = f"""
    🎉 **Lộ trình hoàn chỉnh cho chuyến đi của bạn!**
    
    👥 **Thông tin nhóm:** {preferences.group_type} - {preferences.travel_style}
    ⏱️ **Thời gian:** {preferences.duration}
    💰 **Ngân sách:** {preferences.budget_range}
    
    📋 **LỊCH TRÌNH CHI TIẾT:**
    
    """
    
    current_day = 1
    for item in itinerary:
        if item.get("day") and item["day"] != current_day:
            current_day = item["day"]
            final_message += f"\n🗓️ **NGÀY {current_day}:**\n"
        
        if item.get("place"):
            place = item["place"]
            place_name = place.get("name", "Unknown")
            address = place.get("address", place.get("formatted_address", ""))
            
            final_message += f"""
    ⏰ **{item.get('time', 'TBD')}** - {item.get('activity', 'Tham quan')}
    📍 **{place_name}**
    📍 Địa chỉ: {address}
    """
    
    final_message += f"""
    
    🎯 **Tại sao tôi chọn lộ trình này:**
    • Các địa điểm được sắp xếp theo thứ tự tối ưu để tiết kiệm thời gian di chuyển
    • Phù hợp với sở thích {preferences.travel_style} của nhóm {preferences.group_type}
    • Nằm trong ngân sách {preferences.budget_range}
    • Đã kiểm tra giờ mở cửa và thời tiết
    
    💡 **Bạn có thể yêu cầu tôi:**
    • Thay đổi một địa điểm nào đó
    • Điều chỉnh thời gian
    • Thêm/bớt hoạt động
    • Tính lại ngân sách
    
    Chúc bạn có một chuyến đi tuyệt vời! 🚀
    """
    
    return {
        **state,
        "session_stage": "complete",
        "messages": state["messages"] + [AIMessage(content=final_message)]
    }

# =====================================
# GRAPH CONSTRUCTION
# =====================================

def create_travel_agent_graph():
    """Create the LangGraph workflow"""
    
    # Create the state graph
    workflow = StateGraph(TravelState)
    
    # Add nodes
    workflow.add_node("profile_collector", profile_collector_node)
    workflow.add_node("itinerary_planner", itinerary_planner_node)
    workflow.add_node("route_optimizer", route_optimizer_node)
    workflow.add_node("feasibility_checker", feasibility_checker_node)
    workflow.add_node("budget_calculator", budget_calculator_node)
    workflow.add_node("final_response", final_response_node)
    
    # Define routing logic
    def route_after_profiling(state: TravelState):
        if state["session_stage"] == "planning":
            return "itinerary_planner"
        else:
            return "profile_collector"  # Continue profiling
    
    def route_after_planning(state: TravelState):
        return "route_optimizer"
    
    def route_after_optimization(state: TravelState):
        return "feasibility_checker"
        
    def route_after_feasibility(state: TravelState):
        return "budget_calculator"
        
    def route_after_budget(state: TravelState):
        return "final_response"
    
    # Add edges
    workflow.add_edge(START, "profile_collector")
    workflow.add_conditional_edges("profile_collector", route_after_profiling)
    workflow.add_conditional_edges("itinerary_planner", route_after_planning)
    workflow.add_conditional_edges("route_optimizer", route_after_optimization)
    workflow.add_conditional_edges("feasibility_checker", route_after_feasibility)
    workflow.add_conditional_edges("budget_calculator", route_after_budget)
    workflow.add_edge("final_response", END)
    
    return workflow.compile()

# =====================================
# MAIN AGENT CLASS
# =====================================

class TravelAgent:
    def __init__(self):
        self.graph = create_travel_agent_graph()
        
    def chat(self, user_message: str, conversation_state: Optional[Dict] = None) -> Dict:
        """
        Main chat interface for the travel agent
        
        Args:
            user_message: User's input message
            conversation_state: Previous conversation state (for memory)
            
        Returns:
            Dict containing response and updated state
        """
        
        # Initialize or update state
        if conversation_state:
            state = conversation_state
            state["messages"].append(HumanMessage(content=user_message))
        else:
            state = {
                "messages": [HumanMessage(content=user_message)],
                "user_preferences": UserPreferences(),
                "current_itinerary": [],
                "optimization_applied": False,
                "weather_checked": False,
                "budget_calculated": False,
                "session_stage": "profiling",
                "user_location": None,
                "travel_date": None
            }
        
        # Run the graph
        try:
            final_state = self.graph.invoke(state)
            
            # Extract the latest AI response
            ai_messages = [msg for msg in final_state["messages"] if isinstance(msg, AIMessage)]
            latest_response = ai_messages[-1].content if ai_messages else "Xin lỗi, tôi không thể xử lý yêu cầu của bạn."
            
            return {
                "response": latest_response,
                "state": final_state,
                "stage": final_state.get("session_stage", "profiling"),
                "preferences": final_state["user_preferences"].dict(),
                "itinerary": final_state["current_itinerary"]
            }
            
        except Exception as e:
            print(f"Error in travel agent: {e}")
            return {
                "response": f"Xin lỗi, đã có lỗi xảy ra: {str(e)}",
                "state": state,
                "stage": "error",
                "preferences": {},
                "itinerary": []
            }

# =====================================
# TEST FUNCTION
# =====================================

if __name__ == "__main__":
    # Test the agent
    agent = TravelAgent()
    
    print("🤖 Travel AI Agent started! Type 'quit' to exit.\n")
    
    conversation_state = None
    
    while True:
        user_input = input("👤 Bạn: ")
        if user_input.lower() in ['quit', 'exit', 'thoát']:
            break
            
        result = agent.chat(user_input, conversation_state)
        conversation_state = result["state"]
        
        print(f"🤖 Agent: {result['response']}\n")
        print(f"📊 Stage: {result['stage']}")
        print("-" * 50)