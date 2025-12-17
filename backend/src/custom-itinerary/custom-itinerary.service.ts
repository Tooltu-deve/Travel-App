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
import { Place, PlaceDocument } from '../place/schemas/place.schema';

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
    @InjectModel(Place.name)
    private readonly placeModel: Model<PlaceDocument>,
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
   * @param startLocationCoordinates Start location coordinates for this day
   * @param optimize Whether to optimize waypoints order
   * @returns Array of places with route information (polyline, duration)
   */
  private async calculateRoutesForDay(
    places: PlaceDto[], 
    travelMode: string, 
    startLocationCoordinates?: { lat: number; lng: number },
    optimize?: boolean
  ): Promise<PlaceWithRouteDto[]> {
    if (!travelMode) {
      throw new BadRequestException('travelMode is required for each day and must be provided by the frontend');
    }
    
    this.logger.debug(`🚀 Calculating routes for day with travelMode: ${travelMode}, ${places.length} places`);
    if (startLocationCoordinates) {
      this.logger.debug(`   Start location: ${JSON.stringify(startLocationCoordinates)}`);
    }
    
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
    
    // Initialize all places first
    for (let i = 0; i < placesWithLocation.length; i++) {
      const currentPlace = placesWithLocation[i];
      result.push({
        placeId: currentPlace.placeId,
        name: currentPlace.name,
        address: currentPlace.address,
        location: currentPlace.location,
        encoded_polyline: null,
        travel_duration_minutes: null,
      });
    }
    
    // Calculate routes and assign to the DESTINATION POI
    // travel_duration_minutes của POI = thời gian đi TỪ POI TRƯỚC đến POI này
    
    // 1. Route từ START → POI đầu tiên
    if (startLocationCoordinates && placesWithLocation.length > 0) {
      const firstPOI = placesWithLocation[0];
      this.logger.debug(
        `📍 [POI 0 - ${firstPOI.name}] Calculating route from START to first POI...`
      );
      this.logger.debug(
        `   Origin (START): ${startLocationCoordinates.lat},${startLocationCoordinates.lng}`
      );
      this.logger.debug(
        `   Destination: ${firstPOI.location.lat},${firstPOI.location.lng}`
      );
      
      const startDirectionsData = await this.itineraryService.fetchDirectionsInfo(
        startLocationCoordinates,
        firstPOI.location,
        travelMode
      );
      
      // Gán cho POI đầu tiên
      result[0].start_encoded_polyline = startDirectionsData.encoded_polyline;
      result[0].start_travel_duration_minutes = startDirectionsData.travel_duration_minutes 
        ? Math.round(startDirectionsData.travel_duration_minutes) 
        : null;
      
      this.logger.debug(
        `   ✅ start_encoded_polyline: ${startDirectionsData.encoded_polyline ? 'YES' : 'NO'}`
      );
      this.logger.debug(
        `   ✅ start_travel_duration_minutes: ${result[0].start_travel_duration_minutes ?? 'null'}`
      );
    }
    
    // 2. Routes giữa các POI (POI i → POI i+1)
    for (let i = 0; i < placesWithLocation.length - 1; i++) {
      const currentPlace = placesWithLocation[i];
      const nextPlace = placesWithLocation[i + 1];
      
      this.logger.debug(
        `📍 [POI ${i} → POI ${i+1}] Calculating route: ${currentPlace.name} → ${nextPlace.name}...`
      );
      this.logger.debug(
        `   Origin: ${currentPlace.location.lat},${currentPlace.location.lng}`
      );
      this.logger.debug(
        `   Destination: ${nextPlace.location.lat},${nextPlace.location.lng}`
      );
      
      const directionsData = await this.itineraryService.fetchDirectionsInfo(
        currentPlace.location,
        nextPlace.location,
        travelMode
      );
      
      // Gán cho POI TIẾP THEO (i+1), không phải POI hiện tại (i)
      result[i + 1].encoded_polyline = directionsData.encoded_polyline;
      result[i + 1].travel_duration_minutes = directionsData.travel_duration_minutes 
        ? Math.round(directionsData.travel_duration_minutes) 
        : null;
      result[i + 1].steps = directionsData.steps;
      
      this.logger.debug(
        `   ✅ Assigned to POI ${i+1} (${nextPlace.name}):`
      );
      this.logger.debug(
        `      - encoded_polyline: ${directionsData.encoded_polyline ? 'YES' : 'NO'}`
      );
      this.logger.debug(
        `      - travel_duration_minutes: ${result[i + 1].travel_duration_minutes ?? 'null'}`
      );
    }
    
    this.logger.debug(`✅ Completed route calculation for day with travelMode: ${travelMode}`);
    this.logger.debug(`   Summary:`);
    result.forEach((place, idx) => {
      this.logger.debug(`   POI ${idx} (${place.name}):`);
      if ('start_encoded_polyline' in place) {
        this.logger.debug(`      - start_encoded_polyline: ${place.start_encoded_polyline ? 'YES' : 'NO'}`);
        this.logger.debug(`      - start_travel_duration_minutes: ${place.start_travel_duration_minutes ?? 'null'}`);
      }
      this.logger.debug(`      - encoded_polyline: ${place.encoded_polyline ? 'YES' : 'NO'}`);
      this.logger.debug(`      - travel_duration_minutes: ${place.travel_duration_minutes ?? 'null'}`);
    });
    
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
        // AND calculate route from startLocation to first POI
        const processedPlaces = await this.calculateRoutesForDay(
          day.places, 
          day.travelMode, 
          startLocationCoordinates, // Truyền start location để tính route đến POI đầu tiên
          itineraryData.optimize
        );
        
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

      // Geocode startLocationText để lấy tọa độ điểm bắt đầu
      let startLocationCoordinates: { lat: number; lng: number } | null = null;
      if (itineraryData.startLocationText) {
        try {
          startLocationCoordinates = await this.getCityCoordinates(itineraryData.startLocationText);
          this.logger.log(`Geocoded start location: ${itineraryData.startLocationText} -> ${JSON.stringify(startLocationCoordinates)}`);
        } catch (error) {
          this.logger.warn(`Failed to geocode start location: ${error.message}`);
        }
      }

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
        start_location_text: itineraryData.startLocationText || null,
        start_location: startLocationCoordinates,
        route_data_json: {
          days: processedDays,
          optimize: itineraryData.optimize,
          destination: itineraryData.destination,
          start_date: itineraryData.start_date,
          end_date: itineraryData.end_date,
          start_location_text: itineraryData.startLocationText,
          start_location: startLocationCoordinates,
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
        start_location_text: saved.start_location_text || null,
        start_location: saved.start_location || null,
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
    destination?: string,
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

      // Nếu có destination, lấy tọa độ và giới hạn kết quả trong vùng đó
      if (destination) {
        try {
          const location = await this.getCityCoordinates(destination);
          body.locationRestriction = {
            circle: {
              center: {
                latitude: location.lat,
                longitude: location.lng,
              },
              radius: 50000.0, // 50km radius around the city
            },
          };
        } catch (error) {
          this.logger.warn(`Could not get coordinates for destination: ${destination}. Proceeding without location restriction.`);
        }
      }
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
   * Populate POI names từ Place collection đã được enrich cho custom itinerary
   */
  private async populatePoiNamesFromPlace(customRoute: CustomItineraryDocument | any): Promise<any> {
    if (!customRoute.route_data_json) {
      return customRoute;
    }

    const routeData = customRoute.route_data_json;
    const placeIdsToFetch = new Set<string>();

    // Thu thập tất cả google_place_id từ days
    if (routeData.days && Array.isArray(routeData.days)) {
      routeData.days.forEach((day: any) => {
        if (day.places && Array.isArray(day.places)) {
          day.places.forEach((place: any) => {
            const placeId = place.google_place_id || place.placeId;
            if (placeId) {
              const normalizedId = placeId.replace(/^places\//, '');
              placeIdsToFetch.add(normalizedId);
              placeIdsToFetch.add(`places/${normalizedId}`);
            }
          });
        }
      });
    }

    // Thu thập từ optimized_route (nếu có)
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      routeData.optimized_route.forEach((day: any) => {
        if (day.activities && Array.isArray(day.activities)) {
          day.activities.forEach((activity: any) => {
            const placeId = activity.google_place_id;
            if (placeId) {
              const normalizedId = placeId.replace(/^places\//, '');
              placeIdsToFetch.add(normalizedId);
              placeIdsToFetch.add(`places/${normalizedId}`);
            }
          });
        }
      });
    }

    if (placeIdsToFetch.size === 0) {
      return customRoute;
    }

    // Fetch tất cả places một lần
    const places = await this.placeModel
      .find({ googlePlaceId: { $in: Array.from(placeIdsToFetch) } })
      .exec();

    // Tạo map để lookup nhanh
    const placeMap = new Map<string, PlaceDocument>();
    places.forEach((place) => {
      const id1 = place.googlePlaceId.replace(/^places\//, '');
      const id2 = `places/${id1}`;
      placeMap.set(id1, place);
      placeMap.set(id2, place);
    });

    // Cập nhật tên trong days
    if (routeData.days && Array.isArray(routeData.days)) {
      routeData.days.forEach((day: any) => {
        if (day.places && Array.isArray(day.places)) {
          day.places.forEach((place: any) => {
            const placeId = place.google_place_id || place.placeId;
            if (placeId) {
              const enrichedPlace = placeMap.get(placeId) || placeMap.get(placeId.replace(/^places\//, ''));
              if (enrichedPlace && enrichedPlace.name) {
                place.name = enrichedPlace.name;
              }
            }
          });
        }
      });
    }

    // Cập nhật tên trong optimized_route (nếu có)
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      routeData.optimized_route.forEach((day: any) => {
        if (day.activities && Array.isArray(day.activities)) {
          day.activities.forEach((activity: any) => {
            const placeId = activity.google_place_id;
            if (placeId) {
              const place = placeMap.get(placeId) || placeMap.get(placeId.replace(/^places\//, ''));
              if (place && place.name) {
                activity.name = place.name;
                if (activity.place) {
                  activity.place.name = place.name;
                }
              }
            }
          });
        }
      });
    }

    return customRoute;
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
    const routes = await this.customItineraryModel
      .find(query)
      .sort({ created_at: -1 })
      .lean()
      .exec();

    // Populate POI names từ Place collection cho tất cả routes
    const populatedRoutes = await Promise.all(
      routes.map((route) => this.populatePoiNamesFromPlace(route)),
    );

    return populatedRoutes;
  }

  async checkWeather(departureDate: string, returnDate: string, destination: string): Promise<WeatherCheckResponseDto> {
    const coordinates = await this.getCityCoordinates(destination);
    const weatherData = await this.getWeatherData(coordinates.lat, coordinates.lng);
    const result = this.evaluateSeverity(weatherData);
    this.logger.log(`Weather check for ${destination}: ${result.severity}`);
    return result;
  }
}