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
  severity: 'normal' | 'warning' | 'danger';
  alert: string;
}

/**
 * DTO cho place với route information
 */
export class PlaceWithRouteDto {
  placeId: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  travelMode?: string;
  
  // snake_case để nhất quán với route_id, user_id, created_at... trong các module khác
  encoded_polyline: string | null;
  travel_duration_minutes: number | null;
}

/**
 * DTO cho day với processed routes
 */
export class DayWithRoutesDto {
  dayNumber: number;
  places: PlaceWithRouteDto[];
}

/**
 * DTO cho calculate routes response
 */
export class CalculateRoutesResponseDto {
  days: DayWithRoutesDto[];
}
