import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      // Đây là callback URL sau khi Google xác thực
      // Nó PHẢI khớp với cái bạn đăng ký trên Google Console
      // Chúng ta sẽ không dùng nó trực tiếp (vì RN tự lấy token),
      // nhưng nó vẫn cần thiết để cấu hình
      callbackURL: `${configService.get<string>(
        'API_BASE_URL',
        'http://localhost:3000/api/v1',
      )}/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  /**
   * Hàm này được gọi sau khi Google đã xác thực user.
   * profile chứa thông tin Google trả về.
   * done là một callback để báo cho Passport biết đã xong.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, id } = profile;
    const userPayload = {
      googleId: id,
      email: emails[0].value,
      fullName: name.givenName + ' ' + name.familyName,
    };

    // Gọi service để tìm hoặc tạo user
    try {
      // Hoàn thành lệnh gọi hàm, thêm các tham số còn thiếu
      const user = await this.authService.validateOAuthUser(
        userPayload.googleId,
        'google',
        userPayload.email,
        userPayload.fullName,
      );
      // Passport sẽ gắn 'user' này vào req.user
      done(null, user);
    } catch (err) {
      done(err, false);
    }
  }
}

