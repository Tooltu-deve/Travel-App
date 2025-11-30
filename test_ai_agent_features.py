#!/usr/bin/env python3
"""
Test script for AI Agent new features
"""

import requests
import json
import time

BASE_URL = "http://localhost:8001"

def test_off_topic():
    """Test off-topic question handling"""
    print("\n" + "="*60)
    print("TEST 1: Off-topic Question")
    print("="*60)
    
    payload = {
        "message": "Làm thế nào để nấu phở bò ngon?",
        "user_id": "test_off_topic_123"
    }
    
    response = requests.post(f"{BASE_URL}/chat", json=payload)
    result = response.json()
    
    print(f"📤 User: {payload['message']}")
    print(f"🤖 Agent: {result.get('response', 'No response')}")
    print(f"✅ Intent: {result.get('intent', 'N/A')}")
    print(f"⏱️ Time: {result.get('metadata', {}).get('response_time', 'N/A')}")

def test_travel_question():
    """Test travel-related question"""
    print("\n" + "="*60)
    print("TEST 2: Travel Question")
    print("="*60)
    
    payload = {
        "message": "Đà Nẵng có những món ăn đặc sản gì?",
        "user_id": "test_question_456"
    }
    
    response = requests.post(f"{BASE_URL}/chat", json=payload)
    result = response.json()
    
    print(f"📤 User: {payload['message']}")
    print(f"🤖 Agent: {result.get('response', 'No response')[:200]}...")
    print(f"✅ Intent: {result.get('intent', 'N/A')}")

def test_create_itinerary():
    """Test creating itinerary"""
    print("\n" + "="*60)
    print("TEST 3: Create Itinerary")
    print("="*60)
    
    payload = {
        "message": "Tạo lộ trình đi Đà Nẵng 3 ngày 2 đêm cho 2 người",
        "user_id": "test_itinerary_789"
    }
    
    response = requests.post(f"{BASE_URL}/chat", json=payload)
    result = response.json()
    
    print(f"📤 User: {payload['message']}")
    print(f"🤖 Agent Response Length: {len(result.get('response', ''))} chars")
    print(f"✅ Stage: {result.get('stage', 'N/A')}")
    print(f"📍 Preferences: {result.get('preferences', {})}")
    
    if result.get('itinerary'):
        print(f"📋 Itinerary Days: {len(result.get('itinerary', []))}")
        print(f"📍 Places: {len([p for p in result.get('itinerary', []) if p.get('place')])}")
    
    return result.get('sessionId')

def test_modify_itinerary(session_id):
    """Test modifying existing itinerary"""
    print("\n" + "="*60)
    print("TEST 4: Modify Itinerary")
    print("="*60)
    
    if not session_id:
        print("⚠️ No session_id, skipping modification test")
        return
    
    payload = {
        "message": "Bỏ Chùa Linh Ứng ra khỏi lộ trình",
        "user_id": "test_itinerary_789"
    }
    
    response = requests.post(f"{BASE_URL}/chat", json=payload)
    result = response.json()
    
    print(f"📤 User: {payload['message']}")
    print(f"🤖 Agent: {result.get('response', 'No response')}")
    print(f"✅ Modified: {'Yes' if 'modified' in result.get('stage', '') else 'No'}")

def test_group_type_detection():
    """Test group type detection fix"""
    print("\n" + "="*60)
    print("TEST 5: Group Type Detection (Fix for '2 người')")
    print("="*60)
    
    test_cases = [
        ("Tôi muốn đi du lịch với 2 người", "couple"),
        ("Tạo lộ trình cho 3 người bạn", "friends"),
        ("Gia đình 4 người", "family"),
        ("Đi một mình", "solo"),
    ]
    
    for message, expected_group in test_cases:
        payload = {
            "message": message,
            "user_id": f"test_group_{hash(message)}"
        }
        
        response = requests.post(f"{BASE_URL}/chat", json=payload)
        result = response.json()
        
        detected_group = result.get('preferences', {}).get('group_type', 'N/A')
        status = "✅" if expected_group in str(detected_group) else "❌"
        
        print(f"{status} '{message}' → Expected: {expected_group}, Got: {detected_group}")

def test_destination_detection():
    """Test Vietnamese destination detection"""
    print("\n" + "="*60)
    print("TEST 6: Destination Detection (Vietnamese variants)")
    print("="*60)
    
    test_cases = [
        ("Tôi muốn đi vùng tàu", "vũng tàu"),
        ("Đi du lịch Đà Nẵng", "đà nẵng"),
        ("Lộ trình ở Sài Gòn", "hồ chí minh"),
        ("Phú quốc 3 ngày", "phú quốc"),
    ]
    
    for message, expected_dest in test_cases:
        payload = {
            "message": message,
            "user_id": f"test_dest_{hash(message)}"
        }
        
        response = requests.post(f"{BASE_URL}/chat", json=payload)
        result = response.json()
        
        detected_dest = result.get('preferences', {}).get('start_location', 'N/A')
        status = "✅" if expected_dest in str(detected_dest).lower() else "❌"
        
        print(f"{status} '{message}' → Expected: {expected_dest}, Got: {detected_dest}")

def run_all_tests():
    """Run all test cases"""
    print("\n" + "🚀"*30)
    print("TESTING AI AGENT NEW FEATURES")
    print("🚀"*30)
    
    try:
        # Check if service is running
        health_check = requests.get(f"{BASE_URL}/health", timeout=2)
        if health_check.status_code != 200:
            print("❌ AI Agent service is not running!")
            return
        
        print("✅ AI Agent service is running\n")
        
        # Run tests
        test_off_topic()
        time.sleep(1)
        
        test_travel_question()
        time.sleep(1)
        
        test_group_type_detection()
        time.sleep(1)
        
        test_destination_detection()
        time.sleep(1)
        
        session_id = test_create_itinerary()
        time.sleep(2)
        
        test_modify_itinerary(session_id)
        
        print("\n" + "="*60)
        print("✅ ALL TESTS COMPLETED!")
        print("="*60)
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to AI Agent service at http://localhost:8001")
        print("💡 Make sure the service is running: cd travel-ai-agent && python3 main.py")
    except Exception as e:
        print(f"❌ Error running tests: {e}")

if __name__ == "__main__":
    run_all_tests()
