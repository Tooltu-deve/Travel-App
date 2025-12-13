import { IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['DRAFT', 'CONFIRMED', 'MAIN'])
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';

  @IsOptional()
  title?: string;
}

