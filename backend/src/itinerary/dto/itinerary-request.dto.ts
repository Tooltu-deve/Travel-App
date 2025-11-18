import { IsString, IsNumber, IsOptional, IsObject, IsArray, ValidateNested, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

class PoiDto {
  @IsString()
  google_place_id: string;

  @IsString()
  name: string;

  @IsObject()
  emotional_tags: Record<string, number>;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsOptional()
  @IsObject()
  opening_hours?: any;
}

export class ItineraryRequestDto {
  @IsString()
  @IsOptional()
  destination?: string; // Tên thành phố hoặc địa điểm

  @IsString()
  @IsOptional()
  @IsIn(['free', 'cheap', 'affordable', 'expensive', 'luxury'])
  budgetRange?: string; // Lọc theo budget range

  @IsNumber()
  @Min(0)
  @IsOptional()
  travelRadiusKm?: number; // Bán kính từ current_location (km)

  @ValidateNested()
  @Type(() => LocationDto)
  current_location: LocationDto;

  @IsString()
  start_datetime: string; // ISO 8601 datetime (bắt buộc, 5h-9h sáng)

  @IsString()
  user_mood: string; // Mood để tính ECS

  @IsNumber()
  @Min(1)
  duration_days: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  ecs_score_threshold?: number; // Ngưỡng ECS tối thiểu (mặc định: 0.0)
}

