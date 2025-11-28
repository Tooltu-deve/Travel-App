import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProfileModule } from './profile/profile.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { PlaceModule } from './place/place.module';
import { FavoritesModule } from './likeModules/likes.module';
import { ItineraryModule } from './itinerary/itinerary.module';
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
    AiModule,
    FavoritesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }