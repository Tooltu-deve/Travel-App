import { IsNotEmpty, IsString, IsNumber, IsObject, IsOptional, Min } from 'class-validator';

export class GenerateRouteDto {
  @IsNotEmpty({ message: 'budget không được để trống' })
  @IsString({ message: 'budget phải là chuỗi' })
  budget: string; // Budget range để lọc POI (ví dụ: "low", "medium", "high")

  @IsNotEmpty({ message: 'destination không được để trống' })
  @IsString({ message: 'destination phải là chuỗi' })
  destination: string; // Điểm đến (tên thành phố hoặc địa điểm)

  @IsNotEmpty({ message: 'user_mood không được để trống' })
  @IsString({ message: 'user_mood phải là chuỗi' })
  user_mood: string; // Mood của user

  @IsNotEmpty({ message: 'duration_days không được để trống' })
  @IsNumber({}, { message: 'duration_days phải là số' })
  @Min(1, { message: 'duration_days phải lớn hơn 0' })
  duration_days: number; // Số ngày du lịch

  @IsNotEmpty({ message: 'current_location không được để trống' })
  @IsObject({ message: 'current_location phải là object' })
  current_location: {
    lat: number;
    lng: number;
  }; // Vị trí hiện tại của user

  @IsOptional()
  @IsString({ message: 'start_datetime phải là chuỗi ISO 8601' })
  start_datetime?: string; // Thời gian khởi hành (ISO 8601)

  @IsOptional()
  @IsNumber({}, { message: 'ecs_score_threshold phải là số' })
  ecs_score_threshold?: number; // Ngưỡng ECS tối thiểu
}

