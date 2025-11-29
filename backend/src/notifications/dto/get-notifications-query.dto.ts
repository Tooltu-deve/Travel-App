import { IsOptional, IsBooleanString, IsEnum } from 'class-validator';
import type { NotificationType } from '../schemas/notification.schema';

export class GetNotificationsQueryDto {
  @IsOptional()
  @IsBooleanString()
  isRead?: string;

  @IsOptional()
  @IsEnum(['favorite', 'itinerary', 'account', 'system'])
  type?: NotificationType;
}