import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ItineraryService } from './itinerary.service';
import { ItineraryRequestDto } from './dto/itinerary-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('itinerary')
export class ItineraryController {
  constructor(private readonly itineraryService: ItineraryService) {}

  /**
   * POST /api/v1/itinerary/suggest-ecs
   * Tạo lộ trình tối ưu dựa trên mood và các tiêu chí lọc
   */
  @UseGuards(JwtAuthGuard) // Yêu cầu đăng nhập
  @Post('suggest-ecs')
  async suggestEcsRoute(@Body() request: ItineraryRequestDto) {
    return this.itineraryService.generateOptimizedRoute(request);
  }
}

