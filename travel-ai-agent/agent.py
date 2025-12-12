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
import re
import requests

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from tools import (
    TOOLS, search_places, optimize_route, optimize_route_with_ecs, 
    check_opening_status, check_weather, calculate_budget_estimate,
    search_nearby_places, get_place_details, get_travel_tips, find_emergency_services
)

load_dotenv()

# =====================================
# GEOCODING & LOCATION UTILITIES
# =====================================

def geocode_location(location_name: str, destination: Optional[str] = None) -> Optional[Dict]:
    """
    Geocode a location name to coordinates using Google Geocoding API
    
    Args:
        location_name: Name like "Quận 1", "Sân bay Nội Bài", "Khách sạn ABC"
        destination: Destination city for context (e.g., "Hà Nội", "Đà Nẵng")
    
    Returns:
        Dict with 'lat', 'lng', 'formatted_address' or None if failed
    """
    if not location_name or not location_name.strip():
        print(f"   ⚠️ Empty location name provided")
        return None
    
    # Try multiple API keys in order of preference
    api_keys = [
        os.getenv("GOOGLE_GEOCODING_API_KEY"),
        os.getenv("GOOGLE_DIRECTIONS_API_KEY"),
        os.getenv("GOOGLE_DISTANCE_MATRIX_API_KEY"),
        os.getenv("GOOGLE_PLACES_API_KEY"),
    ]
    api_keys = [k for k in api_keys if k]  # Filter out None values
    
    if not api_keys:
        print(f"   ⚠️ No Google API keys available for geocoding")
        return None
    
    # Add destination context if available
    query = location_name
    if destination and destination not in location_name:
        query = f"{location_name}, {destination}, Vietnam"
    else:
        query = f"{location_name}, Vietnam"
    
    print(f"   🔍 Geocoding query: '{query}'")
    
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    
    # Try each API key
    for idx, google_api_key in enumerate(api_keys):
        try:
            params = {
                "address": query,
                "key": google_api_key
            }
            
            response = requests.get(url, params=params, timeout=5)
            print(f"   📡 API response status: {response.status_code} (key #{idx+1})")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check for authorization error
                if data.get("status") == "REQUEST_DENIED":
                    print(f"   ⚠️ API key #{idx+1} not authorized. Trying next key...")
                    continue
                
                if data.get("results") and len(data["results"]) > 0:
                    result = data["results"][0]
                    location = result.get("geometry", {}).get("location", {})
                    formatted_address = result.get("formatted_address", "")
                    
                    print(f"   ✅ Found location: {formatted_address}")
                    print(f"   📍 Coordinates: lat={location.get('lat')}, lng={location.get('lng')}")
                    
                    if location.get("lat") and location.get("lng"):
                        return {
                            "lat": location.get("lat"),
                            "lng": location.get("lng"),
                            "formatted_address": formatted_address
                        }
                else:
                    print(f"   ❌ No results from API. Status: {data.get('status', 'Unknown error')}")
            else:
                print(f"   ❌ API request failed with status: {response.status_code}")
        
        except Exception as e:
            print(f"   ❌ Geocoding error with key #{idx+1} for '{location_name}': {e}")
    
    print(f"   ❌ Could not geocode '{location_name}' with any available API key")
    return None

# Default coordinates for Vietnamese cities
DEFAULT_CITY_COORDINATES = {
    "hà nội": {"lat": 21.0285, "lng": 105.8542},
    "tp.hcm": {"lat": 10.7769, "lng": 106.6963},
    "thành phố hồ chí minh": {"lat": 10.7769, "lng": 106.6963},
    "sài gòn": {"lat": 10.7769, "lng": 106.6963},
    "đà nẵng": {"lat": 16.0544, "lng": 108.2022},
    "đà lạt": {"lat": 11.9404, "lng": 108.4429},
    "nha trang": {"lat": 12.2388, "lng": 109.1967},
    "phú quốc": {"lat": 10.3000, "lng": 104.0500},
    "hội an": {"lat": 15.8801, "lng": 108.3167},
    "huế": {"lat": 16.4637, "lng": 107.5909},
    "vũng tàu": {"lat": 10.3456, "lng": 107.0657},
    "sapa": {"lat": 22.3402, "lng": 103.8343},
    "hạ long": {"lat": 20.9517, "lng": 107.0423},
}

# =====================================
# MOOD MAPPING FOR ECS SCORING
# =====================================

# Danh sách mood cho người dùng lựa chọn
AVAILABLE_MOODS = [
    "Yên tĩnh & Thư giãn",
    "Náo nhiệt & Xã hội",
    "Lãng mạn & Riêng tư",
    "Điểm thu hút khách du lịch",
    "Mạo hiểm & Thú vị",
    "Gia đình & Thoải mái",
    "Hiện đại & Sáng tạo",
    "Tâm linh & Tôn giáo",
    "Địa phương & Đích thực",
    "Cảnh quan thiên nhiên",
    "Lễ hội & Sôi động",
    "Ven biển & Nghỉ dưỡng",
]

def map_preferences_to_mood(travel_style: str, group_type: str) -> str:
    """
    Map travel_style và group_type sang user_mood cho AI Optimizer Service.
    (Chỉ dùng khi user không tự chọn mood)
    
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

def map_mood_to_ecs_threshold(user_mood: Optional[str]) -> float:
    """
    Map user mood to ECS score threshold for AI Optimizer.
    
    ECS threshold được tính dựa trên MOOD_WEIGHTS từ AI Optimizer Service:
    - Tính tổng trọng số (sum of absolute weights) cho mỗi mood
    - Mood có trọng số lớn (chặt chẽ hơn) → threshold cao hơn
    - Mood có trọng số nhỏ (linh hoạt hơn) → threshold thấp hơn
    
    Công thức:
    threshold = 0.35 + (normalized_weight_sum * 0.25)
    
    Range: [0.35, 0.60]
    - 0.35: Mood rộng rãi (chấp nhận nhiều POI)
    - 0.60: Mood chặt chẽ (chỉ lấy POI chất lượng cao)
    
    MOOD_WEIGHTS analysis:
    - "Yên tĩnh & Thư giãn": sum=5.0 → threshold ≈ 0.55 (chặt chẽ)
    - "Náo nhiệt & Xã hội": sum=3.2 → threshold ≈ 0.45 (vừa phải)
    - "Lãng mạn & Riêng tư": sum=5.0 → threshold ≈ 0.55 (chặt chẽ)
    - "Mạo hiểm & Thú vị": sum=5.0 → threshold ≈ 0.55 (chặt chẽ)
    - "Cảnh quan thiên nhiên": sum=4.9 → threshold ≈ 0.55 (chặt chẽ)
    - "Lễ hội & Sôi động": sum=3.0 → threshold ≈ 0.43 (linh hoạt)
    - "Địa phương & Đích thực": sum=4.7 → threshold ≈ 0.54 (chặt chẽ)
    """
    if not user_mood:
        return 0.50  # Default threshold
    
    # MOOD_WEIGHTS từ AI Optimizer Service
    mood_weights = {
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
    
    # Tìm mood match (exact match)
    selected_weights = mood_weights.get(user_mood)
    
    if selected_weights is None:
        # Fallback: tìm partial match
        mood_lower = user_mood.lower()
        for mood_name, weights in mood_weights.items():
            if any(word in mood_lower for word in mood_name.lower().split()):
                selected_weights = weights
                break
    
    if selected_weights is None:
        return 0.50  # Default if no match found
    
    # Tính tổng trọng số tuyệt đối (sum of |weights|)
    weight_sum = sum(abs(w) for w in selected_weights.values())
    
    # Normalize: max weight_sum ≈ 6.2, min ≈ 2.8
    max_weight_sum = 6.2
    min_weight_sum = 2.8
    normalized_weight = (weight_sum - min_weight_sum) / (max_weight_sum - min_weight_sum)
    normalized_weight = max(0.0, min(1.0, normalized_weight))  # Clamp to [0, 1]
    
    # Công thức: threshold = 0.35 + (normalized_weight * 0.25)
    # Range: [0.35, 0.60]
    threshold = 0.35 + (normalized_weight * 0.25)
    
    print(f"   🎯 ECS Threshold Calculation:")
    print(f"      Mood: {user_mood}")
    print(f"      Weight sum: {weight_sum:.2f} (normalized: {normalized_weight:.2f})")
    print(f"      ECS threshold: {threshold:.2f}")
    
    return threshold

def detect_mood_from_input(user_input: str) -> Optional[str]:
    """
    Detect mood from user input by matching keywords against AVAILABLE_MOODS.
    Returns the matched mood or None if no match found.
    
    Examples:
    - "yên tĩnh" → "Yên tĩnh & Thư giãn"
    - "náo nhiệt" → "Náo nhiệt & Xã hội"
    - "lãng mạn" → "Lãng mạn & Riêng tư"
    - "thú vị" → "Mạo hiểm & Thú vị"
    """
    if not user_input or not isinstance(user_input, str):
        return None
    
    user_input_lower = user_input.lower().strip()
    
    # Keywords mapping for each mood
    mood_keywords = {
        "Yên tĩnh & Thư giãn": ["yên tĩnh", "thư giãn", "chill", "relaxation", "peace"],
        "Náo nhiệt & Xã hội": ["náo nhiệt", "xã hội", "party", "sôi động", "vui nhộn"],
        "Lãng mạn & Riêng tư": ["lãng mạn", "romantic", "riêng tư", "đôi", "yêu"],
        "Điểm thu hút khách du lịch": ["khách du lịch", "tour", "nổi tiếng", "popular", "touristy"],
        "Mạo hiểm & Thú vị": ["mạo hiểm", "adventure", "thú vị", "exciting", "thách thức"],
        "Gia đình & Thoải mái": ["gia đình", "family", "thoải mái", "trẻ em", "an toàn"],
        "Hiện đại & Sáng tạo": ["hiện đại", "modern", "sáng tạo", "creative", "công nghệ"],
        "Tâm linh & Tôn giáo": ["tâm linh", "spiritual", "tôn giáo", "tự suy tư", "thiền"],
        "Địa phương & Đích thực": ["địa phương", "local", "đích thực", "authentic", "bản địa"],
        "Cảnh quan thiên nhiên": ["thiên nhiên", "cảnh quan", "scenery", "núi", "rừng"],
        "Lễ hội & Sôi động": ["lễ hội", "festive", "festival", "celebrations", "penh"],
        "Ven biển & Nghỉ dưỡng": ["biển", "seaside", "resort", "bãi cát", "đảo"],
    }
    
    # Check for mood keywords in user input
    for mood, keywords in mood_keywords.items():
        for keyword in keywords:
            if keyword in user_input_lower:
                return mood
    
    return None

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
    duration: Optional[str] = None      # "half_day", "full_day", "2_days", "3_days", "4_days", "5_days", "6_days", "7_days"
    destination: Optional[str] = None   # Điểm đến: "Đà Nẵng", "Phú Quốc", "Đà Lạt"
    departure_location: Optional[str] = None  # Điểm xuất phát text: "Sân bay Nội Bài", "Khách sạn ABC", "Quận 1"
    departure_coordinates: Optional[Dict] = None  # Geocoded coordinates: {"lat": 10.7769, "lng": 106.6963}
    start_location: Optional[str] = None # DEPRECATED: Use destination instead. Kept for backward compatibility
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
    session_stage: str  # "profiling", "planning", "optimizing", "finalizing", "off_topic", "companion_mode"
    user_location: Optional[str]
    travel_date: Optional[str]
    intent: Optional[str]  # "travel_planning", "itinerary_modification", "general_question", "off_topic", "companion_question"
    itinerary_status: Optional[str]  # "DRAFT", "CONFIRMED" - tracks if user is still editing
    itinerary_id: Optional[str]  # MongoDB _id of saved itinerary for modifications
    current_location: Optional[Dict]  # {'lat': float, 'lng': float} - for live companion mode
    active_place_id: Optional[str]  # Current place user is at (for companion questions)

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

def intent_classifier_node(state: TravelState) -> TravelState:
    """
    Node 0: Classify user intent to handle off-topic questions
    """
    print("🎯 IntentClassifier: Analyzing user intent...")
    
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    
    # Quick keyword-based classification (faster, no API call for obvious cases)
    user_text = last_message.lower()
    
    # PRIORITY 0: Check for COMPANION MODE questions (location-based, real-time help)
    companion_keywords = [
        "gần đây", "nearby", "xung quanh", "quanh đây", "gần",  # Nearby search
        "ăn gì", "món gì", "đặc sản", "food", "quán ăn",  # Food tips
        "check-in", "chụp ảnh", "photo", "sống ảo",  # Photo tips
        "địa điểm này", "chỗ này", "đây",  # Place info
        "bệnh viện", "hospital", "pharmacy", "nhà thuốc", "hiệu thuốc", 
        "atm", "ngân hàng", "bank", "khẩn cấp", "emergency", "cấp cứu",
        "công an", "cảnh sát", "police"  # Emergency services
    ]
    
    has_companion_keywords = any(keyword in user_text for keyword in companion_keywords)
    
    if has_companion_keywords:
        # User asking real-time travel questions
        intent = "companion_question"
        print(f"   → Quick detected intent: {intent} (companion keywords found)")
        
        updated_state = {
            **state,
            "intent": intent,
            "session_stage": "companion_mode"
        }
        return updated_state
    
    # Check for modification intent (if there's existing itinerary)
    # IMPORTANT: Check both itinerary_id (saved) and current_itinerary (in-progress)
    has_itinerary = bool(state.get("itinerary_id")) or len(state.get("current_itinerary", [])) > 0
    modification_keywords = ["bỏ", "xóa", "thêm", "thay", "đổi", "sửa", "remove", "add", "replace", "change"]
    
    print(f"   🔍 Checking modification intent: has_itinerary={has_itinerary}, itinerary_id={state.get('itinerary_id')}, current_itinerary_count={len(state.get('current_itinerary', []))}")
    
    # PRIORITY 1: Check modification keywords FIRST - if found, ALWAYS treat as modification (not planning)
    has_modification_keywords = any(keyword in user_text for keyword in modification_keywords)
    
    if has_modification_keywords:
        if has_itinerary:
            # User wants to modify existing itinerary
            intent = "itinerary_modification"
            print(f"   → Quick detected intent: {intent} (has itinerary + modification keywords)")
            
            updated_state = {
                **state,
                "intent": intent
            }
            return updated_state
        else:
            # Has modification keywords but NO itinerary - user is confused, treat as error
            print(f"   ⚠️ Modification keywords found but no itinerary exists - sending error message")
            error_message = "❌ Bạn chưa có lộ trình nào để chỉnh sửa.\n\n💡 Hãy tạo lộ trình mới trước:\nVí dụ: 'Tôi muốn đi du lịch Đà Lạt 3 ngày'"
            
            updated_state = {
                **state,
                "intent": "off_topic",
                "session_stage": "error",
                "messages": state["messages"] + [AIMessage(content=error_message)]
            }
            return updated_state
    
    # PRIORITY 2: Check for travel planning intent (only if NO modification keywords)
    travel_keywords = ["lộ trình", "du lịch", "đi chơi", "tham quan", "tạo", "làm"]
    
    if any(keyword in user_text for keyword in travel_keywords):
        intent = "travel_planning"
        print(f"   → Quick detected intent: {intent} (travel keyword, no modification keywords)")
        
        updated_state = {
            **state,
            "intent": intent
        }
        return updated_state
    
    # For ambiguous cases, use AI classification with timeout
    try:
        # Get conversation context (last 2 messages for context)
        conversation_context = ""
        if len(messages) > 1:
            prev_messages = messages[-3:-1]  # Get 2 messages before current
            for msg in prev_messages:
                role = "User" if isinstance(msg, HumanMessage) else "Assistant"
                conversation_context += f"{role}: {msg.content}\n"
        
        # Intent classification prompt with context
        system_prompt = f"""
        Bạn là một AI classifier. Phân loại ý định (intent) của câu hỏi người dùng vào 1 trong các loại:
        
        1. "travel_planning" - Người dùng muốn lập kế hoạch du lịch, tạo lộ trình mới
           Ví dụ: "Tạo lộ trình đi Đà Nẵng 3 ngày", "Tôi muốn đi du lịch Phú Quốc"
           QUAN TRỌNG: Nếu assistant vừa hỏi về địa điểm và user trả lời tên địa điểm → travel_planning!
           QUAN TRỌNG: Nếu user trả lời "có", "muốn", "được" sau câu hỏi → travel_planning!
        
        2. "itinerary_modification" - Người dùng muốn thay đổi lộ trình đã tạo
           Ví dụ: "Thay địa điểm ngày 2", "Bỏ chùa Linh Ứng đi", "Thêm 1 quán cà phê"
        
        3. "travel_question" - Câu hỏi về du lịch Việt Nam (địa điểm, thông tin)
           Ví dụ: "Đà Nẵng có gì đẹp?", "Nên đi Nha Trang vào tháng mấy?", "Món ăn đặc sản Huế?"
           CHỈ KHI user hỏi về thông tin, KHÔNG PHẢI khi trả lời câu hỏi của assistant!
        
        4. "off_topic" - Câu hỏi KHÔNG liên quan đến du lịch
           Ví dụ: "Cách nấu phở", "Thời tiết hôm nay", "Giải toán", "Lập trình Python"
        
        Context conversation gần đây:
        {conversation_context}
        
        Tin nhắn mới nhất của user: {last_message}
        
        Chỉ trả về TÊN INTENT, không giải thích.
        """
        
        # Call with shorter timeout
        response = llm.invoke([
            SystemMessage(content=system_prompt)
        ], timeout=10)  # 10 second timeout
        
        intent = response.content.strip().lower()
        print(f"   → AI detected intent: {intent}")
        
    except Exception as e:
        print(f"   ⚠️ Intent classification failed: {e}, defaulting to travel_planning")
        intent = "travel_planning"  # Default to travel planning on error
    
    # Update state with detected intent
    updated_state = {
        **state,
        "intent": intent
    }
    
    # Handle off-topic immediately
    if "off_topic" in intent:
        off_topic_response = """
