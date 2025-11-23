import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from './schemas/place.schema';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { PlaceSeedDto } from './dto/place-seed.dto';
import { SearchPlaceDto } from './dto/search-place.dto';

@Injectable()
export class PlaceService {
    constructor(
        @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    ) { }

    async upsertPlace(placeData: PlaceSeedDto): Promise<PlaceDocument> {
        const { placeID, name, formatted_address, location, emotional_tags, ...restData } =
            placeData;

        const placePayload = {
            googlePlaceId: placeID,
            name: name,
            address: formatted_address,
            location: {
                type: 'Point',
                coordinates: [location.lng, location.lat], // Longitude, Latitude
            },
            emotionalTags: emotional_tags,

            // Đưa các dữ liệu còn lại vào
            type: restData.type,
            budgetRange: restData.budget_range,
            openingHours: restData.opening_hours
                ? {
                    openNow: restData.opening_hours.openNow,
                    weekdayDescriptions: restData.opening_hours.weekdayDescriptions,
                }
                : undefined,
        };

        // Tìm và cập nhật (nếu tồn tại) hoặc tạo mới (nếu không)
        const place = await this.placeModel.findOneAndUpdate(
            { googlePlaceId: placeID },
            { $set: placePayload },
            {
                upsert: true,
                new: true,
            },
        );

        return place;
    }

    create(createPlaceDto: CreatePlaceDto): Promise<Place> {
        const createdPlace = new this.placeModel({
            ...createPlaceDto,
            googlePlaceId: `custom_${Date.now()}`, // Tạo 1 ID giả nếu tạo thủ công
            location: {
                type: 'Point',
                coordinates: createPlaceDto.location.coordinates, // [lon, lat]
            },
        });
        return createdPlace.save();
    }

    findAll(): Promise<Place[]> {
        return this.placeModel.find().exec();
    }

    async findOne(id: string): Promise<Place> {
        const place = await this.placeModel.findById(id).exec();
        if (!place) {
            throw new NotFoundException(`Không tìm thấy địa điểm với ID: ${id}`);
        }
        return place;
    }

    async update(id: string, updatePlaceDto: UpdatePlaceDto): Promise<Place> {
        // 1. Tạo một object mới 'dataToUpdate' và ép kiểu 'any'
        const dataToUpdate: any = { ...updatePlaceDto };

        // 2. Kiểm tra xem 'location' có được gửi lên trong DTO không
        if (updatePlaceDto.location) {
            // 3. Nếu có, format lại 'location' trong 'dataToUpdate'
            //    thành đúng dạng GeoJSON Point mà Schema mong đợi.
            dataToUpdate.location = {
                type: 'Point',
                coordinates: updatePlaceDto.location.coordinates,
            };
        }

        // 4. Dùng 'dataToUpdate' đã được format để $set
        const updatedPlace = await this.placeModel
            .findByIdAndUpdate(id, { $set: dataToUpdate }, { new: true })
            .exec();

        if (!updatedPlace) {
            throw new NotFoundException(`Không tìm thấy địa điểm với ID: ${id}`);
        }
        return updatedPlace;
    }

    async remove(id: string): Promise<any> {
        const result = await this.placeModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Không tìm thấy địa điểm với ID: ${id}`);
        }
        return { message: `Đã xóa thành công địa điểm ${id}` };
    }

    // Tìm lân cận
    findNear(
        lon: number,
        lat: number,
        distanceKm = 2,
    ): Promise<Place[]> {
        const meters = distanceKm * 1000;
        return this.placeModel
            .find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lon, lat],
                        },
                        $maxDistance: meters,
                    },
                },
            })
            .exec();
    }
    async searchByEmotions(
        searchDto: SearchPlaceDto,
    ): Promise<Place[]> {
        const { tags, minScore, sortBy } = searchDto;

        // 1. Chuyển chuỗi "tag1,tag2" thành mảng ['tag1', 'tag2']
        const tagArray = tags.split(',').map((tag) => tag.trim());

        // 2. Xây dựng câu truy vấn (query) cho MongoDB
        // Chúng ta muốn tìm các địa điểm CÓ TẤT CẢ các tags (AND)
        // và mỗi tag phải có điểm >= minScore
        const query: { $and: Record<string, any>[] } = { $and: [] };

        tagArray.forEach((tag) => {
            query.$and.push({
                // Dùng cú pháp "dot notation" để truy vấn key bên trong Map
                [`emotionalTags.${tag}`]: { $gte: minScore },
            });
        });

        // 3. Xây dựng logic sắp xếp (sort)
        const sort = {};
        if (sortBy === 'emotion' && tagArray.length > 0) {
            // Sắp xếp theo điểm của TAG ĐẦU TIÊN mà user gửi lên (cao->thấp)
            sort[`emotionalTags.${tagArray[0]}`] = -1;
        } else {
            // Mặc định sắp xếp theo rating (cao->thấp)
            sort['rating'] = -1;
        }

        // 4. Thực thi truy vấn
        return this.placeModel.find(query).sort(sort).limit(20).exec(); // Giới hạn 20 kết quả
    }
  getAvailableMoods(): string[] {
    // Tạm thời chúng ta sẽ trả về một danh sách TĨNH (hardcoded)
    // Đây là cách làm nhanh và hiệu quả.
    // (Cách nâng cao là quét toàn bộ CSDL để tự động tìm, nhưng sẽ chậm)
    return [
      'quiet',
      'peaceful',
      'relaxing',
      'crowded',
      'lively',
      'vibrant',
      'romantic',
      'good for couples',
      'expensive',
      'luxury',
      'good value',
      'cheap',
      'affordable',
      'touristy',
      'local gem',
      'authentic',
      'adventurous',
      'exciting',
      'family-friendly',
      'cozy',
      'comfortable',
      'modern',
      'artistic',
      'historical',
      'cultural',
      'spiritual',
    ];
  }
}