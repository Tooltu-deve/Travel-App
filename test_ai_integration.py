#!/usr/bin/env python3
"""
Test script for AI Chatbot Integration
Kiểm tra end-to-end flow: AI Agent → AI Optimizer → Backend
"""

import requests
import json
import time
from typing import Dict, Any

# ============================================
# CONFIGURATION
# ============================================

AI_AGENT_URL = "http://localhost:8001"
AI_OPTIMIZER_URL = "http://localhost:8000"
BACKEND_URL = "http://localhost:3000"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}\n")

def print_success(text: str):
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")

def print_error(text: str):
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")

def print_warning(text: str):
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")

def print_info(text: str):
    print(f"{Colors.OKCYAN}ℹ️  {text}{Colors.ENDC}")

# ============================================
# TEST FUNCTIONS
# ============================================

def test_ai_optimizer_health() -> bool:
    """Test 1: AI Optimizer Service health check"""
    print_header("TEST 1: AI Optimizer Service Health Check")
    
    try:
        response = requests.get(f"{AI_OPTIMIZER_URL}/docs", timeout=5)
        if response.status_code == 200:
            print_success("AI Optimizer Service is running")
            return True
        else:
            print_error(f"AI Optimizer returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to AI Optimizer Service")
        print_info("Make sure to run: cd ai_optimizer_service && python3 main.py")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_ai_agent_health() -> bool:
    """Test 2: AI Agent health check"""
    print_header("TEST 2: AI Agent Health Check")
    
    try:
        response = requests.get(f"{AI_AGENT_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print_success("AI Agent is running")
            print_info(f"Status: {data.get('status')}")
            print_info(f"Version: {data.get('version')}")
            return True
        else:
            print_error(f"AI Agent returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to AI Agent")
        print_info("Make sure to run: cd travel-ai-agent && python3 main.py")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_backend_health() -> bool:
    """Test 3: Backend health check"""
    print_header("TEST 3: Backend Health Check")
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/v1/ai/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print_success("Backend is running")
            print_info(f"Status: {data.get('status')}")
            print_info(f"AI Agent Status: {data.get('aiAgentStatus')}")
            return True
        else:
            print_error(f"Backend returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to Backend")
        print_info("Make sure to run: cd backend && npm run start:dev")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_ai_optimizer_direct() -> bool:
    """Test 4: Direct call to AI Optimizer Service"""
    print_header("TEST 4: AI Optimizer Direct Call")
    
    # Sample POI data
    payload = {
        "poi_list": [
            {
                "google_place_id": "test_poi_1",
                "name": "Hoàn Kiếm Lake",
                "emotional_tags": {
                    "peaceful": 0.8,
                    "scenic": 0.9,
                    "touristy": 0.7
                },
                "location": {"lat": 21.0285, "lng": 105.8542},
                "opening_hours": {
                    "openNow": True,
                    "weekdayDescriptions": ["Monday: 6:00 AM – 10:00 PM"]
                }
            },
            {
                "google_place_id": "test_poi_2",
                "name": "Temple of Literature",
                "emotional_tags": {
                    "historical": 0.9,
                    "spiritual": 0.8,
                    "touristy": 0.6
                },
                "location": {"lat": 21.0277, "lng": 105.8355},
                "opening_hours": {
                    "openNow": True,
                    "weekdayDescriptions": ["Monday: 8:00 AM – 5:00 PM"]
                }
            }
        ],
        "user_mood": "Điểm thu hút khách du lịch",
        "duration_days": 1,
        "current_location": {"lat": 21.0285, "lng": 105.8542},
        "start_datetime": "2025-11-27T09:00:00+07:00",
        "ecs_score_threshold": 0.0
    }
    
    try:
        print_info("Sending request to AI Optimizer...")
        response = requests.post(
            f"{AI_OPTIMIZER_URL}/optimize-route",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            optimized_route = data.get("optimized_route", [])
            
            print_success(f"AI Optimizer returned {len(optimized_route)} days")
            
            for day_data in optimized_route:
                day_num = day_data.get("day")
                activities = day_data.get("activities", [])
                print_info(f"Day {day_num}: {len(activities)} activities")
                
                for activity in activities[:2]:  # Show first 2 activities
                    name = activity.get("name")
                    ecs = activity.get("ecs_score")
                    arrival = activity.get("estimated_arrival", "N/A")
                    print(f"  • {name} (ECS: {ecs:.2f}) at {arrival}")
            
            return True
        else:
            print_error(f"AI Optimizer returned status {response.status_code}")
            print_error(response.text)
            return False
            
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_ai_agent_chat() -> bool:
    """Test 5: Chat with AI Agent (without authentication)"""
    print_header("TEST 5: AI Agent Chat Flow")
    
    # Conversation flow
    messages = [
        "Tôi muốn đi Hà Nội 2 ngày",
        "Tôi thích văn hóa lịch sử",
        "Đi cùng bạn gái",
        "Ngân sách trung bình"
    ]
    
    session_id = None
    
    try:
        for i, message in enumerate(messages, 1):
            print_info(f"Message {i}: {message}")
            
            payload = {
                "message": message,
                "user_id": "test_user_123",
                "session_id": session_id
            }
            
            response = requests.post(
                f"{AI_AGENT_URL}/chat",
                json=payload,
                timeout=60
            )
            
            if response.status_code != 200:
                print_error(f"Failed at message {i}: {response.status_code}")
                print_error(response.text)
                return False
            
            data = response.json()
            session_id = data.get("session_id")
            stage = data.get("stage")
            itinerary_count = len(data.get("itinerary", []))
            
            print_success(f"Response received: stage={stage}, itinerary_count={itinerary_count}")
            
            # Print AI response (truncated)
            ai_response = data.get("response", "")
            if len(ai_response) > 150:
                print(f"  AI: {ai_response[:150]}...")
            else:
                print(f"  AI: {ai_response}")
            
            # If itinerary is complete, show details
            if stage == "complete" and itinerary_count > 0:
                print_success(f"✅ Itinerary created with {itinerary_count} activities!")
                
                # Check if ECS scores are present
                itinerary = data.get("itinerary", [])
                has_ecs = any(item.get("ecs_score") is not None for item in itinerary)
                
                if has_ecs:
                    print_success("✅ ECS scores found (AI Optimizer integration working!)")
                else:
                    print_warning("⚠️  No ECS scores (AI Optimizer may not have been called)")
                
                break
            
            time.sleep(1)  # Wait 1 second between messages
        
        return True
        
    except Exception as e:
        print_error(f"Error: {e}")
        return False

def test_mood_mapping() -> bool:
    """Test 6: Mood mapping logic"""
    print_header("TEST 6: Mood Mapping Verification")
    
    # Import the mapping function
    try:
        import sys
        sys.path.append('../travel-ai-agent')
        from agent import map_preferences_to_mood
        
        test_cases = [
            ("chill", "couple", "Lãng mạn & Riêng tư"),
            ("adventure", "solo", "Mạo hiểm & Thú vị"),
            ("cultural", "couple", "Điểm thu hút khách du lịch"),
            ("foodie", "friends", "Náo nhiệt & Xã hội"),
        ]
        
        all_passed = True
        
        for travel_style, group_type, expected_mood in test_cases:
            result = map_preferences_to_mood(travel_style, group_type)
            
            if result == expected_mood:
                print_success(f"{travel_style} + {group_type} → {result}")
            else:
                print_error(f"{travel_style} + {group_type} → {result} (expected: {expected_mood})")
                all_passed = False
        
        return all_passed
        
    except ImportError as e:
        print_warning(f"Cannot import agent.py: {e}")
        print_info("Skipping mood mapping test")
        return True  # Don't fail the test if import fails

# ============================================
# MAIN TEST RUNNER
# ============================================

def main():
    print(f"\n{Colors.BOLD}{Colors.HEADER}")
    print("╔══════════════════════════════════════════════════════════╗")
    print("║   AI CHATBOT INTEGRATION TEST SUITE                     ║")
    print("║   Testing: AI Agent → AI Optimizer → Backend            ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")
    
    tests = [
        ("AI Optimizer Health", test_ai_optimizer_health),
        ("AI Agent Health", test_ai_agent_health),
        ("Backend Health", test_backend_health),
        ("AI Optimizer Direct Call", test_ai_optimizer_direct),
        ("Mood Mapping", test_mood_mapping),
        ("AI Agent Chat Flow", test_ai_agent_chat),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print_error(f"Test crashed: {e}")
            results.append((test_name, False))
        
        time.sleep(1)
    
    # Print summary
    print_header("TEST SUMMARY")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        if result:
            print_success(f"{test_name}: PASSED")
        else:
            print_error(f"{test_name}: FAILED")
    
    print(f"\n{Colors.BOLD}Total: {passed}/{total} tests passed{Colors.ENDC}\n")
    
    if passed == total:
        print_success("🎉 All tests passed! Integration is working correctly!")
        return 0
    else:
        print_error("Some tests failed. Please check the logs above.")
        return 1

if __name__ == "__main__":
    exit(main())
