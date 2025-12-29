"""
Test suite cho AI Optimizer Service
Testing các function helpers và logic xử lý giờ mở cửa

Run: python test_main.py
"""

import sys
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List

# Import các functions từ main.py
from main import (
    is_poi_open_at_datetime,
    get_earliest_opening_time,
    parse_time_string,
    minutes_since_midnight,
    to_day_index,
    get_estimated_visit_duration,
    parse_iso_datetime,
    MOOD_WEIGHTS,
)


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_name: str):
        self.passed += 1
        self.tests.append((test_name, True, None))
        print(f"✅ PASS: {test_name}")
    
    def add_fail(self, test_name: str, error: str):
        self.failed += 1
        self.tests.append((test_name, False, error))
        print(f"❌ FAIL: {test_name}")
        print(f"   Error: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print("\n" + "="*60)
        print(f"Test Summary: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"\nFailed tests:")
            for name, passed, error in self.tests:
                if not passed:
                    print(f"  - {name}: {error}")
        print("="*60)


def assert_equal(actual, expected, message=""):
    if actual != expected:
        raise AssertionError(f"{message}\n  Expected: {expected}\n  Actual: {actual}")


def assert_true(condition, message=""):
    if not condition:
        raise AssertionError(f"{message}\n  Expected: True\n  Actual: False")


def assert_false(condition, message=""):
    if condition:
        raise AssertionError(f"{message}\n  Expected: False\n  Actual: True")


# ============================================================================
# Test Helper Functions
# ============================================================================

def test_parse_time_string(result: TestResult):
    """Test parsing các format thời gian khác nhau"""
    
    # Test case 1: AM/PM format
    try:
        minutes = parse_time_string("8:00 AM")
        assert_equal(minutes, 8 * 60, "Parse 8:00 AM")
        result.add_pass("parse_time_string - 8:00 AM")
    except Exception as e:
        result.add_fail("parse_time_string - 8:00 AM", str(e))
    
    # Test case 2: PM format
    try:
        minutes = parse_time_string("5:00 PM")
        assert_equal(minutes, 17 * 60, "Parse 5:00 PM")
        result.add_pass("parse_time_string - 5:00 PM")
    except Exception as e:
        result.add_fail("parse_time_string - 5:00 PM", str(e))
    
    # Test case 3: 24h format
    try:
        minutes = parse_time_string("14:30")
        assert_equal(minutes, 14 * 60 + 30, "Parse 14:30")
        result.add_pass("parse_time_string - 14:30")
    except Exception as e:
        result.add_fail("parse_time_string - 14:30", str(e))
    
    # Test case 4: Invalid format
    try:
        minutes = parse_time_string("invalid")
        assert_equal(minutes, None, "Parse invalid should return None")
        result.add_pass("parse_time_string - invalid format")
    except Exception as e:
        result.add_fail("parse_time_string - invalid format", str(e))


def test_minutes_since_midnight(result: TestResult):
    """Test tính phút từ nửa đêm"""
    
    try:
        dt = datetime(2025, 12, 29, 10, 30)
        minutes = minutes_since_midnight(dt)
        assert_equal(minutes, 10 * 60 + 30, "10:30 = 630 minutes")
        result.add_pass("minutes_since_midnight - 10:30")
    except Exception as e:
        result.add_fail("minutes_since_midnight - 10:30", str(e))
    
    try:
        dt = datetime(2025, 12, 29, 0, 0)
        minutes = minutes_since_midnight(dt)
        assert_equal(minutes, 0, "00:00 = 0 minutes")
        result.add_pass("minutes_since_midnight - 00:00")
    except Exception as e:
        result.add_fail("minutes_since_midnight - 00:00", str(e))


def test_to_day_index(result: TestResult):
    """Test convert day sang index"""
    
    try:
        idx = to_day_index(0)
        assert_equal(idx, 0, "0 -> 0")
        result.add_pass("to_day_index - 0")
    except Exception as e:
        result.add_fail("to_day_index - 0", str(e))
    
    try:
        idx = to_day_index("MONDAY")
        assert_equal(idx, 0, "MONDAY -> 0")
        result.add_pass("to_day_index - MONDAY")
    except Exception as e:
        result.add_fail("to_day_index - MONDAY", str(e))


# ============================================================================
# Test is_poi_open_at_datetime
# ============================================================================

def test_poi_open_with_periods(result: TestResult):
    """Test POI với periods (cấu trúc)"""
    
    poi = {
        "name": "Test Restaurant",
        "opening_hours": {
            "periods": [
                {
                    "open": {"day": 1, "hour": 8, "minute": 0},   # Monday 8:00
                    "close": {"day": 1, "hour": 18, "minute": 0}  # Monday 18:00
                }
            ]
        }
    }
    
    # Test case 1: Trong giờ mở cửa
    try:
        arrival = datetime(2025, 12, 29, 10, 30)  # Monday 10:30
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "POI should be open at 10:30")
        result.add_pass("is_poi_open - periods - open time")
    except Exception as e:
        result.add_fail("is_poi_open - periods - open time", str(e))
    
    # Test case 2: Ngoài giờ mở cửa
    try:
        arrival = datetime(2025, 12, 29, 20, 0)  # Monday 20:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_false(is_open, "POI should be closed at 20:00")
        result.add_pass("is_poi_open - periods - closed time")
    except Exception as e:
        result.add_fail("is_poi_open - periods - closed time", str(e))
    
    # Test case 3: Trước giờ mở cửa
    try:
        arrival = datetime(2025, 12, 29, 6, 0)  # Monday 6:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_false(is_open, "POI should be closed at 6:00")
        result.add_pass("is_poi_open - periods - before opening")
    except Exception as e:
        result.add_fail("is_poi_open - periods - before opening", str(e))


def test_poi_open_overnight(result: TestResult):
    """Test POI mở cửa qua nửa đêm"""
    
    poi = {
        "name": "Night Club",
        "opening_hours": {
            "periods": [
                {
                    "open": {"day": 5, "hour": 22, "minute": 0},  # Friday 22:00
                    "close": {"day": 6, "hour": 4, "minute": 0}   # Saturday 4:00
                }
            ]
        }
    }
    
    # Test case 1: Friday night 23:00
    try:
        arrival = datetime(2025, 12, 26, 23, 0)  # Friday 23:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Club should be open at Friday 23:00")
        result.add_pass("is_poi_open - overnight - Friday night")
    except Exception as e:
        result.add_fail("is_poi_open - overnight - Friday night", str(e))
    
    # Test case 2: Saturday morning 2:00
    try:
        arrival = datetime(2025, 12, 27, 2, 0)  # Saturday 2:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Club should be open at Saturday 2:00")
        result.add_pass("is_poi_open - overnight - Saturday morning")
    except Exception as e:
        result.add_fail("is_poi_open - overnight - Saturday morning", str(e))


def test_poi_with_weekday_descriptions(result: TestResult):
    """Test POI với weekdayDescriptions"""
    
    poi = {
        "name": "Museum",
        "opening_hours": {
            "weekdayDescriptions": [
                "Monday: 8:00 AM – 5:00 PM",
                "Tuesday: 8:00 AM – 5:00 PM",
                "Wednesday: Closed"
            ]
        }
    }
    
    # Test case 1: Monday open time
    try:
        arrival = datetime(2025, 12, 29, 10, 0)  # Monday 10:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Museum should be open Monday 10:00")
        result.add_pass("is_poi_open - weekday_desc - Monday open")
    except Exception as e:
        result.add_fail("is_poi_open - weekday_desc - Monday open", str(e))
    
    # Test case 2: Wednesday closed
    try:
        arrival = datetime(2025, 12, 31, 10, 0)  # Wednesday 10:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_false(is_open, "Museum should be closed on Wednesday")
        result.add_pass("is_poi_open - weekday_desc - Wednesday closed")
    except Exception as e:
        result.add_fail("is_poi_open - weekday_desc - Wednesday closed", str(e))


def test_poi_no_opening_hours_strict_mode(result: TestResult):
    """Test POI không có opening_hours với strict_mode"""
    
    poi = {
        "name": "Unknown Place",
        # No opening_hours
    }
    
    # Test case 1: Strict mode - early morning
    try:
        arrival = datetime(2025, 12, 29, 4, 0)  # 4:00 AM
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=True)
        assert_false(is_open, "Should be closed at 4 AM with strict_mode")
        result.add_pass("is_poi_open - no_data - strict early morning")
    except Exception as e:
        result.add_fail("is_poi_open - no_data - strict early morning", str(e))
    
    # Test case 2: Strict mode - reasonable time
    try:
        arrival = datetime(2025, 12, 29, 10, 0)  # 10:00 AM
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=True)
        assert_true(is_open, "Should be open at 10 AM with strict_mode")
        result.add_pass("is_poi_open - no_data - strict reasonable time")
    except Exception as e:
        result.add_fail("is_poi_open - no_data - strict reasonable time", str(e))
    
    # Test case 3: Non-strict mode
    try:
        arrival = datetime(2025, 12, 29, 4, 0)  # 4:00 AM
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Should allow any time without strict_mode")
        result.add_pass("is_poi_open - no_data - non-strict")
    except Exception as e:
        result.add_fail("is_poi_open - no_data - non-strict", str(e))


