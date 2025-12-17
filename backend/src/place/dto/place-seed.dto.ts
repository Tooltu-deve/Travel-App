interface Location {
  lat: number;
  lng: number;
}

interface OpeningHoursPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

interface OpeningHours {
  openNow?: boolean;
  periods?: OpeningHoursPeriod[];
  weekdayDescriptions?: string[];
}

export class PlaceSeedDto {
  placeID: string;
  emotional_tags: Map<string, number>;
  name: string;
  budget_range?: string;
  latitude: number;
  longitude: number;
  location: Location;
  formatted_address: string;
  type: string;
  types?: string[];
  opening_hours?: OpeningHours;
  
  // POI Function Classification Fields
  function?: string;
  functionPriority?: number;
  includeInDailyRoute?: boolean;
}