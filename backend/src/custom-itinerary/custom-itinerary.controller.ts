import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomItineraryService } from './custom-itinerary.service';
import { CheckWeatherDto } from './dto/check-weather.dto';
import { CalculateRoutesDto } from './dto/calculate-routes.dto';

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
  async calculateRoutes(@Body() dto: CalculateRoutesDto) {
    return this.customItineraryService.calculateRoutes(dto);
  }
}