def test_poi_multiple_intervals(result: TestResult):
    """Test POI với nhiều khoảng thời gian trong ngày"""
    
    poi = {
        "name": "Temple",
        "opening_hours": {
            "periods": [
                {
                    "open": {"day": 1, "hour": 7, "minute": 30},
                    "close": {"day": 1, "hour": 11, "minute": 0}
                },
                {
                    "open": {"day": 1, "hour": 15, "minute": 0},
                    "close": {"day": 1, "hour": 19, "minute": 30}
                }
            ]
        }
    }
    
    # Test case 1: Morning session
    try:
        arrival = datetime(2025, 12, 29, 9, 0)  # Monday 9:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Temple should be open at 9:00 (morning)")
        result.add_pass("is_poi_open - multi_interval - morning")
    except Exception as e:
        result.add_fail("is_poi_open - multi_interval - morning", str(e))
    
    # Test case 2: Lunch break
    try:
        arrival = datetime(2025, 12, 29, 13, 0)  # Monday 13:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_false(is_open, "Temple should be closed at 13:00 (lunch)")
        result.add_pass("is_poi_open - multi_interval - lunch break")
    except Exception as e:
        result.add_fail("is_poi_open - multi_interval - lunch break", str(e))
    
    # Test case 3: Afternoon session
    try:
        arrival = datetime(2025, 12, 29, 17, 0)  # Monday 17:00
        is_open = is_poi_open_at_datetime(poi, arrival, strict_mode=False)
        assert_true(is_open, "Temple should be open at 17:00 (afternoon)")
        result.add_pass("is_poi_open - multi_interval - afternoon")
    except Exception as e:
        result.add_fail("is_poi_open - multi_interval - afternoon", str(e))


