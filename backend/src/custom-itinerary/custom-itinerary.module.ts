import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomItineraryController } from './custom-itinerary.controller';
import { CustomItineraryService } from './custom-itinerary.service';
import { CustomItinerary, CustomItinerarySchema } from './schemas/custom-itinerary.schema';
import { ItineraryModule } from '../itinerary/itinerary.module';
import { Itinerary, ItinerarySchema } from '../itinerary/schemas/itinerary.schema';
import { Place, PlaceSchema } from '../place/schemas/place.schema';

/**
 * Module quản lý custom itinerary (lộ trình tùy chỉnh)
 * Bao gồm: weather check, directions/polyline
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: CustomItinerary.name, schema: CustomItinerarySchema },
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: Place.name, schema: PlaceSchema },
    ]),
    forwardRef(() => ItineraryModule),
  ],
  controllers: [CustomItineraryController],
  providers: [CustomItineraryService],
  exports: [CustomItineraryService],
})
export class CustomItineraryModule {}
