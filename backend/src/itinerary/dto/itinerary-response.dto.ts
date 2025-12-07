export interface WeatherAlertDto {
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  from?: string;
  to?: string;
  tags?: string[];
}

export class ItineraryResponseDto {
  route_id: string;
  user_id: string;
  created_at: Date;
  title?: string;
  destination?: string;
  duration_days?: number;
  start_datetime?: Date | null;
  start_location?: {
    lat: number;
    lng: number;
  };
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';
  route_data_json: any;
  alerts?: WeatherAlertDto[];
  id: string;
}

