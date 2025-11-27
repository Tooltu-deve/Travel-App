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

  // Lấy tất cả mood (key của emotionalTags) trong toàn bộ Place
  async getAllMoods(): Promise<string[]> {
    const places = await this.placeModel.find({}, { emotionalTags: 1 }).lean();
    const moodSet = new Set<string>();
    for (const place of places) {
      if (place.emotionalTags) {
        for (const key of Object.keys(place.emotionalTags)) {
          if (key) moodSet.add(key);
        }
      }
    }
    return Array.from(moodSet).sort();
  }

  // Lấy danh sách place user đã like theo mood
  async getLikedPlacesByMood(userId: string, mood: string) {
    const user = await this.userModel.findById(userId).select('likedPlaces').lean();
    if (!user || !user.likedPlaces || user.likedPlaces.length === 0) return [];

    // Tìm các place user đã like có chứa mood này
    const places = await this.placeModel.find({
      _id: { $in: user.likedPlaces },
      [`emotionalTags.${mood}`]: { $exists: true },
    }).select('name address rating emotionalTags').lean();

    // Map ra DTO card
    return places.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      address: p.address,
      mood,
      rating: p.rating ?? null,
    }));
  }
}
