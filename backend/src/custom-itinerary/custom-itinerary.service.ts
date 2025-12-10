import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomItinerary, CustomItineraryDocument } from './schemas/custom-itinerary.schema';
import { Itinerary } from '../itinerary/schemas/itinerary.schema';
import { ItineraryService } from '../itinerary/itinerary.service';
import { GoogleDirectionsResponse } from './interfaces/google-directions-response.interface';
import { OpenWeatherResponse } from './interfaces/openweather-response.interface';
import { PlaceWithRouteDto, DayWithRoutesDto, CalculateRoutesResponseDto, WeatherCheckResponseDto } from './dto/custom-itinerary-response.dto';
import { PlaceDto, CalculateRoutesDto } from './dto/calculate-routes.dto';

@Injectable()
export class CustomItineraryService {
  private readonly logger = new Logger(CustomItineraryService.name);
  private readonly openWeatherApiKey: string;
  private readonly googleDirectionsApiKey: string;
  private readonly googlePlacesApiKey: string;
  private readonly AUTOCOMPLETE_DELAY_MS = 150; // Debounce delay (ms) để hạn chế call liên tiếp

  constructor(
    @InjectModel(CustomItinerary.name)
    private readonly customItineraryModel: Model<CustomItineraryDocument>,
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<any>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly itineraryService: ItineraryService,
  ) {
    this.openWeatherApiKey = this.configService.get<string>('OPENWEATHER_API_KEY') || '';
    this.googleDirectionsApiKey = this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') || '';
    this.googlePlacesApiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') || this.googleDirectionsApiKey || '';
    if (!this.openWeatherApiKey || !this.googleDirectionsApiKey) {
      this.logger.warn('Missing API keys in environment variables');
    }
  }

  private generateRouteId(): string {
    return `route_${randomUUID()}`;
  }

  // --- Directions Logic ---
  private async getDirections(origin: string, destination: string, mode: string, optimize?: boolean): Promise<GoogleDirectionsResponse> {
    try {
      const url = 'https://maps.googleapis.com/maps/api/directions/json';
      const params: any = { origin, destination, mode, key: this.googleDirectionsApiKey };
      if (optimize !== undefined) {
        params.optimize = optimize;
      }
      const response = await firstValueFrom(this.httpService.get(url, { params }));
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
   * Calculate routes for a single day using Directions API
   * Each day can have its own travelMode (driving, walking, bicycling, transit)
   * This method calls Directions API for each segment between consecutive places
   * @param places Array of places for this day
   * @param travelMode Travel mode for this specific day (driving, walking, bicycling, transit)
   * @param optimize Whether to optimize waypoints order
   * @returns Array of places with route information (polyline, duration)
   */
  private async calculateRoutesForDay(places: PlaceDto[], travelMode: string, optimize?: boolean): Promise<PlaceWithRouteDto[]> {
    if (!travelMode) {
      throw new BadRequestException('travelMode is required for each day and must be provided by the frontend');
    }
    
    this.logger.debug(`Calculating routes for day with travelMode: ${travelMode}, ${places.length} places`);
    
    const result: PlaceWithRouteDto[] = [];
    
    // Geocode tất cả places trước để có tọa độ
    const placesWithLocation = await Promise.all(
      places.map(async (place) => {
        const location = await this.getCityCoordinates(place.address);
        return {
          ...place,
          location,
        };
      })
    );
    
    // For each place, calculate route to next place using this day's travelMode
    for (let i = 0; i < placesWithLocation.length; i++) {
      const currentPlace = placesWithLocation[i];
      let placeWithRoute: PlaceWithRouteDto;
      
      if (i < placesWithLocation.length - 1) {
        // Not the last place - calculate route to next place
        const nextPlace = placesWithLocation[i + 1];
        
        this.logger.debug(
          `Calling Directions API: ${currentPlace.name} -> ${nextPlace.name} with mode: ${travelMode}`
        );
        
        // Call Directions API with this day's specific travelMode
        const directionsData = await this.getDirections(
          `${currentPlace.location.lat},${currentPlace.location.lng}`,
          `${nextPlace.location.lat},${nextPlace.location.lng}`,
          travelMode, // Use the travelMode specific to this day
          optimize,
        );
        
        const route = directionsData.routes[0];
        const leg = route.legs[0];
        
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          address: currentPlace.address,
          location: currentPlace.location,
          encoded_polyline: route.overview_polyline.points,
          travel_duration_minutes: Math.round(leg.duration.value / 60),
        };
        
        this.logger.debug(
          `Route calculated: ${currentPlace.name} -> ${nextPlace.name}, duration: ${placeWithRoute.travel_duration_minutes} minutes`
        );
      } else {
        // Last place - no route to calculate
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          address: currentPlace.address,
          location: currentPlace.location,
          encoded_polyline: null,
          travel_duration_minutes: null,
        };
      }
      result.push(placeWithRoute);
    }
    
    this.logger.debug(`Completed route calculation for day with travelMode: ${travelMode}`);
    return result;
  }

