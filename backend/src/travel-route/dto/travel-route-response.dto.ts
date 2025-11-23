export class TravelRouteResponseDto {
  route_id: string;
  user_id: string;
  created_at: Date;
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  route_data_json: any;
  id: string;
}

