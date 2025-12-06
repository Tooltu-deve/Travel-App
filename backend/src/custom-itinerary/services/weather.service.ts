import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GoogleGeocodingResponse } from '../interfaces/google-geocoding-response.interface';
import { OpenWeatherResponse } from '../interfaces/openweather-response.interface';
import { WeatherCheckResponseDto } from '../dto/custom-itinerary-response.dto';
/**
 * Service xử lý logic kiểm tra thời tiết
 * 
 * Tuân thủ SOLID principles:
 * - Single Responsibility: Chỉ xử lý logic thời tiết
 * - Open/Closed: Dễ mở rộng thêm logic đánh giá severity
 * - Dependency Inversion: Phụ thuộc vào abstraction (HttpService, ConfigService)
 * 
 * Tuân thủ OOP:
 * - Encapsulation: Private methods cho logic nội bộ
 * - Separation of Concerns: Tách biệt các concern (geocoding, weather, evaluation)
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly openWeatherApiKey: string;
    private readonly googlePlacesApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.openWeatherApiKey = this.configService.get<string>('OPENWEATHER_API_KEY') || '';
      this.googlePlacesApiKey = this.configService.get<string>('GOOGLE_DIRECTIONS_API_KEY') || '';
    
    if (!this.openWeatherApiKey || !this.googlePlacesApiKey) {
      this.logger.warn('Missing API keys in environment variables');
    }
  }

  /**
   * Lấy tọa độ từ tên thành phố qua Google Geocoding API
   * Private method - encapsulation
   */
  private async getCityCoordinates(cityName: string): Promise<{ lat: number; lng: number }> {
    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const params = {
        address: cityName,
        key: this.googlePlacesApiKey,
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

        if (response.data.status !== 'OK' || !response.data.results.length) {
          // LOG DEBUG: In ra response từ Google Geocoding API để kiểm tra lỗi
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

  /**
   * Gọi OpenWeather API để lấy thông tin thời tiết
   * Private method - encapsulation
   */
  private async getWeatherData(lat: number, lng: number): Promise<OpenWeatherResponse> {
    try {
      const url = 'https://api.openweathermap.org/data/3.0/onecall';
      const params = {
        lat,
        lon: lng,
        appid: this.openWeatherApiKey,
        units: 'metric',
        exclude: 'minutely,hourly',
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Lỗi khi gọi OpenWeather API: ${error.message}`);
      throw new BadRequestException('Không thể lấy dữ liệu thời tiết');
    }
  }

  /**
   * Đánh giá mức độ nghiêm trọng của thời tiết
   * Private method - encapsulation, dễ mở rộng (Open/Closed principle)
   */
  private evaluateSeverity(weatherData: OpenWeatherResponse): WeatherCheckResponseDto {
    // Kiểm tra alerts từ chính phủ (ưu tiên cao nhất)
    if (weatherData.alerts && weatherData.alerts.length > 0) {
      const alert = weatherData.alerts[0];
      return {
        severity: 'danger',
        alert: alert.event || 'Cảnh báo thời tiết nghiêm trọng từ chính phủ',
      };
    }

    // Kiểm tra thời tiết cực đoan trong daily forecast
    if (weatherData.daily && weatherData.daily.length > 0) {
      for (const day of weatherData.daily) {
        const temp = day.temp;
        const weather = day.weather[0];
        const windSpeed = day.wind_speed;
        const rain = day.rain || 0;

        // Danger conditions: Thời tiết cực đoan
        if (
          temp.max > 40 || // Nhiệt độ quá cao
          temp.min < 0 || // Nhiệt độ quá thấp
          windSpeed > 20 || // Gió rất mạnh (>72 km/h)
          rain > 100 || // Mưa rất to
          weather.main === 'Thunderstorm' || // Bão
          weather.main === 'Snow' // Tuyết
        ) {
          return {
            severity: 'danger',
            alert: `Thời tiết cực đoan: ${weather.description}`,
          };
        }

        // Warning conditions: Thời tiết khó khăn
        if (
          temp.max > 35 || // Nhiệt độ cao
          temp.min < 5 || // Nhiệt độ thấp
          windSpeed > 10 || // Gió mạnh
          rain > 50 // Mưa to
        ) {
          return {
            severity: 'warning',
            alert: 'empty',
          };
        }
      }
    }

    // Normal weather
    return {
      severity: 'normal',
      alert: 'empty',
    };
  }

  /**
   * Kiểm tra thời tiết cho chuyến đi
   * Public method - business logic chính
   * 
   * @param departureDate - Ngày đi (ISO 8601)
   * @param returnDate - Ngày về (ISO 8601)
   * @param destination - Tên thành phố
   * @returns Object chứa severity và alert
   */
  async checkWeather(
    departureDate: string,
    returnDate: string,
    destination: string,
  ): Promise<WeatherCheckResponseDto> {
    // Lấy tọa độ từ tên thành phố
    const coordinates = await this.getCityCoordinates(destination);

    // Lấy dữ liệu thời tiết
    const weatherData = await this.getWeatherData(
      coordinates.lat,
      coordinates.lng,
    );

    // Đánh giá severity
    const result = this.evaluateSeverity(weatherData);

    this.logger.log(`Weather check for ${destination}: ${result.severity}`);

    return result;
  }
}