  async calculateRoutes(
    itineraryData: CalculateRoutesDto,
    userId: string | null = null,
  ): Promise<CalculateRoutesResponseDto> {
    try {
      const routeId = this.generateRouteId();

      const { days } = itineraryData;
      if (!days || !Array.isArray(days)) {
        throw new BadRequestException('Invalid input: days must be an array');
      }
      // Process each day independently with its own travelMode
      // Each day calls Directions API separately with its specific travel mode
      const processedDaysPromises = days.map(async (day) => {
        if (!day.places || !Array.isArray(day.places)) {
          throw new BadRequestException('Invalid input: each day must have places array');
        }
        if (!day.startLocation) {
          throw new BadRequestException('Invalid input: each day must have startLocation');
        }
        if (!day.travelMode) {
          throw new BadRequestException('Invalid input: each day must have travelMode');
        }
        
        this.logger.log(`Processing day ${day.dayNumber} with travelMode: ${day.travelMode}`);
        
        // Geocode startLocation để lấy tọa độ
        const startLocationCoordinates = await this.getCityCoordinates(day.startLocation);
        
        // Call Directions API for this day with its specific travelMode
        // calculateRoutesForDay will call getDirections for each place-to-place segment using day.travelMode
        const processedPlaces = await this.calculateRoutesForDay(day.places, day.travelMode, itineraryData.optimize);
        
        this.logger.log(`Completed day ${day.dayNumber} with ${processedPlaces.length} places`);
        
        return {
          dayNumber: day.dayNumber,
          travelMode: day.travelMode,
          startLocation: day.startLocation,
          startLocationCoordinates,
          places: processedPlaces 
        };
      });
      
      // Process all days in parallel for better performance
      const processedDays = await Promise.all(processedDaysPromises);
      
      // Sort by dayNumber to ensure correct order
      processedDays.sort((a, b) => a.dayNumber - b.dayNumber);
      
      this.logger.log(`Successfully calculated routes for ${days.length} days with different travel modes`);

      // Lưu vào collection custom-itineraries
      const saved = await this.customItineraryModel.create({
        route_id: routeId,
        user_id: userId,
        title: 'Lộ trình mới',
        destination: itineraryData.destination,
        status: 'DRAFT',
        optimize: itineraryData.optimize ?? false,
        start_date: itineraryData.start_date || null,
        end_date: itineraryData.end_date || null,
        route_data_json: {
          days: processedDays,
          optimize: itineraryData.optimize,
          destination: itineraryData.destination,
          start_date: itineraryData.start_date,
          end_date: itineraryData.end_date,
        },
      });

      return {
        days: processedDays,
        optimize: itineraryData.optimize,
        // Các field meta để tương thích với ItineraryResponseDto
        route_id: saved.route_id,
        user_id: saved.user_id,
        title: saved.title,
        destination: saved.destination,
        status: saved.status,
        start_date: saved.start_date || null,
        end_date: saved.end_date || null,
      };
    } catch (error) {
      this.logger.error(`Lỗi khi tính toán routes: ${error.message}`);
      throw error;
    }
  }

