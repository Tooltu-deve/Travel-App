import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  // Route này được bảo vệ, chỉ user đã login mới xem được
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    // req.user chứa payload từ JWT (vd: { userId: '...', email: '...' })
    const user = await this.userService.findOneById(req.user.userId);
    if (!user) {
      return null;
    }
    // Convert to plain object and remove password
    const plain: any = typeof (user as any).toObject === 'function' ? (user as any).toObject() : { ...(user as any) };
    delete plain.password;
    return plain;
  }
}
