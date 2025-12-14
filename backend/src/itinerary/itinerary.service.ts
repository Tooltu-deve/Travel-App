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
  private readonly googleRoutesApiKey: string;

  private readonly VIETNAM_PORTS = [
    // TP. Hồ Chí Minh
    { name: 'Cảng Cát Lái', lat: 10.7608, lng: 106.7958 },
    { name: 'Cảng Tân Cảng Hiệp Phước', lat: 10.6286, lng: 106.7633 },
    { name: 'Cảng Container Quốc tế Việt Nam (VICT)', lat: 10.7736, lng: 106.7283 },
    { name: 'Cảng Bến Nghé', lat: 10.7700, lng: 106.7300 },
    { name: 'Bến phà Cần Giờ - Vũng Tàu (Bến Tắc Suất)', lat: 10.3983, lng: 106.9750 },

    // Đà Nẵng
    { name: 'Bến cảng Tiên Sa', lat: 16.1233, lng: 108.2167 },
    { name: 'Bến cảng Sông Hàn', lat: 16.0778, lng: 108.2250 },
    { name: 'Bến cảng Nại Hiên', lat: 16.0900, lng: 108.2300 },
    { name: 'Bến cảng Sơn Trà', lat: 16.1167, lng: 108.2333 },
    { name: 'Bến cảng Nhà máy xi măng Hải Vân', lat: 16.1333, lng: 108.1333 },

    // Hải Phòng
    { name: 'Cảng Nam Hải Đình Vũ', lat: 20.8333, lng: 106.7667 },
    { name: 'Cảng container Vip Greenport', lat: 20.8400, lng: 106.7600 },
    { name: 'Bến cảng Việt Nhật', lat: 20.8500, lng: 106.7500 },
    { name: 'Bến phà Đồng Bài', lat: 20.8167, lng: 106.9167 },
    { name: 'Bến phà Gia Luận', lat: 20.8333, lng: 106.9833 },

    // Nha Trang
    { name: 'Cảng Cầu Đá Nha Trang', lat: 12.2167, lng: 109.2167 },
    { name: 'Cảng Nha Trang', lat: 12.2167, lng: 109.2167 },
    { name: 'Cảng Vân Phong', lat: 12.6000, lng: 109.3000 },
    { name: 'Cáp Treo Vinpearl Harbour Nha Trang', lat: 12.1859399, lng: 109.184602},

    // Vũng Tàu
    { name: 'Bến phà Vũng Tàu', lat: 10.3333, lng: 107.0667 },
    { name: 'Cảng Công vụ', lat: 10.3400, lng: 107.0700 },

    // Hạ Long
    { name: 'Cảng Du thuyền Quốc tế Hạ Long (Cảng Sun)', lat: 20.9500, lng: 107.0500 },
    { name: 'Cảng Du thuyền Tuần Châu Hạ Long', lat: 20.9333, lng: 106.9833 },
    { name: 'Bến tàu khách quốc tế Vinashin Hòn Gai', lat: 20.9500, lng: 107.0833 },
    { name: 'Cảng tổng hợp Cái Lân', lat: 20.9667, lng: 107.0333 },
    { name: 'Bến cảng khách Hòn Gai', lat: 20.9500, lng: 107.0833 },

    // Hội An
    { name: 'Cảng Cửa Đại Cù Lao Chàm', lat: 15.8833, lng: 108.3833 },
    { name: 'Bến Cảng Giao Thoa Nam Hội An', lat: 15.8500, lng: 108.4000 },

    // Phú Quốc
    { name: 'Bến phà Bãi Vòng', lat: 10.1500, lng: 104.0500 },
    { name: 'Cảng An Thới', lat: 10.0167, lng: 104.0167 },

    // Phan Thiết
    { name: 'Cảng Phan Thiết', lat: 10.9333, lng: 108.1000 },
  ];

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

    this.googleRoutesApiKey = 
      this.configService.get<string>('GOOGLE_ROUTES_API_KEY') ||
      process.env.GOOGLE_ROUTES_API_KEY ||
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
   * Mapping các tên thành phố và các biến thể phổ biến
   */
  private getCityVariants(destination: string): string[] {
    const destLower = destination.toLowerCase().trim();
    const variants = new Set<string>([destLower]);

    // Xử lý dấu tiếng Việt
    const removeVietnameseTones = (str: string): string => {
      return str.replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, (match) => {
        const map: Record<string, string> = {
          'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
          'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
          'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
          'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
          'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
          'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
          'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
          'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
          'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
          'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
          'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
          'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
          'đ': 'd'
        };
        return map[match] || match;
      });
    };

    // Thêm version không dấu
    variants.add(removeVietnameseTones(destLower));

    // Mapping các tên thành phố phổ biến
    const cityMappings: Record<string, string[]> = {
      'thành phố hồ chí minh': ['ho chi minh', 'hcm', 'saigon', 'sài gòn', 'tp.hcm', 'tp hcm', 'ho chi minh city', 'thanh pho ho chi minh'],
      'hồ chí minh': ['ho chi minh', 'hcm', 'saigon', 'sài gòn', 'tp.hcm', 'tp hcm', 'ho chi minh city'],
      'hà nội': ['ha noi', 'hanoi', 'thủ đô'],
      'đà nẵng': ['da nang', 'danang'],
      'hải phòng': ['hai phong', 'haiphong'],
      'cần thơ': ['can tho', 'cantho'],
      'nha trang': ['nha trang'],
      'huế': ['hue', 'thừa thiên huế', 'thua thien hue'],
      'vũng tàu': ['vung tau', 'vungtau'],
      'hạ long': ['ha long', 'halong'],
      'đà lạt': ['da lat', 'dalat'],
      'sa pa': ['sapa', 'sa pa'],
      'hội an': ['hoi an', 'hoian'],
      'phú quốc': ['phu quoc', 'phuquoc'],
      'phan thiết': ['phan thiet', 'phantheit'],
      'ninh bình': ['ninh binh', 'ninhbinh'],
    };

    // Tìm mapping nếu có
    const normalizedDest = destLower.replace(/thành phố\s+/i, ''); // Loại bỏ "thành phố" prefix
    const mappingKey = Object.keys(cityMappings).find(key => 
      key === destLower || key === normalizedDest || destLower.includes(key) || key.includes(normalizedDest)
    );

    if (mappingKey) {
      cityMappings[mappingKey].forEach(v => variants.add(v));
    } else if (destLower.includes('hồ chí minh') || destLower.includes('ho chi minh')) {
      // Xử lý riêng cho HCM
      ['ho chi minh', 'hcm', 'saigon', 'sài gòn', 'tp.hcm', 'tp hcm', 'ho chi minh city'].forEach(v => variants.add(v));
    } else if (destLower.includes('huế') || destLower.includes('hue')) {
      ['hue', 'thừa thiên huế', 'thua thien hue'].forEach(v => variants.add(v));
    }

    return Array.from(variants);
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

    const searchVariants = this.getCityVariants(destination);

    const filteredPois: PlaceDocument[] = [];
    const excludedPois: PlaceDocument[] = [];

    for (const poi of pois) {
      let matched = false;
      
      // Kiểm tra trong address (ưu tiên)
      const address = (poi.address || '').toLowerCase();
      
      // 1. Tìm kiếm trong address (ưu tiên) - kiểm tra tất cả các biến thể
      for (const variant of searchVariants) {
        // Tìm kiếm variant trong address (bỏ qua ký tự đặc biệt và khoảng trắng)
        const normalizedAddress = address.replace(/[.,;:]/g, ' ').replace(/\s+/g, ' ');
        if (normalizedAddress.includes(variant)) {
          matched = true;
          break;
        }
      }
      
      if (matched) {
        filteredPois.push(poi);
        continue;
      }

      // 2. Kiểm tra trong name (nếu address không match)
      const name = (poi.name || '').toLowerCase();
      for (const variant of searchVariants) {
        if (name.includes(variant)) {
          matched = true;
          break;
        }
      }
      
      if (matched) {
        filteredPois.push(poi);
        continue;
      }

      // POI không match
      excludedPois.push(poi);
    }

    // Log các POI bị loại bỏ để debug
    if (excludedPois.length > 0 && excludedPois.length <= 10) {
      console.log(`⚠️  Các POI bị loại bỏ khi lọc theo "${destination}":`);
      excludedPois.slice(0, 10).forEach((poi, idx) => {
        console.log(`   ${idx + 1}. ${poi.name} - Address: ${poi.address || 'N/A'}`);
      });
      if (excludedPois.length > 10) {
        console.log(`   ... và ${excludedPois.length - 10} POI khác`);
      }
    }

    return filteredPois;
  }

  /**
   * Lọc POI theo destination từ database
   * @param destination - Tên thành phố
   * @returns Danh sách POI đã được lọc
   */
  async filterPoisByDestination(
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

    if (pois.length === 0) {
      throw new HttpException(
        `Không tìm thấy POI nào phù hợp với destination "${destination}".`,
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
    // Ngày hiện tại (bắt đầu ngày) để loại trừ ngày quá khứ
    const todayMs = this.normalizeDate(new Date());

    const isWithinTripRange = (timestampMs: number): boolean => {
      const normalized = this.normalizeDate(new Date(timestampMs));
      // Chỉ kiểm tra các ngày TRONG khoảng thời gian du lịch và không phải ngày quá khứ
      return (
        normalized >= Math.max(tripStartMs, todayMs) && normalized <= tripEndMs
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

  /**
   * Dịch các từ khóa thời tiết từ tiếng Anh sang tiếng Việt
   */
  private translateWeatherDescription(description: string): string {
    if (!description) return description;

    const descLower = description.toLowerCase();
    const weatherTranslations: Record<string, string> = {
      // Rain
      'clear sky': 'trời quang đãng',
      'few clouds': 'ít mây',
      'scattered clouds': 'mây rải rác',
      'broken clouds': 'mây rải rác',
      'overcast clouds': 'trời nhiều mây',
      'mist': 'sương mù nhẹ',
      'fog': 'sương mù',
      'haze': 'sương mù nhẹ',
      'smoke': 'khói',
      'dust': 'bụi',
      'sand': 'cát',
      'light rain': 'mưa nhẹ',
      'moderate rain': 'mưa vừa',
      'heavy rain': 'mưa lớn',
      'very heavy rain': 'mưa rất lớn',
      'extreme rain': 'mưa cực lớn',
      'freezing rain': 'mưa đông',
      'light intensity shower rain': 'mưa rào nhẹ',
      'shower rain': 'mưa rào',
      'heavy intensity shower rain': 'mưa rào lớn',
      'ragged shower rain': 'mưa rào rải rác',
      'light intensity drizzle': 'mưa phùn nhẹ',
      'drizzle': 'mưa phùn',
      'heavy intensity drizzle': 'mưa phùn lớn',
      'light intensity drizzle rain': 'mưa phùn nhẹ',
      'drizzle rain': 'mưa phùn',
      'heavy intensity drizzle rain': 'mưa phùn lớn',
      'shower drizzle': 'mưa phùn rải rác',
      'thunderstorm with light rain': 'dông kèm mưa nhẹ',
      'thunderstorm with rain': 'dông kèm mưa',
      'thunderstorm with heavy rain': 'dông kèm mưa lớn',
      'light thunderstorm': 'dông nhẹ',
      'thunderstorm': 'dông',
      'heavy thunderstorm': 'dông lớn',
      'ragged thunderstorm': 'dông rải rác',
      'thunderstorm with light drizzle': 'dông kèm mưa phùn nhẹ',
      'thunderstorm with drizzle': 'dông kèm mưa phùn',
      'thunderstorm with heavy drizzle': 'dông kèm mưa phùn lớn',
      // Snow
      'light snow': 'tuyết nhẹ',
      'snow': 'tuyết',
      'heavy snow': 'tuyết lớn',
      'sleet': 'tuyết mưa',
      'light shower sleet': 'tuyết mưa nhẹ',
      'shower sleet': 'tuyết mưa',
      'light rain and snow': 'mưa tuyết nhẹ',
      'rain and snow': 'mưa tuyết',
      'light shower snow': 'mưa tuyết nhẹ',
      'shower snow': 'mưa tuyết',
      'heavy shower snow': 'mưa tuyết lớn',
      // Other
      'squalls': 'gió giật mạnh',
      'tornado': 'lốc xoáy',
      'volcanic ash': 'tro núi lửa',
    };

    // Tìm kiếm exact match trước
    if (weatherTranslations[descLower]) {
      return weatherTranslations[descLower];
    }

    // Tìm kiếm từng từ khóa (từ dài đến ngắn để ưu tiên match chính xác hơn)
    const sortedKeys = Object.keys(weatherTranslations).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (descLower.includes(key)) {
        // Thay thế từ khóa bằng bản dịch
        const translated = descLower.replace(key, weatherTranslations[key]);
        // Capitalize chữ cái đầu
        return translated.charAt(0).toUpperCase() + translated.slice(1);
      }
    }

    // Nếu không tìm thấy, trả về nguyên bản (có thể đã là tiếng Việt hoặc từ khóa không có trong map)
    return description;
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
    // Ngày hiện tại (bắt đầu ngày) để loại trừ ngày quá khứ
    const todayMs = this.normalizeDate(new Date());

    const isWithinTripRange = (timestampMs: number): boolean => {
      const normalized = this.normalizeDate(new Date(timestampMs));
      // Chỉ kiểm tra các ngày TRONG khoảng thời gian du lịch và không phải ngày quá khứ
      return (
        normalized >= Math.max(tripStartMs, todayMs) && normalized <= tripEndMs
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
      const translatedDescription = this.translateWeatherDescription(description);
      addAlert({
        type: 'rain',
        title: `Dự báo mưa (${dateLabel})`,
        message: `Ngày ${entryDate.toLocaleDateString(
          'vi-VN',
        )} dự báo ${translatedDescription}. Hãy chuẩn bị ô/áo mưa hoặc cân nhắc điều chỉnh lịch trình cho phù hợp.`,
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

  private findNearestPort(location: { lat: number; lng: number }): { name: string; lat: number; lng: number; distance: number } | null {
    if (!location || !location.lat || !location.lng) return null;

    let nearestPort: { name: string; lat: number; lng: number; distance: number } | null = null;
    let minDistance = Infinity;

    for (const port of this.VIETNAM_PORTS) {
      const distance = this.calculateHaversineDistance(
        location.lat,
        location.lng,
        port.lat,
        port.lng,
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestPort = { ...port, distance };
      }
    }

    // Chỉ lấy cảng trong bán kính 100km
    if (minDistance > 100) {
        return null;
    }

    return nearestPort;
  }

  private calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private async getPlaceIdFromTextSearch(query: string): Promise<string | null> {
    if (!this.googleRoutesApiKey) return null; // Reuse Routes API Key for Places API if possible, or check config

    // Note: Google Places API (New) uses the same project/key usually.
    // URL: https://places.googleapis.com/v1/places:searchText
    const url = 'https://places.googleapis.com/v1/places:searchText';
    
    const body = {
      textQuery: query,
      maxResultCount: 1
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googleRoutesApiKey, // Assuming same key works
            'X-Goog-FieldMask': 'places.id,places.displayName',
          },
          timeout: 10000,
        }),
      );

      const places = response.data.places;
      if (places && places.length > 0) {
        return places[0].id;
      }
    } catch (error) {
      console.error(`❌ Error searching place ID for "${query}":`, error?.message || error);
    }
    return null;
  }

  public async fetchDirectionsInfo(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: string = 'driving',
  ): Promise<{ 
    encoded_polyline: string | null; 
    travel_duration_minutes: number | null;
    origin_port?: { name: string; place_id: string };
    destination_port?: { name: string; place_id: string };
    steps?: any[];
  }> {
    if (!this.googleRoutesApiKey) {
      return { encoded_polyline: null, travel_duration_minutes: null };
    }

    const travelModesToRetry = ['driving', 'walking', 'bicycling'];

    // Map travel mode từ format cũ sang format Routes API v2
    const mapTravelMode = (mode: string): string => {
      const modeMap: { [key: string]: string } = {
        'driving': 'DRIVE',
        'walking': 'WALK',
        'bicycling': 'BICYCLE',
        'transit': 'TRANSIT',
      };
      return modeMap[mode.toLowerCase()] || 'DRIVE';
    };

    const fetchRoute = async (travelMode: string, useTraffic: boolean = true) => {
      const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;
      const mappedMode = mapTravelMode(travelMode);
      const body: any = {
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          },
        },
        travelMode: mappedMode,
      };

      // Chỉ thêm routingPreference cho DRIVE mode nếu useTraffic = true
      if (mappedMode === 'DRIVE' && useTraffic) {
        body.routingPreference = 'TRAFFIC_AWARE';
      }

      try {
        const response = await firstValueFrom(
          this.httpService.post(url, body, {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': this.googleRoutesApiKey,
              'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.navigationInstruction',
            },
            timeout: 30000,
          }),
        );
        const data = response.data;

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const polyline = route.polyline?.encodedPolyline || null;
          const durationSeconds = route.duration ? parseFloat(route.duration.replace('s', '')) : 0;
          const travelDurationMinutes =
            durationSeconds > 0 ? durationSeconds / 60.0 : null;

          // Xử lý multimodal steps (ví dụ: walk -> ferry -> walk)
          let steps: any[] = [];
          if (route.legs && route.legs.length > 0) {
             route.legs.forEach((leg: any) => {
                if (leg.steps && Array.isArray(leg.steps)) {
                   steps = steps.concat(leg.steps.map((step: any) => ({
                      travel_mode: step.travelMode,
                      encoded_polyline: step.polyline?.encodedPolyline,
                      instruction: step.navigationInstruction?.instructions
                   })));
                }
             });
          }

          return {
            encoded_polyline: polyline,
            travel_duration_minutes: travelDurationMinutes,
            steps: steps.length > 0 ? steps : undefined
          };
        }
      } catch (error) {
        if (error?.response?.data) {
          console.error(`Route API error for mode ${travelMode} (traffic: ${useTraffic}):`, JSON.stringify(error.response.data));
        } else {
          console.error(`Route API error for mode ${travelMode} (traffic: ${useTraffic}):`, error?.message || error);
        }
      }
      return { encoded_polyline: null, travel_duration_minutes: null };
    };

    // Gọi API với mode ban đầu
    let result: any = await fetchRoute(mode, true);

    // Nếu mode là 'driving' và thất bại, thử lại không dùng routingPreference (đôi khi gây lỗi hoặc không tìm thấy đường)
    if (mode === 'driving' && (!result.encoded_polyline || !result.travel_duration_minutes)) {
      console.log(`⚠️  No result for mode "driving" with traffic. Retrying without traffic preference...`);
      result = await fetchRoute(mode, false);
    }

    // Nếu thất bại, kiểm tra xem có phải là tuyến đường biển/đảo không (dựa vào việc tìm thấy cảng gần đó)
    if (!result.encoded_polyline || !result.travel_duration_minutes) {
      const originPort = this.findNearestPort(origin);
      const destPort = this.findNearestPort(destination);

      // Chỉ khi tìm thấy cảng ở cả 2 đầu (nghi ngờ là đường ra đảo), mới thử fallback sang walking
      if (originPort && destPort) {
        console.log(`⚠️  No result for mode "${mode}". Potential sea route detected (Ports: ${originPort.name} -> ${destPort.name}).`);
        
        // Thử lại với walking
        console.log(`   Retrying with "walking"...`);
        result = await fetchRoute('walking');

        // Nếu walking vẫn thất bại, trả về thông tin cảng để gợi ý
        if (!result.encoded_polyline || !result.travel_duration_minutes) {
          console.log(`⚠️  Walking also failed. Returning port info.`);
          
          const [originPortId, destPortId] = await Promise.all([
            this.getPlaceIdFromTextSearch(originPort.name),
            this.getPlaceIdFromTextSearch(destPort.name)
          ]);

          if (originPortId) {
            result.origin_port = { name: originPort.name, place_id: originPortId };
          }
          if (destPortId) {
            result.destination_port = { name: destPort.name, place_id: destPortId };
          }
        }
      } else {
        console.log(`⚠️  No result for mode "${mode}" and no ports detected nearby. Returning failure.`);
      }
    }

    return result;
  }

  private async enrichRouteWithDirections(
    optimizedRoute: any,
    currentLocation: { lat: number; lng: number },
    travelMode?: string,
  ): Promise<any> {
    const enrichedRoute: any[] = [];

    for (const dayData of optimizedRoute.optimized_route || []) {
      const enrichedActivities: any[] = [];
      let previousLocation = currentLocation;
      const dayTravelMode =
        dayData.travel_mode || travelMode || optimizedRoute.travel_mode || 'driving';

      for (const poi of dayData.activities || []) {
        const poiLocation = poi.location;
        if (!poiLocation || !poiLocation.lat || !poiLocation.lng) {
          enrichedActivities.push(poi);
          continue;
        }

        const directionsInfo = await this.fetchDirectionsInfo(
          previousLocation,
          { lat: poiLocation.lat, lng: poiLocation.lng },
          dayTravelMode,
        );

        const enrichedPoi = {
          ...poi,
          encoded_polyline: directionsInfo.encoded_polyline,
          travel_duration_minutes: directionsInfo.travel_duration_minutes,
          origin_port: directionsInfo.origin_port,
          steps: directionsInfo.steps,
          destination_port: directionsInfo.destination_port,
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

    let places = await this.filterPoisByDestination(
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
      generateDto.travel_mode,
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

      // B3: Lấy route cũ từ DB để so sánh (nếu có route_id)
      let existingRoute: any = null;
      if (route_id) {
        existingRoute = await this.itineraryModel.findOne({ route_id }).exec();
      }

      // B4: Chỉ tính lại Routes API cho các ngày có POI thay đổi
      const updatedRoute = await this.calculateDirectionsForChangedDays(
        optimizedRoute,
        existingRoute?.route_data_json?.optimized_route || null,
        (routeDto as any).start_location || (route_data_json as any)?.start_location || null,
      );

      // B5: Lưu vào DB và trả về
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
   * B3: Chỉ gọi Routes API cho các ngày có POI thay đổi
   */
  private async calculateDirectionsForChangedDays(
    newDays: DayDto[],
    oldDays: DayDto[] | null,
    startLocation?: { lat: number; lng: number } | null,
  ): Promise<any[]> {
    const result: any[] = [];

    // Nếu không có route cũ, tính lại tất cả
    if (!oldDays) {
      console.log(`📍 No existing route, calculating all days...`);
      return this.calculateDirectionsForAllDays(newDays, startLocation);
    }

    // So sánh từng ngày để tìm những ngày có POI thay đổi
    for (const newDay of newDays) {
      const oldDay = oldDays.find((d) => d.day === newDay.day);
      
      // Kiểm tra xem ngày này có POI thay đổi không
      const hasChanges = this.hasDayChanges(newDay, oldDay);

      if (hasChanges || !oldDay) {
        // Có thay đổi -> tính lại Routes API cho ngày này
        console.log(`🔄 Day ${newDay.day} has changes, recalculating routes...`);
        if (!newDay.travel_mode) {
          throw new Error(`travel_mode is required for day ${newDay.day}`);
        }
        const updatedActivities = await this.calculateDirectionsForDay(
          newDay.activities,
          newDay.travel_mode,
          startLocation,
        );
        result.push({
          day: newDay.day,
          activities: updatedActivities,
          day_start_time: newDay.day_start_time,
          travel_mode: newDay.travel_mode,
        });
      } else {
        // Không có thay đổi -> giữ nguyên từ route cũ
        console.log(`✅ Day ${newDay.day} unchanged, keeping cached routes`);
        result.push(oldDay);
      }
    }

    return result;
  }

  /**
   * Kiểm tra xem một ngày có POI nào thay đổi không
   */
  private hasDayChanges(newDay: DayDto, oldDay?: DayDto): boolean {
    if (!oldDay) return true;

    const newActivities = newDay.activities || [];
    const oldActivities = oldDay.activities || [];

    // Nếu số lượng POI khác nhau -> có thay đổi
    if (newActivities.length !== oldActivities.length) {
      console.log(`   📊 POI count changed: ${oldActivities.length} -> ${newActivities.length}`);
      return true;
    }

    // So sánh từng POI
    for (let i = 0; i < newActivities.length; i++) {
      const newPOI = newActivities[i];
      const oldPOI = oldActivities[i];

      const newPlaceId = (newPOI.google_place_id || '').replace(/^places\//, '');
      const oldPlaceId = (oldPOI.google_place_id || '').replace(/^places\//, '');

      // Nếu google_place_id khác nhau -> có thay đổi
      if (newPlaceId !== oldPlaceId) {
        console.log(`   🔄 POI ${i} changed: ${oldPOI.name} -> ${newPOI.name}`);
        return true;
      }

      // Kiểm tra vị trí có thay đổi đáng kể không (> 10m)
      if (this.isLocationDifferent(newPOI.location, oldPOI.location)) {
        console.log(`   📍 POI ${i} location changed: ${oldPOI.name}`);
        return true;
      }
    }

    // Kiểm tra travel_mode có thay đổi không
    if (newDay.travel_mode !== oldDay.travel_mode) {
      console.log(`   🚗 Travel mode changed: ${oldDay.travel_mode} -> ${newDay.travel_mode}`);
      return true;
    }

    return false;
  }

  /**
   * Kiểm tra xem 2 vị trí có khác nhau đáng kể không (> 10m)
   */
  private isLocationDifferent(
    loc1?: { lat: number; lng: number },
    loc2?: { lat: number; lng: number },
  ): boolean {
    if (!loc1 || !loc2) return true;
    
    // Khoảng cách xấp xỉ: ~0.0001 độ ≈ ~11m
    const latDiff = Math.abs(loc1.lat - loc2.lat);
    const lngDiff = Math.abs(loc1.lng - loc2.lng);
    
    return latDiff > 0.0001 || lngDiff > 0.0001;
  }

  /**
   * B3 (legacy): Call Directions API cho TẤT CẢ các ngày - dùng cho route mới
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
        
        if (directionsFromStart.status === 'OK' && directionsFromStart.routes.length > 0) {
          const startRoute = directionsFromStart.routes[0];
          const startLeg = startRoute.legs[0];
          activityData.start_encoded_polyline = startRoute.overview_polyline.points;
          activityData.start_travel_duration_minutes = Math.round(
            startLeg.duration.value / 60,
          );
          activityData.start_steps = startLeg.steps; // Thêm steps cho đoạn đường từ start
        } else {
          console.warn(`⚠️ No route from start to first POI`);
          activityData.start_encoded_polyline = null;
          activityData.start_travel_duration_minutes = null;
          if (directionsFromStart.origin_port) activityData.start_origin_port = directionsFromStart.origin_port;
          if (directionsFromStart.destination_port) activityData.start_destination_port = directionsFromStart.destination_port;
        }
      }

      // Tính Directions từ POI trước đó đến POI hiện tại (để gán travel_duration_minutes đúng)
      // travel_duration_minutes của POI hiện tại = thời gian đi từ POI trước đó đến POI hiện tại
      if (i > 0) {
        const prev = activities[i - 1];
        const directions = await this.getDirections(
          `${prev.location.lat},${prev.location.lng}`,
          `${current.location.lat},${current.location.lng}`,
          travelMode,
        );

        if (directions.status === 'OK' && directions.routes.length > 0) {
          const route = directions.routes[0];
          const leg = route.legs[0];

          activityData.encoded_polyline = route.overview_polyline.points;
          activityData.travel_duration_minutes = Math.round(
            leg.duration.value / 60,
          );
          activityData.steps = leg.steps;
        } else {
          console.warn(`⚠️ No route between ${prev.name} and ${current.name}`);
          activityData.encoded_polyline = null;
          activityData.travel_duration_minutes = null;
          if (directions.origin_port) activityData.origin_port = directions.origin_port;
          if (directions.destination_port) activityData.destination_port = directions.destination_port;
        }
      } else {
        // POI đầu tiên không có travel_duration_minutes (đã có start_travel_duration_minutes)
        activityData.encoded_polyline = null;
        activityData.travel_duration_minutes = null;
      }

      result.push(activityData);
    }

    return result;
  }

  /**
   * Gọi Google Routes API (thay thế Directions API)
   */
  private async getDirections(
    origin: string,
    destination: string,
    mode: string,
  ): Promise<any> {
    try {
      console.log(`🔍 getDirections called with:`, { origin, destination, mode });
      
      // Parse origin và destination (có thể là "lat,lng" hoặc place_id)
      const parseLocation = (location: string) => {
        if (location.includes(',')) {
          const [lat, lng] = location.split(',').map(Number);
          return { lat, lng };
        }
        return null;
      };

      const originCoords = parseLocation(origin);
      const destCoords = parseLocation(destination);

      console.log(`📍 Parsed coordinates:`, { originCoords, destCoords });

      if (!originCoords || !destCoords) {
        throw new HttpException(
          'Invalid origin or destination format',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Sử dụng fetchDirectionsInfo đã có sẵn
      console.log(`🚀 Calling fetchDirectionsInfo...`);
      const result = await this.fetchDirectionsInfo(
        originCoords,
        destCoords,
        mode || 'driving',
      );

      console.log(`📥 fetchDirectionsInfo result:`, { 
        hasPolyline: !!result.encoded_polyline, 
        hasDuration: !!result.travel_duration_minutes,
        duration: result.travel_duration_minutes
      });

      if (!result.encoded_polyline || !result.travel_duration_minutes) {
        console.warn(`⚠️ No route found for ${origin} -> ${destination} with mode ${mode}`);
        // Không throw error ngay, trả về response với route rỗng
        return {
          status: 'ZERO_RESULTS',
          routes: [],
          origin_port: result.origin_port,
          destination_port: result.destination_port,
        };
      }

      // Format lại giống Directions API response để tương thích với code cũ
      const response = {
        status: 'OK',
        routes: [
          {
            overview_polyline: {
              points: result.encoded_polyline,
            },
            legs: [
              {
                duration: {
                  value: result.travel_duration_minutes * 60,
                  text: `${Math.round(result.travel_duration_minutes)} phút`,
                },
                steps: result.steps, // Thêm steps vào response
              },
            ],
          },
        ],
        origin_port: result.origin_port,
        destination_port: result.destination_port,
      };
      
      console.log(`✅ getDirections success`);
      return response;
    } catch (error) {
      console.error('❌ getDirections error:', error?.message || error);
      throw new HttpException(
        `Cannot get directions: ${error?.message || 'Unknown error'}`,
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
      console.log(`🔍 Looking for route: ${route_id} by user: ${user_id}`);
      
      // Tìm route chỉ bằng route_id trước (không cần user_id)
      const existing = await this.itineraryModel
        .findOne({ route_id })
        .exec();

      if (existing) {
        console.log(`✅ Found existing route: ${route_id}, updating...`);
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
      } else {
        console.log(`⚠️ Route not found: ${route_id}, creating new...`);
      }
    }

    // Không có route_id hoặc không tìm thấy → tạo mới
    const newRouteId = route_id || `route_${randomUUID()}`;
    console.log(`🆕 Creating new route with ID: ${newRouteId}`);
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