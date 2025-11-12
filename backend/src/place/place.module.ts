import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlaceService } from './place.service';
import { PlaceController } from './place.controller';
import { Place, PlaceSchema } from './schemas/place.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Place.name, schema: PlaceSchema }]),
        AuthModule,
    ],
    controllers: [PlaceController],
    providers: [PlaceService],
    exports: [PlaceService], // Export service nếu bạn muốn module khác (như AI) dùng
})
export class PlaceModule { }