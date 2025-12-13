import {
  Controller,
  Post,
  Request,
  UseGuards,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Res
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return await this.authService.register(createUserDto);
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
   * Xác thực email với token
   */
  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string, @Res() res: any) {
    try {
      const result = await this.authService.verifyEmail(token);
      // Trả về HTML đẹp thay vì JSON
      return res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Xác thực thành công</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              color: #667eea;
              margin-bottom: 10px;
            }
            p {
              color: #666;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Xác thực thành công!</h1>
            <p>${result.message}</p>
            <p style="font-size: 14px; color: #999;">Bạn có thể đóng trang này và quay lại ứng dụng để đăng nhập.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      // Trả về HTML lỗi
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Xác thực thất bại</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
            }
            .error-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              color: #f5576c;
              margin-bottom: 10px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Xác thực thất bại</h1>
            <p>${error.message || 'Có lỗi xảy ra. Vui lòng thử lại.'}</p>
          </div>
        </body>
        </html>
      `);
    }
  }

  /**
   * Gửi lại email xác thực
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body('email') email: string) {
    return await this.authService.resendVerificationEmail(email);
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

