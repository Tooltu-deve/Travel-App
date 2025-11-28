import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiItineraryDocument = AiItinerary & Document;

@Schema({
    collection: 'ai_itineraries',
    timestamps: true,
})
export class AiItinerary {
    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    userId: Types.ObjectId;

    @Prop({ required: true })
    sessionId: string;

    @Prop({ required: true })
    title: string; // e.g., "Hà Nội 2 ngày - Cặp đôi văn hóa"

    @Prop({ type: Object, required: true })
    preferences: {
        travel_style?: string;
        group_type?: string;
        budget_range?: string;
        interests?: string[];
        duration?: string;
        start_location?: string;
        special_requests?: string[];
    };

    @Prop({ type: [Object], required: true })
    itinerary: Array<{
        day: number;
        time: string;
        activity: string;
        place: {
            googlePlaceId: string;
            name: string;
            address: string;
            type: string;
            location: {
                type: string;
                coordinates: [number, number];
            };
            budgetRange: string;
            openingHours?: object;
            emotionalTags?: object;
            similarity_score?: number;
        };
        duration_minutes?: number;
        estimated_cost?: number;
        notes?: string;
        // New fields for AI Optimizer integration
        ecs_score?: number;
        estimated_arrival?: string;
        estimated_departure?: string;
        // New fields for Google Directions enrichment
        encoded_polyline?: string;
        travel_duration_minutes?: number;
        distance_meters?: number;
        distance_text?: string;
    }>;

    @Prop({ type: Object })
    metadata: {
        stage: string;
        optimization_applied: boolean;
        weather_checked: boolean;
        budget_calculated: boolean;
        total_estimated_cost?: number;
        total_duration?: string;
        weather_conditions?: object;
        // New field for tracking Directions API enrichment
        directions_enriched?: boolean;
        enriched_at?: string;
    };

    @Prop({ type: String, enum: ['draft', 'completed', 'saved', 'archived'], default: 'completed' })
    status: string;

    @Prop({ type: [String], default: [] })
    tags: string[]; // e.g., ['cultural', 'couple', 'hanoi', '2-days']

    @Prop({ type: String })
    notes: string;

    @Prop({ type: Date })
    travel_date: Date;

    @Prop({ type: Boolean, default: false })
    is_favorite: boolean;

    @Prop({ type: Number, min: 1, max: 5 })
    rating: number;

    @Prop({ type: String })
    feedback: string;

    // Timestamps tự động
    createdAt: Date;
    updatedAt: Date;
}

export const AiItinerarySchema = SchemaFactory.createForClass(AiItinerary);