import { Controller, Post, Body, UseGuards, Req, Patch, Param, Get, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomItineraryService } from './custom-itinerary.service';
import { CheckWeatherDto } from './dto/check-weather.dto';
import { CalculateRoutesDto } from './dto/calculate-routes.dto';
import { AutocompleteRequestDto } from './dto/autocomplete-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ItineraryService } from '../itinerary/itinerary.service';

/**
 * Controller quản lý custom itinerary
 * Tuân thủ MVC pattern, RESTful API conventions
 * Dùng snake_case trực tiếp (nhất quán với itinerary, place, user modules)
 */
@UseGuards(JwtAuthGuard)
@Controller('custom-itinerary')
export class CustomItineraryController {
  constructor(
    private readonly customItineraryService: CustomItineraryService,
    private readonly itineraryService: ItineraryService,
  ) {}

  /**
   * POST /custom-itinerary/weather-check
   * Kiểm tra thời tiết cho chuyến đi
   */
  @Post('weather-check')
  async checkWeather(@Body() dto: CheckWeatherDto) {
    return this.customItineraryService.checkWeather(
      dto.departureDate,
      dto.returnDate,
      dto.destination,
    );
  }

  /**
   * POST /custom-itinerary/calculate-routes
   * Tính toán đường đi và polyline cho itinerary
   */
  @Post('calculate-routes')
  async calculateRoutes(@Body() dto: CalculateRoutesDto, @Req() req: any) {
    // Lấy user_id từ JWT (ưu tiên userId, fallback id)
    const userId = req?.user?.userId || req?.user?.id || null;
    return this.customItineraryService.calculateRoutes(dto, userId);
  }

  /**
   * POST /custom-itinerary/autocomplete
   * Gợi ý địa điểm bằng Google Places Autocomplete, giới hạn trong Việt Nam
   * Body:
   * - input: chuỗi người dùng nhập (bắt buộc)
   * - sessionToken: optional, để gom billing trong một session
   * Debounce 150ms phía server, trả tối đa 5 gợi ý
   */
  @Post('autocomplete')
  async autocomplete(@Body() dto: AutocompleteRequestDto) {
    return this.customItineraryService.autocompletePlaces(dto.input, dto.sessionToken);
  }

  /**
   * PATCH /custom-itinerary/status/:routeId
   * Proxy đổi status, tái sử dụng logic từ itinerary module
   * Body:
   * - status: DRAFT | CONFIRMED | MAIN
   * - title?: optional
   */
  @Patch('status/:routeId')
  async updateStatus(
    @Param('routeId') routeId: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.userId || req?.user?.id;
    if (!userId) {
      return { message: 'Unauthorized', status: 401 };
    }
    const updated = await this.customItineraryService.updateStatusAll(
      routeId,
      userId,
      dto.status,
      dto.title ? { title: dto.title } : undefined,
    );
    return updated || { message: 'Not found or no changes', status: 404 };
  }

  /**
   * GET /custom-itinerary/routes
   * Lấy danh sách custom-itineraries của user (có thể lọc theo status)
   * Query: status? = DRAFT | CONFIRMED | MAIN
   */
  @Get('routes')
  async getRoutes(
    @Req() req: any,
    @Query('status') status?: 'DRAFT' | 'CONFIRMED' | 'MAIN',
  ) {
    const userId = req?.user?.userId || req?.user?.id;
    if (!userId) {
      return { message: 'Unauthorized', status: 401 };
    }
    return this.customItineraryService.listRoutes(userId, status);
  }
}
