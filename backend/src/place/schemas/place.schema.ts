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

    @Prop({ type: String, enum: PlaceTypes, default: PlaceTypes.OTHER })
    type: string;

    @Prop([String])
    types?: string[];

    @Prop([String])
    images?: string[];

    @Prop()
    rating?: number;

    @Prop({ type: String })
    budgetRange?: string; // vd: 'free', 'affordable'

    @Prop({ type: OpeningHours }) // Object lồng nhau
    openingHours?: OpeningHours;

    @Prop({ type: Point, index: '2dsphere', required: true }) // Quan trọng: index 2dsphere cho GeoJSON
    location: Point;

    @Prop({ type: MongooseSchema.Types.Map, of: Number }) // Lưu trữ tags cảm xúc
    emotionalTags?: Map<string, number>;
}

export const PlaceSchema = SchemaFactory.createForClass(Place);