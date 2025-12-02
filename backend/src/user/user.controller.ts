import { Controller, Get, Request, UseGuards, Body, Patch, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) { }

  /**
   * GET /users/me - Lấy profile của user hiện tại
   * Chỉ trả về: email, fullName, emotionalTags
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getMe(@Request() req) {
    const user = await this.userService.findOneById(req.user.userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }
    // Trả về field dạng snake_case, dùng preferencedTags
    return {
      email: user.email,
      full_name: user.fullName,
      preferenced_tags: user.preferencedTags || [],
    };
  }

  /**
   * PATCH /users/profile - Cập nhật emotionalTags
   * Input: { emotionalTags: string[] }
   * Output: profile mới (email, fullName, emotionalTags)
   */
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    const userId = req.user.userId;

    // Map preferencedTags để lưu vào DB
    if (dto.preferencedTags !== undefined) {
      const updateDto: UpdateUserPreferencesDto = {
        preferencedTags: dto.preferencedTags,
      };
      const updatedUser = await this.userService.updatePreferences(userId, updateDto);

      // Trả về profile mới với snake_case, dùng preferencedTags
      return {
        email: updatedUser.email,
        full_name: updatedUser.fullName,
        preferenced_tags: updatedUser.preferencedTags || [],
      };
    }

    // Nếu không có gì để update, trả về profile hiện tại
    const user = await this.userService.findOneById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }
    return {
      email: user.email,
      full_name: user.fullName,
      preferenced_tags: user.preferencedTags || [],
    };
  }


}