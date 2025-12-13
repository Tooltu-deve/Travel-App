import { IsArray, IsNotEmpty, ValidateNested, IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO cho location của một place
 */
export class LocationDto {
  @IsNotEmpty()
  lat: number;

  @IsNotEmpty()
  lng: number;
}

/**
 * DTO cho một place trong day
 */
export class PlaceDto {
  @IsNotEmpty()
  placeId: string;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  address: string; // Địa chỉ dạng string, sẽ được geocoding sang tọa độ
  
  // travelMode đã chuyển lên DayDto
}

/**
 * DTO cho một day trong itinerary
 */
export class DayDto {
  @IsNotEmpty()
  dayNumber: number;

  @IsNotEmpty()
  @IsIn(['driving', 'walking', 'bicycling', 'transit'])
  travelMode: string; // Phương tiện di chuyển cho ngày này: driving, walking, bicycling, transit

  @IsNotEmpty()
  startLocation: string; // Địa chỉ điểm xuất phát, sẽ được geocoding sang tọa độ

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceDto)
  places: PlaceDto[];
}

/**
 * DTO cho request tính toán routes
 * 
 * Tuân thủ best practices:
 * - Validation rõ ràng với class-validator
 * - Type safety với TypeScript
 * - Nested validation cho complex objects
 */
export class CalculateRoutesDto {
  @IsNotEmpty()
  destination: string; // Điểm đến chính của lộ trình

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  days: DayDto[];

  optimize?: boolean; // Tối ưu hóa lộ trình (waypoints)

  @IsOptional()
  @IsString()
  start_date?: string; // Ngày bắt đầu (ISO string)

  @IsOptional()
  @IsString()
  end_date?: string; // Ngày kết thúc (ISO string)

  @IsOptional()
  @IsString()
  startLocationText?: string; // Địa chỉ xuất phát của toàn bộ lộ trình
}