🤖 Xin lỗi, tôi là AI chuyên về **lập kế hoạch du lịch Việt Nam**.

Tôi có thể giúp bạn:
✅ Tạo lộ trình du lịch theo sở thích
✅ Gợi ý địa điểm tham quan
✅ Tối ưu hóa tuyến đường di chuyển
✅ Tính toán ngân sách
✅ Kiểm tra thời tiết & giờ mở cửa

❌ Tôi không thể trả lời các câu hỏi ngoài phạm vi du lịch.

💡 **Bạn có muốn tôi giúp tạo lộ trình du lịch không?**
Ví dụ: "Tạo lộ trình đi Đà Nẵng 3 ngày 2 đêm cho 2 người"
        """
        updated_state["messages"] = state["messages"] + [AIMessage(content=off_topic_response)]
        updated_state["session_stage"] = "off_topic"
    
    # Handle travel questions (provide info without creating itinerary)
    elif "travel_question" in intent:
        updated_state["session_stage"] = "answering_question"
    
    return updated_state

def travel_question_answerer_node(state: TravelState) -> TravelState:
    """
    Node: Answer travel-related questions without creating itinerary
    """
    print("❓ TravelQuestionAnswerer: Answering travel question...")
    
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    
    system_prompt = """
    Bạn là travel expert về du lịch Việt Nam. Trả lời câu hỏi của người dùng một cách chi tiết và hữu ích.
    
    Sau khi trả lời, LUÔN hỏi lại: "Bạn có muốn tôi tạo lộ trình du lịch chi tiết không?"
    
    Trả lời bằng tiếng Việt, ngắn gọn (3-5 câu), dễ hiểu.
    """
    
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=last_message)
    ])
    
    # Add follow-up prompt
    full_response = f"{response.content}\n\n💡 Bạn có muốn tôi tạo lộ trình du lịch chi tiết không?"
    
    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=full_response)],
        "session_stage": "profiling"  # Ready to create itinerary if user wants
    }

def profile_collector_node(state: TravelState) -> TravelState:
    """
    Node 1: Collect user preferences through smart questioning
    """
    print("🔍 ProfileCollector: Analyzing user input and preferences...")
    
    messages = state["messages"]
    preferences = state.get("user_preferences", UserPreferences())
    last_message = messages[-1].content if messages else ""
    
    # CHECK: If user hasn't provided start location, try to detect from user message first
    # IMPORTANT: Start location MUST be provided explicitly by user
    start_location_just_detected = False
    
    if not preferences.departure_location and last_message:
        # Try to geocode the user message - they might be answering our question about start location
        print(f"   🔍 Attempting to geocode user message as start location: '{last_message}'")
        geocoded = geocode_location(last_message)
        if geocoded:
            # Successfully geocoded!
            preferences.departure_location = last_message.strip()
            preferences.departure_coordinates = {"lat": geocoded['lat'], "lng": geocoded['lng']}
            print(f"   ✅ Geocoded start location: {last_message} → ({geocoded['lat']}, {geocoded['lng']})")
            start_location_just_detected = True
        else:
            # Geocoding failed - ask user again
            print(f"   ❌ Geocoding failed for: {last_message}")
            ai_response = f"❌ Không tìm thấy địa điểm '{last_message}'.\n\nVui lòng nhập tên thành phố hoặc địa điểm khác (ví dụ: Hà Nội, TP.HCM, Đà Nẵng, hoặc bất kỳ nơi nào)."
            state["messages"].append(AIMessage(content=ai_response))
            return state
    
    # If still no start location after attempted geocode, ask user
    if not preferences.departure_location:
        # Check if this is first message (no destination asked yet)
        # If yes, ask for start location FIRST
        if not preferences.destination and not preferences.start_location:
            # Very first turn - ask for start location immediately
            print(f"   ❓ First turn - no start location, asking user...")
            ai_response = "Xin chào! 👋 Tôi là AI Travel Assistant của bạn.\n\nĐầu tiên, mình cần biết bạn **muốn khởi hành từ đâu?** 📍\n\nVui lòng nhập tên thành phố hoặc địa điểm (ví dụ: Hà Nội, TP.HCM, Đà Nẵng, 227 Nguyễn văn cừ, v.v.)"
            state["messages"].append(AIMessage(content=ai_response))
            return state
        else:
            # User has destination but no start location yet
            print(f"   ❓ Has destination but no start location - asking user...")
            ai_response = "Còn một thông tin quan trọng nữa - **bạn muốn khởi hành từ đâu?** 📍\n\nVui lòng nhập tên thành phố hoặc địa điểm (ví dụ: Hà Nội, TP.HCM, Đà Nẵng, 227 Nguyễn văn cừ, v.v.)"
            state["messages"].append(AIMessage(content=ai_response))
            return state
    
    # Determine what information we're still missing
    missing_info = []
    # Use destination field, fallback to start_location for backward compatibility
    current_destination = preferences.destination or preferences.start_location
    if not current_destination:
        missing_info.append("destination")
    # Check departure_location (start location)
    if not preferences.departure_location:
        missing_info.append("departure_location")
    # Removed: travel_style - NOT required (doesn't affect ECS score, only for internal mapping)
    if not preferences.group_type:
        missing_info.append("group_type") 
    if not preferences.budget_range:
        missing_info.append("budget_range")
    if not preferences.duration:
        missing_info.append("duration")
    if not preferences.user_mood:
        missing_info.append("user_mood")
    
    # Update preferences based on user input (simple keyword detection)
    # Use model_copy() for Pydantic models
    # IMPORTANT: Parse preferences FIRST before calling LLM
    updated_preferences = preferences.model_copy() if hasattr(preferences, 'model_copy') else preferences.copy()
    
    # Extract info from user message
    user_text = last_message.lower()
    
    # Debug: Track destination preservation
    print(f"   📍 STATE INPUT - destination: {preferences.destination}, start_location: {preferences.start_location}, departure: {preferences.departure_location}")
    
    # CRITICAL: Detect confirmation responses (user answering "yes" to our question)
    # Only consider as confirmation if:
    # 1. Message is short (< 15 chars) AND contains confirmation word
    # 2. OR message is ONLY a confirmation word (like "Muốn", "Có", "Được")
    # IMPORTANT: Don't treat informational messages as confirmations!
    confirmation_keywords = ["có", "được", "muốn", "ok", "okay", "yes", "ừ", "oke", "đồng ý", "vâng"]
    user_text_stripped = user_text.strip().replace(".", "").replace("!", "")
    
    # More strict confirmation check: must be VERY short and match exactly
    is_confirmation = (
        len(user_text_stripped) <= 10 and 
        (user_text_stripped in confirmation_keywords or 
         any(user_text_stripped == word for word in confirmation_keywords))
    )
    
    # If user is just confirming and we already have destination, check if all info is complete
    current_dest = updated_preferences.destination or updated_preferences.start_location
    if is_confirmation and current_dest:
        print(f"   ✅ User confirmed (destination already set: {current_dest})")
        
        # Auto-set departure_location to destination (this is OK, not asking user)
        if not updated_preferences.departure_location:
            updated_preferences.departure_location = current_dest
            print(f"      → Auto-setting departure_location to: {current_dest}")
    
    # Destination detection (IMPORTANT!)
    # Only update if found in current message - preserve existing destination if not mentioned
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
    
    destination_found_in_message = False
    for dest_name, keywords in destination_keywords.items():
        if any(keyword in user_text for keyword in keywords):
            updated_preferences.destination = dest_name
            updated_preferences.start_location = dest_name  # Backward compatibility
            destination_found_in_message = True
            print(f"   ✅ Detected NEW destination in message: {dest_name}")
            break
    
    # If no destination in current message, preserve existing one from state
    if not destination_found_in_message:
        existing_dest = preferences.destination or preferences.start_location
        if existing_dest:
            updated_preferences.destination = existing_dest
            updated_preferences.start_location = existing_dest
            print(f"   🔄 PRESERVED destination from state: {existing_dest}")
    
    # NOTE: Departure location detection removed - no longer asking users for this
    # Departure location will be auto-set to destination in the logic below
    
    # START LOCATION DETECTION (from user input if they're answering the "where are you starting from?" question)
    # Accept ANY string and geocode it to validate
    if not preferences.departure_location and last_message:
        # Try to geocode the entire user message as a location
        # Pass destination context for better geocoding accuracy
        destination_context = updated_preferences.destination or updated_preferences.start_location
        geocoded = geocode_location(last_message, destination_context)
        if geocoded:
            # Successfully geocoded - use this as start location
            updated_preferences.departure_location = last_message.strip()
            updated_preferences.departure_coordinates = {"lat": geocoded['lat'], "lng": geocoded['lng']}
            print(f"   ✅ Geocoded start location from user input: '{last_message}' → ({geocoded['lat']}, {geocoded['lng']})")
        # If geocode fails, we'll ask user again in the "missing_info" logic
    
    # Auto-set departure_location to destination if not set
    # Handle departure_location preservation
    # NOTE: Do NOT auto-set to destination! User MUST explicitly provide start location
    print(f"   🔍 DEBUG: updated_preferences.departure_location = {updated_preferences.departure_location}, preferences.departure_location = {preferences.departure_location}")
    
    if preferences.departure_location:
        # Preserve existing departure_location if set
        updated_preferences.departure_location = preferences.departure_location
        # Also preserve geocoded coordinates
        if preferences.departure_coordinates:
            updated_preferences.departure_coordinates = preferences.departure_coordinates
        print(f"   🔄 PRESERVED departure_location from state: {preferences.departure_location}")
    elif updated_preferences.departure_location:
        # departure_location was just set by geocoding from user message
        print(f"   ✅ departure_location just set in updated_preferences: {updated_preferences.departure_location}")
    
    # Travel style detection
    if any(word in user_text for word in ["chill", "nghỉ dưỡng", "thư giãn", "yên tĩnh"]):
        updated_preferences.travel_style = "chill"
    elif any(word in user_text for word in ["phiêu lưu", "khám phá", "mạo hiểm", "vận động"]):
        updated_preferences.travel_style = "adventure"
    elif any(word in user_text for word in ["văn hóa", "lịch sử", "truyền thống", "bảo tàng"]):
        updated_preferences.travel_style = "cultural"
    elif any(word in user_text for word in ["ăn uống", "ẩm thực", "quán ăn", "món ngon"]):
        updated_preferences.travel_style = "foodie"
    # NOTE: Removed auto-default to allow agent to ask user
    
    # Mood detection from user input
    detected_mood = detect_mood_from_input(last_message)
    if detected_mood:
        updated_preferences.user_mood = detected_mood
        print(f"   ✅ Detected mood from input: {detected_mood}")
    # Preserve existing mood if already set
    elif preferences.user_mood:
        updated_preferences.user_mood = preferences.user_mood
        print(f"   🔄 PRESERVED mood from state: {preferences.user_mood}")
    
    # Group type detection
    # Detect based on number of people first
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
        
    # Duration detection FIRST - support 1-7+ days with regex
    # Try regex pattern first for flexible number detection (e.g., "4 ngày", "5 ngày 4 đêm")
    duration_match = re.search(r'(\d+)\s*ngày', user_text)
    if duration_match:
        num_days = int(duration_match.group(1))
        if num_days == 1:
            updated_preferences.duration = "full_day"
        elif num_days >= 2 and num_days <= 7:
            updated_preferences.duration = f"{num_days}_days"
        elif num_days > 7:
            updated_preferences.duration = "7_days"  # Cap at 7 days
            print(f"   ⚠️ Duration capped at 7 days (user requested {num_days})")
        print(f"   ✅ Detected duration from regex: {num_days} ngày → {updated_preferences.duration}")
    # Fallback to keyword detection
    elif any(word in user_text for word in ["nửa ngày", "buổi sáng", "buổi chiều"]):
        updated_preferences.duration = "half_day"
    elif any(word in user_text for word in ["một ngày", "cả ngày", "1 ngày"]):
        updated_preferences.duration = "full_day"
    elif any(word in user_text for word in ["hai ngày"]):
        updated_preferences.duration = "2_days"
    elif any(word in user_text for word in ["ba ngày"]):
        updated_preferences.duration = "3_days"
    elif any(word in user_text for word in ["bốn ngày"]):
        updated_preferences.duration = "4_days"
    elif any(word in user_text for word in ["năm ngày"]):
        updated_preferences.duration = "5_days"
    elif any(word in user_text for word in ["sáu ngày"]):
        updated_preferences.duration = "6_days"
    elif any(word in user_text for word in ["bảy ngày", "tuần", "1 tuần"]):
        updated_preferences.duration = "7_days"
    
    # NOW Budget detection AFTER duration is known
    # This way we can calculate per-day budget correctly
    budget_amount = None
    
    # Try to extract budget amount (in million VND)
    budget_patterns = [
        r'(\d+)\s*triệu',           # "10 triệu"
        r'(\d+)\s*tr',              # "10tr"
        r'(\d+)\s*million',         # "10 million"
        r'(\d+\.?\d*)\s*triệu',     # "1.5 triệu"
    ]
    
    for pattern in budget_patterns:
        match = re.search(pattern, user_text)
        if match:
            budget_amount = float(match.group(1))
            print(f"   💰 Detected budget: {budget_amount} triệu VND")
            break
    
    # Classify budget based on amount or keywords
    # NOW we have duration info, so we can calculate per-day budget accurately
    if budget_amount:
        # Per day calculation (assume if total budget mentioned)
        # If duration is known, divide by duration
        duration_days = 1
        if updated_preferences.duration:
            if "_" in updated_preferences.duration:
                try:
                    duration_days = int(updated_preferences.duration.split("_")[0])
                except:
                    duration_days = 1
            elif updated_preferences.duration == "half_day":
                duration_days = 0.5
            elif updated_preferences.duration == "full_day":
                duration_days = 1
        
        per_day_budget = budget_amount / duration_days if duration_days > 0 else budget_amount
        print(f"   💰 Budget per day: {per_day_budget:.1f} triệu VND (total: {budget_amount}, days: {duration_days})")
        
        if per_day_budget < 1:
            updated_preferences.budget_range = "budget"
        elif per_day_budget >= 3:
            updated_preferences.budget_range = "luxury"
        else:
            updated_preferences.budget_range = "mid-range"
    elif any(word in user_text for word in ["tiết kiệm", "rẻ", "bình dân", "sinh viên"]):
        updated_preferences.budget_range = "budget"
    elif any(word in user_text for word in ["cao cấp", "sang", "luxury", "đắt tiền"]):
        updated_preferences.budget_range = "luxury"
    # NOTE: Do NOT set default budget_range here - let it remain None
    # This ensures the assistant will ask the user to specify their budget
    
    # Determine next stage
    # Use destination field, fallback to start_location for backward compatibility
    has_destination = updated_preferences.destination or updated_preferences.start_location
    is_info_complete = all([
        has_destination,  # MUST have destination!
        updated_preferences.departure_location,  # MUST have start location!
        updated_preferences.group_type, 
        updated_preferences.budget_range,
        updated_preferences.duration,
        updated_preferences.user_mood  # MUST have mood! (affects ECS threshold)
    ])
    
    # If user confirmed with complete info, go straight to planning
    if is_confirmation and has_destination and is_info_complete:
        print(f"   🚀 User confirmed with complete info → Going to planning")
        
        return {
            **state,
            "user_preferences": updated_preferences,
            "session_stage": "planning"
        }
    
    # NOW call LLM with UPDATED preferences to generate natural response
    missing_fields = []
    
    # SEQUENTIAL QUESTIONING - Ask ONE field at a time in priority order
    # Priority: destination → departure → duration → group → budget → MOOD (LAST!)
    # CRITICAL: ONLY add the FIRST missing field, not all missing fields!
    
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not updated_preferences.departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not updated_preferences.duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not updated_preferences.group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not updated_preferences.budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not updated_preferences.user_mood:
        # MOOD IS LAST - only ask when all others are done!
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    missing_info = ", ".join(missing_fields) if missing_fields else "Đã đủ"
    
    # Create mood options string for system prompt
    mood_options_str = "\n".join([f"  - {mood}" for mood in AVAILABLE_MOODS])
    
    system_prompt = f"""
    Bạn là một AI travel assistant thông minh. Nhiệm vụ của bạn là thu thập thông tin về sở thích du lịch của khách hàng một cách tự nhiên.
    
    Thông tin hiện tại về khách hàng:
    - Điểm đến: {updated_preferences.destination or updated_preferences.start_location or "Chưa biết"}
    - Nhóm đi: {updated_preferences.group_type or "Chưa biết"}  
    - Ngân sách: {updated_preferences.budget_range or "Chưa biết"} ⭐ (CẦN THIẾT - ảnh hưởng đến lựa chọn địa điểm và quán ăn)
    - Thời gian: {updated_preferences.duration or "Chưa biết"}
    - Tâm trạng/Mood: {updated_preferences.user_mood or "Chưa biết"} ⭐ (ĐẶC BIỆT QUAN TRỌNG - ảnh hưởng đến chất lượng lộ trình)
    
    Các ngân sách có sẵn:
    - "Tiết kiệm" (< 1 triệu VND/ngày): quán ăn bình dân, chỗ ở rẻ
    - "Trung bình" (1-3 triệu VND/ngày): quán ăn 3-4 sao, khách sạn 2-3 sao
    - "Cao cấp" (> 3 triệu VND/ngày): quán hàng đầu, khách sạn 4-5 sao
    
    Các mood có sẵn (hãy giúp khách chọn một):
{mood_options_str}
    
    Tin nhắn mới nhất của khách: "{last_message}"
    
    Thông tin còn thiếu: {missing_info}
    
    HƯỚNG DẪN:
    - Nếu khách trả lời "có", "muốn", "được", "ok" SAU KHI đã có đầy đủ tất cả thông tin → Nói sẽ tạo lộ trình
    - Nếu còn thiếu thông tin → Hỏi những trường còn thiếu một cách tự nhiên
    - ⭐ HỎI TUẦN TỰ - Chỉ hỏi MỘT trường còn thiếu duy nhất, không hỏi nhiều cái cùng lúc!
    - ⭐ NGÂN SÁCH là BẮT BUỘC - không được bỏ qua! Nếu khách chưa nói → hỏi cụ thể: "Bạn có ngân sách bao nhiêu cho chuyến du lịch này?"
    - ⭐ Tâm trạng/MOOD phải HỎI CUỐI CÙNG, sau khi tất cả các trường khác (điểm đến, khởi hành, thời gian, nhóm đi, ngân sách) đã có!
    - Tâm trạng/mood ảnh hưởng trực tiếp đến mức độ chất lượng của các địa điểm được chọn
    - Hỏi tự nhiên, thân thiện, lồng ghép các câu hỏi
    - Khi hỏi về tâm trạng/mood, giới thiệu ngắn gọn các lựa chọn
    - Ví dụ: "Bạn muốn đi với tâm trạng nào - yên tĩnh & thư giãn, náo nhiệt & xã hội, hay mạo hiểm & thú vị?"
    - Chỉ hỏi những trường CHƯA CÓ, không hỏi lại những trường đã có
    
    Trả lời bằng tiếng Việt, thân thiện.
    """
    
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=last_message)
    ])
    
    next_stage = "planning" if is_info_complete else "profiling"
    
    print(f"   📍 STATE OUTPUT - destination: {updated_preferences.destination}, departure: {updated_preferences.departure_location}")
    print(f"   ℹ️  Info complete: {is_info_complete}, next stage: {next_stage}")
    
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
    
    # Use user-selected mood if available, otherwise auto-map from travel_style + group_type
    if preferences.user_mood:
        user_mood = preferences.user_mood
        print(f"   ✅ Using user-selected mood: {user_mood}")
    else:
        # Fallback to auto-mapping (shouldn't happen if user_mood is required)
        user_mood = map_preferences_to_mood(
            preferences.travel_style or "cultural",
            preferences.group_type or "solo"
        )
        preferences.user_mood = user_mood
        print(f"   → Auto-mapped mood (fallback): {user_mood} (from {preferences.travel_style} + {preferences.group_type})")
    
    # Get destination (location filter) - use destination field, fallback to start_location
    destination = preferences.destination or preferences.start_location or "Hà Nội"
    departure = preferences.departure_location or destination  # Default to destination if not set
    print(f"   → Destination: {destination}, Departure: {departure}")
    
    # Search for places based on preferences WITH location filter
    # Parse duration to days FIRST - support up to 7 days (needed for POI calculation)
    duration_map = {
        "half_day": 1,
        "full_day": 1,
        "2_days": 2,
        "3_days": 3,
        "4_days": 4,
        "5_days": 5,
        "6_days": 6,
        "7_days": 7
    }
    duration_days = duration_map.get(preferences.duration, 1)
    print(f"   → Duration: {preferences.duration} → {duration_days} days")
    
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
    
    # Calculate how many places to fetch based on duration (minimum 3 per day)
    min_places_needed = duration_days * 3
    places_per_query = max(15, min_places_needed // len(search_queries) + 5)
    print(f"   → Fetching at least {min_places_needed} places ({places_per_query} per query) for {duration_days} days")
    
    # Collect places from multiple searches with location filter
    all_places = []
    for query in search_queries:
        # Add location filter to search
        places = search_places.invoke({
            "query": query, 
            "location_filter": destination,
            "limit": places_per_query
        })
        all_places.extend(places[:min(10, len(places))])  # Take more places to ensure minimum 3 per day
    
    print(f"   → Found {len(all_places)} places before deduplication (need at least {min_places_needed})")
    
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
    
    # Get destination center (use first place's location as reference point)
    # This is used by AI Optimizer to filter POIs within radius
    destination_center = {"lat": 21.0285, "lng": 105.8542}  # Default to Hanoi
    if unique_places:
        first_place_loc = unique_places[0].get("location", {})
        if first_place_loc.get("lat") and first_place_loc.get("lng"):
            destination_center = {
                "lat": first_place_loc["lat"],
                "lng": first_place_loc["lng"]
            }
            print(f"   → Using destination center from first place: {destination_center}")
    
    # Get user's current location (departure point for route calculation)
    # Priority: departure_coordinates > user_location > destination_center > default
    current_location = {"lat": 21.0285, "lng": 105.8542}  # Default to Hanoi
    
    # Use geocoded departure coordinates if available
    if preferences.departure_coordinates:
        current_location = {
            "lat": preferences.departure_coordinates.get("lat", 21.0285),
            "lng": preferences.departure_coordinates.get("lng", 105.8542)
        }
        print(f"   → Using departure coordinates as start point: {current_location}")
    elif state.get("user_location"):
        # Parse user_location if provided (format: "lat,lng" or location name)
        try:
            parts = state["user_location"].split(",")
            if len(parts) == 2:
                current_location = {"lat": float(parts[0]), "lng": float(parts[1])}
                print(f"   → User current location: {current_location}")
        except:
            pass
    
    # Get start datetime (default to tomorrow 9 AM)
    start_datetime = state.get("travel_date")
    if not start_datetime:
        tomorrow = datetime.now() + timedelta(days=1)
        start_datetime = tomorrow.replace(hour=9, minute=0, second=0).isoformat()
    elif isinstance(start_datetime, datetime):
        # Convert datetime object to ISO string if needed
        start_datetime = start_datetime.isoformat()
    
    # Call AI Optimizer Service with adaptive ECS threshold
    # Start with a reasonable threshold and adjust based on max 4 places/day
    print(f"   → Calling AI Optimizer with {len(unique_places)} places, {duration_days} days")
    
    # Calculate target: 4 places per day is ideal
    target_places = min(duration_days * 4, len(unique_places))
    print(f"   → Target places: {target_places} (max 4/day for {duration_days} days)")
    
    # Map user_mood to ECS threshold (no longer hardcoded 0.5)
    initial_ecs_threshold = map_mood_to_ecs_threshold(user_mood)
    print(f"   → User mood: {user_mood} → ECS threshold: {initial_ecs_threshold}")
    
    optimizer_result = optimize_route_with_ecs.invoke({
        "places": unique_places,
        "user_mood": user_mood,
        "duration_days": duration_days,
        "current_location": destination_center,  # Use destination center for POI filtering
        "start_datetime": start_datetime,
        "ecs_score_threshold": initial_ecs_threshold
    })
    
    # Extract optimized route
    optimized_route = optimizer_result.get("optimized_route", [])
    
    # Adaptive ECS threshold: if too many places, increase threshold to reduce quantity
    if optimized_route:
        total_places_in_route = sum(len(day.get("activities", [])) for day in optimized_route)
        print(f"   → Initial result: {total_places_in_route} places across {len(optimized_route)} days")
        
        # If more than 4 places per day on average, increase threshold and retry
        avg_places_per_day = total_places_in_route / duration_days if duration_days > 0 else 0
        if avg_places_per_day > 4:
            print(f"   ⚠️  Too many places: {avg_places_per_day:.1f}/day (target: 4/day)")
            
            # Increase threshold gradually to reduce quantity
            # ECS 0.5 → 0.6 → 0.7 → 0.8 based on how many extra places
            excess_ratio = (avg_places_per_day - 4) / 4  # How much above 4
            adjusted_threshold = min(0.9, initial_ecs_threshold + (excess_ratio * 0.3))
            
            print(f"   → Retrying with higher ECS threshold: {adjusted_threshold:.2f}")
            
            optimizer_result = optimize_route_with_ecs.invoke({
                "places": unique_places,
                "user_mood": user_mood,
                "duration_days": duration_days,
                "current_location": destination_center,
                "start_datetime": start_datetime,
                "ecs_score_threshold": adjusted_threshold
            })
            
            optimized_route = optimizer_result.get("optimized_route", [])
            total_places_in_route = sum(len(day.get("activities", [])) for day in optimized_route)
            print(f"   ✅ Adjusted result: {total_places_in_route} places ({total_places_in_route / duration_days:.1f}/day)")
    
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
        # Get Google API key for directions
        google_api_key = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_DIRECTIONS_API_KEY")
        
        # Helper function to extract lat/lng from various formats
        def extract_coords(loc):
            """Extract (lat, lng) from various location formats"""
            if not loc:
                return None, None
            
            # Format 1: Dict with lat/lng keys
            if isinstance(loc, dict):
                lat = loc.get("lat") or loc.get("latitude")
                lng = loc.get("lng") or loc.get("longitude")
                if lat is not None and lng is not None:
                    return float(lat), float(lng)
                
                # Format 2: Dict with coordinates array (GeoJSON)
                if "coordinates" in loc and isinstance(loc["coordinates"], (list, tuple)):
                    coords = loc["coordinates"]
                    if len(coords) >= 2:
                        # GeoJSON is [lng, lat], so swap if needed
                        return float(coords[1]), float(coords[0])
            
            # Format 3: Direct list/tuple [lat, lng]
            if isinstance(loc, (list, tuple)) and len(loc) >= 2:
                try:
                    return float(loc[0]), float(loc[1])
                except:
                    pass
            
            return None, None
        
        itinerary = []
        is_first_activity_overall = True  # Track if this is the first activity of the entire itinerary
        
        for day_data in optimized_route:
            day_num = day_data.get("day", 1)
            day_activities = day_data.get("activities", [])
            
            # Add polyline from start location to first activity of the entire itinerary
            if is_first_activity_overall and day_activities and preferences.departure_coordinates and google_api_key:
                try:
                    start_coords = preferences.departure_coordinates
                    first_activity_loc = day_activities[0].get("location", {})
                    
                    print(f"   📍 [Polyline] START LOCATION: type={type(start_coords)}, value={start_coords}")
                    print(f"   📍 [Polyline] First Activity: type={type(first_activity_loc)}, value={first_activity_loc}")
                    
                    lat_start, lng_start = extract_coords(start_coords)
                    lat_first, lng_first = extract_coords(first_activity_loc)
                    
                    print(f"   📍 [Polyline] START → FIRST: ({lat_start}, {lng_start}) → ({lat_first}, {lng_first})")
                    
                    if all([lat_start is not None, lng_start is not None, lat_first is not None, lng_first is not None]):
                        # Call Google Directions API
                        directions_url = f"https://maps.googleapis.com/maps/api/directions/json?origin={lat_start},{lng_start}&destination={lat_first},{lng_first}&mode=driving&key={google_api_key}"
                        print(f"   🌐 [Polyline START→FIRST] Calling API...")
                        try:
                            resp = requests.get(directions_url, timeout=5)
                            if resp.status_code == 200:
                                data = resp.json()
                                if data.get("routes"):
                                    polyline = data["routes"][0].get("overview_polyline", {}).get("points")
                                    duration = data["routes"][0].get("legs", [{}])[0].get("duration", {}).get("value", 0)
                                    
                                    # Store polyline for first activity (it will be used for start_location polyline)
                                    if polyline:
                                        day_activities[0]["start_location_polyline"] = polyline
                                        day_activities[0]["travel_duration_from_start"] = duration // 60 if duration > 0 else 0
                                        print(f"   ✅ [Polyline START→FIRST] SUCCESS! Length: {len(polyline)}")
                                        is_first_activity_overall = False  # Mark that we've processed the first activity
                        except Exception as e:
                            print(f"   ⚠️ [Polyline START→FIRST] Request failed: {e}")
                except Exception as e:
                    print(f"   ❌ [Polyline START→FIRST] Error: {e}")
            else:
                is_first_activity_overall = False  # Mark that we've passed the first day


            
            for idx, activity in enumerate(day_activities):
                activity_item = {
                    "day": day_num,
                    "time": activity.get("estimated_arrival", "09:00").split("T")[1][:5] if "T" in activity.get("estimated_arrival", "") else "09:00",
                    "activity": "Tham quan",
                    "place": activity,
                    "duration_minutes": activity.get("visit_duration_minutes", 90),
                    "estimated_arrival": activity.get("estimated_arrival"),
                    "estimated_departure": activity.get("estimated_departure"),
                    "ecs_score": activity.get("ecs_score"),
                    "google_place_id": activity.get("google_place_id"),
                }
                
                # Add start_location_polyline if it exists (polyline from start location to first activity)
                if activity.get("start_location_polyline"):
                    activity_item["start_location_polyline"] = activity.get("start_location_polyline")
                    activity_item["travel_duration_from_start"] = activity.get("travel_duration_from_start", 0)
                
                # Add encoded polyline for travel between this activity and the next one
                if idx < len(day_activities) - 1 and google_api_key:
                    next_activity = day_activities[idx + 1]
                    try:
                        current_loc = activity.get("location", {})
                        next_loc = next_activity.get("location", {})
                        
                        print(f"   📍 [Polyline] Activity {idx}: current_loc type={type(current_loc)}, value={current_loc}")
                        print(f"   📍 [Polyline] Next activity: next_loc type={type(next_loc)}, value={next_loc}")
                        
                        lat1, lng1 = extract_coords(current_loc)
                        lat2, lng2 = extract_coords(next_loc)
                        
                        print(f"   📍 [Polyline] Extracted coords: ({lat1}, {lng1}) → ({lat2}, {lng2})")
                        
                        if all([lat1 is not None, lng1 is not None, lat2 is not None, lng2 is not None]):
                            # Call Google Directions API
                            directions_url = f"https://maps.googleapis.com/maps/api/directions/json?origin={lat1},{lng1}&destination={lat2},{lng2}&mode=driving&key={google_api_key}"
                            print(f"   🌐 [Polyline] Calling API: {directions_url[:80]}...")
                            try:
                                resp = requests.get(directions_url, timeout=5)
                                print(f"   📡 [Polyline] Response: {resp.status_code}")
                                
                                if resp.status_code == 200:
                                    data = resp.json()
                                    print(f"   ✓ [Polyline] API returned: status={data.get('status')}, routes={len(data.get('routes', []))}")
                                    
                                    if data.get("routes"):
                                        polyline = data["routes"][0].get("overview_polyline", {}).get("points")
                                        duration = data["routes"][0].get("legs", [{}])[0].get("duration", {}).get("value", 0)
                                        
                                        if polyline:
                                            activity_item["encoded_polyline"] = polyline
                                            activity_item["travel_duration_minutes"] = duration // 60 if duration > 0 else 0
                                            print(f"   ✅ [Polyline] SUCCESS! Length: {len(polyline)}, Duration: {activity_item['travel_duration_minutes']} mins")
                                        else:
                                            print(f"   ⚠️ [Polyline] No polyline in overview_polyline")
                                    else:
                                        print(f"   ⚠️ [Polyline] No routes: {data.get('status', 'Unknown error')}")
                                else:
                                    print(f"   ❌ [Polyline] API error: {resp.status_code}")
                                    print(f"      Response: {resp.text[:200]}")
                            except Exception as e:
                                print(f"   ⚠️ [Polyline] Request failed: {e}")
                        else:
                            print(f"   ⚠️ [Polyline] Invalid coords - lat1:{lat1}, lng1:{lng1}, lat2:{lat2}, lng2:{lng2}")
                    except Exception as e:
                        print(f"   ❌ [Polyline] Error processing: {e}")
                        import traceback
                        traceback.print_exc()
                
                itinerary.append(activity_item)
    
    # Generate explanation
    total_places = len(itinerary)
    days_count = len(optimized_route) if optimized_route else 1
    
    explanation = f"""
    🎯 **Lộ trình được tối ưu hóa bởi AI dựa trên:**
    - 📍 Điểm đến: {destination}
    - 🚀 Xuất phát từ: {departure}
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
    
    # Store departure_location in state for route calculation later
    # Format user_location as "lat,lng" string for route calculation
    user_location_str = None
    if preferences.departure_coordinates:
        lat = preferences.departure_coordinates.get("lat")
        lng = preferences.departure_coordinates.get("lng")
        if lat is not None and lng is not None:
            user_location_str = f"{lat},{lng}"
    
    return {
        **state,
        "current_itinerary": itinerary,
        "user_preferences": preferences,  # Update with mood
        "user_location": user_location_str,  # Store departure coordinates as "lat,lng" string for route calculation
        "departure_coordinates": preferences.departure_coordinates,  # Also store coordinates dict
        "optimization_applied": True,  # Mark as optimized
        "session_stage": "optimizing",
        "itinerary_status": "DRAFT",  # New itinerary starts as DRAFT
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

def itinerary_modifier_node(state: TravelState) -> TravelState:
    """
    Node: Modify existing itinerary based on user request
    """
    print("✏️ ItineraryModifier: Processing modification request...")
    
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    current_itinerary = state.get("current_itinerary", [])
    itinerary_id = state.get("itinerary_id")
    
    # CRITICAL: If we have itinerary_id but no current_itinerary, fetch from database
    if itinerary_id and not current_itinerary:
        print(f"   ⚠️  No current_itinerary in state but have itinerary_id: {itinerary_id}")
        print(f"   🔄 Fetching itinerary from database...")
        
        try:
            from pymongo import MongoClient
            import os
            
            # Connect to MongoDB
            mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
            client = MongoClient(mongo_uri)
            db = client["travel_planner"]
            collection = db["ai_itineraries"]
            
            # Fetch itinerary by ID
            from bson import ObjectId
            itinerary_doc = collection.find_one({"_id": ObjectId(itinerary_id)})
            
            if itinerary_doc and "itinerary" in itinerary_doc:
                current_itinerary = itinerary_doc["itinerary"]
                print(f"   ✅ Fetched {len(current_itinerary)} places from database")
            else:
                print(f"   ❌ Itinerary not found in database: {itinerary_id}")
                return {
                    **state,
                    "messages": state["messages"] + [AIMessage(content="❌ Không tìm thấy lộ trình. Vui lòng tạo lộ trình mới.")],
                    "session_stage": "error"
                }
        except Exception as e:
            print(f"   ❌ Error fetching itinerary from database: {e}")
            return {
                **state,
                "messages": state["messages"] + [AIMessage(content=f"❌ Lỗi khi tải lộ trình: {str(e)}")],
                "session_stage": "error"
            }
    
    # Check if we still don't have itinerary
    if not current_itinerary:
        print(f"   ❌ No itinerary to modify!")
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content="❌ Bạn chưa có lộ trình nào. Vui lòng tạo lộ trình mới trước.")],
            "session_stage": "error"
        }
    
    # Parse modification request
    system_prompt = """
    Bạn là AI assistant chuyên parse yêu cầu chỉnh sửa lộ trình.
    
    Phân tích yêu cầu và trả về JSON format:
    {
        "action": "add" | "remove" | "replace",
        "place_name": "tên địa điểm",
        "day": số ngày (nếu có),
        "replace_with": "địa điểm mới" (nếu action = replace)
    }
    
    Ví dụ:
    - "Bỏ Chùa Linh Ứng" → {"action": "remove", "place_name": "Chùa Linh Ứng"}
    - "Thêm Bà Nà Hills vào ngày 2" → {"action": "add", "place_name": "Bà Nà Hills", "day": 2}
    - "Thay VinWonders bằng Hội An" → {"action": "replace", "place_name": "VinWonders", "replace_with": "Hội An"}
    
    Chỉ trả về JSON, không giải thích.
    """
    
    # Simple keyword-based modification (more reliable than JSON parsing)
    user_text = last_message.lower()
    updated_itinerary = current_itinerary.copy()
    response_msg = ""
    
    print(f"   📝 User message (lowercased): '{user_text}'")
    
    # Check if user is confirming a previous duplicate warning
    is_confirmation = any(word in user_text[:10] for word in ["có", "được", "yes", "ok", "chắc chắn"]) and "thêm" in user_text
    
    try:
        # PRIORITY: Handle confirmation of duplicate add
        if is_confirmation:
            # Extract place name from confirmation message
            place_query = user_text
            confirm_words = ["có", "được", "yes", "ok", "chắc chắn", "thêm", "vào", "lộ trình", ",", "."]
            for word in confirm_words:
                place_query = place_query.replace(word, " ")
            place_query = " ".join(place_query.split()).strip()
            
            print(f"   ✅ User confirmed to add duplicate: '{place_query}'")
            
            # Search and add the place (force add even if duplicate)
            try:
                from pymongo import MongoClient
                import os
                
                MONGO_URI = os.getenv("MONGO_URI")
                DB_NAME = os.getenv("DATABASE_NAME")
                mongo_client = MongoClient(MONGO_URI)
                mongo_db = mongo_client[DB_NAME]
                places_coll = mongo_db["places"]
                
                # Use fuzzy search with word overlap scoring
                query_words = set(place_query.lower().split())
                all_places = list(places_coll.find())
                
                best_match = None
                best_score = 0.0
                for p in all_places:
                    place_name = p.get("name", "")
                    place_words = set(place_name.lower().split())
                    common = query_words.intersection(place_words)
                    score = len(common) / len(query_words) if query_words else 0
                    if score > best_score:
                        best_score = score
                        best_match = p
                
                print(f"   🎯 Best match score: {best_score:.2f}")
                found_place = best_match if best_score > 0.3 else None
                
                if found_place:
                    found_place.pop('_id', None)
                    place_data = {
                        "googlePlaceId": found_place.get("googlePlaceId", ""),
                        "name": found_place.get("name", place_query),
                        "address": found_place.get("address", ""),
                        "formatted_address": found_place.get("formatted_address", found_place.get("address", "")),
                        "type": found_place.get("type", "tourist_attraction"),
                        "location": found_place.get("location", {}),
                        "budgetRange": found_place.get("budgetRange", "mid-range"),
                        "emotionalTags": found_place.get("emotionalTags", {}),
                        "openingHours": found_place.get("openingHours", found_place.get("regularOpeningHours", {})),
                        "rating": found_place.get("rating"),
                        "user_ratings_total": found_place.get("user_ratings_total"),
                        "photos": found_place.get("photos", []),
                        "description": found_place.get("description", ""),
                        "visit_duration_minutes": found_place.get("visit_duration_minutes", 90),
                        "priceLevel": found_place.get("priceLevel"),
                        "phone": found_place.get("phone", ""),
                        "website": found_place.get("website", "")
                    }
                    
                    new_item = {
                        "day": len(updated_itinerary) // 3 + 1,
                        "time": "14:00",
                        "activity": "Tham quan",
                        "place": place_data,
                        "duration_minutes": place_data.get("visit_duration_minutes", 90),
                        "notes": "Địa điểm được thêm bởi người dùng (confirmed duplicate)"
                    }
                    
                    updated_itinerary.append(new_item)
                    response_msg = f"✅ Đã thêm **{place_data['name']}** vào lộ trình (lần 2).\n\n📋 Lộ trình hiện có {len(updated_itinerary)} địa điểm."
                else:
                    response_msg = f"❌ Không tìm thấy địa điểm '{place_query}' để thêm."
            except Exception as e:
                print(f"   ❌ Error adding confirmed place: {e}")
                response_msg = f"❌ Không thể thêm địa điểm. Vui lòng thử lại."
            
            # Return immediately after handling confirmation - don't continue to ADD/REMOVE logic
            return {
                **state,
                "messages": state["messages"] + [AIMessage(content=response_msg)],
                "current_itinerary": updated_itinerary,
                "stage": "modified"
            }
        
        # REMOVE action
        elif any(word in user_text for word in ["bỏ", "xóa", "xoá", "remove", "loại"]):
            # Check if itinerary is CONFIRMED - if so, cannot modify
            itinerary_status = state.get("itinerary_status", "DRAFT")
            if itinerary_status == "CONFIRMED":
                response_msg = "❌ Lộ trình đã được xác nhận (CONFIRMED). Bạn không thể xóa địa điểm khỏi lộ trình đã xác nhận.\n\n💡 Nếu muốn chỉnh sửa, bạn cần tạo lộ trình mới."
                print(f"   ⛔ Cannot remove: itinerary is {itinerary_status}")
                return {
                    **state,
                    "messages": state["messages"] + [AIMessage(content=response_msg)],
                    "session_stage": "profiling"  # Keep current stage, don't proceed to planning
                }
            
            # Extract place name - simple approach: remove action keywords and get the main text
            place_query = user_text
            remove_words = ["bỏ", "xóa", "remove", "loại", "ra", "khỏi", "lộ trình", "itinerary", "đi", "muốn", "tôi"]
            for word in remove_words:
                place_query = place_query.replace(word, " ")
            place_query = " ".join(place_query.split()).strip()  # Clean whitespace
            
            print(f"   🔍 Looking for place to remove: '{place_query}'")
            
            # Fuzzy matching: Find best match using word overlap
            best_match = None
            best_score = 0
            query_words = set([w.lower() for w in place_query.split() if len(w) >= 2])
            
            # Check for exact matches first (to handle ambiguous cases)
            exact_matches = []
            partial_matches = []  # Places that contain the query words
            
            for item in current_itinerary:
                place_name = item.get("place", {}).get("name", "")
                place_name_lower = place_name.lower()
                
                # Exact match (100%)
                if place_name_lower == place_query.lower():
                    exact_matches.append(item)
                # Partial match (contains query words)
                elif all(word in place_name_lower for word in query_words) and query_words:
                    partial_matches.append(item)
            
            # If multiple exact OR partial matches, ask user to clarify
            matches_to_check = exact_matches if exact_matches else partial_matches
            if len(matches_to_check) > 1:
                response_msg = f"⚠️ Có {len(matches_to_check)} '{place_query}' trong lộ trình. Bạn muốn xóa cái nào?\n\n📍 Vị trí trong lộ trình:\n"
                for idx, item in enumerate(matches_to_check, 1):
                    day = item.get("day", 1)
                    arrival = item.get("time", item.get("estimated_arrival", "TBD"))
                    place_name = item.get("place", {}).get("name", "")
                    response_msg += f"{idx}. {place_name} - Ngày {day} lúc {arrival}\n"
                response_msg += f"\n💡 Vui lòng nói cụ thể: 'Xóa {place_query} ngày X' hoặc 'Xóa tên đầy đủ'"
                return {
                    **state,
                    "messages": state["messages"] + [AIMessage(content=response_msg)],
                    "session_stage": "profiling"
                }
            
            # Use exact or partial match if found (single match)
            if exact_matches:
                best_match = exact_matches[0]
                best_score = 1.0
            elif partial_matches:
                best_match = partial_matches[0]
                best_score = 0.9
            else:
                best_match = None
                best_score = 0
                # Fuzzy matching: Find best match using word overlap
                for item in current_itinerary:
                    place_name = item.get("place", {}).get("name", "")
                    place_words = set([w.lower() for w in place_name.split() if len(w) >= 2])
                    
                    # Calculate word overlap score
                    common_words = query_words.intersection(place_words)
                    if common_words:
                        score = len(common_words) / max(len(query_words), 1)
                        if score > best_score:
                            best_score = score
                            best_match = item
            
            # Accept match if score > 0.3 (at least 30% word overlap) or exact/partial match
            if best_match and best_score >= 0.3:
                place_name = best_match.get("place", {}).get("name", "")
                updated_itinerary = [
                    it for it in updated_itinerary 
                    if it.get("place", {}).get("name", "") != place_name
                ]
                response_msg = f"✅ Đã xóa **{place_name}** khỏi lộ trình.\n\n📋 Lộ trình còn lại {len(updated_itinerary)} địa điểm."
                print(f"   ✅ Removed: {place_name} (match score: {best_score:.2f})")
            else:
                # Show available places to help user
                places_list = [item.get("place", {}).get("name", "") for item in current_itinerary if item.get("place")]
                response_msg = f"❌ Không tìm thấy địa điểm '{place_query}' trong lộ trình.\n\n📍 Các địa điểm hiện có:\n" + "\n".join([f"• {p}" for p in places_list[:10]])
        
        # ADD action
        elif any(word in user_text for word in ["thêm", "add", "bổ sung"]):
            # Check if itinerary is CONFIRMED - if so, cannot modify
            itinerary_status = state.get("itinerary_status", "DRAFT")
            if itinerary_status == "CONFIRMED":
                response_msg = "❌ Lộ trình đã được xác nhận (CONFIRMED). Bạn không thể thêm địa điểm vào lộ trình đã xác nhận.\n\n💡 Nếu muốn chỉnh sửa, bạn cần tạo lộ trình mới."
                print(f"   ⛔ Cannot add: itinerary is {itinerary_status}")
                return {
                    **state,
                    "messages": state["messages"] + [AIMessage(content=response_msg)],
                    "session_stage": "profiling"  # Keep current stage, don't proceed to planning
                }
            
            # Extract place name - remove time, day, and action keywords in correct order
            place_query = user_text
            
            # STEP 1: Remove time patterns FIRST (most specific)
            time_patterns = [
                r'lúc \d{1,2}:\d{2}',     # "lúc 14:30"
                r'lúc \d{1,2}h\d{2}',     # "lúc 14h30"
                r'lúc \d{1,2}h',          # "lúc 14h", "lúc 15h"
                r'\d{1,2}:\d{2}',         # "14:30"
                r'\d{1,2}h\d{2}',         # "14h30"
                r'\d{1,2}h',              # "14h", "15h"
                r'buổi sáng',
                r'buổi trưa',
                r'buổi chiều',
                r'buổi tối',
                r'sáng',
                r'trưa',
                r'chiều',
                r'tối'
            ]
            for pattern in time_patterns:
                place_query = re.sub(pattern, '', place_query, flags=re.IGNORECASE)
            
            # STEP 2: Remove day patterns (second most specific)
            day_patterns = [
                r'vào ngày \d+',
                r'ngày \d+',
                r'ngày thứ \d+',
                r'vào ngày đầu',
                r'vào ngày cuối',
                r'ngày đầu',
                r'ngày cuối'
            ]
            for pattern in day_patterns:
                place_query = re.sub(pattern, '', place_query, flags=re.IGNORECASE)
            
            # STEP 3: Remove action keywords (last)
            add_words = ["thêm", "add", "bổ sung", "vào", "vô", "cho", "tôi", "lộ trình", "itinerary", "địa điểm"]
            for word in add_words:
                place_query = place_query.replace(word, " ")
            
            # STEP 4: Clean whitespace
            place_query = " ".join(place_query.split()).strip()
            
            print(f"   ✅ [NEW CODE v2] Successfully cleaned place query")
            print(f"   🔍 Looking for place to add: '{place_query}'")
            
            if len(place_query) < 3:
                response_msg = "❌ Vui lòng cho biết tên địa điểm bạn muốn thêm.\n\nVí dụ: 'Thêm Hồ Tuyền Lâm', 'Thêm Thiền viện Trúc Lâm'"
            else:
                # Search for the place in database with FULL details from MongoDB
                try:
                    from pymongo import MongoClient
                    import os
                    
                    # Connect directly to MongoDB to get complete place data
                    MONGO_URI = os.getenv("MONGO_URI")
                    DB_NAME = os.getenv("DATABASE_NAME")
                    mongo_client = MongoClient(MONGO_URI)
                    mongo_db = mongo_client[DB_NAME]
                    places_coll = mongo_db["places"]
                    
                    preferences = state.get("user_preferences", UserPreferences())
                    location_filter = preferences.start_location or "vietnam"
                    
                    # Build search filter with name and location
                    search_filter = {
                        "name": {"$regex": place_query, "$options": "i"}
                    }
                    
                    # Add location filter if specified
                    if location_filter and location_filter.lower() != "vietnam":
                        search_filter["$or"] = [
                            {"address": {"$regex": location_filter, "$options": "i"}},
                            {"formatted_address": {"$regex": location_filter, "$options": "i"}}
                        ]
                    
                    # Get full place document from database (not projection - get ALL fields)
                    found_place = places_coll.find_one(search_filter)
                    
                    if found_place:
                        # Remove MongoDB _id field and extract complete place data
                        found_place.pop('_id', None)
                        
                        # Ensure all required fields exist with defaults
                        place_data = {
                            "googlePlaceId": found_place.get("googlePlaceId", ""),
                            "name": found_place.get("name", place_query),
                            "address": found_place.get("address", ""),
                            "formatted_address": found_place.get("formatted_address", found_place.get("address", "")),
                            "type": found_place.get("type", "tourist_attraction"),
                            "location": found_place.get("location", {}),
                            "budgetRange": found_place.get("budgetRange", "mid-range"),
                            "emotionalTags": found_place.get("emotionalTags", {}),
                            "openingHours": found_place.get("openingHours", found_place.get("regularOpeningHours", {})),
                            "rating": found_place.get("rating"),
                            "user_ratings_total": found_place.get("user_ratings_total"),
                            "photos": found_place.get("photos", []),
                            "description": found_place.get("description", ""),
                            "visit_duration_minutes": found_place.get("visit_duration_minutes", 90),
                            "priceLevel": found_place.get("priceLevel"),
                            "phone": found_place.get("phone", ""),
                            "website": found_place.get("website", "")
                        }
                        
                        print(f"   ✅ Found place in DB: {place_data['name']} (googlePlaceId: {place_data['googlePlaceId']})")
                        
                        # CHECK IF PLACE ALREADY EXISTS IN ITINERARY
                        place_exists = False
                        for existing_item in updated_itinerary:
                            existing_place = existing_item.get("place", {})
                            # Check by googlePlaceId OR name similarity
                            if existing_place.get("googlePlaceId") == place_data["googlePlaceId"]:
                                place_exists = True
                                break
                            # Check by name similarity (fuzzy match)
                            existing_name_words = set([w.lower() for w in existing_place.get("name", "").split() if len(w) >= 2])
                            new_name_words = set([w.lower() for w in place_data["name"].split() if len(w) >= 2])
                            common = existing_name_words.intersection(new_name_words)
                            if common and len(common) / max(len(new_name_words), 1) > 0.5:  # 50% overlap
                                place_exists = True
                                break
                        
                        if place_exists:
                            # Place already in itinerary - ask for confirmation
                            response_msg = f"⚠️ **{place_data['name']}** đã có trong lộ trình.\n\n❓ Bạn có chắc chắn muốn thêm lại địa điểm này không?\n\n💡 Nếu muốn thêm, hãy nói: 'Có, thêm {place_data['name']}'\n💡 Nếu không, hãy thử địa điểm khác."
                            print(f"   ⚠️  Place already exists, asking for confirmation")
                        else:
                            # Parse target day AND time from user message
                            target_day = None
                            target_time = None
                            user_text_lower = user_text.lower()
                            
                            # Check for explicit day mention
                            day_patterns = [
                                r'ngày (\d+)',
                                r'ngày thứ (\d+)', 
                                r'ngày đầu|ngày 1',
                                r'ngày cuối',
                                r'hôm nay|today',
                            ]
                            
                            for pattern in day_patterns:
                                match = re.search(pattern, user_text_lower)
                                if match:
                                    if 'ngày đầu' in user_text_lower:
                                        target_day = 1
                                    elif 'ngày cuối' in user_text_lower:
                                        # Find max day in current itinerary
                                        target_day = max([item.get("day", 1) for item in updated_itinerary]) if updated_itinerary else 1
                                    elif len(match.groups()) > 0 and match.group(1):
                                        target_day = int(match.group(1))
                                    break
                            
                            # Parse time from user message (if specified)
                            time_patterns = [
                                (r'lúc (\d{1,2}):(\d{2})', 'exact'),  # "lúc 14:30"
                                (r'lúc (\d{1,2})h(\d{2})?', 'hour'),  # "lúc 14h", "lúc 14h30"
                                (r'(\d{1,2}):(\d{2})', 'exact'),      # "14:30"
                                (r'(\d{1,2})h', 'hour'),              # "14h"
                                (r'buổi sáng|sáng', 'morning'),       # "buổi sáng"
                                (r'buổi trưa|trưa', 'noon'),          # "buổi trưa"
                                (r'buổi chiều|chiều', 'afternoon'),   # "buổi chiều"
                                (r'buổi tối|tối', 'evening'),         # "buổi tối"
                            ]
                            
                            for pattern, time_type in time_patterns:
                                match = re.search(pattern, user_text_lower)
                                if match:
                                    if time_type == 'exact':
                                        hour = int(match.group(1))
                                        minute = int(match.group(2))
                                        target_time = f"{hour:02d}:{minute:02d}"
                                    elif time_type == 'hour':
                                        hour = int(match.group(1))
                                        minute = int(match.group(2)) if match.group(2) else 0
                                        target_time = f"{hour:02d}:{minute:02d}"
                                    elif time_type == 'morning':
                                        target_time = "09:00"
                                    elif time_type == 'noon':
                                        target_time = "12:00"
                                    elif time_type == 'afternoon':
                                        target_time = "14:00"
                                    elif time_type == 'evening':
                                        target_time = "18:00"
                                    print(f"   ⏰ Detected time: {target_time}")
                                    break
                            
                            # If no day specified, find day with least POIs (load balancing)
                            if target_day is None and updated_itinerary:
                                from collections import Counter
                                day_counts = Counter([item.get("day", 1) for item in updated_itinerary])
                                max_day = max(day_counts.keys()) if day_counts else 1
                                target_day = min(day_counts, key=day_counts.get)  # Day with least POIs
                                print(f"   🎯 Auto-selected day {target_day} (has {day_counts[target_day]} POIs)")
                            elif target_day is None:
                                target_day = 1  # Default to day 1 if empty itinerary
                            
                            # If no time specified, find next available slot in that day
                            if target_time is None:
                                # Find latest time in that day
                                day_items = [item for item in updated_itinerary if item.get("day") == target_day]
                                if day_items:
                                    # Parse latest time and add 2 hours
                                    latest_times = []
                                    for item in day_items:
                                        time_str = item.get("time", "09:00")
                                        try:
                                            hour, minute = map(int, time_str.split(":"))
                                            duration = item.get("duration_minutes", 90)
                                            # Calculate departure time
                                            total_minutes = hour * 60 + minute + duration
                                            latest_times.append(total_minutes)
                                        except:
                                            pass
                                    
                                    if latest_times:
                                        latest_minute = max(latest_times)
                                        next_hour = latest_minute // 60
                                        next_minute = latest_minute % 60
                                        target_time = f"{next_hour:02d}:{next_minute:02d}"
                                        print(f"   ⏰ Auto-selected time: {target_time} (after last POI)")
                                    else:
                                        target_time = "09:00"  # Default morning
                                else:
                                    target_time = "09:00"  # Default morning start
                            
                            # Create new itinerary item with COMPLETE place data
                            new_item = {
                                "day": target_day,
                                "time": target_time,
                                "activity": "Tham quan",
                                "place": place_data,
                                "duration_minutes": place_data.get("visit_duration_minutes", 90),
                                "notes": "Địa điểm được thêm bởi người dùng"
                            }
                            
                            updated_itinerary.append(new_item)
                            
                            # IMPORTANT: Sort itinerary by day and time after adding new item
                            def parse_time_to_minutes(time_str):
                                """Convert time string 'HH:MM' to minutes since midnight"""
                                try:
                                    parts = time_str.split(':')
                                    return int(parts[0]) * 60 + int(parts[1])
                                except:
                                    return 0
                            
                            updated_itinerary.sort(key=lambda x: (x.get("day", 1), parse_time_to_minutes(x.get("time", "00:00"))))
                            print(f"   🔄 Sorted itinerary by day and time")
                            
                            # Smart response based on how day/time was selected
                            day_msg = ""
                            time_msg = ""
                            
                            if 'ngày' in user_text_lower and target_day:
                                day_msg = f" vào **ngày {target_day}**"
                            else:
                                day_msg = f" vào **ngày {target_day}** (ngày có ít POI nhất)"
                            
                            if any(keyword in user_text_lower for keyword in ['lúc', 'h', ':', 'sáng', 'trưa', 'chiều', 'tối']):
                                time_msg = f" lúc **{target_time}**"
                            else:
                                time_msg = f" lúc **{target_time}** (sau POI cuối cùng)"
                            
                            response_msg = f"✅ Đã thêm **{place_data['name']}**{day_msg}{time_msg}.\n\n📋 Lộ trình hiện có {len(updated_itinerary)} địa điểm.\n\n💡 Tip:\n• 'Thêm [địa điểm] vào ngày X lúc 14:00'\n• 'Thêm [địa điểm] vào ngày X buổi sáng'"
                            print(f"   ✅ Added place to day {target_day} at {target_time}")
                    else:
                        response_msg = f"❌ Không tìm thấy địa điểm '{place_query}' tại {location_filter}.\n\n💡 Vui lòng thử:\n• Tên khác của địa điểm\n• Tên đầy đủ hơn\n• Kiểm tra chính tả"
                        
                except Exception as search_error:
                    print(f"   ❌ Error adding place: {search_error}")
                    import traceback
                    traceback.print_exc()
                    response_msg = f"❌ Không thể thêm địa điểm '{place_query}'.\n\n💡 Vui lòng thử lại hoặc mô tả rõ hơn."
        
        # REPLACE action  
        elif any(word in user_text for word in ["thay", "đổi", "replace", "change"]):
            response_msg = "✅ Tính năng thay thế địa điểm đang được phát triển.\n\n💡 Bạn có thể:\n• Xóa địa điểm cũ và tạo lộ trình mới\n• Hoặc tạo lộ trình hoàn toàn mới"
        
        else:
            response_msg = "❌ Tôi chưa hiểu yêu cầu chỉnh sửa của bạn.\n\n💡 Bạn có thể nói:\n• 'Bỏ [tên địa điểm]'\n• 'Xóa [tên địa điểm]'\n• 'Thêm [tên địa điểm]'"
        
        return {
            **state,
            "current_itinerary": updated_itinerary,
            "messages": state["messages"] + [AIMessage(content=response_msg)],
            "session_stage": "modified",
            "itinerary": updated_itinerary  # Return modified itinerary to backend
        }
    
    except Exception as e:
        print(f"   ❌ Error parsing modification: {e}")
        error_msg = "❌ Xin lỗi, tôi chưa hiểu yêu cầu của bạn. Bạn có thể nói rõ hơn không?\n\nVí dụ: 'Bỏ Chùa Linh Ứng', 'Thêm Bà Nà Hills vào ngày 2'"
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content=error_msg)]
        }

