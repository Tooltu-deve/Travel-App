import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiItinerary, AiItinerarySchema } from '../itinerary/schemas/ai-itinerary.schema';
import { Itinerary, ItinerarySchema } from '../itinerary/schemas/itinerary.schema';

@Module({
    imports: [
        HttpModule,
        MongooseModule.forFeature([
            { name: AiItinerary.name, schema: AiItinerarySchema },
            { name: Itinerary.name, schema: ItinerarySchema }
        ])
    ],
    controllers: [AiController],
    providers: [AiService],
    exports: [AiService],
})
export class AiModule { }