  // --- Places Autocomplete ---
  async autocompletePlaces(
    userInput: string,
    token?: string,
  ): Promise<
    Array<{
      description: string;
      place_id: string;
      structured_formatting?: {
        main_text: string;
        secondary_text: string;
      };
    }>
  > {
    if (!userInput || userInput.trim().length === 0) {
      throw new BadRequestException('input is required');
    }

    if (!this.googlePlacesApiKey) {
      throw new BadRequestException('Google Places API key is not configured');
    }

    // Optional debounce delay to reduce rapid calls from frontend
    await new Promise((resolve) => setTimeout(resolve, this.AUTOCOMPLETE_DELAY_MS));

    try {
      // Google Places API (new) v1 autocomplete
      const url = 'https://places.googleapis.com/v1/places:autocomplete';
      const body: any = {
        input: userInput,
        languageCode: 'vi',
        includedRegionCodes: ['VN'], // Giới hạn Việt Nam
        sessionToken: token || undefined,
      };
      const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.googlePlacesApiKey,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,' +
          'suggestions.placePrediction.text,' +
          'suggestions.placePrediction.structuredFormat',
      };

      const response = await firstValueFrom(this.httpService.post(url, body, { headers }));
      const predictions = Array.isArray(response.data?.suggestions)
        ? response.data.suggestions
        : [];

      return predictions
        .map((p: any) => {
          const place = p.placePrediction;
          const struct = place?.structuredFormat;
          return {
            description: place?.text?.text,
            place_id: place?.placeId,
            structured_formatting: struct
              ? {
                  main_text: struct.mainText?.text,
                  secondary_text: struct.secondaryText?.text,
                }
              : undefined,
          };
        })
        .filter((p: any) => p.place_id && p.description)
        .slice(0, 5);
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.status ||
        error?.message ||
        'Unknown error';
      this.logger.error(`Lỗi khi gọi Places Autocomplete API: ${msg}`);
      throw new BadRequestException('Không thể lấy gợi ý địa điểm');
    }
  }

  // --- Weather Logic ---
  private async getCityCoordinates(cityName: string): Promise<{ lat: number; lng: number }> {
    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const params = { address: cityName, key: this.googleDirectionsApiKey };
      const response = await firstValueFrom(this.httpService.get(url, { params }));
      if (response.data.status !== 'OK' || !response.data.results.length) {
        this.logger.error('Geocoding response:', JSON.stringify(response.data));
        throw new BadRequestException('Không tìm thấy tọa độ cho địa điểm này');
      }
      const location = response.data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    } catch (error) {
      this.logger.error(`Lỗi khi lấy tọa độ: ${error.message}`);
      throw new BadRequestException('Không thể lấy tọa độ cho địa điểm này');
    }
  }

  private async getWeatherData(lat: number, lng: number): Promise<OpenWeatherResponse> {
    try {
      const url = 'https://api.openweathermap.org/data/3.0/onecall';
      const params = { lat, lon: lng, appid: this.openWeatherApiKey, units: 'metric', exclude: 'minutely,hourly', lang: 'vi' };
      const response = await firstValueFrom(this.httpService.get(url, { params }));
      return response.data;
    } catch (error) {
      this.logger.error(`Lỗi khi gọi OpenWeather API: ${error.message}`);
      throw new BadRequestException('Không thể lấy dữ liệu thời tiết');
    }
  }

  private evaluateSeverity(weatherData: OpenWeatherResponse): WeatherCheckResponseDto {
    if (weatherData.alerts && weatherData.alerts.length > 0) {
      const alert = weatherData.alerts[0];
      return { severity: 'Nguy hiểm', alert: alert.event || 'Cảnh báo thời tiết nghiêm trọng từ chính phủ' };
    }
    if (weatherData.daily && weatherData.daily.length > 0) {
      for (const day of weatherData.daily) {
        const temp = day.temp;
        const weather = day.weather[0];
        const windSpeed = day.wind_speed;
        const rain = day.rain || 0;
        if (
          temp.max > 40 || temp.min < 0 || windSpeed > 20 || rain > 100 || weather.main === 'Thunderstorm' || weather.main === 'Snow'
        ) {
          return { severity: 'Nguy hiểm', alert: `Thời tiết cực đoan: ${weather.description}` };
        }
        if (
          temp.max > 35 || temp.min < 5 || windSpeed > 10 || rain > 50
        ) {
          return { severity: 'Cảnh báo', alert: 'empty' };
        }
      }
    }
    return { severity: 'Bình thường', alert: 'empty' };
  }

  /**
   * Đổi status, đảm bảo chỉ 1 MAIN cho user trên cả hai collections
   */
  async updateStatusAll(
    routeId: string,
    userId: string,
    status: 'DRAFT' | 'CONFIRMED' | 'MAIN',
    extra?: { title?: string },
  ) {
    const userIdString = userId?.toString();
    const userIdNormalized = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    // Tìm route trong custom-itineraries (ưu tiên match string, fallback ObjectId)
    const customRoute = await this.customItineraryModel.findOne({
      route_id: routeId,
      user_id: userIdString,
    });

    // Nếu set MAIN, hạ MAIN khác ở cả hai collections
    if (status === 'MAIN') {
      await this.customItineraryModel.updateMany(
        { user_id: userIdString, status: 'MAIN', route_id: { $ne: routeId } },
        { status: 'CONFIRMED' },
      );
      await this.itineraryModel.updateMany(
        { user_id: userIdNormalized, status: 'MAIN', route_id: { $ne: routeId } },
        { status: 'CONFIRMED' },
      );
    }

    if (customRoute) {
      // Cập nhật custom route
      customRoute.status = status;
      if (extra?.title !== undefined) {
        customRoute.title = extra.title;
      }
      await customRoute.save();
      return customRoute;
    }

    // Không có trong custom, fallback sang itinerary service
    const updatedItinerary = await this.itineraryService.updateStatus(
      routeId,
      userId,
      status,
      extra,
    );
    // ItineraryService đã hạ MAIN trong collection itinerary;
    // Chúng ta đã hạ MAIN ở custom trước đó nếu status MAIN.
    return updatedItinerary;
  }

  /**
   * Lấy danh sách custom itineraries của user, optional lọc status
   */
  async listRoutes(
    userId: string,
    status?: 'DRAFT' | 'CONFIRMED' | 'MAIN',
  ) {
    const query: any = { user_id: userId };
    if (status) {
      query.status = status;
    }
    return this.customItineraryModel
      .find(query)
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async checkWeather(departureDate: string, returnDate: string, destination: string): Promise<WeatherCheckResponseDto> {
    const coordinates = await this.getCityCoordinates(destination);
    const weatherData = await this.getWeatherData(coordinates.lat, coordinates.lng);
    const result = this.evaluateSeverity(weatherData);
    this.logger.log(`Weather check for ${destination}: ${result.severity}`);
    return result;
  }
}
