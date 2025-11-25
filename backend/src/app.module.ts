import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProfileModule } from './profile/profile.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { PlaceModule } from './place/place.module';
import { ItineraryModule } from './itinerary/itinerary.module';
import { TravelRouteModule } from './travel-route/travel-route.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UserModule,
    PlaceModule,
    ItineraryModule,
    ProfileModule,
    TravelRouteModule,
    AiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
