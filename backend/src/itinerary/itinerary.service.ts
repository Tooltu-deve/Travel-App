import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Place, PlaceDocument } from '../place/schemas/place.schema';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import { GenerateRouteDto } from './dto/generate-route.dto';
import { CreateItineraryDto } from './dto/create-itinerary.dto';

@Injectable()
export class ItineraryService {
  private readonly aiOptimizerServiceUrl: string;
  private readonly googleDirectionsApiKey: string;

  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    @InjectModel(Itinerary.name) private itineraryModel: Model<ItineraryDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiOptimizerServiceUrl =
      this.configService.get<string>('AI_OPTIMIZER_SERVICE_URL') ||
      process.env.AI_OPTIMIZER_URL ||
      'http://localhost:8000';

    this.googleDirectionsApiKey =
      this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') ||
      this.configService.get<string>('GOOGLE_DISTANCE_MATRIX_API_KEY') ||
      process.env.GOOGLE_DIRECTIONS_API_KEY ||
      process.env.GOOGLE_DISTANCE_MATRIX_API_KEY ||
      '';
  }

  async saveItinerary(
    userId: string,
    createDto: CreateItineraryDto,
  ): Promise<ItineraryDocument> {
    const routeId = this.generateRouteId();

    const itinerary = new this.itineraryModel({
      route_id: routeId,
      user_id: userId,
      created_at: new Date(),
      route_data_json: createDto.route_data_json,
      status: createDto.status || 'DRAFT',
    });

    return await itinerary.save();
  }

  async findByRouteId(routeId: string): Promise<ItineraryDocument | null> {
    return this.itineraryModel.findOne({ route_id: routeId }).exec();
  }

  async findByUserId(
    userId: string,
    status?: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
  ): Promise<ItineraryDocument[]> {
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    const query: any = { user_id: userObjectId };
    if (status) {
      query.status = status;
    }

    return this.itineraryModel
      .find(query)
      .sort({ created_at: -1 })
      .exec();
  }

  async updateStatus(
    routeId: string,
    userId: string,
    status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED',
    extra?: { title?: string },
  ): Promise<ItineraryDocument | null> {
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    const updatePayload: any = { status };
    if (extra?.title !== undefined) {
      updatePayload.title = extra.title;
      updatePayload['route_data_json.metadata.title'] = extra.title;
    }

    return this.itineraryModel
      .findOneAndUpdate(
        { route_id: routeId, user_id: userObjectId },
        updatePayload,
        { new: true },
      )
      .exec();
  }

  private generateRouteId(): string {
    return `route_${randomUUID()}`;
  }


  /**
   * Lọc POI theo thành phố (destination)
   * Tìm kiếm trong address và name
   */
  filterByCity(
    pois: PlaceDocument[],
    destination?: string,
  ): PlaceDocument[] {
    if (!destination) {
      return pois;
    }

    const destinationLower = destination.toLowerCase().trim();
    const destinationWords = destinationLower.split(/\s+/); // Tách thành các từ

    return pois.filter((poi) => {
      // Kiểm tra trong address (ưu tiên)
      const address = (poi.address || '').toLowerCase();
      
      // Tìm kiếm chính xác hoặc một phần của tên thành phố
      // Ví dụ: "Hồ Chí Minh" hoặc "TP.HCM" hoặc "Ho Chi Minh City"
      if (address.includes(destinationLower)) {
        return true;
      }

      // Tìm kiếm từng từ trong destination (cho trường hợp viết tắt)
      // Ví dụ: "HCM" sẽ match "Ho Chi Minh"
      const allWordsMatch = destinationWords.every(word => 
        word.length > 2 && address.includes(word)
      );
      if (allWordsMatch && destinationWords.length > 0) {
        return true;
      }

      // Kiểm tra trong name (nếu có)
      const name = (poi.name || '').toLowerCase();
      if (name.includes(destinationLower)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Lọc POI theo budget range
   */
  filterByBudget(
    pois: PlaceDocument[],
    budgetRange?: string,
  ): PlaceDocument[] {
    if (!budgetRange) {
      return pois;
    }

    return pois.filter((poi) => {
      const poiBudget = poi.budgetRange?.toLowerCase();
      return poiBudget === budgetRange.toLowerCase();
    });
  }


  /**
   * Lọc POI theo budget và destination từ database
   * @param budget - Budget range
   * @param destination - Tên thành phố
   * @returns Danh sách POI đã được lọc
   */
  async filterPoisByBudgetAndDestination(
    budget: string,
    destination: string,
  ): Promise<PlaceDocument[]> {
    // Lấy tất cả POI từ MongoDB
    let pois: PlaceDocument[] = await this.placeModel.find().exec();

    console.log(`📊 Tổng số POI trong DB: ${pois.length}`);

    // Lọc theo thành phố (destination)
    if (destination) {
      pois = this.filterByCity(pois, destination);
      console.log(`📍 Sau khi lọc theo thành phố "${destination}": ${pois.length} POI`);
    }

    // Lọc theo budget range
    if (budget) {
      const beforeCount = pois.length;
      const availableBudgets = new Set(
        pois.map((p) => p.budgetRange?.toLowerCase()).filter(Boolean),
      );
      console.log(
        `💰 Lọc theo budget "${budget}". Các budget có sẵn: ${Array.from(availableBudgets).join(', ') || 'không có'}`,
      );

      pois = this.filterByBudget(pois, budget);
      console.log(
        `💰 Sau khi lọc theo budget "${budget}": ${pois.length} POI (từ ${beforeCount} POI)`,
      );

      if (pois.length === 0 && beforeCount > 0) {
        console.warn(
          `⚠️  Không tìm thấy POI nào với budget "${budget}". Các budget có sẵn: ${Array.from(availableBudgets).join(', ')}`,
        );
      }
    }

    if (pois.length === 0) {
      throw new HttpException(
        `Không tìm thấy POI nào phù hợp với budget "${budget}" và destination "${destination}".`,
        HttpStatus.NOT_FOUND,
      );
    }

    return pois;
  }

  /**
   * Chuyển đổi PlaceDocument sang format cho AI Optimizer
   */
  convertPlaceToOptimizerFormat(poi: PlaceDocument): any {
    const [lng, lat] = poi.location.coordinates;

    // Chuyển đổi emotionalTags từ Map sang Object
    const emotionalTags: Record<string, number> = {};
    if (poi.emotionalTags) {
      poi.emotionalTags.forEach((value, key) => {
        emotionalTags[key] = value;
      });
    }

    // Chuyển đổi openingHours
    // Lưu ý: Schema hiện tại chỉ lưu openNow và weekdayDescriptions
    // Nếu cần periods, cần cập nhật schema hoặc lấy từ raw data
    let openingHours: any = {};
    if (poi.openingHours) {
      openingHours = {
        openNow: poi.openingHours.openNow,
        weekdayDescriptions: poi.openingHours.weekdayDescriptions,
      };
      
      // Nếu có periods trong raw data (từ MongoDB document), thêm vào
      const poiAny = poi as any;
      if (poiAny.openingHours?.periods) {
        openingHours.periods = poiAny.openingHours.periods;
      }
    }

    return {
      google_place_id: poi.googlePlaceId,
      name: poi.name,
      emotional_tags: emotionalTags,
      location: {
        lat: lat,
        lng: lng,
      },
      opening_hours: openingHours,
      visit_duration_minutes: 90, // Mặc định
    };
  }

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
        const travelDurationMinutes =
          durationSeconds > 0 ? durationSeconds / 60.0 : null;

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

  private async enrichRouteWithDirections(
    optimizedRoute: any,
    currentLocation: { lat: number; lng: number },
  ): Promise<any> {
    const enrichedRoute: any[] = [];

    for (const dayData of optimizedRoute.optimized_route || []) {
      const enrichedActivities: any[] = [];
      let previousLocation = currentLocation;

      for (const poi of dayData.activities || []) {
        const poiLocation = poi.location;
        if (!poiLocation || !poiLocation.lat || !poiLocation.lng) {
          enrichedActivities.push(poi);
          continue;
        }

        const directionsInfo = await this.fetchDirectionsInfo(
          previousLocation,
          { lat: poiLocation.lat, lng: poiLocation.lng },
        );

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

  private async callAiOptimizer(
    poiList: any[],
    generateDto: GenerateRouteDto,
  ): Promise<any> {
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
            timeout: 120000,
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

  async generateAndSaveRoute(
    userId: string,
    generateDto: GenerateRouteDto,
  ): Promise<ItineraryDocument> {
    const places = await this.filterPoisByBudgetAndDestination(
      generateDto.budget,
      generateDto.destination,
    );

    const poiList = places.map((place) =>
      this.convertPlaceToOptimizerFormat(place as any),
    );

    const optimizedRoute = await this.callAiOptimizer(poiList, generateDto);
    const enrichedRoute = await this.enrichRouteWithDirections(
      optimizedRoute,
      generateDto.current_location,
    );

    const routeId = this.generateRouteId();
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    const defaultTitle = generateDto.destination
      ? `Lộ trình ${generateDto.destination}`
      : 'Lộ trình mới';

    const metadata = {
      title: defaultTitle,
      destination: generateDto.destination,
      duration_days: generateDto.duration_days,
      start_datetime: generateDto.start_datetime || null,
      budget: generateDto.budget,
      user_mood: generateDto.user_mood,
      created_at: new Date().toISOString(),
    };

    const routeDataJson = {
      ...enrichedRoute,
      destination: metadata.destination,
      duration_days: metadata.duration_days,
      start_datetime: metadata.start_datetime,
      metadata: {
        ...(enrichedRoute?.metadata || {}),
        ...metadata,
      },
    };

    const itinerary = new this.itineraryModel({
      route_id: routeId,
      user_id: userObjectId,
      created_at: new Date(),
      route_data_json: routeDataJson,
      status: 'DRAFT',
      title: metadata.title,
      destination: metadata.destination,
      duration_days: metadata.duration_days,
      start_datetime: metadata.start_datetime
        ? new Date(metadata.start_datetime)
        : null,
    });

    return itinerary.save();
  }

  async deleteDraftRoute(routeId: string, userId: string): Promise<boolean> {
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    const result = await this.itineraryModel
      .deleteOne({
        route_id: routeId,
        user_id: userObjectId,
        status: 'DRAFT',
      })
      .exec();

    return result.deletedCount > 0;
  }
}

