import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule, // Import UserModule để inject UserService trong ProfileService
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService], // Export ProfileService nếu module khác cần dùng
})
export class ProfileModule {}
