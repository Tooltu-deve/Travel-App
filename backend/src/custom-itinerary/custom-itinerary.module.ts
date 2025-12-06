import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CustomItineraryController } from './custom-itinerary.controller';
import { WeatherService } from './services/weather.service';
import { DirectionsService } from './services/directions.service';

/**
 * Module quản lý custom itinerary (lộ trình tùy chỉnh)
 * Bao gồm: weather check, directions/polyline
 */
@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [CustomItineraryController],
  providers: [WeatherService, DirectionsService],
  exports: [WeatherService, DirectionsService],
})
export class CustomItineraryModule {}
