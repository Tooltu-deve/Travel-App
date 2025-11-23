import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TravelRoute, TravelRouteDocument } from './schemas/travel-route.schema';
import { CreateTravelRouteDto } from './dto/create-travel-route.dto';
import { GenerateRouteDto } from './dto/generate-route.dto';
import { ItineraryService } from '../itinerary/itinerary.service';
import { PlaceDocument } from '../place/schemas/place.schema';

@Injectable()
export class TravelRouteService {
  private readonly aiOptimizerServiceUrl: string;
  private readonly googleDirectionsApiKey: string;

  constructor(
    @InjectModel(TravelRoute.name)
    private travelRouteModel: Model<TravelRouteDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly itineraryService: ItineraryService,
  ) {
    // Lấy URL từ environment variable, mặc định là localhost:8000
    this.aiOptimizerServiceUrl =
      this.configService.get<string>('AI_OPTIMIZER_SERVICE_URL') ||
      'http://localhost:8000';
    
    // Lấy Google Directions API key
    this.googleDirectionsApiKey =
      this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') ||
      this.configService.get<string>('GOOGLE_DISTANCE_MATRIX_API_KEY') ||
      '';
  }

  /**
   * Tạo route_id duy nhất
   */
  private generateRouteId(): string {
    return `route_${randomUUID()}`;
  }

  /**
   * Lưu lộ trình vào database
   * @param userId - ID của user tạo lộ trình
   * @param createDto - DTO chứa route_data_json và status
   * @returns TravelRouteDocument đã được lưu
   */
  async saveRoute(
    userId: string,
    createDto: CreateTravelRouteDto,
  ): Promise<TravelRouteDocument> {
    const routeId = this.generateRouteId();

    const travelRoute = new this.travelRouteModel({
      route_id: routeId,
      user_id: userId,
      created_at: new Date(),
      route_data_json: createDto.route_data_json,
      status: createDto.status || 'DRAFT',
    });

    return await travelRoute.save();
  }

  /**
   * Lấy lộ trình theo route_id
   */
  async findByRouteId(routeId: string): Promise<TravelRouteDocument | null> {
    return await this.travelRouteModel.findOne({ route_id: routeId }).exec();
  }

  /**
   * Lấy tất cả lộ trình của một user
   */
  async findByUserId(
    userId: string,
    status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
  ): Promise<TravelRouteDocument[]> {
    // Convert userId string thành ObjectId
    const userObjectId = Types.ObjectId.isValid(userId) 
      ? new Types.ObjectId(userId) 
      : userId;
    
    const query: any = { user_id: userObjectId };
    if (status) {
      query.status = status;
    }
    return await this.travelRouteModel
      .find(query)
      .sort({ created_at: -1 })
      .exec();
  }

  /**
   * Cập nhật status của lộ trình
   */
  async updateStatus(
    routeId: string,
    userId: string,
    status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
  ): Promise<TravelRouteDocument | null> {
    // Convert userId string thành ObjectId
    const userObjectId = Types.ObjectId.isValid(userId) 
      ? new Types.ObjectId(userId) 
      : userId;
    
    return await this.travelRouteModel
      .findOneAndUpdate(
        { route_id: routeId, user_id: userObjectId },
        { status },
        { new: true },
      )
      .exec();
  }

  /**
   * Convert POI từ database format sang format mà AI Optimizer cần
   * Sử dụng method từ ItineraryService
   */
  private convertPlaceToPoiFormat(place: PlaceDocument): any {
    return this.itineraryService.convertPlaceToOptimizerFormat(place);
  }

