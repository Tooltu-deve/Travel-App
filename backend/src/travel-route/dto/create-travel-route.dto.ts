import { IsNotEmpty, IsObject, IsString, IsEnum, IsOptional } from 'class-validator';

export class CreateTravelRouteDto {
  @IsNotEmpty({ message: 'route_data_json không được để trống' })
  @IsObject({ message: 'route_data_json phải là object' })
  route_data_json: any; // Enriched route JSON từ AI Optimizer Service

  @IsOptional()
  @IsEnum(['DRAFT', 'CONFIRMED', 'ARCHIVED'], {
    message: 'status phải là DRAFT, CONFIRMED hoặc ARCHIVED',
  })
  status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
}

