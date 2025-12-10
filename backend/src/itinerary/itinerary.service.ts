import { Injectable, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Place, PlaceDocument } from '../place/schemas/place.schema';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PlaceService } from '../place/place.service';
import { GenerateRouteDto } from './dto/generate-route.dto';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { RouteDto, DayDto, ActivityDto } from './dto/custom-route.dto';

type WeatherAlertSeverity = 'info' | 'warning' | 'danger';

interface WeatherAlertMessage {
  type: string;
  title: string;
  message: string;
  severity: WeatherAlertSeverity;
  from?: string;
  to?: string;
  tags?: string[];
}

@Injectable()
export class ItineraryService {
  private readonly aiOptimizerServiceUrl: string;
  private readonly googleDirectionsApiKey: string;
  private readonly openWeatherApiKey: string;

  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    @InjectModel(Itinerary.name) private itineraryModel: Model<ItineraryDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
    private readonly placeService: PlaceService,
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

    this.openWeatherApiKey =
      this.configService.get<string>('OPENWEATHER_API_KEY') ||
      process.env.OPENWEATHER_API_KEY ||
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

  /**
   * Populate POI names từ Place collection đã được enrich
   * Cập nhật tên POI trong route_data_json với tên tiếng Việt từ Place collection
   */
  private async populatePoiNamesFromPlace(route: ItineraryDocument): Promise<ItineraryDocument> {
    if (!route.route_data_json) {
      return route;
    }

    const routeData = route.route_data_json;
    const placeIdsToFetch = new Set<string>();

    // Thu thập tất cả google_place_id từ optimized_route
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      routeData.optimized_route.forEach((day: any) => {
        if (day.activities && Array.isArray(day.activities)) {
          day.activities.forEach((activity: any) => {
            const placeId = activity.google_place_id;
            if (placeId) {
              // Normalize placeId (có thể có hoặc không có prefix "places/")
              const normalizedId = placeId.replace(/^places\//, '');
              placeIdsToFetch.add(normalizedId);
              placeIdsToFetch.add(`places/${normalizedId}`);
            }
          });
        }
      });
    }

    // Thu thập từ days (custom itinerary)
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

    if (placeIdsToFetch.size === 0) {
      return route;
    }

    // Fetch tất cả places một lần
    const places = await this.placeModel
      .find({ googlePlaceId: { $in: Array.from(placeIdsToFetch) } })
      .exec();

    // Tạo map để lookup nhanh
    const placeMap = new Map<string, PlaceDocument>();
    places.forEach((place) => {
      // Thêm cả với và không có prefix "places/"
      const id1 = place.googlePlaceId.replace(/^places\//, '');
      const id2 = `places/${id1}`;
      placeMap.set(id1, place);
      placeMap.set(id2, place);
    });

    // Cập nhật tên trong optimized_route
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

    // Cập nhật tên trong days (custom itinerary)
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

    return route;
  }

  async findByRouteId(routeId: string): Promise<ItineraryDocument | null> {
    const route = await this.itineraryModel.findOne({ route_id: routeId }).exec();
    if (!route) {
      return null;
    }
    // Populate POI names từ Place collection đã được enrich
    return await this.populatePoiNamesFromPlace(route);
  }

  async findByUserId(
    userId: string,
    status?: 'DRAFT' | 'CONFIRMED' | 'MAIN',
  ): Promise<ItineraryDocument[]> {
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    const query: any = { user_id: userObjectId };
    if (status) {
      query.status = status;
    }

    const routes = await this.itineraryModel
      .find(query)
      .sort({ created_at: -1 })
      .exec();

    // Populate POI names từ Place collection cho tất cả routes
    const populatedRoutes = await Promise.all(
      routes.map((route) => this.populatePoiNamesFromPlace(route)),
    );

    return populatedRoutes;
  }

  async updateStatus(
    routeId: string,
    userId: string,
    status: 'DRAFT' | 'CONFIRMED' | 'MAIN',
    extra?: { title?: string },
  ): Promise<ItineraryDocument | null> {
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    // Nếu đang set status thành MAIN, cần chuyển MAIN cũ về CONFIRMED
    if (status === 'MAIN') {
      const existingMain = await this.itineraryModel
        .findOne({
          user_id: userObjectId,
          status: 'MAIN',
          route_id: { $ne: routeId }, // Không phải lộ trình hiện tại
        })
        .exec();

      if (existingMain) {
        // Chuyển MAIN cũ về CONFIRMED
        await this.itineraryModel
          .findOneAndUpdate(
            { _id: existingMain._id },
            { status: 'CONFIRMED' },
            { new: true },
          )
          .exec();
      }
    }

    const updatePayload: any = { status };
    if (extra?.title !== undefined) {
      updatePayload.title = extra.title;
      updatePayload['route_data_json.metadata.title'] = extra.title;
    }

    const updated = await this.itineraryModel
      .findOneAndUpdate(
        { route_id: routeId, user_id: userObjectId },
        updatePayload,
        { new: true },
      )
      .exec();

    // Gửi notification khi xác nhận lộ trình (CONFIRMED)
    if (status === 'CONFIRMED' && updated) {
      try {
        await this.notificationsService.createNotification({
          userId: userObjectId,
          type: 'itinerary',
          title: 'Bạn đã xác nhận lộ trình',
          message: extra?.title || updated.title || 'Lộ trình đã xác nhận',
          entityType: 'itinerary',
          entityId: updated._id,
          routeId: updated.route_id,
        });
      } catch (err) {
        console.error('Lỗi khi tạo notification CONFIRMED:', err);
      }
    }

    // Gửi notification khi set lộ trình thành MAIN
    if (status === 'MAIN' && updated) {
      try {
        await this.notificationsService.createNotification({
          userId: userObjectId,
          type: 'itinerary',
          title: 'Lộ trình đã được đặt làm lộ trình chính',
          message: extra?.title || updated.title || 'Lộ trình đã được đặt làm lộ trình chính',
          entityType: 'itinerary',
          entityId: updated._id,
          routeId: updated.route_id,
        });
      } catch (err) {
        console.error('Lỗi khi tạo notification MAIN:', err);
      }
    }

    return updated;
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
   * Kiểm tra POI có phải outdoor không dựa trên types
   */
  private isOutdoorPoi(poi: PlaceDocument): boolean {
    const poiAny = poi as any;
    const types = poiAny.types || [];
    
    // Các loại outdoor: beach, park, seaside, natural_feature, campground, etc.
    const outdoorTypes = [
      'beach',
      'park',
      'seaside',
      'natural_feature',
      'campground',
      'amusement_park',
      'zoo',
      'aquarium',
      'stadium',
      'garden',
      'rv_park',
    ];
    
    return types.some((type: string) =>
      outdoorTypes.some((outdoorType) =>
        type.toLowerCase().includes(outdoorType.toLowerCase()),
      ),
    );
  }

  /**
   * Lấy dữ liệu thời tiết từ OpenWeather API
   */
  private async fetchWeatherData(
    lat: number,
    lng: number,
  ): Promise<any> {
    if (!this.openWeatherApiKey) {
      console.warn('⚠️  OpenWeather API key chưa được cấu hình. Bỏ qua kiểm tra thời tiết.');
      return null;
    }

    console.log(`🌤️  Đang lấy dữ liệu thời tiết tại tọa độ: ${lat}, ${lng}`);

    try {
      // Thử dùng One Call API 3.0 trước (hỗ trợ 8 ngày, cần subscription)
      const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,hourly&appid=${this.openWeatherApiKey}&units=metric`;
      
      const response = await firstValueFrom(
        this.httpService.get(oneCallUrl, { timeout: 10000 }),
      );
      
      const data = response.data;
      
      // Log thông tin thời tiết hiện tại
      if (data.current) {
        const current = data.current;
        const weather = current.weather?.[0];
        console.log(`🌡️  Thời tiết hiện tại tại địa điểm:`);
        console.log(`   - Nhiệt độ: ${current.temp}°C (cảm giác như ${current.feels_like}°C)`);
        console.log(`   - Điều kiện: ${weather?.main || 'N/A'} - ${weather?.description || 'N/A'}`);
        console.log(`   - Độ ẩm: ${current.humidity}%`);
        console.log(`   - Tốc độ gió: ${current.wind_speed || 0} m/s (${((current.wind_speed || 0) * 3.6).toFixed(1)} km/h)`);
        console.log(`   - Tầm nhìn: ${current.visibility ? (current.visibility / 1000).toFixed(1) : 'N/A'} km`);
        if (data.alerts && data.alerts.length > 0) {
          console.log(`   ⚠️  CẢNH BÁO: ${data.alerts.length} cảnh báo thời tiết`);
          data.alerts.forEach((alert: any, idx: number) => {
            const startDate = alert.start ? new Date(alert.start * 1000) : null;
            const endDate = alert.end ? new Date(alert.end * 1000) : null;
            console.log(`      ${idx + 1}. ${alert.event || 'Cảnh báo'}`);
            console.log(`         - Nguồn: ${alert.sender_name || 'N/A'}`);
            console.log(`         - Mô tả: ${alert.description || 'N/A'}`);
            if (startDate && endDate) {
              console.log(`         - Thời gian: ${startDate.toLocaleString('vi-VN')} - ${endDate.toLocaleString('vi-VN')}`);
            }
            if (alert.tags && alert.tags.length > 0) {
              console.log(`         - Loại: ${Array.isArray(alert.tags) ? alert.tags.join(', ') : alert.tags}`);
            }
          });
        }
      }
      
      // Log forecast nếu có
      if (data.daily && data.daily.length > 0) {
        console.log(`📅 Dự báo thời tiết ${Math.min(8, data.daily.length)} ngày tới:`);
        data.daily.slice(0, 8).forEach((day: any, idx: number) => {
          const date = new Date(day.dt * 1000);
          const weather = day.weather?.[0];
          console.log(`   Ngày ${idx + 1} (${date.toLocaleDateString('vi-VN')}): ${weather?.main || 'N/A'} - ${weather?.description || 'N/A'}, ${day.temp?.day || day.temp}°C, gió ${day.wind_speed || 0} m/s`);
        });
      }
      
      return data;
    } catch (error: any) {
      // Nếu One Call API 3.0 không khả dụng (401/403 = cần subscription), thử dùng Forecast API (5 ngày miễn phí)
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('⚠️  One Call API 3.0 không khả dụng (cần subscription). Thử dùng Forecast API (5 ngày).');
        try {
          const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${this.openWeatherApiKey}&units=metric`;
          const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${this.openWeatherApiKey}&units=metric`;
          
          const [currentResponse, forecastResponse] = await Promise.all([
            firstValueFrom(this.httpService.get(currentUrl, { timeout: 10000 })),
            firstValueFrom(this.httpService.get(forecastUrl, { timeout: 10000 })),
          ]);
          
          const currentData = currentResponse.data;
          const forecastData = forecastResponse.data;
          
          // Log thông tin thời tiết hiện tại
          if (currentData) {
            const weather = currentData.weather?.[0];
            console.log(`🌡️  Thời tiết hiện tại tại địa điểm:`);
            console.log(`   - Địa điểm: ${currentData.name || 'N/A'}`);
            console.log(`   - Nhiệt độ: ${currentData.main.temp}°C (cảm giác như ${currentData.main.feels_like}°C)`);
            console.log(`   - Điều kiện: ${weather?.main || 'N/A'} - ${weather?.description || 'N/A'}`);
            console.log(`   - Độ ẩm: ${currentData.main.humidity}%`);
            console.log(`   - Tốc độ gió: ${currentData.wind?.speed || 0} m/s (${((currentData.wind?.speed || 0) * 3.6).toFixed(1)} km/h)`);
            console.log(`   - Tầm nhìn: ${currentData.visibility ? (currentData.visibility / 1000).toFixed(1) : 'N/A'} km`);
          }
          
          // Log forecast
          if (forecastData && forecastData.list) {
            console.log(`📅 Dự báo thời tiết 5 ngày tới (${forecastData.list.length} điểm dữ liệu):`);
            // Hiển thị một vài điểm forecast đầu tiên
            forecastData.list.slice(0, 8).forEach((item: any, idx: number) => {
              const date = new Date(item.dt * 1000);
              const weather = item.weather?.[0];
              console.log(`   ${date.toLocaleString('vi-VN')}: ${weather?.main || 'N/A'} - ${weather?.description || 'N/A'}, ${item.main.temp}°C, gió ${item.wind?.speed || 0} m/s`);
            });
          }
          
          return {
            current: currentData,
            forecast: forecastData,
            // Chỉ include alerts nếu tồn tại trong response
            ...(currentData.alerts !== undefined && { alerts: currentData.alerts }),
          };
        } catch (fallbackError: any) {
          console.error('❌ Lỗi khi lấy dữ liệu thời tiết:', fallbackError.message);
          return null;
        }
      } else {
        console.error('❌ Lỗi khi lấy dữ liệu thời tiết:', error.message);
        if (error.response?.data) {
          console.error('   Chi tiết:', JSON.stringify(error.response.data));
        }
        return null;
      }
    }
  }

  /**
   * Kiểm tra thời tiết có xấu không (mưa lớn, bão, gió mạnh) trong toàn bộ khoảng thời gian du lịch
   */
  private isBadWeather(
    weatherData: any,
    tripStartDate: Date,
    durationDays: number,
  ): boolean {
    if (!weatherData || !tripStartDate || durationDays <= 0) {
      return false;
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const tripStartMs = this.normalizeDate(tripStartDate);
    const tripEndDate = new Date(tripStartDate);
    tripEndDate.setDate(tripEndDate.getDate() + durationDays - 1);
    const tripEndMs = this.normalizeDate(tripEndDate);

    const isWithinTripRange = (timestampMs: number): boolean => {
      const normalized = this.normalizeDate(new Date(timestampMs));
      return (
        normalized >= tripStartMs - DAY_MS && normalized <= tripEndMs + DAY_MS
      );
    };

    const checkWeatherEntry = (
      weather: any,
      dateLabel: string,
      entryDate: Date,
    ): boolean => {
      if (!weather || !weather[0]) {
        return false;
      }
      const weatherMain = weather[0].main?.toLowerCase() || '';
      const weatherDescription = weather[0].description?.toLowerCase() || '';
      if (this.isSevereWeatherCondition(weatherMain, weatherDescription)) {
        console.log(
          `   ⚠️  Phát hiện thời tiết xấu (${dateLabel} - ${entryDate.toLocaleDateString(
            'vi-VN',
          )}): ${weatherMain} - ${weatherDescription}`,
        );
        return true;
      }
      return false;
    };

    const checkWindSpeed = (
      speed: number | undefined,
      dateLabel: string,
      entryDate: Date,
    ): boolean => {
      if (speed && speed > 15) {
        console.log(
          `   ⚠️  Phát hiện gió mạnh (${dateLabel} - ${entryDate.toLocaleDateString(
            'vi-VN',
          )}): ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(
            1,
          )} km/h) - vượt ngưỡng 15 m/s`,
        );
        return true;
      }
      return false;
    };

    const currentEntry = weatherData.current || weatherData;
    if (currentEntry?.weather) {
      const currentDate =
        currentEntry.dt != null
          ? new Date(currentEntry.dt * 1000)
          : tripStartDate;
      if (
        isWithinTripRange(currentDate.getTime()) &&
        checkWeatherEntry(currentEntry.weather, 'hiện tại', currentDate)
      ) {
        return true;
      }
      if (
        isWithinTripRange(currentDate.getTime()) &&
        checkWindSpeed(
          currentEntry.wind?.speed || currentEntry.wind_speed,
          'hiện tại',
          currentDate,
        )
      ) {
        return true;
      }
    }

    if (Array.isArray(weatherData.daily) && weatherData.daily.length > 0) {
      for (const day of weatherData.daily) {
        if (!day.dt) {
          continue;
        }
        const entryDate = new Date(day.dt * 1000);
        if (!isWithinTripRange(entryDate.getTime())) {
          continue;
        }
        if (checkWeatherEntry(day.weather, 'dự báo', entryDate)) {
          return true;
        }
        if (checkWindSpeed(day.wind_speed, 'dự báo', entryDate)) {
          return true;
        }
      }
    } else if (
      weatherData.forecast &&
      Array.isArray(weatherData.forecast.list)
    ) {
      for (const item of weatherData.forecast.list) {
        if (!item.dt) {
          continue;
        }
        const entryDate = new Date(item.dt * 1000);
        if (!isWithinTripRange(entryDate.getTime())) {
          continue;
        }
        if (checkWeatherEntry(item.weather, 'dự báo (3h)', entryDate)) {
          return true;
        }
        if (checkWindSpeed(item.wind?.speed, 'dự báo (3h)', entryDate)) {
          return true;
        }
      }
    }

    return false;
  }

  private normalizeDate(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  private isSevereWeatherCondition(
    weatherMain: string,
    weatherDescription: string,
  ): boolean {
    const severeKeywords = [
      'rain',
      'drizzle',
      'thunderstorm',
      'heavy rain',
      'extreme',
      'snow',
      'sleet',
      'hail',
      'squall',
      'tornado',
      'storm',
      'hurricane',
      'violent',
    ];

    return severeKeywords.some(
      (keyword) =>
        weatherMain.includes(keyword) || weatherDescription.includes(keyword),
    );
  }

  /**
   * Thu thập các cảnh báo nhẹ để cải thiện trải nghiệm (mưa nhỏ, sương mù, UV,...)
   */
  private collectComfortAlerts(
    weatherData: any,
    tripStartDate: Date,
    durationDays: number,
  ): WeatherAlertMessage[] {
    const comfortAlerts: WeatherAlertMessage[] = [];
    const current = weatherData.current || weatherData;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const tripStartMs = this.normalizeDate(tripStartDate);
    const tripEndDate = new Date(tripStartDate);
    tripEndDate.setDate(tripEndDate.getDate() + durationDays - 1);
    const tripEndMs = this.normalizeDate(tripEndDate);

    const isWithinTripRange = (timestampMs: number): boolean => {
      const normalized = this.normalizeDate(new Date(timestampMs));
      return (
        normalized >= tripStartMs - DAY_MS && normalized <= tripEndMs + DAY_MS
      );
    };

    const addAlert = (alert: WeatherAlertMessage) => {
      comfortAlerts.push(alert);
    };

    if (current?.weather && current.weather[0]) {
      const weatherMain = current.weather[0].main?.toLowerCase() || '';
      const weatherDescription =
        current.weather[0].description?.toLowerCase() || '';

      const isLightOrModerateRain =
        (weatherMain.includes('rain') || weatherMain.includes('drizzle')) &&
        !weatherDescription.includes('heavy') &&
        !weatherDescription.includes('storm');

      if (isLightOrModerateRain) {
        addAlert({
          type: 'rain',
          title: 'Dự báo có mưa nhẹ',
          message:
            'Khu vực sắp ghé có mưa nhẹ/vừa. Hãy mang theo ô, áo mưa hoặc chuẩn bị phương tiện di chuyển kín nước để trải nghiệm tốt hơn.',
          severity: 'warning',
        });
      }

      const fogKeywords = ['fog', 'mist', 'haze', 'smoke', 'dust', 'sand'];
      if (
        fogKeywords.some(
          (keyword) =>
            weatherMain.includes(keyword) || weatherDescription.includes(keyword),
        )
      ) {
        addAlert({
          type: 'visibility',
          title: 'Tầm nhìn bị hạn chế',
          message:
            'Sương mù/khói bụi xuất hiện trong khu vực. Nên mang khẩu trang, kính mắt và đi chậm để đảm bảo an toàn.',
          severity: 'warning',
        });
      }
    }

    const addRainForecastAlert = (
      dateLabel: string,
      entryDate: Date,
      description: string,
    ) => {
      const severity: WeatherAlertSeverity =
        description.includes('heavy') || description.includes('storm')
          ? 'danger'
          : 'warning';
      addAlert({
        type: 'rain',
        title: `Dự báo mưa (${dateLabel})`,
        message: `Ngày ${entryDate.toLocaleDateString(
          'vi-VN',
        )} dự báo ${description}. Hãy chuẩn bị ô/áo mưa hoặc cân nhắc điều chỉnh lịch trình cho phù hợp.`,
        severity,
      });
    };

    if (Array.isArray(weatherData.daily)) {
      for (const day of weatherData.daily) {
        if (!day.dt || !day.weather) {
          continue;
        }
        const entryDate = new Date(day.dt * 1000);
        if (!isWithinTripRange(entryDate.getTime())) {
          continue;
        }
        const weatherMain = day.weather[0]?.main?.toLowerCase() || '';
        const weatherDescription =
          day.weather[0]?.description?.toLowerCase() || '';
        if (
          weatherMain.includes('rain') ||
          weatherMain.includes('drizzle') ||
          weatherDescription.includes('rain')
        ) {
          addRainForecastAlert('dự báo ngày', entryDate, weatherDescription);
        }
      }
    } else if (
      weatherData.forecast &&
      Array.isArray(weatherData.forecast.list)
    ) {
      for (const item of weatherData.forecast.list) {
        if (!item.dt || !item.weather) {
          continue;
        }
        const entryDate = new Date(item.dt * 1000);
        if (!isWithinTripRange(entryDate.getTime())) {
          continue;
        }
        const weatherMain = item.weather[0]?.main?.toLowerCase() || '';
        const weatherDescription =
          item.weather[0]?.description?.toLowerCase() || '';
        if (
          weatherMain.includes('rain') ||
          weatherMain.includes('drizzle') ||
          weatherDescription.includes('rain')
        ) {
          addRainForecastAlert('dự báo 3h', entryDate, weatherDescription);
        }
      }
    }

    const uvIndex =
      typeof weatherData.current?.uvi === 'number'
        ? weatherData.current.uvi
        : weatherData.daily?.[0]?.uvi;

    if (typeof uvIndex === 'number') {
      if (uvIndex >= 8) {
        addAlert({
          type: 'uv',
          title: 'Chỉ số UV rất cao',
          message:
            'Chỉ số UV đang ở mức rất cao. Nên thoa kem chống nắng SPF 50+, đội mũ rộng vành và hạn chế ở ngoài trời quá lâu.',
          severity: 'danger',
        });
      } else if (uvIndex >= 6) {
        addAlert({
          type: 'uv',
          title: 'Chỉ số UV cao',
          message:
            'Chỉ số UV cao. Hãy thoa kem chống nắng và mang theo áo khoác mỏng/ô để bảo vệ da.',
          severity: 'warning',
        });
      }
    }

    return comfortAlerts;
  }

  /**
   * Lọc POI theo thời tiết
   */
  private async filterByWeather(
    pois: PlaceDocument[],
    currentLocation: { lat: number; lng: number },
    startDatetime?: string,
    durationDays?: number,
  ): Promise<{
    pois: PlaceDocument[];
    alerts: WeatherAlertMessage[];
    stopDueToOfficialAlert: boolean;
  }> {
    const weatherAlerts: WeatherAlertMessage[] = [];

    if (!startDatetime || !durationDays) {
      console.log('⚠️  Không có thông tin thời gian. Bỏ qua lọc theo thời tiết.');
      return { pois, alerts: weatherAlerts, stopDueToOfficialAlert: false };
    }

    // Kiểm tra khoảng thời gian du lịch
    const startDate = new Date(startDatetime);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays - 1);
    const daysFromNow = Math.ceil(
      (startDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalDays = durationDays;

    console.log(`📅 Thông tin chuyến du lịch:`);
    console.log(`   - Ngày bắt đầu: ${startDate.toLocaleString('vi-VN')}`);
    console.log(`   - Ngày kết thúc: ${endDate.toLocaleString('vi-VN')}`);
    console.log(`   - Số ngày: ${durationDays} ngày`);
    console.log(`   - Còn ${daysFromNow} ngày nữa đến ngày bắt đầu`);

    if (daysFromNow + totalDays > 8) {
      console.error(`❌ Không thể dự đoán thời tiết: khoảng thời gian du lịch vượt quá 8 ngày (${daysFromNow + totalDays} ngày)`);
      throw new HttpException(
        `Không thể dự đoán thời tiết cho khoảng thời gian du lịch (hơn 8 ngày tới). Vui lòng chọn thời gian gần hơn.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Lấy dữ liệu thời tiết
    const weatherData = await this.fetchWeatherData(
      currentLocation.lat,
      currentLocation.lng,
    );

    if (!weatherData) {
      console.warn(
        '⚠️  Không thể lấy dữ liệu thời tiết. Bỏ qua lọc theo thời tiết.',
      );
      return { pois, alerts: weatherAlerts, stopDueToOfficialAlert: false };
    }

    // Kiểm tra alerts và tạo thông tin cảnh báo
    if (weatherData.alerts !== undefined && weatherData.alerts !== null) {
      const alerts = Array.isArray(weatherData.alerts)
        ? weatherData.alerts
        : [];
      if (alerts.length > 0) {
        // Tính toán thời gian du lịch để so sánh
        const tripStartDate = new Date(startDate);
        const tripEndDate = new Date(endDate);

        const msPerDay = 1000 * 60 * 60 * 24;
        const isOverlappingOrNearby = (
          alertStart: Date,
          alertEnd: Date,
        ): boolean => {
          const overlapping =
            tripStartDate <= alertEnd && tripEndDate >= alertStart;
          if (overlapping) {
            return true;
          }

          const daysBeforeAlert = Math.abs(
            (tripStartDate.getTime() - alertEnd.getTime()) / msPerDay,
          );
          const daysAfterAlert = Math.abs(
            (tripEndDate.getTime() - alertStart.getTime()) / msPerDay,
          );

          return daysBeforeAlert <= 2 || daysAfterAlert <= 2;
        };

        const relevantAlerts = alerts.filter((alert: any) => {
          if (!alert.start || !alert.end) {
            return true;
          }
          const alertStart = new Date(alert.start * 1000);
          const alertEnd = new Date(alert.end * 1000);
          return isOverlappingOrNearby(alertStart, alertEnd);
        });

        if (relevantAlerts.length > 0) {
          console.error(
            `⚠️  PHÁT HIỆN CẢNH BÁO THỜI TIẾT NGUY HIỂM LIÊN QUAN ĐẾN THỜI GIAN DU LỊCH:`,
          );
          console.error(
            `   Thời gian du lịch: ${tripStartDate.toLocaleString(
              'vi-VN',
            )} - ${tripEndDate.toLocaleString('vi-VN')}`,
          );

          relevantAlerts.forEach((alert: any, idx: number) => {
            const alertStart = alert.start
              ? new Date(alert.start * 1000)
              : null;
            const alertEnd = alert.end ? new Date(alert.end * 1000) : null;
            console.error(`   ${idx + 1}. ${alert.event || 'Cảnh báo'}`);
            console.error(`      - Nguồn: ${alert.sender_name || 'N/A'}`);
            console.error(`      - Mô tả: ${alert.description || 'N/A'}`);
            if (alertStart && alertEnd) {
              console.error(
                `      - Thời gian cảnh báo: ${alertStart.toLocaleString(
                  'vi-VN',
                )} - ${alertEnd.toLocaleString('vi-VN')}`,
              );
            }
            if (alert.tags && alert.tags.length > 0) {
              console.error(
                `      - Loại thời tiết nguy hiểm: ${
                  Array.isArray(alert.tags) ? alert.tags.join(', ') : alert.tags
                }`,
              );
            }

            weatherAlerts.push({
              type: 'official',
              title: alert.event || 'Cảnh báo thời tiết',
              message:
                alert.description ||
                'Có cảnh báo thời tiết ảnh hưởng tới hành trình. Hãy cân nhắc đổi lịch hoặc chuẩn bị kỹ hơn.',
              severity: 'danger',
              from: alertStart?.toISOString(),
              to: alertEnd?.toISOString(),
              tags: Array.isArray(alert.tags) ? alert.tags : undefined,
            });
          });

          console.error(
            '⚠️  Có cảnh báo từ cơ quan chức năng. Dừng tạo lộ trình và chỉ trả về alerts.',
          );
          return {
            pois: [],
            alerts: weatherAlerts,
            stopDueToOfficialAlert: true,
          };
        } else {
          console.log(
            `✅ Có ${alerts.length} cảnh báo thời tiết nhưng không liên quan trực tiếp đến thời gian du lịch.`,
          );
        }
      } else {
        console.log(
          '✅ Không có cảnh báo thời tiết nguy hiểm (alerts rỗng hoặc không có dữ liệu).',
        );
      }
    } else {
      console.log(
        '✅ Không có trường alerts trong response - không có cảnh báo thời tiết nguy hiểm.',
      );
    }

    // Thu thập thêm các cảnh báo nhẹ (mưa nhỏ, sương mù, UV,...)
    const comfortAlerts = this.collectComfortAlerts(
      weatherData,
      startDate,
      durationDays,
    );
    if (comfortAlerts.length > 0) {
      weatherAlerts.push(...comfortAlerts);
    }

    // Kiểm tra thời tiết xấu
    const isBad = this.isBadWeather(weatherData, startDate, durationDays);
    if (isBad) {
      console.log('🌧️  ⚠️  Thời tiết xấu phát hiện. Loại bỏ các POI outdoor...');
      const beforeCount = pois.length;
      const outdoorPois = pois.filter((poi) => this.isOutdoorPoi(poi));
      const filteredPois = pois.filter((poi) => !this.isOutdoorPoi(poi));
      console.log(`   - Tổng số POI trước khi lọc: ${beforeCount}`);
      console.log(`   - Số POI outdoor: ${outdoorPois.length}`);
      console.log(`   - Số POI indoor: ${filteredPois.length}`);
      console.log(`   - Đã loại bỏ: ${beforeCount - filteredPois.length} POI outdoor`);
      if (outdoorPois.length > 0) {
        console.log(
          `   - Các POI outdoor bị loại: ${outdoorPois
            .slice(0, 5)
            .map((p) => p.name)
            .join(', ')}${outdoorPois.length > 5 ? '...' : ''}`,
        );
      }
      weatherAlerts.push({
        type: 'routing',
        title: 'Đã điều chỉnh lộ trình do thời tiết xấu',
        message:
          'Một số địa điểm ngoài trời đã được lược bỏ để đảm bảo an toàn và trải nghiệm tốt hơn trong điều kiện thời tiết hiện tại.',
        severity: 'warning',
      });
      return {
        pois: filteredPois,
        alerts: weatherAlerts,
        stopDueToOfficialAlert: false,
      };
    }

    console.log('☀️  ✅ Thời tiết tốt. Giữ lại tất cả POI (bao gồm cả outdoor).');
    return { pois, alerts: weatherAlerts, stopDueToOfficialAlert: false };
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
    currentLocation: { lat: number; lng: number },
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiOptimizerServiceUrl}/optimize-route`,
          {
            poi_list: poiList,
            user_mood: generateDto.user_mood,
            duration_days: generateDto.duration_days,
            current_location: currentLocation,
            start_datetime: generateDto.start_datetime,
            ecs_score_threshold: generateDto.ecs_score_threshold || 0.15,
            travel_mode: generateDto.travel_mode || 'driving',
            poi_per_day: generateDto.poi_per_day || 3,
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

  /**
   * Geocode địa chỉ string thành tọa độ lat/lng
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const params = {
        address: address,
        key: this.googleDirectionsApiKey,
      };
      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      if (response.data.status !== 'OK' || !response.data.results.length) {
        throw new HttpException(
          `Không tìm thấy tọa độ cho địa điểm: ${address}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const location = response.data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Lỗi khi geocode địa điểm: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async generateAndSaveRoute(
    userId: string,
    generateDto: GenerateRouteDto,
  ): Promise<ItineraryDocument> {
    // Geocode start_location từ string sang coordinates
    const currentLocation = await this.geocodeAddress(generateDto.start_location);

    let places = await this.filterPoisByBudgetAndDestination(
      generateDto.budget,
      generateDto.destination,
    );

    // Lọc theo thời tiết sau khi lọc budget
    const weatherFilterResult = await this.filterByWeather(
      places,
      currentLocation,
      generateDto.start_datetime,
      generateDto.duration_days,
    );

    places = weatherFilterResult.pois;
    const weatherAlerts = weatherFilterResult.alerts;

    if (weatherFilterResult.stopDueToOfficialAlert) {
      return await this.saveAlertOnlyDraft(
        userId,
        generateDto,
        weatherAlerts,
      );
    }

    if (places.length === 0) {
      throw new HttpException(
        'Không tìm thấy POI nào phù hợp sau khi lọc theo thời tiết.',
        HttpStatus.NOT_FOUND,
      );
    }

    const poiList = places.map((place) =>
      this.convertPlaceToOptimizerFormat(place as any),
    );

    const optimizedRoute = await this.callAiOptimizer(poiList, generateDto, currentLocation);
    const enrichedRoute = await this.enrichRouteWithDirections(
      optimizedRoute,
      currentLocation,
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
      start_location: currentLocation,
      alerts: weatherAlerts,
    });

    const savedItinerary = await itinerary.save();

    return savedItinerary;
  }

