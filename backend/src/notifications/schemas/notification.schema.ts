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

  @Prop({ type: Boolean, default: false, index: true })
  isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
