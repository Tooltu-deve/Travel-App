import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiItinerary, AiItinerarySchema } from '../itinerary/schemas/ai-itinerary.schema';

@Module({
    imports: [
        HttpModule,
        MongooseModule.forFeature([
            { name: AiItinerary.name, schema: AiItinerarySchema }
        ])
    ],
    controllers: [AiController],
    providers: [AiService],
    exports: [AiService],
})
export class AiModule { }