  private async saveAlertOnlyDraft(
    userId: string,
    generateDto: GenerateRouteDto,
    alerts: WeatherAlertMessage[],
  ): Promise<ItineraryDocument> {
    const routeId = this.generateRouteId();
    const userObjectId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : userId;

    // Geocode start_location để lưu vào schema
    const currentLocation = await this.geocodeAddress(generateDto.start_location);

    const metadata = {
      title: generateDto.destination
        ? `Lộ trình ${generateDto.destination}`
        : 'Lộ trình mới',
      destination: generateDto.destination,
      duration_days: generateDto.duration_days,
      start_datetime: generateDto.start_datetime || null,
      budget: generateDto.budget,
      user_mood: generateDto.user_mood,
      created_at: new Date().toISOString(),
      weather_alerts: alerts,
    };

    const routeDataJson = {
      optimized_route: [],
      metadata,
      alerts,
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
      start_location: currentLocation,
      alerts,
    });

    return await itinerary.save();
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

  /**
   * Xử lý custom route từ AI optimizer
   * B1: Nhận JSON từ AI optimizer
   * B2: Enrich tất cả POI mới (chưa có trong DB)
   * B3: Call Directions API cho TẤT CẢ POI → Lấy polyline & duration
   * B4: Trả về JSON hoàn chỉnh
   */
  async processCustomRoute(
    userId: string,
    routeDto: RouteDto,
  ): Promise<any> {
    try {
      const { route_id, route_data_json, start_location } = routeDto;
      const optimizedRoute = route_data_json.optimized_route;

      console.log(`🔧 Processing custom route for user: ${userId}`);
      console.log(`   - Route ID: ${route_id || 'NEW'}`);
      console.log(`   - Days: ${optimizedRoute.length}`);

      // B2: Enrich tất cả POI mới
      await this.enrichAllNewPOIs(optimizedRoute);

      // B3: Call Directions API cho TẤT CẢ POI, truyền travel_mode từng day
      const updatedRoute = await this.calculateDirectionsForAllDays(
        optimizedRoute,
        (routeDto as any).start_location || (route_data_json as any)?.start_location || null,
      );

      // B4: Lưu vào DB và trả về
      const savedRoute = await this.saveOrUpdateRoute({
          route_id,
          user_id: userId,
          route_data_json: {
            ...route_data_json,
            optimized_route: updatedRoute,
          },
          title: routeDto.title,
          destination: routeDto.destination,
          duration_days: routeDto.duration_days,
          start_datetime: routeDto.start_datetime,
          start_location: start_location || (route_data_json as any)?.start_location || null,
          status: routeDto.status || 'DRAFT',
          alerts: routeDto.alerts,
      });

      console.log(`✅ Custom route processed: ${savedRoute.route_id}`);
      return savedRoute;
    } catch (error) {
      console.error(`❌ Error processing custom route:`, error);
      throw new HttpException(
        `Error processing custom route: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * B2: Enrich tất cả POI mới (chưa có trong DB)
   */
  private async enrichAllNewPOIs(days: DayDto[]): Promise<void> {
    const allActivities: ActivityDto[] = [];

    // Thu thập tất cả activities
    for (const day of days) {
      if (day.activities && Array.isArray(day.activities)) {
        allActivities.push(...day.activities);
      }
    }

    console.log(`📋 Checking ${allActivities.length} POIs...`);

    // Enrich từng POI
    for (const activity of allActivities) {
      await this.ensurePOIExists(activity);
    }
  }

  /**
   * B3: Call Directions API cho TẤT CẢ các ngày
   */
  private async calculateDirectionsForAllDays(
    days: DayDto[],
    startLocation?: { lat: number; lng: number } | null,
  ): Promise<any[]> {
    const result: any[] = [];

    for (const day of days) {
      console.log(`🗺️  Calculating directions for Day ${day.day}...`);
      if (!day.travel_mode) {
        throw new Error(`travel_mode is required for day ${day.day}`);
      }
      const updatedActivities = await this.calculateDirectionsForDay(
        day.activities,
        day.travel_mode,
        startLocation,
      );
      result.push({
        day: day.day,
        activities: updatedActivities,
        day_start_time: day.day_start_time,
        travel_mode: day.travel_mode,
      });
    }

    return result;
  }

  /**
   * Kiểm tra và tạo POI mới nếu chưa có trong DB
   */
  private async ensurePOIExists(activity: ActivityDto): Promise<void> {
    const { google_place_id, name, location } = activity;

    if (!google_place_id || !name || !location) {
      throw new HttpException(
        'Each activity must have google_place_id, name, and location',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Kiểm tra POI đã có trong DB chưa
    const existingPlace = await this.placeModel
      .findOne({ googlePlaceId: google_place_id })
      .exec();

    if (!existingPlace) {
      console.log(`🆕 Creating new POI: ${name} (${google_place_id})`);
      await this.createAndEnrichPOI(google_place_id, name, location);
    } else {
      console.log(`✅ POI exists: ${name} (${google_place_id})`);
    }
  }

  /**
   * Tạo và enrich POI mới - sử dụng PlaceService để tái sử dụng code
   */
  private async createAndEnrichPOI(
    googlePlaceId: string,
    name: string,
    location: { lat: number; lng: number },
  ): Promise<void> {
    // Sử dụng PlaceService.upsertPlace để tạo hoặc cập nhật POI
    await this.placeService.upsertPlace({
      placeID: googlePlaceId,
      name,
      formatted_address: 'Đang cập nhật...',
      location: { lat: location.lat, lng: location.lng },
      emotional_tags: new Map<string, number>(),
      type: 'other',
      latitude: location.lat,
      longitude: location.lng,
    });
    console.log(`💾 Saved new POI to DB: ${name}`);

    // Enrich với Google Places API sử dụng PlaceService
    try {
      await this.placeService.enrichPlaceDetails({
        googlePlaceId,
        forceRefresh: true,
      });
      console.log(`✨ Enriched POI: ${name}`);
    } catch (error) {
      console.error(`❌ Error enriching POI ${googlePlaceId}:`, error.message);
    }
  }

  /**
   * Tính toán Directions cho các POI trong một ngày
   */
  private async calculateDirectionsForDay(
    activities: ActivityDto[],
    travelMode: string,
    startLocation?: { lat: number; lng: number } | null,
  ): Promise<any[]> {
    const result: any[] = [];

    for (let i = 0; i < activities.length; i++) {
      const current = activities[i];
      const activityData: any = {
        google_place_id: current.google_place_id,
        name: current.name,
        location: current.location,
        emotional_tags: current.emotional_tags || {},
        opening_hours: current.opening_hours || null,
        visit_duration_minutes: current.visit_duration_minutes || 90,
        ecs_score: current.ecs_score,
        estimated_arrival: current.estimated_arrival,
        estimated_departure: current.estimated_departure,
      };

      // Nếu có startLocation và đây là activity đầu tiên, tính polyline từ start đến activity đầu tiên
      if (i === 0 && startLocation?.lat !== undefined && startLocation?.lng !== undefined) {
        const directionsFromStart = await this.getDirections(
          `${startLocation.lat},${startLocation.lng}`,
          `${current.location.lat},${current.location.lng}`,
          travelMode,
        );
        const startRoute = directionsFromStart.routes[0];
        const startLeg = startRoute.legs[0];
        activityData.start_encoded_polyline = startRoute.overview_polyline.points;
        activityData.start_travel_duration_minutes = Math.round(
          startLeg.duration.value / 60,
        );
      }

      // Tính Directions đến POI tiếp theo
      if (i < activities.length - 1) {
        const next = activities[i + 1];
        const directions = await this.getDirections(
          `${current.location.lat},${current.location.lng}`,
          `${next.location.lat},${next.location.lng}`,
          travelMode,
        );

        const route = directions.routes[0];
        const leg = route.legs[0];

        activityData.encoded_polyline = route.overview_polyline.points;
        activityData.travel_duration_minutes = Math.round(
          leg.duration.value / 60,
        );
      } else {
        activityData.encoded_polyline = null;
        activityData.travel_duration_minutes = null;
      }

      result.push(activityData);
    }

    return result;
  }

  /**
   * Gọi Google Directions API
   */
  private async getDirections(
    origin: string,
    destination: string,
    mode: string,
  ): Promise<any> {
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
        throw new HttpException(
          `Directions API error: ${response.data.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      return response.data;
    } catch (error) {
      throw new HttpException(
        'Cannot get directions',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * B5: Lưu hoặc cập nhật route vào DB
   */
  private async saveOrUpdateRoute(data: {
    route_id?: string;
    user_id: string;
    route_data_json: any;
    title?: string;
    destination?: string;
    duration_days?: number;
    start_datetime?: string;
    start_location?: { lat: number; lng: number } | null;
    status?: string;
    alerts?: any[];
  }): Promise<ItineraryDocument> {
    const {
      route_id,
      user_id,
      route_data_json,
      title,
      destination,
      duration_days,
      start_datetime,
      start_location,
      status,
      alerts,
    } = data;

    // Nếu có route_id → cập nhật
    if (route_id) {
      const existing = await this.itineraryModel
        .findOne({ route_id, user_id })
        .exec();

      if (existing) {
        existing.route_data_json = route_data_json;
        if (title) existing.title = title;
        if (destination) existing.destination = destination;
        if (duration_days) existing.duration_days = duration_days;
        if (start_datetime)
          existing.start_datetime = new Date(start_datetime);
        if (start_location) existing.start_location = start_location as any;
        if (status) existing.status = status as any;
        if (alerts) (existing as any).alerts = alerts;

        return existing.save();
      }
    }

    // Không có route_id hoặc không tìm thấy → tạo mới
    const newRouteId = `route_${randomUUID()}`;
    const newRoute = new this.itineraryModel({
      route_id: newRouteId,
      user_id,
      created_at: new Date(),
      route_data_json,
      title: title || null,
      destination: destination || null,
      duration_days: duration_days || null,
      start_datetime: start_datetime ? new Date(start_datetime) : null,
      start_location: start_location || null,
      status: status || 'DRAFT',
      alerts: alerts || [],
    });

    return newRoute.save();
  }
}