# ============================================================================
# Test get_earliest_opening_time
# ============================================================================

def test_get_earliest_opening_time_basic(result: TestResult):
    """Test tìm giờ mở cửa sớm nhất"""
    
    poi = {
        "name": "Cafe",
        "opening_hours": {
            "periods": [
                {
                    "open": {"day": 1, "hour": 8, "minute": 0},
                    "close": {"day": 1, "hour": 20, "minute": 0}
                }
            ]
        }
    }
    
    # Test case 1: Trước giờ mở cửa (cùng ngày)
    try:
        after_time = datetime(2025, 12, 29, 6, 0)  # Monday 6:00
        opening_time = get_earliest_opening_time(poi, after_time)
        expected = datetime(2025, 12, 29, 8, 0)  # Monday 8:00
        assert_equal(opening_time, expected, "Should return 8:00 same day")
        result.add_pass("get_earliest_opening - before opening same day")
    except Exception as e:
        result.add_fail("get_earliest_opening - before opening same day", str(e))
    
    # Test case 2: Sau giờ mở cửa (tuần sau)
    try:
        after_time = datetime(2025, 12, 29, 21, 0)  # Monday 21:00
        opening_time = get_earliest_opening_time(poi, after_time)
        expected = datetime(2026, 1, 5, 8, 0)  # Next Monday 8:00
        assert_equal(opening_time, expected, "Should return next week")
        result.add_pass("get_earliest_opening - after closing next week")
    except Exception as e:
        result.add_fail("get_earliest_opening - after closing next week", str(e))


