import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnrichPoiDto {
  @IsString()
  @IsNotEmpty()
  googlePlaceId: string;

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}

export class EnrichedPoiResponseDto {
  // Core identifiers & basic info
  googlePlaceId: string;
  name: string;
  address: string;
  description?: string;
  type: string;
  types?: string[];

  // Enriched details
  rating?: number;
  editorialSummary?: string | null;
  websiteUri?: string;
  contactNumber?: string;
  photos?: Array<{
    name: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
  reviews?: Array<{
    name?: string;
    relativePublishTimeDescription?: string;
    rating?: number;
    text?: string;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
  lastEnrichedAt?: Date;

  // Extra business fields
  budgetRange?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  location: {
    type: string;
    coordinates: number[]; // [lon, lat]
  };
  emotionalTags?: Record<string, number>;
  
  // POI Function Classification Fields
  function?: string;
  functionPriority?: number;
  includeInDailyRoute?: boolean;
}


