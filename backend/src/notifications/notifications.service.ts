import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType, EntityType } from './schemas/notification.schema';

interface CreateNotificationDto {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message?: string;
  entityType?: EntityType;
  entityId?: Types.ObjectId | null;
}

interface NotificationFilter {
  isRead?: boolean;
  type?: NotificationType;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    const notification = new this.notificationModel({
      ...dto,
      isRead: false,
    });
    return notification.save();
  }

  async getNotifications(userId: Types.ObjectId, filters: NotificationFilter = {}): Promise<Notification[]> {
    const query: any = { userId };
    if (filters.isRead !== undefined) query.isRead = filters.isRead;
    if (filters.type) query.type = filters.type;
    return this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  async getUnreadCount(userId: Types.ObjectId): Promise<number> {
    return this.notificationModel.countDocuments({ userId, isRead: false });
  }

  async markAsRead(userId: Types.ObjectId, notificationId: Types.ObjectId): Promise<void> {
    const result = await this.notificationModel.updateOne(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
    );
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Notification not found or not owned by user');
    }
  }

  async markAllAsRead(userId: Types.ObjectId): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } },
    );
    return result.modifiedCount;
  }

  async deleteOne(userId: Types.ObjectId, notificationId: Types.ObjectId): Promise<void> {
    const result = await this.notificationModel.deleteOne({ _id: notificationId, userId });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Notification not found or not owned by user');
    }
  }

  async deleteAll(userId: Types.ObjectId): Promise<number> {
    const result = await this.notificationModel.deleteMany({ userId });
    return result.deletedCount;
  }
}
