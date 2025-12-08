import { IsArray, IsNotEmpty, ValidateNested, IsOptional, IsString } from 'class-validator';
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
    // travelMode đã chuyển lên CalculateRoutesDto
  @IsNotEmpty()
  dayNumber: number;

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
    travelMode: string; // driving, walking, bicycling, transit

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
}
