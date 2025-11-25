export class ItineraryResponseDto {
  route_id: string;
  user_id: string;
  created_at: Date;
  title?: string;
  destination?: string;
  duration_days?: number;
  start_datetime?: Date | null;
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  route_data_json: any;
  id: string;
}

