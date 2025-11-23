import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Place, PlaceDocument } from '../place/schemas/place.schema';
import { ItineraryRequestDto } from './dto/itinerary-request.dto';

@Injectable()
export class ItineraryService {
  private readonly AI_OPTIMIZER_URL = process.env.AI_OPTIMIZER_URL || 'http://localhost:8000';

  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private httpService: HttpService,
  ) {}


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

  /**
   * Tạo lộ trình tối ưu
   */
  async generateOptimizedRoute(request: ItineraryRequestDto): Promise<any> {
    try {
      // Bước 1: Lấy tất cả POI từ MongoDB
      let pois: PlaceDocument[] = await this.placeModel.find().exec();

      console.log(`📊 Tổng số POI trong DB: ${pois.length}`);

      // Bước 2: Lọc theo thành phố (destination)
      if (request.destination) {
        pois = this.filterByCity(pois, request.destination);
        console.log(`📍 Sau khi lọc theo thành phố "${request.destination}": ${pois.length} POI`);
      }

      // Bước 3: Lọc theo budget range
      if (request.budgetRange) {
        const beforeCount = pois.length;
        // Log các budget range có sẵn trước khi lọc
        const availableBudgets = new Set(
          pois.map((p) => p.budgetRange?.toLowerCase()).filter(Boolean),
        );
        console.log(
          `💰 Lọc theo budget "${request.budgetRange}". Các budget có sẵn: ${Array.from(availableBudgets).join(', ') || 'không có'}`,
        );

        pois = this.filterByBudget(pois, request.budgetRange);
        console.log(
          `💰 Sau khi lọc theo budget "${request.budgetRange}": ${pois.length} POI (từ ${beforeCount} POI)`,
        );

        // Cảnh báo nếu không tìm thấy POI với budget này
        if (pois.length === 0 && beforeCount > 0) {
          console.warn(
            `⚠️  Không tìm thấy POI nào với budget "${request.budgetRange}". Các budget có sẵn: ${Array.from(availableBudgets).join(', ')}`,
          );
        }
      }

      if (pois.length === 0) {
        // Tạo thông báo lỗi chi tiết hơn
        let errorMessage = 'Không tìm thấy POI nào phù hợp với tiêu chí lọc.';
        const details: string[] = [];

        if (request.destination) {
          details.push(`Thành phố: "${request.destination}"`);
        }
        if (request.budgetRange) {
          // Lấy lại danh sách budget có sẵn từ DB
          const allPois = await this.placeModel.find().exec();
          const availableBudgets = new Set(
            allPois.map((p) => p.budgetRange?.toLowerCase()).filter(Boolean),
          );
          details.push(
            `Budget range "${request.budgetRange}" không có trong dữ liệu. Các budget có sẵn: ${Array.from(availableBudgets).join(', ') || 'không có'}`,
          );
        }

        if (details.length > 0) {
          errorMessage += `\nChi tiết: ${details.join('; ')}`;
        }

        throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
      }

      // Bước 4: Chuyển đổi format cho AI Optimizer
      const poiList = pois.map((poi) => this.convertPlaceToOptimizerFormat(poi));

      // Bước 5: Gọi AI Optimizer Service
      const optimizerRequest = {
        poi_list: poiList,
        user_mood: request.user_mood,
        duration_days: request.duration_days,
        current_location: request.current_location,
        start_datetime: request.start_datetime,
        ecs_score_threshold: request.ecs_score_threshold || 0.0,
      };

      console.log(`🚀 Gửi ${poiList.length} POI đến AI Optimizer Service...`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.AI_OPTIMIZER_URL}/optimize-route`,
          optimizerRequest,
          {
            timeout: 60000, // 60 giây
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      console.error('❌ Lỗi khi tạo lộ trình:', error);

      if (error.response) {
        // Lỗi từ AI Optimizer Service
        const status = error.response.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error.response.data?.detail || error.response.data?.message || 'Lỗi từ AI Optimizer Service';
        throw new HttpException(message, status);
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        // Không thể kết nối đến AI Optimizer Service
        throw new HttpException(
          'Không thể kết nối đến AI Optimizer Service. Vui lòng kiểm tra service có đang chạy không.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      } else {
        // Lỗi khác
        throw new HttpException(
          error.message || 'Lỗi không xác định khi tạo lộ trình',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }
}

