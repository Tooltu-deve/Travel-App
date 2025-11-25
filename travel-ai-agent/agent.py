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

from tools import TOOLS, search_places, optimize_route, check_opening_status, check_weather, calculate_budget_estimate

load_dotenv()

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
    - Phong cách du lịch: {preferences.travel_style or "Chưa biết"}
    - Nhóm đi: {preferences.group_type or "Chưa biết"}  
    - Ngân sách: {preferences.budget_range or "Chưa biết"}
    - Thời gian: {preferences.duration or "Chưa biết"}
    - Sở thích: {preferences.interests or "Chưa biết"}
    
    Tin nhắn mới nhất của khách: "{last_message}"
    
    Hãy:
    1. Phân tích tin nhắn để trích xuất thông tin sở thích (nếu có)
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
    if any(word in user_text for word in ["một mình", "solo", "tự túc"]):
        updated_preferences.group_type = "solo"
    elif any(word in user_text for word in ["cặp đôi", "bạn trai", "bạn gái", "vợ chồng"]):
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
    Node 2: Generate initial itinerary based on preferences
    """
    print("📋 ItineraryPlanner: Creating day-by-day itinerary...")
    
    preferences = state["user_preferences"]
    
    # Search for places based on preferences
    search_queries = []
    
    if preferences.travel_style == "cultural":
        search_queries = ["bảo tàng lịch sử", "đình chùa", "di tích văn hóa"]
    elif preferences.travel_style == "foodie":
        search_queries = ["quán ăn ngon", "món đặc sản", "chợ ẩm thực"]
    elif preferences.travel_style == "adventure":
        search_queries = ["công viên", "leo núi", "hoạt động ngoài trời"]
    elif preferences.travel_style == "chill":
        search_queries = ["quán cà phê yên tĩnh", "công viên", "hồ nước"]
    else:
        search_queries = ["địa điểm tham quan", "quán ăn", "công viên"]
    
    # Collect places from multiple searches
    all_places = []
    for query in search_queries:
        places = search_places.invoke({"query": query, "limit": 5})
        all_places.extend(places[:3])  # Take top 3 from each search
    
    # Remove duplicates
    seen_ids = set()
    unique_places = []
    for place in all_places:
        place_id = place.get('googlePlaceId') or place.get('_id') or place.get('name')
        if place_id not in seen_ids:
            seen_ids.add(place_id)
            unique_places.append(place)
    
    # Limit based on duration
    duration_limits = {
        "half_day": 3,
        "full_day": 5, 
        "2_days": 8,
        "3_days": 12
    }
    
    max_places = duration_limits.get(preferences.duration, 5)
    selected_places = unique_places[:max_places]
    
    # Create basic itinerary structure
    if preferences.duration == "half_day":
        itinerary = [
            {"time": "09:00", "activity": "Bắt đầu", "place": selected_places[0] if selected_places else None},
            {"time": "11:00", "activity": "Tham quan", "place": selected_places[1] if len(selected_places) > 1 else None},
            {"time": "12:30", "activity": "Ăn trưa và kết thúc", "place": selected_places[2] if len(selected_places) > 2 else None},
        ]
    elif preferences.duration == "full_day":
        itinerary = [
            {"time": "09:00", "activity": "Bắt đầu ngày", "place": selected_places[0] if selected_places else None},
            {"time": "10:30", "activity": "Tham quan", "place": selected_places[1] if len(selected_places) > 1 else None},
            {"time": "12:30", "activity": "Ăn trưa", "place": selected_places[2] if len(selected_places) > 2 else None},
            {"time": "14:30", "activity": "Hoạt động chiều", "place": selected_places[3] if len(selected_places) > 3 else None},
            {"time": "17:00", "activity": "Kết thúc ngày", "place": selected_places[4] if len(selected_places) > 4 else None},
        ]
    else:
        # Multi-day itinerary (simplified)
        itinerary = []
        places_per_day = max_places // int(preferences.duration.split('_')[0])
        for day in range(int(preferences.duration.split('_')[0])):
            day_places = selected_places[day * places_per_day:(day + 1) * places_per_day]
            for i, place in enumerate(day_places):
                itinerary.append({
                    "day": day + 1,
                    "time": f"{9 + i * 2}:00",
                    "activity": f"Hoạt động {i + 1}",
                    "place": place
                })
    
    # Generate explanation
    explanation = f"""
    🎯 **Lộ trình được thiết kế dựa trên:**
    - Phong cách: {preferences.travel_style}
    - Nhóm: {preferences.group_type}
    - Ngân sách: {preferences.budget_range}
    - Thời gian: {preferences.duration}
    
    📍 **Tôi đã chọn {len(selected_places)} địa điểm phù hợp với sở thích của bạn.**
    
    ⏰ **Lộ trình chi tiết:**
    """
    
    for item in itinerary:
        if item.get("place"):
            place_name = item["place"].get("name", "Unknown")
            explanation += f"\n• {item['time']} - {item['activity']}: {place_name}"
    
    return {
        **state,
        "current_itinerary": itinerary,
        "session_stage": "optimizing",
        "messages": state["messages"] + [AIMessage(content=explanation)]
    }

def route_optimizer_node(state: TravelState) -> TravelState:
    """
    Node 3: Optimize route for minimal travel distance
    """
    print("🗺️ RouteOptimizer: Optimizing travel route...")
    
    itinerary = state["current_itinerary"]
    if not itinerary:
        return {**state, "optimization_applied": True}
    
    # Extract places from itinerary
    places = []
    for item in itinerary:
        if item.get("place"):
            places.append(item["place"])
    
    if len(places) <= 1:
        return {**state, "optimization_applied": True}
    
    # Optimize route
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
    🔄 **Đã tối ưu hóa lộ trình!**
    
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