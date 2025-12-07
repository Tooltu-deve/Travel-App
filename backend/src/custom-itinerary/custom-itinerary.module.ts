import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CustomItineraryController } from './custom-itinerary.controller';
import { CustomItineraryService } from './custom-itinerary.service';

/**
 * Module quản lý custom itinerary (lộ trình tùy chỉnh)
 * Bao gồm: weather check, directions/polyline
 */
@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [CustomItineraryController],
  providers: [CustomItineraryService],
  exports: [CustomItineraryService],
})
export class CustomItineraryModule {}
