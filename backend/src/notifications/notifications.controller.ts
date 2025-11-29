import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { Types } from 'mongoose';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @Request() req,
    @Query() query: GetNotificationsQueryDto,
  ) {
    const userId = req.user.userId;
    const filters: any = {};
    if (query.isRead !== undefined) filters.isRead = query.isRead === 'true';
    if (query.type) filters.type = query.type;
    return this.notificationsService.getNotifications(new Types.ObjectId(userId), filters);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user.userId;
    const count = await this.notificationsService.getUnreadCount(new Types.ObjectId(userId));
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.notificationsService.markAsRead(new Types.ObjectId(userId), new Types.ObjectId(id));
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllAsRead(@Request() req) {
    const userId = req.user.userId;
    await this.notificationsService.markAllAsRead(new Types.ObjectId(userId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOne(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.notificationsService.deleteOne(new Types.ObjectId(userId), new Types.ObjectId(id));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAll(@Request() req) {
    const userId = req.user.userId;
    await this.notificationsService.deleteAll(new Types.ObjectId(userId));
  }
}
