import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotificationType = 'favorite' | 'itinerary' | 'account' | 'system';
export type EntityType = 'place' | 'itinerary' | 'system' | null;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['favorite', 'itinerary', 'account', 'system'], index: true })
  type: NotificationType;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String })
  message?: string;

  @Prop({ type: String, enum: ['place', 'itinerary', 'system'], default: null })
  entityType?: EntityType;

  @Prop({ type: Types.ObjectId, default: null })
  entityId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  routeId?: string | null;

  @Prop({ type: Boolean, default: false, index: true })
  isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });

// Optional: Convert to snake_case when returning as JSON
NotificationSchema.set('toJSON', {
  transform: function (doc, ret) {
    // Chuyển đổi sang snake_case nếu có thuộc tính
    if ('userId' in ret) {
      (ret as any).user_id = ret.userId;
      delete (ret as any).userId;
    }
    if ('entityType' in ret) {
      (ret as any).entity_type = ret.entityType;
      delete (ret as any).entityType;
    }
    if ('entityId' in ret) {
      (ret as any).entity_id = ret.entityId;
      delete (ret as any).entityId;
    }
    if ('routeId' in ret) {
      (ret as any).route_id = ret.routeId;
      delete (ret as any).routeId;
    }
    if ('isRead' in ret) {
      (ret as any).is_read = ret.isRead;
      delete (ret as any).isRead;
    }
    if ('createdAt' in ret) {
      (ret as any).created_at = ret.createdAt;
      delete (ret as any).createdAt;
    }
    if ('updatedAt' in ret) {
      (ret as any).updated_at = ret.updatedAt;
      delete (ret as any).updatedAt;
    }
    return ret;
  }
});
