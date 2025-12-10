import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO cho location của một POI
 */
export class LocationDto {
  @IsNotEmpty()
  @IsNumber()
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  lng: number;
}

/**
 * DTO cho một activity (POI) trong route
 */
export class ActivityDto {
  @IsNotEmpty()
  @IsString()
  google_place_id: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsOptional()
  @IsObject()
  emotional_tags?: Record<string, number>;

  @IsOptional()
  @IsObject()
  opening_hours?: any;

  @IsOptional()
  @IsNumber()
  visit_duration_minutes?: number;

  @IsOptional()
  @IsNumber()
  ecs_score?: number;

  @IsOptional()
  @IsString()
  estimated_arrival?: string;

  @IsOptional()
  @IsString()
  estimated_departure?: string;

  @IsOptional()
  @IsString()
  encoded_polyline?: string;

  @IsOptional()
  @IsNumber()
  travel_duration_minutes?: number;
}

/**
 * DTO cho một day trong route
 */
export class DayDto {
  @IsNotEmpty()
  @IsNumber()
  day: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityDto)
  activities: ActivityDto[];

  @IsNotEmpty()
  @IsString()
  day_start_time: string;

  @IsNotEmpty()
  @IsString()
  travel_mode: string; // driving, walking, ...
}

/**
 * DTO cho route_data_json
 */
export class RouteDataJsonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  optimized_route: DayDto[];

  @IsNotEmpty()
  @IsString()
  destination: string;

  @IsNotEmpty()
  @IsNumber()
  duration_days: number;

  @IsNotEmpty()
  @IsString()
  start_datetime: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

/**
 * DTO cho route object trong AI optimizer response
 */
export class RouteDto {
  @IsOptional()
  @IsString()
  route_id?: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  created_at?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsNumber()
  duration_days?: number;

  @IsOptional()
  @IsString()
  start_datetime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  start_location?: LocationDto;

  @IsOptional()
  @IsString()
  status?: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RouteDataJsonDto)
  route_data_json: RouteDataJsonDto;

  @IsOptional()
  @IsArray()
  alerts?: any[];

  @IsOptional()
  @IsString()
  id?: string;

}

/**
 * DTO cho request custom route (wrapper từ AI optimizer)
 */
export class CustomRouteDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RouteDto)
  route: RouteDto;
}
