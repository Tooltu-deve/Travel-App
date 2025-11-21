import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

import { Types } from 'mongoose';
import { Place, PlaceDocument } from '../place/schemas/place.schema';

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
    return this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .exec();
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

  /**
   * Like or unlike a place for a user.
   * If the place is already liked, it will be unliked. Otherwise, it will be liked.
   * @param userId - The user's id
   * @param placeId - The place's id
   */
  async likePlace(userId: string, placeId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Kiểm tra placeId có tồn tại trong DB không
    const place = await this.userModel.db.model<PlaceDocument>('Place').findById(placeId);
    if (!place) throw new NotFoundException('Place not found');

    const idx = user.likedPlaces.findIndex((id) => id.equals(placeId));
    if (idx > -1) {
      // Unlike
      user.likedPlaces.splice(idx, 1);
    } else {
      // Like
      user.likedPlaces.push(new Types.ObjectId(placeId));
    }
    return user.save();
  }

  /**
   * Get all places liked by a user.
   * @param userId - The user's id
   */
  async getLikedPlaces(userId: string): Promise<Place[]> {
    const user = await this.userModel.findById(userId).populate('likedPlaces');
    if (!user) throw new NotFoundException('User not found');
    // After populate, likedPlaces can be (Place | ObjectId)[]
    // Filter and return only Place objects
    return (user.likedPlaces as any[]).filter(p => p && p.name && p.googlePlaceId);
  }
}

