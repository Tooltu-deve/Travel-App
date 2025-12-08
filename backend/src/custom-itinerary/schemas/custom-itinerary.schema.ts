import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

export type CustomItineraryDocument = CustomItinerary & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class CustomItinerary {
  @Prop({ required: true, unique: true, index: true })
  route_id: string;

  @Prop({ required: true })
  user_id: string;

  @Prop({ default: 'Lộ trình mới' })
  title: string;

  @Prop({ type: String, default: null })
  destination: string | null;

  @Prop({ enum: ['DRAFT', 'CONFIRMED', 'MAIN'], default: 'DRAFT' })
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';

  @Prop({ type: Boolean, default: false })
  optimize?: boolean;

  @Prop({ type: SchemaTypes.Mixed })
  route_data_json: any;
}

export const CustomItinerarySchema = SchemaFactory.createForClass(CustomItinerary);

