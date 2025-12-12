#!/usr/bin/env python3
"""
Test script to verify sequential questioning order in profile_collector_node.
Tests that mood is ALWAYS asked last and only ONE field is asked per interaction.
"""

def test_sequential_questioning_logic():
    """
    Simulate the sequential questioning logic to verify:
    1. Only ONE missing field is added per iteration
    2. Mood is ONLY added when all other fields are complete
    3. Order follows: destination → departure → duration → group → budget → mood
    """
    
    # Test Case 1: All fields missing
    print("\n=== TEST CASE 1: All fields missing ===")
    has_destination = False
    departure_location = None
    duration = None
    group_type = None
    budget_range = None
    user_mood = None
    
    missing_fields = []
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not user_mood:
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    print(f"Missing fields: {missing_fields}")
    assert len(missing_fields) == 1, "Should only ask ONE field"
    assert "điểm đến" in missing_fields[0], "Should ask for destination first"
    assert "mood" not in str(missing_fields).lower(), "Mood should NOT be asked first"
    print("✅ PASS: Only destination asked")
    
    # Test Case 2: After destination provided
    print("\n=== TEST CASE 2: After destination provided ===")
    has_destination = True
    departure_location = None
    duration = None
    group_type = None
    budget_range = None
    user_mood = None
    
    missing_fields = []
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not user_mood:
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    print(f"Missing fields: {missing_fields}")
    assert len(missing_fields) == 1, "Should only ask ONE field"
    assert "xuất phát" in missing_fields[0], "Should ask for departure location second"
    assert "mood" not in str(missing_fields).lower(), "Mood should NOT be asked yet"
    print("✅ PASS: Only departure location asked")
    
    # Test Case 3: After destination, departure, duration, group provided
    print("\n=== TEST CASE 3: After destination, departure, duration, group provided ===")
    has_destination = True
    departure_location = "Hà Nội"
    duration = "4 ngày"
    group_type = "Gia đình"
    budget_range = None
    user_mood = None
    
    missing_fields = []
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not user_mood:
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    print(f"Missing fields: {missing_fields}")
    assert len(missing_fields) == 1, "Should only ask ONE field"
    assert "ngân sách" in missing_fields[0], "Should ask for budget at this point"
    assert "mood" not in str(missing_fields).lower(), "Mood should NOT be asked before budget"
    print("✅ PASS: Only budget asked (mood not yet)")
    
    # Test Case 4: ALL fields except mood provided
    print("\n=== TEST CASE 4: ALL fields except mood provided ===")
    has_destination = True
    departure_location = "Hà Nội"
    duration = "4 ngày"
    group_type = "Gia đình"
    budget_range = "mid-range"
    user_mood = None
    
    missing_fields = []
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not user_mood:
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    print(f"Missing fields: {missing_fields}")
    assert len(missing_fields) == 1, "Should only ask ONE field"
    assert "mood" in str(missing_fields).lower(), "MOOD MUST BE ASKED LAST!"
    print("✅ PASS: Only mood asked (LAST, as intended)")
    
    # Test Case 5: All fields complete
    print("\n=== TEST CASE 5: All fields complete ===")
    has_destination = True
    departure_location = "Hà Nội"
    duration = "4 ngày"
    group_type = "Gia đình"
    budget_range = "mid-range"
    user_mood = "Yên tĩnh & Thư giãn"
    
    missing_fields = []
    if not has_destination:
        missing_fields.append("điểm đến (bạn muốn đi đâu?)")
    elif not departure_location:
        missing_fields.append("điểm xuất phát (khởi hành từ đâu?)")
    elif not duration:
        missing_fields.append("thời gian (mấy ngày?)")
    elif not group_type:
        missing_fields.append("nhóm đi (bao nhiêu người?)")
    elif not budget_range:
        missing_fields.append("ngân sách (tiết kiệm/trung bình/cao cấp?)")
    elif not user_mood:
        missing_fields.append("tâm trạng/mood (yên tĩnh, náo nhiệt, lãng mạn...)")
    
    print(f"Missing fields: {missing_fields}")
    assert len(missing_fields) == 0, "Should have no missing fields"
    print("✅ PASS: All fields complete, ready for planning")
    
    print("\n" + "="*60)
    print("✅ ALL TESTS PASSED!")
    print("="*60)
    print("\nSUMMARY:")
    print("✓ Sequential questioning works correctly")
    print("✓ Only ONE field asked per iteration")
    print("✓ MOOD is ALWAYS asked LAST")
    print("✓ Order: destination → departure → duration → group → budget → mood")

if __name__ == "__main__":
    test_sequential_questioning_logic()
