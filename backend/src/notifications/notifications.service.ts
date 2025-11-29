import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType, EntityType } from './schemas/notification.schema';

interface CreateNotificationDto {
  userId: string | Types.ObjectId;
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

  async getNotifications(userId: string | Types.ObjectId, filters: NotificationFilter = {}): Promise<any[]> {
    const query: any = { userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId };
    if (filters.isRead !== undefined) query.isRead = filters.isRead;
    if (filters.type) query.type = filters.type;
    const results = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
    return results.map((item: any) => ({
      _id: item._id,
      user_id: item.userId,
      type: item.type,
      title: item.title,
      message: item.message,
      entity_type: item.entityType,
      entity_id: item.entityId,
      is_read: item.isRead,
      created_at: item.createdAt || item.created_at,
      updated_at: item.updatedAt || item.updated_at,
    }));
  }

  async getUnreadCount(userId: string | Types.ObjectId): Promise<number> {
    return this.notificationModel.countDocuments({ userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId, isRead: false });
  }

  async markAsRead(userId: string | Types.ObjectId, notificationId: Types.ObjectId): Promise<void> {
    const result = await this.notificationModel.updateOne(
      { _id: notificationId, userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId },
      { $set: { isRead: true } },
    );
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Notification not found or not owned by user');
    }
  }

  async markAllAsRead(userId: string | Types.ObjectId): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId, isRead: false },
      { $set: { isRead: true } },
    );
    return result.modifiedCount;
  }

  async deleteOne(userId: string | Types.ObjectId, notificationId: Types.ObjectId): Promise<void> {
    const result = await this.notificationModel.deleteOne({ _id: notificationId, userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Notification not found or not owned by user');
    }
  }

  async deleteAll(userId: string | Types.ObjectId): Promise<number> {
    const result = await this.notificationModel.deleteMany({ userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId });
    return result.deletedCount;
  }
}
