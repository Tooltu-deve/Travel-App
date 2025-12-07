import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
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

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;
  
  @IsNotEmpty()
  travelMode: string; // driving, walking, bicycling, transit
}

/**
 * DTO cho một day trong itinerary
 */
export class DayDto {
  @IsNotEmpty()
  dayNumber: number;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  days: DayDto[];

  optimize?: boolean; // Tối ưu hóa lộ trình (waypoints)
}
