import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { TravelRoute, TravelRouteSchema } from './schemas/travel-route.schema';
import { TravelRouteService } from './travel-route.service';
import { TravelRouteController } from './travel-route.controller';
import { ItineraryModule } from '../itinerary/itinerary.module'; // Import ItineraryModule để dùng ItineraryService

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TravelRoute.name, schema: TravelRouteSchema },
    ]),
    HttpModule, // Để gọi HTTP requests đến AI Optimizer Service và Directions API
    ItineraryModule, // Để lọc POI từ database (logic lọc ở ItineraryService)
  ],
  providers: [TravelRouteService],
  controllers: [TravelRouteController],
  exports: [TravelRouteService], // Export để các module khác có thể dùng
})
export class TravelRouteModule {}

