import { IsEnum } from 'class-validator';

export class UpdateRouteStatusDto {
  @IsEnum(['DRAFT', 'CONFIRMED', 'ARCHIVED'], {
    message: 'status phải là DRAFT, CONFIRMED hoặc ARCHIVED',
  })
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
}

