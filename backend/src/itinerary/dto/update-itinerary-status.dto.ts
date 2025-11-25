import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateItineraryStatusDto {
  @IsEnum(['DRAFT', 'CONFIRMED', 'ARCHIVED'], {
    message: 'status phải là DRAFT, CONFIRMED hoặc ARCHIVED',
  })
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';

  @IsOptional()
  @IsString({ message: 'title phải là chuỗi' })
  @MaxLength(120, { message: 'title không được vượt quá 120 ký tự' })
  title?: string;
}

