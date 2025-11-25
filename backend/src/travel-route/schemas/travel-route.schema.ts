import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TravelRouteDocument = Document & {
  _id: Types.ObjectId;
  route_id: string;
  user_id: Types.ObjectId;
  created_at: Date;
  title?: string;
  destination?: string;
  duration_days?: number;
  start_datetime?: Date;
  route_data_json: any; // Lưu toàn bộ JSON enriched route
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  id: string;
};

@Schema({
  timestamps: false, // Tắt timestamps tự động vì chúng ta dùng created_at riêng
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class TravelRoute {
  _id: Types.ObjectId;

  @Prop({ 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  })
  route_id: string;

  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  })
  user_id: Types.ObjectId;

  @Prop({ 
    type: Date, 
    required: true, 
    default: Date.now 
  })
  created_at: Date;

  @Prop({
    type: String,
    required: false,
    default: null,
  })
  title?: string;

  @Prop({
    type: String,
    required: false,
    default: null,
  })
  destination?: string;

  @Prop({
    type: Number,
    required: false,
    default: null,
  })
  duration_days?: number;

  @Prop({
    type: Date,
    required: false,
    default: null,
  })
  start_datetime?: Date;

  @Prop({ 
    type: Object, 
    required: true 
  })
  route_data_json: any;

  @Prop({ 
    type: String, 
    enum: ['DRAFT', 'CONFIRMED', 'ARCHIVED'],
    required: true,
    default: 'DRAFT',
    index: true
  })
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
}

export const TravelRouteSchema = SchemaFactory.createForClass(TravelRoute);

TravelRouteSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Tạo index cho user_id và status để query nhanh hơn
TravelRouteSchema.index({ user_id: 1, status: 1 });
TravelRouteSchema.index({ created_at: -1 }); // Để sort theo thời gian tạo mới nhất

