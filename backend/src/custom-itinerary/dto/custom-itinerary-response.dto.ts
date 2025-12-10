/**
 * Response DTOs cho custom-itinerary module
 * Tuân thủ coding convention của toàn bộ hệ thống:
 * - PascalCase cho classes
 * - snake_case cho properties (nhất quán với itinerary, place, user modules)
 * Tuân thủ SOLID: Single Responsibility - mỗi DTO đảm nhiệm một response type
 */

/**
 * DTO cho weather check response
 */
export class WeatherCheckResponseDto {
  severity: 'Bình thường' | 'Cảnh báo' | 'Nguy hiểm';
  alert: string;
}

/**
 * DTO cho place với route information
 */
export class PlaceWithRouteDto {
  placeId: string;
  name: string;
  address: string; // Địa chỉ gốc từ request
  location: {
    lat: number;
    lng: number;
  }; // Tọa độ được geocoding từ address
  
  // snake_case để nhất quán với route_id, user_id, created_at... trong các module khác
  encoded_polyline: string | null;
  travel_duration_minutes: number | null;
}

/**
 * DTO cho day với processed routes
 */
export class DayWithRoutesDto {
  dayNumber: number;
  travelMode: string; // Phương tiện di chuyển cho ngày này: driving, walking, bicycling, transit
  startLocation: string; // Địa chỉ điểm xuất phát gốc từ request
  startLocationCoordinates: {
    lat: number;
    lng: number;
  }; // Tọa độ được geocoding từ startLocation
  places: PlaceWithRouteDto[];
}

/**
 * DTO cho calculate routes response
 */
export class CalculateRoutesResponseDto {
  days: DayWithRoutesDto[];
  optimize?: boolean;
  // Meta fields để tương thích với ItineraryResponseDto
  route_id?: string | null;
  user_id?: string | null;
  title?: string | null;
  destination?: string | null;
  status?: 'DRAFT' | 'CONFIRMED' | 'MAIN' | null;
  start_date?: string | null; // Ngày bắt đầu (ISO string)
  end_date?: string | null; // Ngày kết thúc (ISO string)
}
