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
  BadRequestException,
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
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    return this.notificationsService.getNotifications(userObjectId, filters);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user.userId;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    await this.notificationsService.markAsRead(userObjectId, new Types.ObjectId(id));
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllAsRead(@Request() req) {
    const userId = req.user.userId;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    await this.notificationsService.markAllAsRead(userObjectId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOne(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    await this.notificationsService.deleteOne(userObjectId, new Types.ObjectId(id));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAll(@Request() req) {
    const userId = req.user.userId;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    const userObjectId = new Types.ObjectId(userId as string);
    await this.notificationsService.deleteAll(userObjectId);
  }
}
