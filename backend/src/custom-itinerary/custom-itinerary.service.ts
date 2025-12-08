import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
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
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.openWeatherApiKey = this.configService.get<string>('OPENWEATHER_API_KEY') || '';
    this.googleDirectionsApiKey = this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') || '';
    this.googlePlacesApiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') || this.googleDirectionsApiKey || '';
    if (!this.openWeatherApiKey || !this.googleDirectionsApiKey) {
      this.logger.warn('Missing API keys in environment variables');
    }
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

  private async calculateRoutesForDay(places: PlaceDto[], travelMode: string, optimize?: boolean): Promise<PlaceWithRouteDto[]> {
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
    
    for (let i = 0; i < placesWithLocation.length; i++) {
      const currentPlace = placesWithLocation[i];
      let placeWithRoute: PlaceWithRouteDto;
      if (i < placesWithLocation.length - 1) {
        const nextPlace = placesWithLocation[i + 1];
        if (!travelMode) {
          throw new BadRequestException('travelMode is required for each day and must be provided by the frontend');
        }
        const directionsData = await this.getDirections(
          `${currentPlace.location.lat},${currentPlace.location.lng}`,
          `${nextPlace.location.lat},${nextPlace.location.lng}`,
          travelMode,
          optimize,
        );
        const route = directionsData.routes[0];
        const leg = route.legs[0];
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          address: currentPlace.address,
          location: currentPlace.location,
          // travelMode chỉ dùng cho logic, không trả về response
          encoded_polyline: route.overview_polyline.points,
          travel_duration_minutes: Math.round(leg.duration.value / 60),
        };
      } else {
        placeWithRoute = {
          placeId: currentPlace.placeId,
          name: currentPlace.name,
          address: currentPlace.address,
          location: currentPlace.location,
          // travelMode chỉ dùng cho logic, không trả về response
          encoded_polyline: null,
          travel_duration_minutes: null,
        };
      }
      result.push(placeWithRoute);
    }
    return result;
  }

  async calculateRoutes(itineraryData: CalculateRoutesDto): Promise<CalculateRoutesResponseDto> {
    try {
      const { days } = itineraryData;
      if (!days || !Array.isArray(days)) {
        throw new BadRequestException('Invalid input: days must be an array');
      }
      const processedDays: DayWithRoutesDto[] = [];
      if (!itineraryData.travelMode) {
        throw new BadRequestException('travelMode is required for the whole itinerary and must be provided by the frontend');
      }
      for (const day of days) {
        if (!day.places || !Array.isArray(day.places)) {
          throw new BadRequestException('Invalid input: each day must have places array');
        }
        if (!day.startLocation) {
          throw new BadRequestException('Invalid input: each day must have startLocation');
        }
        
        // Geocode startLocation để lấy tọa độ
        const startLocationCoordinates = await this.getCityCoordinates(day.startLocation);
        
        const processedPlaces = await this.calculateRoutesForDay(day.places, itineraryData.travelMode, itineraryData.optimize);
        processedDays.push({ 
          dayNumber: day.dayNumber, 
          startLocation: day.startLocation,
          startLocationCoordinates,
          places: processedPlaces 
        });
      }
      this.logger.log(`Successfully calculated routes for ${days.length} days`);
      return { days: processedDays, optimize: itineraryData.optimize };
    } catch (error) {
      this.logger.error(`Lỗi khi tính toán routes: ${error.message}`);
      throw error;
    }
  }

  // --- Places Autocomplete ---
  async autocompletePlaces(
    input: string,
    sessionToken?: string,
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
    if (!input || input.trim().length === 0) {
      throw new BadRequestException('input is required');
    }

    if (!this.googlePlacesApiKey) {
      throw new BadRequestException('Google Places API key is not configured');
    }

    // Optional debounce delay to reduce rapid calls from frontend
    await new Promise((resolve) => setTimeout(resolve, this.AUTOCOMPLETE_DELAY_MS));

    try {
      const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
      const params: any = {
        input,
        key: this.googlePlacesApiKey,
        language: 'vi',
        components: 'country:VN', // Giới hạn Việt Nam
      };
      if (sessionToken) {
        params.sessiontoken = sessionToken;
      }

      const response = await firstValueFrom(this.httpService.get(url, { params }));
      if (response.data.status !== 'OK') {
        throw new BadRequestException(`Autocomplete API error: ${response.data.status}`);
      }

      const predictions = Array.isArray(response.data.predictions)
        ? response.data.predictions.slice(0, 5)
        : [];

      return predictions.map((p: any) => ({
        description: p.description,
        place_id: p.place_id,
        structured_formatting: p.structured_formatting,
      }));
    } catch (error: any) {
      this.logger.error(`Lỗi khi gọi Places Autocomplete API: ${error.message}`);
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
      const params = { lat, lon: lng, appid: this.openWeatherApiKey, units: 'metric', exclude: 'minutely,hourly' };
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
      return { severity: 'danger', alert: alert.event || 'Cảnh báo thời tiết nghiêm trọng từ chính phủ' };
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
          return { severity: 'danger', alert: `Thời tiết cực đoan: ${weather.description}` };
        }
        if (
          temp.max > 35 || temp.min < 5 || windSpeed > 10 || rain > 50
        ) {
          return { severity: 'warning', alert: 'empty' };
        }
      }
    }
    return { severity: 'normal', alert: 'empty' };
  }

  async checkWeather(departureDate: string, returnDate: string, destination: string): Promise<WeatherCheckResponseDto> {
    const coordinates = await this.getCityCoordinates(destination);
    const weatherData = await this.getWeatherData(coordinates.lat, coordinates.lng);
    const result = this.evaluateSeverity(weatherData);
    this.logger.log(`Weather check for ${destination}: ${result.severity}`);
    return result;
  }
}
