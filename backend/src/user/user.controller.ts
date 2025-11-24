import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { Body, Patch } from '@nestjs/common';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

import { Post } from '@nestjs/common';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) { }

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
  @Patch('profile/preferences')
  async updatePreferences(
    @Request() req,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    const userId = req.user.userId;
    // req.user.userId được lấy từ JWT token
    return this.userService.updatePreferences(userId, dto);
  }

  /**
   * Like or unlike a place for the current user
   * @param req - Request object (contains user info)
   * @param body - { google_place_id: string }
   */
  @UseGuards(JwtAuthGuard)
  @Post('like-place')
  async likePlace(@Request() req, @Body('google_place_id') google_place_id: string) {
    // Chuyển đổi snake_case -> camelCase cho đầu vào
    return this.userService.likePlace(req.user.userId, google_place_id);
  }

  /**
   * Get all places liked by the current user
   * @param req - Request object (contains user info)
   */
  @UseGuards(JwtAuthGuard)
  @Get('liked-places')
  async getLikedPlaces(@Request() req) {
    return this.userService.getLikedPlaces(req.user.userId);
  }
}