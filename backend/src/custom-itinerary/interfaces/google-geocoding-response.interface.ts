/**
 * Interfaces cho Google Geocoding API Response
 * Tuân thủ coding convention: PascalCase cho interfaces
 * Separation of Concerns: Tách biệt API response types khỏi domain models
 */

export interface GoogleGeocodingGeometry {
  location: {
    lat: number;
    lng: number;
  };
  location_type: string;
  viewport: {
    northeast: {
      lat: number;
      lng: number;
    };
    southwest: {
      lat: number;
      lng: number;
    };
  };
}

export interface GoogleGeocodingResult {
  address_components: any[];
  formatted_address: string;
  geometry: GoogleGeocodingGeometry;
  place_id: string;
  types: string[];
}

export interface GoogleGeocodingResponse {
  results: GoogleGeocodingResult[];
  status: string;
}
