import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ItineraryModule } from './itinerary/itinerary.module';
import { AiModule } from './ai/ai.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    // Tải .env file và làm cho nó có sẵn toàn ứng dụng
    ConfigModule.forRoot({ isGlobal: true }),
    // Module kết nối Database (MongoDB)
    DatabaseModule,
    // Module nghiệp vụ (chỉ bật auth + user cho hiện tại)
    AuthModule,
    UserModule,
    // ChatModule (như trong hình, bạn có thể thêm sau)
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
