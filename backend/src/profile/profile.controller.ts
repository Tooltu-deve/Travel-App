import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profile')
@UseGuards(JwtAuthGuard) // Tất cả routes yêu cầu JWT authentication
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /profile
   * Lấy thông tin profile của user đang login
   */
  @Get()
  async getProfile(@Request() req) {
    // req.user chứa payload từ JWT (userId, email)
    const user = await this.profileService.getProfile(req.user.userId);
    
    // Convert Mongoose document to plain object và remove password
    const userObject = user.toObject ? user.toObject() : { ...user };
    delete userObject.password;
    
    return userObject;
  }

  /**
   * PATCH /profile
   * Cập nhật profile (fullName, avatar)
   */
  @Patch()
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto, // ValidationPipe tự động validate DTO
  ) {
    const updatedUser = await this.profileService.updateProfile(
      req.user.userId,
      updateProfileDto,
    );

    // Convert to plain object và remove password
    const userObject = updatedUser.toObject ? updatedUser.toObject() : { ...updatedUser };
    delete userObject.password;

    return {
      message: 'Cập nhật profile thành công',
      user: userObject,
    };
  }

  /**
   * PATCH /profile/password
   * Đổi password
   */
  @Patch('password')
  @HttpCode(HttpStatus.OK) // Return 200 instead of 201
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.profileService.changePassword(req.user.userId, changePasswordDto);

    return {
      message: 'Đổi password thành công',
    };
  }

  /**
   * DELETE /profile/avatar
   * Xóa avatar (set về null)
   */
  @Delete('avatar')
  async removeAvatar(@Request() req) {
    const updatedUser = await this.profileService.removeAvatar(req.user.userId);

    const userObject = updatedUser.toObject ? updatedUser.toObject() : { ...updatedUser };
    delete userObject.password;

    return {
      message: 'Xóa avatar thành công',
      user: userObject,
    };
  }
}