  /**
   * Gọi Google Directions API để lấy polyline và duration
   */
  private async fetchDirectionsInfo(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<{ encoded_polyline: string | null; travel_duration_minutes: number | null }> {
    if (!this.googleDirectionsApiKey) {
      return { encoded_polyline: null, travel_duration_minutes: null };
    }

    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=driving&key=${this.googleDirectionsApiKey}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 30000 }),
      );
      const data = response.data;

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        const overviewPolyline = route.overview_polyline;
        const encodedPolyline = overviewPolyline?.points || null;
        const durationSeconds = leg?.duration?.value || 0;
        const travelDurationMinutes = durationSeconds > 0 ? durationSeconds / 60.0 : null;

        return {
          encoded_polyline: encodedPolyline,
          travel_duration_minutes: travelDurationMinutes,
        };
      }

      return { encoded_polyline: null, travel_duration_minutes: null };
    } catch (error) {
      console.error('Directions API error:', error);
      return { encoded_polyline: null, travel_duration_minutes: null };
    }
  }

  /**
   * Enrich lộ trình đã tối ưu với Directions API (thêm polyline và duration)
   */
  private async enrichRouteWithDirections(
    optimizedRoute: any,
    currentLocation: { lat: number; lng: number },
  ): Promise<any> {
    const enrichedRoute: any[] = [];

    for (const dayData of optimizedRoute.optimized_route || []) {
      const enrichedActivities: any[] = [];
      let previousLocation = currentLocation; // Bắt đầu từ current_location

      for (const poi of dayData.activities || []) {
        const poiLocation = poi.location;
        if (!poiLocation || !poiLocation.lat || !poiLocation.lng) {
          enrichedActivities.push(poi);
          continue;
        }

        // Gọi Directions API
        const directionsInfo = await this.fetchDirectionsInfo(
          previousLocation,
          { lat: poiLocation.lat, lng: poiLocation.lng },
        );

        // Thêm polyline và duration vào POI
        const enrichedPoi = {
          ...poi,
          encoded_polyline: directionsInfo.encoded_polyline,
          travel_duration_minutes: directionsInfo.travel_duration_minutes,
        };

        enrichedActivities.push(enrichedPoi);
        previousLocation = { lat: poiLocation.lat, lng: poiLocation.lng };
      }

      enrichedRoute.push({
        ...dayData,
        activities: enrichedActivities,
      });
    }

    return { optimized_route: enrichedRoute };
  }

  /**
   * Gọi AI Optimizer Service để tối ưu lộ trình (chỉ tối ưu, không enrich)
   */
  private async callAiOptimizer(poiList: any[], generateDto: GenerateRouteDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiOptimizerServiceUrl}/optimize-route`,
          {
            poi_list: poiList,
            user_mood: generateDto.user_mood,
            duration_days: generateDto.duration_days,
            current_location: generateDto.current_location,
            start_datetime: generateDto.start_datetime,
            ecs_score_threshold: generateDto.ecs_score_threshold || 0.0,
          },
          {
            timeout: 120000, // 2 phút timeout
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          `AI Optimizer Service error: ${error.response.data?.message || error.response.statusText}`,
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else if (error.request) {
        throw new HttpException(
          'Không thể kết nối đến AI Optimizer Service. Vui lòng thử lại sau.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      } else {
        throw new HttpException(
          `Lỗi khi gọi AI Optimizer Service: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  /**
   * Tạo và lưu lộ trình theo đúng flow:
   * 1. Lọc POI từ database (sử dụng ItineraryService)
   * 2. Gọi AI Optimizer để tối ưu
   * 3. Enrich với Directions API
   * 4. Lưu vào database
   */
  async generateAndSaveRoute(
    userId: string,
    generateDto: GenerateRouteDto,
  ): Promise<TravelRouteDocument> {
    // Bước 1: Lọc POI từ database (sử dụng ItineraryService)
    const places = await this.itineraryService.filterPoisByBudgetAndDestination(
      generateDto.budget,
      generateDto.destination,
    );

    // Convert sang format mà AI Optimizer cần
    const poiList = places.map((place) => this.convertPlaceToPoiFormat(place));

    // Bước 2: Gọi AI Optimizer Service để tối ưu
    const optimizedRoute = await this.callAiOptimizer(poiList, generateDto);

    // Bước 3: Enrich với Directions API (thêm polyline và duration)
    const enrichedRoute = await this.enrichRouteWithDirections(
      optimizedRoute,
      generateDto.current_location,
    );

    // Bước 4: Lưu vào database với status DRAFT
    const routeId = this.generateRouteId();

    // Convert userId string thành ObjectId
    const userObjectId = Types.ObjectId.isValid(userId) 
      ? new Types.ObjectId(userId) 
      : userId;

    const travelRoute = new this.travelRouteModel({
      route_id: routeId,
      user_id: userObjectId,
      created_at: new Date(),
      route_data_json: enrichedRoute, // Lưu route đã được enrich
      status: 'DRAFT',
    });

    return await travelRoute.save();
  }

  /**
   * Xóa lộ trình DRAFT (khi user từ chối)
   */
  async deleteDraftRoute(routeId: string, userId: string): Promise<boolean> {
    // Convert userId string thành ObjectId
    const userObjectId = Types.ObjectId.isValid(userId) 
      ? new Types.ObjectId(userId) 
      : userId;
    
    const result = await this.travelRouteModel
      .deleteOne({
        route_id: routeId,
        user_id: userObjectId,
        status: 'DRAFT', // Chỉ cho phép xóa DRAFT
      })
      .exec();

    return result.deletedCount > 0;
  }
}

