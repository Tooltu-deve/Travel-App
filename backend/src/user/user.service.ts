// ...existing code...
// ...existing code...

  /**
   * Xóa toàn bộ địa điểm đã like của user (làm rỗng likedPlaces)
   */
  async clearLikedPlaces(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.likedPlaces = [];
    return user.save();
  }
import { Place, PlaceDocument } from '../place/schemas/place.schema';
import { enqueuePlaceFetch } from '../place/place-fetcher';
import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

import { Types } from 'mongoose';
import { Place, PlaceDocument } from '../place/schemas/place.schema';
import { enqueuePlaceFetch } from '../place/place-fetcher';

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
   * @param googlePlaceId - The Google Places id (preferred). If a MongoDB _id is provided
   *                         and a Place with that _id exists, it will be used instead.
   */
  async likePlace(userId: string, googlePlaceId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!googlePlaceId || typeof googlePlaceId !== 'string' || !googlePlaceId.trim()) {
      throw new InternalServerErrorException('googlePlaceId is required and must be a non-empty string');
    }
    const PlaceModel = this.userModel.db.model<PlaceDocument>('Place');
    let place: PlaceDocument | null = null;

    // If the client accidentally sent a MongoDB _id (24 hex chars) and that document exists, prefer that
    if (Types.ObjectId.isValid(googlePlaceId)) {
      try {
        const byId = await PlaceModel.findById(googlePlaceId).exec();
        if (byId) {
          place = byId;
        }
      } catch (err) {
        // ignore and continue treating input as googlePlaceId
      }
    }

    // If not found by _id, upsert by googlePlaceId
    if (!place) {
      const mock = {
        name: `Placeholder ${googlePlaceId.substring(0, 8)}`,
        address: '',
        googlePlaceId: googlePlaceId,
        location: { type: 'Point', coordinates: [0, 0] },
        type: 'other',
        isStub: true,
        fetchAttempts: 0,
      } as any;
      try {
        // Try upsert (atomic)
        const upserted = await PlaceModel.findOneAndUpdate(
          { googlePlaceId: googlePlaceId },
          { $setOnInsert: mock },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          },
        ).exec();
        place = upserted;
      } catch (err: any) {
        // Duplicate key: try to find existing
        if (err && (err.code === 11000 || err.code === 11001)) {
          place = await PlaceModel.findOne({ googlePlaceId: googlePlaceId }).exec();
        } else {
          throw new InternalServerErrorException('Failed to create place stub: ' + (err?.message || err));
        }
      }
      // If still not found, try create (last resort)
      if (!place) {
        try {
          place = await PlaceModel.create(mock);
        } catch (err: any) {
          // If duplicate again, try to find
          if (err && (err.code === 11000 || err.code === 11001)) {
            place = await PlaceModel.findOne({ googlePlaceId: googlePlaceId }).exec();
          } else {
            throw new InternalServerErrorException('Failed to create place stub: ' + (err?.message || err));
          }
        }
      }
      if (!place) {
        throw new InternalServerErrorException('Failed to create or load place stub');
      }
      // Enqueue background fetch only if USE_GOOGLE=true and we just inserted (best effort)
      if (place.isStub && (process.env.USE_GOOGLE || '').toLowerCase() === 'true') {
        try {
          enqueuePlaceFetch(place.googlePlaceId);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('enqueuePlaceFetch failed', err?.message || err);
        }
      }
    }

    // Like/unlike logic
    const idx = user.likedPlaces.findIndex((id) => (id as any).equals(place._id as any));
    if (idx > -1) {
      user.likedPlaces.splice(idx, 1);
    } else {
      user.likedPlaces.push(place._id as any);
    }
    return user.save();
  }

  /**
   * Get all places liked by a user.
   * @param userId - The user's id
   */
  async getLikedPlaces(userId: string): Promise<any[]> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Populate likedPlaces from DB and return stored details (no external calls)
    const userPop = await this.userModel.findById(userId).populate({ path: 'likedPlaces' });
    if (!userPop || !userPop.likedPlaces) return [];
    const populatedPlaces = (userPop.likedPlaces as any[]).filter((p) => !!p);
    return populatedPlaces.map((place) => ({
      placeId: place._id?.toString() || '',
      googlePlaceId: place.googlePlaceId,
      name: place.name,
      address: place.address,
      location: place.location,
      type: place.type,
      openingHours: place.openingHours || {},
      emotionalTags: place.emotionalTags || {},
      isStub: place.isStub || false,
    }));
  }
  /**
   * Xóa toàn bộ địa điểm đã like của user (làm rỗng likedPlaces)
   */
  async clearLikedPlaces(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.likedPlaces = [];
    return user.save();
  }
}

