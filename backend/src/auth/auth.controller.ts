import {
  Controller,
  Post,
  Request,
  UseGuards,
  Body,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    const result = await this.authService.register(createUserDto);
    return {
      access_token: result.access_token,
      user: {
        _id: result.user._id,
        email: result.user.email,
        full_name: result.user.full_name,
        preferenced_tags: result.user.preferenced_tags || [],
      },
    };
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req) {
    const result = await this.authService.login(req.user);
    return {
      access_token: result.access_token,
      user: {
        _id: result.user._id,
        email: result.user.email,
        full_name: result.user.full_name,
        preferenced_tags: result.user.preferenced_tags || [],
      },
    };
  }

  /**
   * Đổi mật khẩu cho user đang đăng nhập
   * Yêu cầu JWT token và currentPassword, newPassword
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(req.user.userId, changePasswordDto);
    return { message: 'Đổi mật khẩu thành công' };
  }

  // --- API MỚI CHO GOOGLE ---

  /**
   * Endpoint này là để client (React Native) gửi token họ lấy được từ Google SDK
   * Chúng ta sẽ dùng một flow khác đơn giản hơn cho mobile
   * Thay vì 2 bước (redirect), ta chỉ cần 1 bước (validate token)
   *
   * Tạm thời tôi sẽ giữ flow redirect (Web-based) cho đơn giản,
   * bạn có thể đổi sang flow "token" (cho mobile) sau.
   */

  // Bước 1: Client gọi GET /auth/google
  // Server sẽ redirect sang trang đăng nhập Google
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Request() req) {
    // Passport tự động điều hướng sang Google
  }

  // Bước 2: Google đăng nhập xong, redirect về đây
  // Server nhận code, tự động đổi code lấy profile
  // GoogleStrategy.validate() được gọi
  // req.user được gán
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Request() req) {
    // Đăng nhập thành công, req.user đã có
    // Trả về JWT Token của CHÍNH MÌNH
    const result = await this.authService.login(req.user);
    return {
      access_token: result.access_token,
      user: {
        _id: result.user._id,
        email: result.user.email,
        full_name: result.user.full_name,
        preferenced_tags: result.user.preferenced_tags || [],
      },
    };
  }
}

