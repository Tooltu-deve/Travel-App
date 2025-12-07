import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FavoritesService } from './likes.service';
import { FavoritesController } from './likes.controller';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Place, PlaceSchema } from '../place/schemas/place.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Place.name, schema: PlaceSchema },
    ]),
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