def test_get_earliest_opening_time_multiple_days(result: TestResult):
    """Test tìm giờ mở cửa với nhiều ngày"""
    
    poi = {
        "name": "Restaurant",
        "opening_hours": {
            "periods": [
                {"open": {"day": 1, "hour": 11, "minute": 0}},  # Monday
                {"open": {"day": 2, "hour": 11, "minute": 0}},  # Tuesday
                {"open": {"day": 3, "hour": 11, "minute": 0}}   # Wednesday
            ]
        }
    }
    
    # Test case: Friday morning → Next Monday
    try:
        after_time = datetime(2025, 12, 26, 9, 0)  # Friday 9:00
        opening_time = get_earliest_opening_time(poi, after_time)
        # Should return next Monday 11:00
        assert_true(opening_time.weekday() == 0, "Should be Monday")
        assert_true(opening_time.hour == 11, "Should be 11:00")
        result.add_pass("get_earliest_opening - multiple days")
    except Exception as e:
        result.add_fail("get_earliest_opening - multiple days", str(e))


# ============================================================================
# Integration Tests - Simulate optimize_route_for_day logic
# ============================================================================

def test_defer_and_retry_scenario(result: TestResult):
    """Test scenario: POI defer và retry thành công"""
    
    # Simulate: Start 6:00, có POI mở 8:00
    poi_early = {
        "name": "Early Cafe",
        "opening_hours": {
            "periods": [{"open": {"day": 1, "hour": 7, "minute": 0}}]
        }
    }
    
    poi_late = {
        "name": "Late Museum",
        "opening_hours": {
            "periods": [{"open": {"day": 1, "hour": 9, "minute": 0}}]
        }
    }
    
    try:
        start_time = datetime(2025, 12, 29, 6, 0)  # Monday 6:00
        
        # Early cafe: not open at 6:00
        is_open_6 = is_poi_open_at_datetime(poi_early, start_time, False)
        assert_false(is_open_6, "Early cafe closed at 6:00")
        
        # After visiting somewhere, current_time = 7:30
        current_time = datetime(2025, 12, 29, 7, 30)
        is_open_730 = is_poi_open_at_datetime(poi_early, current_time, False)
        assert_true(is_open_730, "Early cafe open at 7:30 (retry success)")
        
        result.add_pass("defer_retry - scenario success")
    except Exception as e:
        result.add_fail("defer_retry - scenario success", str(e))


def test_time_jump_scenario(result: TestResult):
    """Test scenario: Time jump khi tất cả POI đều chưa mở"""
    
    poi = {
        "name": "Morning Market",
        "opening_hours": {
            "periods": [{"open": {"day": 1, "hour": 8, "minute": 0}}]
        }
    }
    
    try:
        start_time = datetime(2025, 12, 29, 4, 0)  # Monday 4:00 AM
        
        # POI not open at 4:00
        is_open_4 = is_poi_open_at_datetime(poi, start_time, True)
        assert_false(is_open_4, "Market closed at 4:00")
        
        # Get earliest opening
        earliest = get_earliest_opening_time(poi, start_time)
        expected = datetime(2025, 12, 29, 8, 0)
        assert_equal(earliest, expected, "Earliest opening should be 8:00")
        
        # After time jump to 8:00
        is_open_8 = is_poi_open_at_datetime(poi, earliest, True)
        assert_true(is_open_8, "Market open at 8:00 after jump")
        
        result.add_pass("time_jump - scenario success")
    except Exception as e:
        result.add_fail("time_jump - scenario success", str(e))


# ============================================================================
# Test Additional Functions
# ============================================================================

def calculate_ecs_score_single(poi: Dict[str, Any], mood: str) -> float:
    """Helper function từ main.py - tính ECS score cho một mood"""
    weights = MOOD_WEIGHTS.get(mood, {})
    tags = poi.get('emotional_tags', {})
    ecs_score = 0.0
    for tag_name, weight in weights.items():
        ecs_score += tags.get(tag_name, 0.0) * weight
    return ecs_score

