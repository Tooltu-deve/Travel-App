import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { PlaceModule } from './place/place.module';
import { FavoritesModule } from './likeModules/likes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ItineraryModule } from './itinerary/itinerary.module';
import { AiModule } from './ai/ai.module';
import { CustomItineraryModule } from './custom-itinerary/custom-itinerary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UserModule,
    PlaceModule,
    ItineraryModule,
    AiModule,
    FavoritesModule,
    NotificationsModule,
    CustomItineraryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
