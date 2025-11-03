import { Injectable, UnauthorizedException } from '@nestjs/common';
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
        password: null,
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
        _id: user._id || user.id,
        email: user.email,
        fullName: user.fullName,
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
      // Trả về token luôn sau khi đăng ký thành công
      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
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
          password: null,
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

