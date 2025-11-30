import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ItineraryAlert = {
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  from?: string;
  to?: string;
  tags?: string[];
};

export type ItineraryDocument = Document & {
  _id: Types.ObjectId;
  route_id: string;
  user_id: Types.ObjectId;
  created_at: Date;
  title?: string;
  destination?: string;
  duration_days?: number;
  start_datetime?: Date | null;
  route_data_json: any;
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  id: string;
};

@Schema({
  collection: 'itineraries',
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Itinerary {
  _id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  route_id: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user_id: Types.ObjectId;

  @Prop({
    type: Date,
    required: true,
    default: Date.now,
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
  start_datetime?: Date | null;

  @Prop({
    type: Object,
    required: true,
  })
  route_data_json: any;

  @Prop({
    type: String,
    enum: ['DRAFT', 'CONFIRMED', 'ARCHIVED'],
    required: true,
    default: 'DRAFT',
    index: true,
  })
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';

  @Prop({
    type: [
      {
        type: { type: String },
        title: { type: String },
        message: { type: String },
        severity: {
          type: String,
          enum: ['info', 'warning', 'danger'],
          default: 'info',
        },
        from: { type: String },
        to: { type: String },
        tags: [{ type: String }],
      },
    ],
    default: [],
  })
  alerts?: ItineraryAlert[];
}

export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);

ItinerarySchema.virtual('id').get(function () {
  return this._id.toHexString();
});

ItinerarySchema.index({ user_id: 1, status: 1 });
ItinerarySchema.index({ created_at: -1 });

