import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { PlaceModule } from './place/place.module';
import { ItineraryModule } from './itinerary/itinerary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UserModule,
    PlaceModule,
    ItineraryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