def live_companion_node(state: TravelState) -> TravelState:
    """
    Node: Live Travel Companion - Answer location-based questions
    Handles: nearby search, travel tips, place info, emergency help
    """
    print("🧭 LiveCompanion: Handling real-time travel question...")
    
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    user_text = last_message.lower()
    
    current_location = state.get("current_location")
    active_place_id = state.get("active_place_id")
    
    print(f"   📍 Current location: {current_location}")
    print(f"   🏛️ Active place: {active_place_id}")
    
    # Default fallback response
    response_text = "🤔 Tôi chưa hiểu rõ câu hỏi của bạn.\n\n💡 Bạn có thể hỏi:\n• Quán cà phê gần đây\n• Nhà hàng xung quanh\n• Ăn gì ở đây ngon?\n• Chỗ nào chụp ảnh đẹp?"
    
    try:
        # Classify companion question type - PRIORITY ORDER MATTERS!
        
        # PRIORITY 1: EMERGENCY SERVICES (check first!)
        if any(word in user_text for word in ["bệnh viện", "hospital", "pharmacy", "nhà thuốc", "hiệu thuốc", "atm", "ngân hàng", "bank", "khẩn cấp", "emergency", "cấp cứu", "công an", "cảnh sát", "police"]):
            # EMERGENCY SERVICES
            print("   🚨 Type: Emergency services")
            
            service_type = "hospital"
            if any(word in user_text for word in ["pharmacy", "nhà thuốc", "hiệu thuốc", "thuốc"]):
                service_type = "pharmacy"
            elif any(word in user_text for word in ["atm", "ngân hàng", "bank", "rút tiền"]):
                service_type = "atm"
            elif any(word in user_text for word in ["police", "công an", "cảnh sát"]):
                service_type = "police"
            
            if not current_location:
                response_text = "🚨 Tôi cần biết vị trí của bạn để tìm dịch vụ gần nhất!\n\n💡 Vui lòng bật GPS."
            else:
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
                            "police": "Công an"
                        }.get(service_type, "Dịch vụ")
                        
                        response_text = f"🚨 **{service_label} gần nhất:**\n\n"
                        for i, service in enumerate(services[:5], 1):
                            name = service.get('name', 'Unknown')
                            distance = service.get('distance_km', 0)
                            response_text += f"{i}. **{name}** ({distance:.1f}km)\n"
                            if service.get('address'):
                                response_text += f"   📍 {service.get('address')}\n"
                            response_text += "\n"
                    else:
                        service_label_vn = {
                            "hospital": "bệnh viện",
                            "pharmacy": "nhà thuốc",
                            "atm": "ATM",
                            "police": "đồn công an"
                        }.get(service_type, "dịch vụ")
                        
                        response_text = f"😔 Xin lỗi, không tìm thấy {service_label_vn} trong cơ sở dữ liệu.\n\n"
                        response_text += "🚨 **Số điện thoại khẩn cấp:**\n"
                        response_text += "• Cấp cứu: 115\n"
                        response_text += "• Công an: 113\n"
                        response_text += "• Cứu hỏa: 114\n"
                        response_text += "• Tổng đài du lịch: 1800-1008"
                except Exception as e:
                    print(f"   ❌ Error in emergency services: {e}")
                    response_text = "🚨 **Số điện thoại khẩn cấp:**\n\n"
                    response_text += "• Cấp cứu: 115\n"
                    response_text += "• Công an: 113\n"
                    response_text += "• Cứu hỏa: 114"
        
        # PRIORITY 2: NEARBY SEARCH (general places)
        elif any(word in user_text for word in ["gần đây", "nearby", "xung quanh", "quanh đây", "gần"]):
            # NEARBY SEARCH
            print("   🔍 Type: Nearby search")
            
            if not current_location:
                response_text = "📍 **Tôi cần biết vị trí của bạn để tìm địa điểm gần đây.**\n\n💡 Vui lòng:\n1. Bật GPS trên điện thoại\n2. Cho phép app truy cập vị trí\n3. Hoặc cho tôi biết bạn đang ở khu vực nào?"
            else:
                # Detect category from query
                category = None
                if any(word in user_text for word in ["ăn", "quán ăn", "nhà hàng", "food", "restaurant"]):
                    category = "restaurant"
                elif any(word in user_text for word in ["cà phê", "cafe", "coffee"]):
                    category = "cafe"
                elif any(word in user_text for word in ["mua sắm", "shop", "chợ"]):
                    category = "shopping"
                elif any(word in user_text for word in ["tham quan", "du lịch", "attraction"]):
                    category = "attraction"
                
                # Call the tool using .invoke()
                from tools import search_nearby_places
                nearby_places = search_nearby_places.invoke({
                    "current_location": current_location,
                    "radius_km": 2.0,
                    "category": category,
                    "limit": 5
                })
                
                if nearby_places and len(nearby_places) > 0:
                    # Translate category to Vietnamese
                    category_vn = {
                        'restaurant': 'nhà hàng',
                        'cafe': 'quán cà phê',
                        'shopping': 'mua sắm',
                        'attraction': 'tham quan'
                    }.get(category, category or 'địa điểm')
                    
                    response_text = f"📍 **Các {category_vn} gần bạn:**\n\n"
                    for i, place in enumerate(nearby_places, 1):
                        name = place.get('name', 'Unknown')
                        distance = place.get('distance_km', 0)
                        rating = place.get('rating', 'N/A')
                        response_text += f"{i}. **{name}** ({distance:.1f}km)\n"
                        response_text += f"   ⭐ {rating} | {place.get('type', '')}\n"
                        if place.get('address'):
                            response_text += f"   📍 {place.get('address')}\n"
                        response_text += "\n"
                else:
                    # More helpful error message with suggestions
                    category_vn = {
                        'restaurant': 'nhà hàng',
                        'cafe': 'quán cà phê',
                        'shopping': 'địa điểm mua sắm',
                        'attraction': 'điểm tham quan'
                    }.get(category, 'địa điểm')
                    
                    # Check if user is in Vietnam area
                    lat = current_location.get('lat', 0)
                    lng = current_location.get('lng', 0)
                    is_in_vietnam = (10 <= lat <= 24) and (102 <= lng <= 110)
                    
                    if not is_in_vietnam:
                        response_text = f"📍 **Xin lỗi, hiện tại tôi chỉ hỗ trợ tìm kiếm địa điểm tại Việt Nam.**\n\n"
                        response_text += f"Vị trí của bạn: ({lat:.4f}, {lng:.4f})\n\n"
                        response_text += "🇻🇳 **Các khu vực được hỗ trợ:**\n"
                        response_text += "• Hà Nội\n"
                        response_text += "• TP. Hồ Chí Minh\n"
                        response_text += "• Đà Nẵng, Hội An, Huế\n"
                        response_text += "• Nha Trang, Đà Lạt\n"
                        response_text += "• Phú Quốc, Hạ Long, Sa Pa\n\n"
                        response_text += "💡 Nếu bạn đang ở Việt Nam, vui lòng kiểm tra lại GPS."
                    else:
                        response_text = f"😔 Không tìm thấy {category_vn} nào trong bán kính 2km.\n\n"
                        response_text += "💡 **Gợi ý:**\n"
                        response_text += "• Thử mở rộng phạm vi tìm kiếm\n"
                        response_text += "• Hỏi loại địa điểm khác (nhà hàng, quán ăn...)\n"
                        response_text += "• Di chuyển gần trung tâm thành phố hơn"
        
        elif any(word in user_text for word in ["ăn gì", "món gì", "đặc sản", "food", "eat", "quán ăn"]):
            # FOOD TIPS
            print("   🍽️ Type: Food tips")
            
            if not current_location:
                response_text = "🍽️ Tôi cần biết vị trí của bạn để gợi ý món ăn ngon gần đó!\n\n💡 Vui lòng bật GPS."
            else:
                try:
                    # Find nearby restaurants
                    nearby = search_nearby_places.invoke({
                        "current_location": current_location,
                        "category": "restaurant",
                        "radius_km": 2.0,
                        "limit": 5
                    })
                    
                    if nearby and len(nearby) > 0:
                        response_text = "🍽️ **Nhà hàng gần bạn:**\n\n"
                        for i, restaurant in enumerate(nearby, 1):
                            name = restaurant.get('name', 'Unknown')
                            distance = restaurant.get('distance_km', 0)
                            rating = restaurant.get('rating', 'N/A')
                            response_text += f"{i}. **{name}** ({distance:.1f}km)\n"
                            response_text += f"   ⭐ {rating} | {restaurant.get('type', '')}\n"
                            if restaurant.get('address'):
                                response_text += f"   📍 {restaurant.get('address')}\n"
                            response_text += "\n"
                        response_text += "💡 **Tip:** Hỏi người địa phương về đặc sản nhé!"
                    else:
                        response_text = "😔 Không tìm thấy nhà hàng nào trong bán kính 2km.\n\n"
                        response_text += "💡 **Gợi ý:**\n"
                        response_text += "• Thử tìm 'quán ăn gần đây'\n"
                        response_text += "• Tìm 'quán cà phê' để hỏi người địa phương\n"
                        response_text += "• Di chuyển gần trung tâm thành phố hơn"
                except Exception as e:
                    print(f"   ❌ Error in food tips: {e}")
                    response_text = "😔 Xin lỗi, tôi gặp lỗi khi tìm nhà hàng.\n\n💡 Bạn có thể thử hỏi 'nhà hàng gần đây' không?"
        
        elif any(word in user_text for word in ["check-in", "checkin", "chụp ảnh", "photo", "sống ảo"]):
            # PHOTO TIPS
            print("   📸 Type: Photo tips")
            
            if active_place_id:
                place = get_place_details.invoke({"place_id": active_place_id})
                tips = get_travel_tips.invoke({"place": place, "tip_type": "photo"})
                
                response_text = f"📸 **Góc check-in đẹp tại {tips.get('place_name', 'đây')}:**\n\n"
                for suggestion in tips.get('suggestions', []):
                    response_text += f"• {suggestion}\n"
                
                if tips.get('best_time'):
                    response_text += f"\n⏰ **Thời gian đẹp nhất:** {tips['best_time']}\n"
            else:
                response_text = "📸 Bạn đang ở địa điểm nào? Cho tôi biết để gợi ý góc chụp đẹp nhé!"
        
        elif any(word in user_text for word in ["địa điểm này", "chỗ này", "đây", "place", "here", "về", "thông tin", "info", "tell me about"]):
            # PLACE INFO
            print("   ℹ️ Type: Place info")
            
            if active_place_id:
                place = get_place_details.invoke({"place_id": active_place_id})
                
                if place:
                    response_text = f"ℹ️ **Thông tin về {place.get('name', 'địa điểm này')}:**\n\n"
                    
                    if place.get('description'):
                        response_text += f"📝 {place['description']}\n\n"
                    
                    if place.get('rating'):
                        response_text += f"⭐ **Đánh giá:** {place['rating']}/5 ({place.get('user_ratings_total', 0)} reviews)\n"
                    
                    if place.get('opening_hours'):
                        response_text += f"🕐 **Giờ mở cửa:** Đang mở\n"
                    
                    if place.get('budget_range'):
                        budget_label = {
                            'budget': '💰 Bình dân',
                            'mid-range': '💰💰 Trung bình',
                            'expensive': '💰💰💰 Cao cấp'
                        }.get(place['budget_range'], place['budget_range'])
                        response_text += f"💵 **Mức giá:** {budget_label}\n"
                    
                    response_text += "\n💡 **Bạn muốn biết thêm gì?**\n"
                    response_text += "• Ăn gì ngon?\n"
                    response_text += "• Chụp ảnh ở đâu đẹp?\n"
                    response_text += "• Nên làm gì tại đây?\n"
                else:
                    response_text = "❌ Không tìm thấy thông tin về địa điểm này."
            else:
                response_text = "📍 Bạn đang ở địa điểm nào? Cho tôi biết để tìm thông tin nhé!"
        
        else:
            # DEFAULT - General companion question
            print("   💬 Type: General companion question")
            
            system_prompt = f"""
            Bạn là travel companion AI đang hỗ trợ du khách TRONG LÚC đi du lịch.
            
            Trả lời câu hỏi ngắn gọn, thực tế, hữu ích.
            Nếu cần vị trí để trả lời chính xác → Hỏi user bật GPS.
            
            User location: {current_location or 'Unknown'}
            Active place: {active_place_id or 'Unknown'}
            
            Trả lời bằng tiếng Việt, thân thiện.
            """
            
            response = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=last_message)
            ])
            
            response_text = response.content
    
    except Exception as e:
        print(f"   ❌ Error in companion mode: {e}")
        import traceback
        traceback.print_exc()
        response_text = "😔 Xin lỗi, tôi gặp lỗi khi xử lý câu hỏi.\n\n💡 Bạn có thể thử hỏi lại hoặc liên hệ hỗ trợ không?"
    
    print(f"   ✅ Response ({len(response_text)} chars): {response_text[:150]}...")
    
    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=response_text)],
        "session_stage": "companion_mode"
    }

