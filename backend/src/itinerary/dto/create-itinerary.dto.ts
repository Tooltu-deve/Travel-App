import { IsNotEmpty, IsObject, IsEnum, IsOptional } from 'class-validator';

export class CreateItineraryDto {
  @IsNotEmpty({ message: 'route_data_json không được để trống' })
  @IsObject({ message: 'route_data_json phải là object' })
  route_data_json: any;

  @IsOptional()
  @IsEnum(['DRAFT', 'CONFIRMED', 'ARCHIVED'], {
    message: 'status phải là DRAFT, CONFIRMED hoặc ARCHIVED',
  })
  status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
}

