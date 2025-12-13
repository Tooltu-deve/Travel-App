import { IsNotEmpty, IsString, IsNumber, IsObject, IsOptional, Min, IsArray, IsIn } from 'class-validator';

export class GenerateRouteDto {
  @IsNotEmpty({ message: 'budget không được để trống' })
  @IsString({ message: 'budget phải là chuỗi' })
  budget: string;

  @IsNotEmpty({ message: 'destination không được để trống' })
  @IsString({ message: 'destination phải là chuỗi' })
  destination: string;

  @IsNotEmpty({ message: 'user_mood không được để trống' })
  @IsArray({ message: 'user_mood phải là mảng' })
  @IsString({ each: true, message: 'mỗi phần tử user_mood phải là chuỗi' })
  user_mood: string[];

  @IsNotEmpty({ message: 'duration_days không được để trống' })
  @IsNumber({}, { message: 'duration_days phải là số' })
  @Min(1, { message: 'duration_days phải lớn hơn 0' })
  duration_days: number;

  @IsNotEmpty({ message: 'start_location không được để trống' })
  @IsString({ message: 'start_location phải là chuỗi' })
  start_location: string;

  @IsOptional()
  @IsString({ message: 'start_datetime phải là chuỗi ISO 8601' })
  start_datetime?: string;

  @IsOptional()
  @IsNumber({}, { message: 'ecs_score_threshold phải là số' })
  ecs_score_threshold?: number;

  @IsOptional()
  @IsIn(['driving', 'walking', 'bicycling', 'transit'], { message: 'travel_mode không hợp lệ' })
  travel_mode?: string;

  @IsOptional()
  @IsNumber({}, { message: 'poi_per_day phải là số' })
  @Min(1, { message: 'poi_per_day phải >= 1' })
  poi_per_day?: number;
}

