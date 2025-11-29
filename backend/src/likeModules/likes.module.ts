import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FavoritesService } from './likes.service';
import { FavoritesController } from './likes.controller';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Place, PlaceSchema } from '../place/schemas/place.schema';
import { forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Place.name, schema: PlaceSchema },
    ]),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
