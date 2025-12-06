/**
 * Interfaces cho Google Directions API Response
 * Tuân thủ coding convention: PascalCase cho interfaces
 * Separation of Concerns: Tách biệt API response types khỏi domain models
 */

export interface GoogleDirectionsLeg {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  end_address: string;
  end_location: {
    lat: number;
    lng: number;
  };
  start_address: string;
  start_location: {
    lat: number;
    lng: number;
  };
  steps: any[];
}

export interface GoogleDirectionsRoute {
  bounds: any;
  copyrights: string;
  legs: GoogleDirectionsLeg[];
  overview_polyline: {
    points: string;
  };
  summary: string;
  warnings: string[];
  waypoint_order: number[];
}

export interface GoogleDirectionsResponse {
  geocoded_waypoints: any[];
  routes: GoogleDirectionsRoute[];
  status: string;
}
