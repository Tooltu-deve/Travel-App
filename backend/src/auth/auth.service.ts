import { Injectable, UnauthorizedException, ConflictException, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { Types } from 'mongoose';
import { UserService } from 'src/user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { Document } from 'mongoose';
import { User, UserDocument } from 'src/user/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';

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
    private readonly mailService: MailService,
  ) { }

  /**
   * Kiểm tra email và password có khớp không.
   * Dùng bởi LocalStrategy.
   */
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findOneByEmail(email);
    // Phải kiểm tra user.password tồn tại (vì user Google sẽ không có)
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      // Kiểm tra email đã được xác thực chưa
      if (!user.isVerified) {
        throw new UnauthorizedException(
          'Email chưa được xác thực. Vui lòng kiểm tra email để xác thực tài khoản.',
        );
      }
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
   * @param user - User object từ validateUser hoặc validateOAuthUser
   * @returns Object chứa access_token và thông tin user
   */
  async login(user: any) {
    // Đảm bảo _id (từ Mongoose object) hoặc id (từ plain object)
    const payload = { email: user.email, sub: user._id || user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        _id: user._id || user.id,
        email: user.email,
        full_name: user.fullName || user.full_name,
        preferenced_tags: user.preferencedTags || [],
      },
    };
  }

  /**
   * Xử lý đăng ký user mới.
   * @param createUserDto - DTO chứa thông tin đăng ký (email, password, fullName)
   * @returns Object chứa access_token và thông tin user mới tạo
   * @throws ConflictException nếu email đã tồn tại
   */
  async register(createUserDto: CreateUserDto) {
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await this.userService.findOneByEmail(
      createUserDto.email,
    );
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại');
    }

    // Tạo verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

    // Tạo user mới với isVerified = false
    const user = await this.userService.create({
      ...createUserDto,
      isVerified: false,
      verificationToken,
      verificationTokenExpiry,
    });

    // Gửi email xác thực
    try {
      await this.mailService.sendVerificationEmail(
        user.email,
        user.fullName,
        verificationToken,
      );
    } catch (emailError) {
      console.error('Lỗi khi gửi email xác thực:', emailError);
      // Xóa user nếu không gửi được email
      await this.userService.deleteById(user._id.toString());
      throw new InternalServerErrorException(
        'Không thể gửi email xác thực. Vui lòng thử lại sau.',
      );
    }

    // Trả về thông báo thành công (không login ngay)
    return {
      message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.',
      email: user.email,
    };
  }
  /**
   * Đổi mật khẩu cho user
   * @param userId - ID của user cần đổi mật khẩu
   * @param changePasswordDto - DTO chứa currentPassword và newPassword
   * @throws UnauthorizedException nếu password hiện tại không đúng
   */
  async changePassword(
    userId: string,
    changePasswordDto: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    // Lấy user với password
    const user = await this.userService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy user');
    }

    // Kiểm tra user có password không (OAuth users có thể không có)
    if (!user.password) {
      throw new UnauthorizedException(
        'Tài khoản này đăng nhập bằng Google/Facebook và không có password',
      );
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

  /**
   * Xác thực email với token
   */
  async verifyEmail(token: string) {
    const user = await this.userService.findByVerificationToken(token);

    if (!user) {
      throw new BadRequestException('Token xác thực không hợp lệ');
    }

    // Kiểm tra token đã hết hạn chưa
    if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
      throw new BadRequestException('Token xác thực đã hết hạn');
    }

    // Kiểm tra đã verify chưa
    if (user.isVerified) {
      throw new BadRequestException('Email đã được xác thực trước đó');
    }

    // Cập nhật trạng thái verify
    await this.userService.update(user._id.toString(), {
      isVerified: true,
      verificationToken: undefined,
      verificationTokenExpiry: undefined,
    });

    // Gửi email chào mừng
    try {
      await this.mailService.sendWelcomeEmail(user.email, user.fullName);
    } catch (error) {
      console.error('Lỗi khi gửi email chào mừng:', error);
    }

    // Gửi notification chào mừng
    try {
      await this.notificationsService.createNotification({
        userId: user._id instanceof Types.ObjectId ? user._id : new Types.ObjectId(user._id),
        type: 'account',
        title: 'Xác thực tài khoản thành công',
        message: 'Chào mừng bạn đến với hệ thống!',
        entityType: 'system',
        entityId: null,
      });
    } catch (notifError) {
      console.error('Lỗi khi tạo notification:', notifError);
    }

    return { message: 'Xác thực email thành công! Bạn có thể đăng nhập ngay bây giờ.' };
  }

  /**
   * Gửi lại email xác thực
   */
  async resendVerificationEmail(email: string) {
    const user = await this.userService.findOneByEmail(email);

    if (!user) {
      throw new NotFoundException('Email không tồn tại trong hệ thống');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    // Tạo token mới
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

    // Cập nhật token mới
    await this.userService.update(user._id.toString(), {
      verificationToken,
      verificationTokenExpiry,
    });

    // Gửi email
    try {
      await this.mailService.sendVerificationEmail(
        user.email,
        user.fullName,
        verificationToken,
      );
    } catch (emailError) {
      console.error('Lỗi khi gửi email:', emailError);
      throw new InternalServerErrorException(
        'Không thể gửi email xác thực. Vui lòng thử lại sau.',
      );
    }

    return {
      message: 'Email xác thực đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.',
    };
  }
}
