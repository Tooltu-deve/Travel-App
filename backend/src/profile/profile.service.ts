import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDocument } from '../user/schemas/user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ProfileService {
  constructor(
    private readonly userService: UserService, // Inject UserService để access data layer
  ) {}

  /**
   * Lấy profile của user hiện tại
   */
  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userService.findOneById(userId);
    
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return user;
  }

  /**
   * Cập nhật profile (chỉ cho phép update fullName và avatar)
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserDocument> {
    // Kiểm tra user tồn tại
    const user = await this.userService.findOneById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }

    // Build update object - chỉ các field được phép
    const updateData: any = {};
    
    if (updateProfileDto.fullName !== undefined) {
      updateData.fullName = updateProfileDto.fullName;
    }
    
    if (updateProfileDto.avatar !== undefined) {
      updateData.avatar = updateProfileDto.avatar;
    }

    // Nếu không có gì để update, return user hiện tại
    if (Object.keys(updateData).length === 0) {
      return user;
    }

    // Update data trong DB
    const updatedUser = await this.userService.update(userId, updateData);
    
    if (!updatedUser) {
      throw new NotFoundException('Không thể cập nhật user');
    }

    return updatedUser;
  }

  /**
   * Đổi password
   * - Verify current password trước
   * - Check new password khác old password
   * - Hash new password trước khi save
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    // Lấy user với password
    const user = await this.userService.findOneById(userId);
    
    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
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
  }

  /**
   * Xóa avatar (set về null)
   */
  async removeAvatar(userId: string): Promise<UserDocument> {
    const updatedUser = await this.userService.update(userId, { avatar: undefined });
    
    if (!updatedUser) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return updatedUser;
  }
}
