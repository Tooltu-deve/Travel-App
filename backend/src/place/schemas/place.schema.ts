import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PlaceDocument = Place & Document;

export enum PlaceTypes {
    RESTAURANT = 'restaurant',
    HOTEL = 'hotel',
    ATTRACTION = 'tourist_attraction',
    OTHER = 'other',
}

// Định nghĩa cấu trúc cho GeoJSON Point
@Schema({ _id: false })
class Point {
    @Prop({ type: String, enum: ['Point'], default: 'Point' })
    type: string;

    @Prop({ type: [Number], required: true })
    coordinates: number[]; // [longitude, latitude]
}

// Định nghĩa cấu trúc cho Giờ mở cửa
@Schema({ _id: false })
class OpeningHours {
    @Prop()
    openNow?: boolean;

    @Prop([String])
    weekdayDescriptions?: string[];
}

@Schema({ _id: false })
class PhotoAttribution {
  @Prop()
  displayName?: string;

  @Prop()
  uri?: string;

  @Prop()
  photoUri?: string;
}

@Schema({ _id: false })
class PlacePhoto {
  @Prop({ required: true })
  name: string;

  @Prop()
  widthPx?: number;

  @Prop()
  heightPx?: number;

  @Prop({ type: [PhotoAttribution], default: [] })
  authorAttributions?: PhotoAttribution[];
}

@Schema({ _id: false })
class PlaceReview {
  @Prop()
  name?: string;

  @Prop()
  relativePublishTimeDescription?: string;

  @Prop()
  rating?: number;

  @Prop()
  text?: string;

  @Prop({ type: [PhotoAttribution], default: [] })
  authorAttributions?: PhotoAttribution[];
}

@Schema({ timestamps: true })
export class Place {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, unique: true, index: true })
    googlePlaceId: string; // Dùng làm khóa chính để tìm kiếm

    @Prop({ required: true })
    address: string;

    @Prop()
    description?: string;

    @Prop({ type: String, default: PlaceTypes.OTHER })
    type: string;

    @Prop([String])
    types?: string[];

    @Prop({ type: [PlacePhoto], default: [] })
    photos?: PlacePhoto[];

    @Prop()
    rating?: number;

    @Prop()
    websiteUri?: string;

    @Prop()
    contactNumber?: string;

    @Prop({ type: String })
    editorialSummary?: string;

    @Prop({ type: [PlaceReview], default: [] })
    reviews?: PlaceReview[];

    @Prop({ type: String })
    budgetRange?: string; // vd: 'free', 'affordable'

    @Prop({ type: OpeningHours }) // Object lồng nhau
    openingHours?: OpeningHours;

    @Prop({ type: Point, index: '2dsphere', required: true }) // Quan trọng: index 2dsphere cho GeoJSON
    location: Point;

    @Prop({ type: MongooseSchema.Types.Map, of: Number }) // Lưu trữ tags cảm xúc
    emotionalTags?: Map<string, number>;

    @Prop({ type: Date, default: null })
    lastEnrichedAt?: Date;
}

export const PlaceSchema = SchemaFactory.createForClass(Place);