def calculate_ecs_score(poi: Dict[str, Any], moods: Any) -> float:
    """Helper function từ main.py - tính ECS score cho nhiều mood"""
    if isinstance(moods, str):
        return calculate_ecs_score_single(poi, moods)
    if isinstance(moods, list):
        scores = [calculate_ecs_score_single(poi, str(m)) for m in moods if m is not None]
        return max(scores) if scores else 0.0
    return 0.0

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Helper function từ main.py - tính khoảng cách Haversine"""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def poi_likely_open_in_day_window(poi: Dict[str, Any], day_start: datetime) -> bool:
    """Helper function từ main.py - check POI có mở trong day window không"""
    opening_data = poi.get('opening_hours') or poi.get('regularOpeningHours') or poi.get('openingHours')
    if not opening_data or not isinstance(opening_data, dict):
        return True
    
    test_hours = [8, 12, 16]
    for hour in test_hours:
        test_time = day_start.replace(hour=hour, minute=0, second=0)
        if is_poi_open_at_datetime(poi, test_time, strict_mode=False):
            return True
    
    return False


def test_calculate_ecs_score(result: TestResult):
    """Test tính ECS score với các mood khác nhau"""
    
    # Test với mood có trong MOOD_WEIGHTS: "Mạo hiểm & Thú vị"
    test_poi = {
        'emotional_tags': {
            'adventurous': 0.8,
            'scenic': 0.6,
            'seaside': 0.5,
            'peaceful': 0.2,
            'spiritual': 0.1
        }
    }
    
    # Test với "Mạo hiểm & Thú vị" mood
    try:
        ecs_adventure = calculate_ecs_score_single(test_poi, 'Mạo hiểm & Thú vị')
        # adventurous: 1.0, scenic: 0.8, seaside: 0.7, peaceful: -0.9, spiritual: -0.7
        expected = 0.8 * 1.0 + 0.6 * 0.8 + 0.5 * 0.7 + 0.2 * (-0.9) + 0.1 * (-0.7)
        assert abs(ecs_adventure - expected) < 0.01, f"Expected {expected:.2f}, got {ecs_adventure:.2f}"
        result.add_pass("calculate_ecs_score - adventure mood")
    except Exception as e:
        result.add_fail("calculate_ecs_score - adventure mood", str(e))
    
    # Test với "Yên tĩnh & Thư giãn" mood
    try:
        test_poi2 = {
            'emotional_tags': {
                'peaceful': 0.9,
                'scenic': 0.7,
                'seaside': 0.6
            }
        }
        ecs_relaxation = calculate_ecs_score_single(test_poi2, 'Yên tĩnh & Thư giãn')
        # peaceful: 1.0, scenic: 0.8, seaside: 0.7
        expected = 0.9 * 1.0 + 0.7 * 0.8 + 0.6 * 0.7
        assert abs(ecs_relaxation - expected) < 0.01, f"Expected {expected:.2f}, got {ecs_relaxation:.2f}"
        result.add_pass("calculate_ecs_score - relaxation mood")
    except Exception as e:
        result.add_fail("calculate_ecs_score - relaxation mood", str(e))
    
    # Test với multiple moods
    try:
        ecs_multi = calculate_ecs_score(test_poi, ['Mạo hiểm & Thú vị', 'Yên tĩnh & Thư giãn'])
        ecs_adv = calculate_ecs_score_single(test_poi, 'Mạo hiểm & Thú vị')
        ecs_rel = calculate_ecs_score_single(test_poi, 'Yên tĩnh & Thư giãn')
        assert ecs_multi == max(ecs_adv, ecs_rel), "Should return max ECS"
        result.add_pass("calculate_ecs_score - multiple moods")
    except Exception as e:
        result.add_fail("calculate_ecs_score - multiple moods", str(e))
    
    # Test với mood không tồn tại
    try:
        ecs_unknown = calculate_ecs_score_single(test_poi, 'unknown_mood')
        assert ecs_unknown == 0.0, "Unknown mood should return 0"
        result.add_pass("calculate_ecs_score - unknown mood")
    except Exception as e:
        result.add_fail("calculate_ecs_score - unknown mood", str(e))


def test_get_estimated_visit_duration(result: TestResult):
    """Test tính thời gian tham quan theo type của POI"""
    
    # Museum - theo VISIT_DURATION_BY_TYPE = 90
    try:
        museum_poi = {'type': 'museum', 'types': ['museum', 'tourist_attraction']}
        duration = get_estimated_visit_duration(museum_poi)
        assert duration == 90, f"Museum should be 90 minutes, got {duration}"
        result.add_pass("get_estimated_visit_duration - museum")
    except Exception as e:
        result.add_fail("get_estimated_visit_duration - museum", str(e))
    
    # Restaurant - theo VISIT_DURATION_BY_TYPE = 60
    try:
        restaurant_poi = {'type': 'restaurant', 'types': ['restaurant', 'food']}
        duration = get_estimated_visit_duration(restaurant_poi)
        assert duration == 60, f"Restaurant should be 60 minutes, got {duration}"
        result.add_pass("get_estimated_visit_duration - restaurant")
    except Exception as e:
        result.add_fail("get_estimated_visit_duration - restaurant", str(e))
    
    # Park - theo VISIT_DURATION_BY_TYPE = 60
    try:
        park_poi = {'type': 'park', 'types': ['park', 'tourist_attraction']}
        duration = get_estimated_visit_duration(park_poi)
        assert duration == 60, f"Park should be 60 minutes, got {duration}"
        result.add_pass("get_estimated_visit_duration - park")
    except Exception as e:
        result.add_fail("get_estimated_visit_duration - park", str(e))
    
    # Shopping mall - theo VISIT_DURATION_BY_TYPE = 90
    try:
        shopping_poi = {'type': 'shopping_mall', 'types': ['shopping_mall']}
        duration = get_estimated_visit_duration(shopping_poi)
        assert duration == 90, f"Shopping mall should be 90 minutes, got {duration}"
        result.add_pass("get_estimated_visit_duration - shopping mall")
    except Exception as e:
        result.add_fail("get_estimated_visit_duration - shopping mall", str(e))
    
    # Unknown type (fallback) - DEFAULT_VISIT_DURATION_MINUTES = 120
    try:
        unknown_poi = {'type': 'unknown', 'types': ['unknown']}
        duration = get_estimated_visit_duration(unknown_poi)
        assert duration == 120, f"Unknown type should default to 120 minutes, got {duration}"
        result.add_pass("get_estimated_visit_duration - fallback")
    except Exception as e:
        result.add_fail("get_estimated_visit_duration - fallback", str(e))


def test_haversine_km(result: TestResult):
    """Test tính khoảng cách Haversine giữa 2 tọa độ"""
    
    # Hà Nội - Hồ Chí Minh (~1140 km)
    try:
        hanoi = (21.0285, 105.8542)
        hcm = (10.8231, 106.6297)
        distance = haversine_km(*hanoi, *hcm)
        assert 1100 < distance < 1200, f"Hanoi-HCM distance should be ~1140km, got {distance:.2f}km"
        result.add_pass(f"haversine_km - Hanoi to HCM: {distance:.2f} km")
    except Exception as e:
        result.add_fail("haversine_km - Hanoi to HCM", str(e))
    
    # Short distance (~5km)
    try:
        hanoi_center = (21.0285, 105.8542)
        hanoi_west = (21.0285, 105.8042)
        distance = haversine_km(*hanoi_center, *hanoi_west)
        assert 4 < distance < 6, f"Short distance should be ~5km, got {distance:.2f}km"
        result.add_pass(f"haversine_km - Short distance: {distance:.2f} km")
    except Exception as e:
        result.add_fail("haversine_km - Short distance", str(e))
    
    # Same point (0 km)
    try:
        hanoi = (21.0285, 105.8542)
        distance = haversine_km(*hanoi, *hanoi)
        assert distance < 0.01, f"Same point should be 0km, got {distance:.2f}km"
        result.add_pass("haversine_km - Same point")
    except Exception as e:
        result.add_fail("haversine_km - Same point", str(e))


def test_parse_iso_datetime(result: TestResult):
    """Test parse ISO datetime format"""
    
    # Valid ISO format
    try:
        dt = parse_iso_datetime("2024-12-29T08:00:00Z")
        assert dt is not None and dt.year == 2024 and dt.month == 12 and dt.day == 29
        result.add_pass("parse_iso_datetime - valid ISO format")
    except Exception as e:
        result.add_fail("parse_iso_datetime - valid ISO format", str(e))
    
    # With timezone offset
    try:
        dt = parse_iso_datetime("2024-12-29T15:00:00+07:00")
        assert dt is not None and dt.year == 2024
        result.add_pass("parse_iso_datetime - with timezone")
    except Exception as e:
        result.add_fail("parse_iso_datetime - with timezone", str(e))
    
    # Invalid format
    try:
        dt = parse_iso_datetime("invalid-date")
        assert dt is None, "Invalid date should return None"
        result.add_pass("parse_iso_datetime - invalid format")
    except Exception as e:
        result.add_fail("parse_iso_datetime - invalid format", str(e))
    
    # None input
    try:
        dt = parse_iso_datetime(None)
        assert dt is None, "None input should return None"
        result.add_pass("parse_iso_datetime - None input")
    except Exception as e:
        result.add_fail("parse_iso_datetime - None input", str(e))


def test_poi_likely_open_in_day_window(result: TestResult):
    """Test POI có mở cửa trong day window không (8h-20h)"""
    
    # POI mở cả ngày
    try:
        poi_open_all_day = {
            'name': 'Museum',
            'opening_hours': {
                'periods': [
                    {'open': {'day': 1, 'hour': 7, 'minute': 0}, 'close': {'day': 1, 'hour': 20, 'minute': 0}}
                ]
            }
        }
        day_start = datetime(2024, 12, 30, 6, 0)  # Monday 6 AM
        is_open = poi_likely_open_in_day_window(poi_open_all_day, day_start)
        assert is_open == True, "Should be open in day window"
        result.add_pass("poi_likely_open_in_day_window - open all day")
    except Exception as e:
        result.add_fail("poi_likely_open_in_day_window - open all day", str(e))
    
    # POI chỉ mở tối
    try:
        poi_night_only = {
            'name': 'Night Club',
            'opening_hours': {
                'periods': [
                    {'open': {'day': 5, 'hour': 22, 'minute': 0}, 'close': {'day': 6, 'hour': 4, 'minute': 0}}
                ]
            }
        }
        day_start = datetime(2024, 1, 5, 6, 0)  # Friday 6 AM
        is_open = poi_likely_open_in_day_window(poi_night_only, day_start)
        assert is_open == False, "Night club should not match day window"
        result.add_pass("poi_likely_open_in_day_window - night only")
    except Exception as e:
        result.add_fail("poi_likely_open_in_day_window - night only", str(e))
    
    # POI không có opening_hours (fallback to True)
    try:
        poi_no_hours = {'name': 'Unknown Place'}
        day_start = datetime(2024, 1, 5, 6, 0)
        is_open = poi_likely_open_in_day_window(poi_no_hours, day_start)
        assert is_open == True, "No opening_hours should default to True"
        result.add_pass("poi_likely_open_in_day_window - no data")
    except Exception as e:
        result.add_fail("poi_likely_open_in_day_window - no data", str(e))


# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests():
    """Chạy tất cả test cases"""
    
    result = TestResult()
    
    print("="*60)
    print("Running AI Optimizer Service Tests")
    print("="*60)
    print()
    
    print("--- Helper Functions Tests ---")
    test_parse_time_string(result)
    test_minutes_since_midnight(result)
    test_to_day_index(result)
    print()
    
    print("--- is_poi_open_at_datetime Tests ---")
    test_poi_open_with_periods(result)
    test_poi_open_overnight(result)
    test_poi_with_weekday_descriptions(result)
    test_poi_no_opening_hours_strict_mode(result)
    test_poi_multiple_intervals(result)
    print()
    
    print("--- get_earliest_opening_time Tests ---")
    test_get_earliest_opening_time_basic(result)
    test_get_earliest_opening_time_multiple_days(result)
    print()
    
    print("--- Additional Function Tests ---")
    test_calculate_ecs_score(result)
    test_get_estimated_visit_duration(result)
    test_haversine_km(result)
    test_parse_iso_datetime(result)
    test_poi_likely_open_in_day_window(result)
    print()
    
    print("--- Integration Tests ---")
    test_defer_and_retry_scenario(result)
    test_time_jump_scenario(result)
    print()
    
    result.summary()
    
    return result.failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
