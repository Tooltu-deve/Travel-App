import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findOneByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email }).exec();
  }

  async findOneById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findOneByProviderId(
    providerId: string,
    provider: 'google' | 'facebook',
  ): Promise<UserDocument | null> {
    const query = { [`${provider}Id`]: providerId };
    return this.userModel.findOne(query).exec();
  }

  async linkProviderToUser(
    userId: string,
    providerId: string,
    provider: 'google' | 'facebook',
  ): Promise<UserDocument | null> {
    const query = { [`${provider}Id`]: providerId };
    return this.userModel
      .findByIdAndUpdate(userId, { $set: query }, { new: true })
      .exec();
  }

  async update(
    userId: string,
    updateData: Partial<User>,
  ): Promise<UserDocument | null> {
    // Nếu updateData có password, phải hash trước khi lưu (dùng .save() để chạy pre-save hook)
    if (updateData.password !== undefined) {
      const user = await this.userModel.findById(userId);
      if (!user) return null;
      user.set(updateData);
      await user.save();
      return user;
    } else {
      return this.userModel
        .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
        .exec();
    }
  }

  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<User> {
    const { preferredTags } = dto;

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { preferredTags: preferredTags } },
        { new: true }, // Trả về tài liệu user đã được cập nhật
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    updatedUser.password = undefined; // Luôn ẩn password khi trả về
    return updatedUser;
  }
}

