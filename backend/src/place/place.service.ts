import {
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Place, PlaceDocument } from './schemas/place.schema';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { PlaceSeedDto } from './dto/place-seed.dto';
import { SearchPlaceDto } from './dto/search-place.dto';
import { EnrichPoiDto, EnrichedPoiResponseDto } from './dto/enrich-poi.dto';

@Injectable()
export class PlaceService {
    private readonly googlePlacesApiKey: string;
    private static readonly THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    constructor(
        @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.googlePlacesApiKey =
            this.configService.get<string>('GOOGLE_PLACES_API_KEY') ||
            process.env.GOOGLE_PLACES_API_KEY ||
            '';
    }

    async upsertPlace(placeData: PlaceSeedDto): Promise<PlaceDocument> {
        const {
            placeID,
            name,
            formatted_address,
            location,
            emotional_tags,
            ...restData
        } = placeData;

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
            types: restData.types,
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

  private mapPlaceToEnrichedDto(place: PlaceDocument): EnrichedPoiResponseDto {
    const emotionalTagsObject: Record<string, number> | undefined =
      place.emotionalTags
        ? Object.fromEntries(
            Array.from(place.emotionalTags.entries()) as [string, number][],
          )
        : undefined;

    return {
      googlePlaceId: place.googlePlaceId,
      name: place.name,
      address: place.address,
      description: place.description,
      type: place.type,
      types: place.types,
      rating: place.rating,
      editorialSummary: place.editorialSummary ?? null,
      websiteUri: place.websiteUri,
      contactNumber: place.contactNumber,
      photos: place.photos?.map((photo) => ({
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        authorAttributions: photo.authorAttributions?.map((attr) => ({
          displayName: attr.displayName,
          uri: attr.uri,
          photoUri: attr.photoUri,
        })),
      })),
      reviews: place.reviews?.map((review) => ({
        name: review.name,
        relativePublishTimeDescription: review.relativePublishTimeDescription,
        rating: review.rating,
        text: review.text,
        authorAttributions: review.authorAttributions?.map((attr) => ({
          displayName: attr.displayName,
          uri: attr.uri,
          photoUri: attr.photoUri,
        })),
      })),
      lastEnrichedAt: place.lastEnrichedAt,
      budgetRange: place.budgetRange,
      openingHours: place.openingHours,
      location: place.location,
      emotionalTags: emotionalTagsObject,
    };
  }

  async enrichPlaceDetails(
    enrichDto: EnrichPoiDto,
  ): Promise<EnrichedPoiResponseDto> {
    if (!this.googlePlacesApiKey) {
      throw new HttpException(
        'Google Places API key chưa được cấu hình.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { googlePlaceId, forceRefresh } = enrichDto;

    const place = await this.placeModel
      .findOne({ googlePlaceId })
      .exec();

    if (!place) {
      throw new NotFoundException(
        `Không tìm thấy địa điểm với Google Place ID: ${googlePlaceId}`,
      );
    }

    const lastEnrichedAt = place.lastEnrichedAt?.getTime() ?? 0;
    const isExpired =
      Date.now() - lastEnrichedAt > PlaceService.THIRTY_DAYS_MS;

    if (!forceRefresh && place.lastEnrichedAt && !isExpired) {
      return this.mapPlaceToEnrichedDto(place);
    }

    const url = `https://places.googleapis.com/v1/places/${googlePlaceId}`;
    const fieldMask = [
      'rating',
      'editorialSummary',
      'photos',
      'reviews',
      'websiteUri',
      'internationalPhoneNumber',
      'nationalPhoneNumber',
    ].join(',');

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googlePlacesApiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          timeout: 10000,
        }),
      );

      const data = response.data;

      if (typeof data.rating === 'number') {
        place.rating = data.rating;
      }

      if (data.editorialSummary) {
        place.editorialSummary = data.editorialSummary.text ?? null;
      }

      if (data.websiteUri) {
        place.websiteUri = data.websiteUri;
      }

      const phoneNumber =
        data.internationalPhoneNumber || data.nationalPhoneNumber;
      if (phoneNumber) {
        place.contactNumber = phoneNumber;
      }
      if (data.photos) {
        place.photos = data.photos.map((photo) => ({
          name: photo.name,
          widthPx: photo.widthPx,
          heightPx: photo.heightPx,
          authorAttributions: photo.authorAttributions?.map((attr) => ({
            displayName: attr.displayName,
            uri: attr.uri,
            photoUri: attr.photoUri,
          })),
        }));
      }

      if (data.reviews) {
        place.reviews = data.reviews.slice(0, 5).map((review) => ({
          name: review.name,
          relativePublishTimeDescription:
            review.relativePublishTimeDescription,
          rating: review.rating,
          text: review.text?.text ?? review.text ?? undefined,
          authorAttributions: review.authorAttributions?.map((attr) => ({
            displayName: attr.displayName,
            uri: attr.uri,
            photoUri: attr.photoUri,
          })),
        }));
      }
      place.lastEnrichedAt = new Date();

      await place.save();

      return this.mapPlaceToEnrichedDto(place);
    } catch (error: any) {
      // Lỗi từ Google Places API (có response)
      if (error.response) {
        const status = error.response.status;
        const message =
          error.response.data?.error?.message ||
          error.response.statusText ||
          'Lỗi không xác định từ Google Places API';
        throw new HttpException(message, status);
      }

      // Lỗi validate / lưu MongoDB
      if (error.name === 'ValidationError') {
        throw new HttpException(
          `Lỗi validate dữ liệu Place: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Các lỗi khác (network, timeout, ...)
      throw new HttpException(
        `Không thể kết nối tới Google Places API: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}