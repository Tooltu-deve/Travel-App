import { Injectable, UnauthorizedException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { Types } from 'mongoose';
import { UserService } from 'src/user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { Document } from 'mongoose';
import { User, UserDocument } from 'src/user/schemas/user.schema';

// Interface for Google User
interface GoogleUser {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) { }

  /**
   * Kiểm tra email và password có khớp không.
   * Dùng bởi LocalStrategy.
   */
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findOneByEmail(email);
    // Phải kiểm tra user.password tồn tại (vì user Google sẽ không có)
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      // Chuyển đổi Mongoose document thành plain object
      const userObject = user instanceof Document ? (user as any).toObject() : user;
      const { password, ...result } = userObject;
      return result;
    }
    return null;
  }

  /**
   * Logic tìm hoặc tạo user cho Social Login
   */
  async validateOAuthUser(
    providerId: string,
    provider: 'google' | 'facebook',
    email: string,
    fullName: string,
  ): Promise<UserDocument> {
    const providerKey = `${provider}Id`;

    try {
      // 1. Tìm user bằng providerId
      let user = await this.userService.findOneByProviderId(
        providerId,
        provider,
      );
      if (user) {
        return user;
      }

      // 2. Nếu không thấy, tìm bằng email
      user = await this.userService.findOneByEmail(email);
      if (user) {
        // 3. Email tồn tại -> Link tài khoản
        const updatedUser = await this.userService.linkProviderToUser(
          user.id,
          providerId,
          provider,
        );
        if (!updatedUser) {
          throw new UnauthorizedException('Không thể liên kết tài khoản');
        }
        return updatedUser;
      }

      // 4. Nếu không thấy email -> Tạo user mới
      const createDto: CreateUserDto = {
        email,
        fullName,
        password: '',
        [providerKey]: providerId,
      };

      return await this.userService.create(createDto);
    } catch (err) {
      throw new UnauthorizedException('Lỗi xác thực OAuth: ' + err.message);
    }
  }

  /**
   * Tạo JWT token khi user đăng nhập thành công.
   */
  async login(user: any) {
    // 'user' có thể là user từ validateUser hoặc validateOAuthUser
    // Đảm bảo _id (từ Mongoose object) hoặc id (từ plain object)
    const payload = { email: user.email, sub: user._id || user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        user_id: (user._id || user.id)?.toString(),
        email: user.email,
        full_name: user.fullName,
      },
    };
  }

  /**
   * Xử lý đăng ký user mới.
   */
  async register(createUserDto: CreateUserDto) {
    try {
      // Logic kiểm tra email tồn tại có thể thêm ở đây
      const existingUser = await this.userService.findOneByEmail(
        createUserDto.email,
      );
      if (existingUser) {
        throw new UnauthorizedException('Email đã tồn tại');
      }

      const user = await this.userService.create(createUserDto);
      // Gửi notification khi đăng ký thành công
      await this.notificationsService.createNotification({
        userId: user._id instanceof Types.ObjectId ? user._id : new Types.ObjectId(user._id),
        type: 'account',
        title: 'Đăng ký tài khoản thành công',
        message: 'Chào mừng bạn đến với hệ thống!',
        entityType: 'system',
        entityId: null,
      });
      // Trả về token luôn sau khi đăng ký thành công
      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }
  /**
   * Đổi mật khẩu cho user (yêu cầu currentPassword, newPassword)
   */
  async changePassword(userId: string, changePasswordDto: any): Promise<void> {
    // Lấy user với password
    const user = await this.userService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy user');
    }

    // Kiểm tra user có password không (OAuth users có thể không có)
    if (!user.password) {
      throw new UnauthorizedException('Tài khoản này đăng nhập bằng Google/Facebook và không có password');
    }

    // Verify current password với bcrypt.compare()
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password hiện tại không đúng');
    }

    // Kiểm tra password mới khác password cũ
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );
    if (isSamePassword) {
      throw new UnauthorizedException('Password mới phải khác password cũ');
    }

    // Hash password mới (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Update password trong DB
    await this.userService.update(userId, { password: hashedPassword });
    // Gửi notification khi đổi mật khẩu thành công
    await this.notificationsService.createNotification({
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
      type: 'account',
      title: 'Đổi mật khẩu thành công',
      message: 'Bạn vừa đổi mật khẩu tài khoản thành công.',
      entityType: 'system',
      entityId: null,
    });
  }

  /**
   * Xử lý user từ Google OAuth2
   */
  async validateOrCreateGoogleUser(googleUser: GoogleUser): Promise<UserDocument> {
    try {
      let user = await this.userService.findOneByEmail(googleUser.email);

      if (!user) {
        // Tạo user mới từ thông tin Google
        const createUserDto: CreateUserDto = {
          email: googleUser.email,
          password: '',
          fullName: `${googleUser.firstName} ${googleUser.lastName}`,
          googleId: googleUser.accessToken,
          avatar: googleUser.picture,
        };

        return await this.userService.create(createUserDto);
      }

      // Cập nhật thông tin Google nếu cần
      const updatedUser = await this.userService.update(user._id.toString(), {
        googleId: googleUser.accessToken,
        avatar: user.avatar || googleUser.picture,
      });

      if (!updatedUser) {
        throw new UnauthorizedException('Không thể cập nhật thông tin user');
      }

      return updatedUser;
    } catch (error) {
      throw new UnauthorizedException(
        error.message || 'Error processing Google login',
      );
    }
  }
}
