
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Place, PlaceDocument } from '../place/schemas/place.schema';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
  ) {}

  // Lấy tất cả type trong toàn bộ Place
  async getAllMoods(): Promise<string[]> {
    const places = await this.placeModel.find({}, { type: 1 }).lean();
    const typeSet = new Set<string>();
    for (const place of places) {
      if (place.type) {
        typeSet.add(place.type);
      }
    }
    return Array.from(typeSet).sort();
  }

  // Lấy danh sách place user đã like theo mood
  async getLikedPlacesByMood(userId: string, mood: string) {
    const user = await this.userModel.findById(userId).select('likedPlaces').lean();
    if (!user || !user.likedPlaces || user.likedPlaces.length === 0) return [];

    // Tìm các place user đã like có type đúng với mood (thực chất là type)
    const places = await this.placeModel.find({
      _id: { $in: user.likedPlaces },
      type: mood,
    }).select('name address rating type').lean();

    // Map ra DTO card (snake_case)
    return places.map((p: any) => ({
      place_id: p._id?.toString() || '',
      name: p.name,
      address: p.address,
      mood: p.type,
      rating: p.rating ?? null,
    }));
  }

  /**
   * Like or unlike a place for a user.
   * If the place is already liked, it will be unliked. Otherwise, it will be liked.
   * @param userId - The user's id
   * @param googlePlaceId - The Google Places id (preferred). If a MongoDB _id is provided
   *                         and a Place with that _id exists, it will be used instead.
   */
  async likePlace(userId: string, googlePlaceId: string): Promise<any> {
    console.log('🔄 [likePlace] Starting like/unlike');
    console.log('   userId:', userId);
    console.log('   googlePlaceId:', googlePlaceId);
    
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!googlePlaceId || typeof googlePlaceId !== 'string' || !googlePlaceId.trim()) {
      throw new InternalServerErrorException('googlePlaceId is required and must be a non-empty string');
    }
    let place: PlaceDocument | null = null;
    
    // Nếu truyền vào là _id MongoDB
    if (Types.ObjectId.isValid(googlePlaceId)) {
      console.log('   Trying to find by MongoDB _id...');
      try {
        const byId = await this.placeModel.findById(googlePlaceId).exec();
        if (byId) {
          console.log('   ✅ Found place by _id:', byId.name);
          place = byId;
        }
      } catch (err) {
        console.log('   ❌ Error finding by _id:', err);
      }
    }
    
    // Nếu không tìm thấy theo _id, tìm theo googlePlaceId
    if (!place) {
      console.log('   Trying to find by googlePlaceId field...');
      place = await this.placeModel.findOne({ googlePlaceId: googlePlaceId }).exec();
      if (place) {
        console.log('   ✅ Found place by googlePlaceId:', place.name);
      }
    }
    
    if (!place) {
      console.error('   ❌ Place not found in database');
      console.log('   Searching for similar places...');
      const allPlaces = await this.placeModel.find({}, { googlePlaceId: 1, name: 1 }).limit(5).exec();
      console.log('   Sample places in DB:', allPlaces.map(p => ({ googlePlaceId: p.googlePlaceId, name: p.name })));
      throw new InternalServerErrorException('Place không tồn tại trong hệ thống. Vui lòng nhập đúng googlePlaceId.');
    }
    
    // Like/unlike logic
    const idx = user.likedPlaces.findIndex((id) => (id as any).equals(place._id as any));
    let action: 'like' | 'unlike' = 'like';
    if (idx > -1) {
      user.likedPlaces.splice(idx, 1);
      action = 'unlike';
      console.log('   Action: UNLIKE');
    } else {
      user.likedPlaces.push(place._id as any);
      action = 'like';
      console.log('   Action: LIKE');
    }
    await user.save();
    console.log('   ✅ User saved successfully');

    return { success: true, liked: action === 'like' };
  }

  /**
   * Get all places liked by a user.
   * @param userId - The user's id
   */
  async getLikedPlaces(userId: string): Promise<any[]> {
    const user = await this.userModel.findById(userId).populate({ path: 'likedPlaces' });
    if (!user || !user.likedPlaces) throw new NotFoundException('User not found');
    const populatedPlaces = (user.likedPlaces as any[]).filter((p) => !!p);
    return populatedPlaces.map((place: any) => ({
      place_id: place._id?.toString() || '',
      google_place_id: place.googlePlaceId,
      name: place.name,
      address: place.address,
      location: place.location,
      type: place.type || '',
      opening_hours: place.openingHours || {},
      is_stub: place.isStub || false,
    }));
  }
}