def final_response_node(state: TravelState) -> TravelState:
    """
    Node 6: Format final response with complete itinerary
    """
    print("📝 FinalResponse: Formatting complete itinerary...")
    
    itinerary = state["current_itinerary"]
    preferences = state["user_preferences"]
    itinerary_status = state.get("itinerary_status", "DRAFT")
    
    # Map values to Vietnamese
    group_type_map = {
        "solo": "Một mình",
        "couple": "Cặp đôi",
        "friends": "Bạn bè",
        "family": "Gia đình",
        "business": "Công tác"
    }
    
    travel_style_map = {
        "cultural": "Văn hóa",
        "adventure": "Phiêu lưu",
        "relaxation": "Thư giãn",
        "foodie": "Ẩm thực",
        "shopping": "Mua sắm",
        "nature": "Thiên nhiên",
        "nightlife": "Cuộc sống về đêm",
        "photography": "Nhiếp ảnh"
    }
    
    budget_map = {
        "budget": "Tiết kiệm (< 1 triệu/ngày)",
        "mid-range": "Trung bình (1-3 triệu/ngày)",
        "luxury": "Cao cấp (> 3 triệu/ngày)"
    }
    
    # Parse duration to readable format
    duration_str = preferences.duration
    if "_" in duration_str:
        # Format: "3_days" -> "3 ngày"
        parts = duration_str.split("_")
        if len(parts) == 2:
            num = parts[0]
            if parts[1] == "days":
                duration_str = f"{num} ngày"
            elif parts[1] == "hours":
                duration_str = f"{num} giờ"
    
    group_display = group_type_map.get(preferences.group_type, preferences.group_type)
    style_display = travel_style_map.get(preferences.travel_style, preferences.travel_style)
    budget_display = budget_map.get(preferences.budget_range, preferences.budget_range)
    
    # Create comprehensive final response
    final_message = f"""
    🎉 **Lộ trình hoàn chỉnh cho chuyến đi của bạn!**
    
    👥 **Thông tin nhóm:** {group_display} - {style_display}
    ⏱️ **Thời gian:** {duration_str}
    💰 **Ngân sách:** {budget_display}
    
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
    • Phù hợp với sở thích {style_display} của nhóm {group_display}
    • Nằm trong ngân sách {budget_display}
    • Đã kiểm tra giờ mở cửa và thời tiết
    """
    
    # Add status-specific suggestions
    if itinerary_status == "DRAFT":
        final_message += f"""
    
    � **Trạng thái:** ✏️ Bản nháp (DRAFT) - Bạn vẫn có thể chỉnh sửa!
    
    💡 **Bạn có thể làm gì tiếp theo:**
    • 🗑️ "Bỏ [tên địa điểm]" - Xóa một địa điểm khỏi lộ trình
    • ➕ "Thêm [tên địa điểm]" - Thêm địa điểm mới (đang phát triển)
    • ✅ "Xác nhận lộ trình" - Hoàn tất và lưu vào kế hoạch của bạn
    
    ⚠️ Lưu ý: Bản nháp này sẽ được lưu tự động và bạn có thể quay lại chỉnh sửa bất cứ lúc nào!
    """
    else:
        final_message += f"""
    
    ✅ **Trạng thái:** Đã xác nhận (CONFIRMED)
    
    🎉 Chúc bạn có một chuyến đi tuyệt vời! 🚀
    """
    
    return {
        **state,
        "session_stage": "complete",
        "itinerary_status": itinerary_status,  # Preserve status
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
    workflow.add_node("intent_classifier", intent_classifier_node)
    workflow.add_node("travel_question_answerer", travel_question_answerer_node)
    workflow.add_node("profile_collector", profile_collector_node)
    workflow.add_node("itinerary_planner", itinerary_planner_node)
    workflow.add_node("itinerary_modifier", itinerary_modifier_node)
    workflow.add_node("route_optimizer", route_optimizer_node)
    workflow.add_node("feasibility_checker", feasibility_checker_node)
    workflow.add_node("budget_calculator", budget_calculator_node)
    workflow.add_node("live_companion", live_companion_node)  # NEW: Live Travel Companion
    workflow.add_node("final_response", final_response_node)
    
    # Define routing logic
    def route_after_intent_classification(state: TravelState):
        """Route based on detected intent"""
        stage = state.get("session_stage", "profiling")
        intent = state.get("intent", "")
        has_itinerary = state.get("itinerary_id") or state.get("current_itinerary")
        
        print(f"   🔀 Routing after intent: intent={intent}, stage={stage}, has_itinerary={bool(has_itinerary)}")
        
        if stage == "off_topic":
            return END  # End conversation for off-topic
        elif stage == "companion_mode" or "companion_question" in intent:
            print("   → Going to live_companion")
            return "live_companion"  # Live travel companion mode
        elif stage == "answering_question":
            return "travel_question_answerer"
        elif "itinerary_modification" in intent and has_itinerary:
            print("   → Going to itinerary_modifier")
            return "itinerary_modifier"  # User wants to modify existing itinerary
        else:
            print("   → Going to profile_collector")
            return "profile_collector"  # Default: start profiling
    
    def route_after_profiling(state: TravelState):
        stage = state.get("session_stage", "profiling")
        preferences = state.get("user_preferences", UserPreferences())
        
        # Check if we have all required info to create itinerary
        # Use destination field, fallback to start_location for backward compatibility
        has_destination = preferences.destination or preferences.start_location
        is_info_complete = all([
            has_destination,
            preferences.departure_location,  # NEW: Must have departure location
            preferences.travel_style,
            preferences.group_type,
            preferences.budget_range,
            preferences.duration
        ])
        
        print(f"   🔀 Routing after profiling: stage={stage}, complete={is_info_complete}")
        print(f"      destination={has_destination}, departure={preferences.departure_location}, duration={preferences.duration}")
        
        if stage == "planning" or is_info_complete:
            print("   → Going to itinerary_planner")
            return "itinerary_planner"
        else:
            print("   → Staying in profile_collector (missing info)")
            return END  # End and wait for next message
    
    def route_after_planning(state: TravelState):
        return "route_optimizer"
    
    def route_after_optimization(state: TravelState):
        return "feasibility_checker"
        
    def route_after_feasibility(state: TravelState):
        return "budget_calculator"
        
    def route_after_budget(state: TravelState):
        return "final_response"
    
    # Add edges
    workflow.add_edge(START, "intent_classifier")
    workflow.add_conditional_edges("intent_classifier", route_after_intent_classification)
    workflow.add_edge("travel_question_answerer", END)
    workflow.add_edge("live_companion", END)  # NEW: Companion mode ends after response
    workflow.add_edge("itinerary_modifier", END)  # After modification, show result and end
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
            # Preserve existing state and add new message
            state = conversation_state.copy()
            state["messages"].append(HumanMessage(content=user_message))
            
            # Ensure user_preferences is UserPreferences object (not dict)
            if isinstance(state.get("user_preferences"), dict):
                state["user_preferences"] = UserPreferences(**state["user_preferences"])
            
            print(f"   📋 Resuming conversation with {len(state['messages'])} messages")
            print(f"   📍 Existing preferences: location={state['user_preferences'].start_location}, style={state['user_preferences'].travel_style}")
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
                "travel_date": None,
                "intent": None,
                "itinerary_status": None,
                "itinerary_id": None
            }
            print(f"   🆕 Starting new conversation")
        
        # Run the graph
        try:
            final_state = self.graph.invoke(state)
            
            # Extract the latest AI response
            ai_messages = [msg for msg in final_state["messages"] if isinstance(msg, AIMessage)]
            latest_response = ai_messages[-1].content if ai_messages else "Xin lỗi, tôi không thể xử lý yêu cầu của bạn."
            
            # Debug: Log final state
            print(f"   ✅ Conversation complete: stage={final_state.get('session_stage')}, messages={len(final_state['messages'])}")
            print(f"   📍 Final preferences: location={final_state['user_preferences'].start_location}, style={final_state['user_preferences'].travel_style}")
            
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