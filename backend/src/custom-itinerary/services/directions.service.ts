import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GoogleDirectionsResponse } from '../interfaces/google-directions-response.interface';
import { PlaceWithRouteDto, DayWithRoutesDto, CalculateRoutesResponseDto } from '../dto/custom-itinerary-response.dto';
import { PlaceDto, DayDto, CalculateRoutesDto } from '../dto/calculate-routes.dto';
/**
 * Service xử lý logic tính toán route và polyline
 * 
 * Tuân thủ SOLID principles:
 * - Single Responsibility: Chỉ xử lý logic directions và route calculation
 * - Open/Closed: Dễ mở rộng thêm logic tối ưu route
 * - Dependency Inversion: Phụ thuộc vào abstraction (HttpService, ConfigService)
 * 
 * Tuân thủ OOP:
 * - Encapsulation: Private methods cho logic nội bộ
 * - Separation of Concerns: Tách biệt các concern (directions API, processing)
 */
@Injectable()
export class DirectionsService {
  private readonly logger = new Logger(DirectionsService.name);
  private readonly googleDirectionsApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.googleDirectionsApiKey = this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') || '';
    
    if (!this.googleDirectionsApiKey) {
      this.logger.warn('Missing GOOGLE_DIRECTIONS_API_KEY in environment variables');
    }
  }

  /**
   * Gọi Google Directions API để lấy route giữa 2 điểm
   * Private method - encapsulation
   * 
   * @param origin - Điểm xuất phát (place_id hoặc lat,lng)
   * @param destination - Điểm đến (place_id hoặc lat,lng)
   * @param mode - Phương tiện di chuyển (driving, walking, bicycling, transit)
   * @returns Dữ liệu route từ Google Directions API
   */
  private async getDirections(
    origin: string,
    destination: string,
    mode: string = 'driving',
  ): Promise<GoogleDirectionsResponse> {
    try {
      const url = 'https://maps.googleapis.com/maps/api/directions/json';
      const params = {
        origin,
        destination,
        mode,
        key: this.googleDirectionsApiKey,
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      if (response.data.status !== 'OK') {
        throw new BadRequestException(`Directions API error: ${response.data.status}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Lỗi khi gọi Directions API: ${error.message}`);
      throw new BadRequestException('Không thể lấy thông tin route');
    }
  }

  /**
   * Tính toán route cho một day (nhiều places)
   * Private method - encapsulation
   * 
   * @param places - Mảng các place trong một day
   * @returns Mảng places đã được thêm encoded_polyline và travel_duration_minutes
   */
  private async calculateRoutesForDay(places: PlaceDto[]): Promise<PlaceWithRouteDto[]> {
    const result: PlaceWithRouteDto[] = [];

    for (let i = 0; i < places.length; i++) {
      const currentPlace = places[i];
      let placeWithRoute: PlaceWithRouteDto;

      // Nếu không phải place cuối cùng, tính route đến place tiếp theo
      if (i < places.length - 1) {
        const nextPlace = places[i + 1];
        
        // Gọi Directions API
        const directionsData = await this.getDirections(
          `${currentPlace.location.lat},${currentPlace.location.lng}`,
          `${nextPlace.location.lat},${nextPlace.location.lng}`,
          currentPlace.travelMode || 'driving',
        );

        const route = directionsData.routes[0];
        const leg = route.legs[0];

        // Tạo object PlaceWithRouteDto với snake_case (nhất quán với hệ thống)
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          location: currentPlace.location,
          travelMode: currentPlace.travelMode,
          encoded_polyline: route.overview_polyline.points,
          travel_duration_minutes: Math.round(leg.duration.value / 60),
        };
      } else {
        // Place cuối cùng không có route tiếp theo
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          location: currentPlace.location,
          travelMode: currentPlace.travelMode,
          encoded_polyline: null,
          travel_duration_minutes: null,
        };
      }

      result.push(placeWithRoute);
    }

    return result;
  }

  /**
   * Tính toán routes cho toàn bộ itinerary (nhiều days)
   * Public method - business logic chính
   * 
   * @param itineraryData - JSON object chứa days, mỗi day có places
   * @returns JSON object đã được thêm encoded_polyline và travel_duration_minutes cho mỗi place
   */
  async calculateRoutes(itineraryData: CalculateRoutesDto): Promise<CalculateRoutesResponseDto> {
    try {
      const { days } = itineraryData;

      if (!days || !Array.isArray(days)) {
        throw new BadRequestException('Invalid input: days must be an array');
      }

      const processedDays: DayWithRoutesDto[] = [];

      for (const day of days) {
        if (!day.places || !Array.isArray(day.places)) {
          throw new BadRequestException('Invalid input: each day must have places array');
        }

        const processedPlaces = await this.calculateRoutesForDay(day.places);

        processedDays.push({
          dayNumber: day.dayNumber,
          places: processedPlaces,
        });
      }

      this.logger.log(`Successfully calculated routes for ${days.length} days`);

      return {
        days: processedDays,
      };
    } catch (error) {
      this.logger.error(`Lỗi khi tính toán routes: ${error.message}`);
      throw error;
    }
  }
}
