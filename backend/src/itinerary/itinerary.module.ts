import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ItineraryController } from './itinerary.controller';
import { ItineraryService } from './itinerary.service';
import { Place, PlaceSchema } from '../place/schemas/place.schema';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Place.name, schema: PlaceSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
    HttpModule,
  ],
  controllers: [ItineraryController],
  providers: [ItineraryService],
  exports: [ItineraryService], // Export để TravelRouteModule có thể dùng
})
export class ItineraryModule {}

