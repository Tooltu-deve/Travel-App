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
            
            // POI Classification Fields (từ classify-poi-functions.ts)
            function: placeData.function,
            functionPriority: placeData.functionPriority,
            includeInDailyRoute: placeData.includeInDailyRoute !== undefined 
                ? placeData.includeInDailyRoute 
                : true, // Default true
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
      function: place.function,
      functionPriority: place.functionPriority,
      includeInDailyRoute: place.includeInDailyRoute,
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

    console.log(`🔍 Enriching place: ${googlePlaceId}`);

    // Validate googlePlaceId format - must be a valid Google Place ID
    // Valid formats: ChIJxxxx or places/ChIJxxxx (not custom_xxx or activity-xxx)
    const cleanPlaceId = googlePlaceId.replace(/^places\//, '');
    if (!cleanPlaceId || 
        cleanPlaceId.startsWith('custom_') || 
        cleanPlaceId.startsWith('activity-') ||
        cleanPlaceId.length < 10 ||
        !/^ChIJ/.test(cleanPlaceId)) {
      console.log(`❌ Invalid Place ID: ${googlePlaceId}`);
      throw new HttpException(
        `Place ID không hợp lệ: ${googlePlaceId}. Chỉ chấp nhận Google Place ID (format: ChIJxxxx).`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let place = await this.placeModel
      .findOne({ googlePlaceId })
      .exec();

    // Nếu POI chưa có trong database, tự động tạo mới từ Google Places API
    if (!place) {
      console.log(`📝 POI chưa có trong database, đang tạo mới: ${googlePlaceId}`);
      
      // Place ID format: thêm prefix "places/" nếu chưa có
      const placeIdForApi = googlePlaceId.startsWith('places/') 
        ? googlePlaceId 
        : `places/${googlePlaceId}`;
      
      const url = `https://places.googleapis.com/v1/${placeIdForApi}`;
      const fieldMask = 'displayName,formattedAddress,location,types,rating';
      
      try {
        const response = await firstValueFrom(
          this.httpService.get(url, {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': this.googlePlacesApiKey,
              'X-Goog-FieldMask': fieldMask,
              'Accept-Language': 'vi',
            },
            timeout: 10000,
          }),
        );

        const data = response.data;
        
        // Tạo POI mới với thông tin cơ bản
        const name = data.displayName?.text || data.displayName || 'Địa điểm';
        const address = data.formattedAddress || '';
        const location = data.location?.latitude && data.location?.longitude
          ? {
              type: 'Point' as const,
              coordinates: [data.location.longitude, data.location.latitude],
            }
          : {
              type: 'Point' as const,
              coordinates: [0, 0], // Default location, sẽ được cập nhật khi enrich
            };
        
        place = new this.placeModel({
          googlePlaceId,
          name,
          address,
          location,
          type: data.types?.[0] || 'other',
          types: data.types || [],
          rating: data.rating,
        });
        
        await place.save();
        console.log(`✅ Đã tạo POI mới: ${name}`);
      } catch (error: any) {
        console.error(`❌ Lỗi khi tạo POI mới: ${error.message}`);
        throw new HttpException(
          `Không thể lấy thông tin địa điểm từ Google Places API: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    const lastEnrichedAt = place.lastEnrichedAt?.getTime() ?? 0;
    const isExpired =
      Date.now() - lastEnrichedAt > PlaceService.THIRTY_DAYS_MS;

    if (!forceRefresh && place.lastEnrichedAt && !isExpired) {
      return this.mapPlaceToEnrichedDto(place);
    }

    // Place ID format: thêm prefix "places/" nếu chưa có
    const placeIdForApi = googlePlaceId.startsWith('places/') 
      ? googlePlaceId 
      : `places/${googlePlaceId}`;
    
    const url = `https://places.googleapis.com/v1/${placeIdForApi}`;
    
    // Field mask theo Google Places API v1 - sử dụng đúng field names
    const fieldMask = [
      'displayName', // Tên đã được localize (object {text, languageCode})
      'formattedAddress', // Địa chỉ đã format (không phải 'address')
      'location', // Tọa độ {latitude, longitude}
      'rating', // Rating
      'editorialSummary', // Mô tả ngắn (object {text})
      'photos', // Danh sách ảnh
      'reviews', // Reviews
      'websiteUri', // Website
      'internationalPhoneNumber', // Số điện thoại quốc tế
      'nationalPhoneNumber', // Số điện thoại trong nước
      'types', // Loại địa điểm (array, không phải 'type')
      'regularOpeningHours', // Giờ mở cửa
      'priceLevel', // Mức giá
    ].join(',');
    
    console.log(`🔍 Enriching place: ${googlePlaceId}`);
    console.log(`   API URL: ${url}`);
    console.log(`   Field Mask: ${fieldMask}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googlePlacesApiKey,
            'X-Goog-FieldMask': fieldMask,
            'Accept-Language': 'vi', // Để lấy tên bằng tiếng Việt
          },
          timeout: 10000,
        }),
      );

      const data = response.data;
      console.log(`✅ Google Places API response received for ${googlePlaceId}`);
      console.log(`   Has photos: ${!!data.photos}, Count: ${data.photos?.length || 0}`);
      console.log(`   Has reviews: ${!!data.reviews}, Count: ${data.reviews?.length || 0}`);

      // Update name - ưu tiên displayName (đã localize) nếu có
      if (data.displayName) {
        // displayName là object { text: string, languageCode: string }
        const localizedName = typeof data.displayName === 'string' 
          ? data.displayName 
          : data.displayName.text;
        if (localizedName) {
          place.name = localizedName;
          console.log(`   ✅ Using localized name: ${localizedName}`);
        }
      }

      // Update address - dùng formattedAddress
      if (data.formattedAddress) {
        place.address = data.formattedAddress;
      }

      // Update location nếu có
      if (data.location?.latitude && data.location?.longitude) {
        place.location = {
          type: 'Point',
          coordinates: [data.location.longitude, data.location.latitude], // [lng, lat] cho GeoJSON
        };
      }

      if (typeof data.rating === 'number') {
        place.rating = data.rating;
      }

      if (data.editorialSummary) {
        place.editorialSummary = 
          typeof data.editorialSummary === 'string' 
            ? data.editorialSummary 
            : data.editorialSummary.text ?? null;
      }

      if (data.websiteUri) {
        place.websiteUri = data.websiteUri;
      }

      const phoneNumber =
        data.internationalPhoneNumber || data.nationalPhoneNumber;
      if (phoneNumber) {
        place.contactNumber = phoneNumber;
      }
      
      // Update types
      if (data.types && Array.isArray(data.types)) {
        place.types = data.types;
        // Cập nhật type chính (lấy type đầu tiên)
        if (data.types.length > 0) {
          place.type = data.types[0];
        }
      }
      
      // Update price level
      if (data.priceLevel !== undefined) {
        // Convert price level to budget range
        // PRICE_LEVEL_FREE = 0, PRICE_LEVEL_INEXPENSIVE = 1, PRICE_LEVEL_MODERATE = 2, PRICE_LEVEL_EXPENSIVE = 3, PRICE_LEVEL_VERY_EXPENSIVE = 4
        const priceLevelMap: { [key: number]: string } = {
          0: 'free',
          1: 'affordable',
          2: 'moderate',
          3: 'expensive',
          4: 'very_expensive',
        };
        place.budgetRange = priceLevelMap[data.priceLevel] || 'free';
      }
      
      // Update opening hours
      if (data.regularOpeningHours) {
        place.openingHours = {
          openNow: data.regularOpeningHours.openNow,
          weekdayDescriptions: data.regularOpeningHours.weekdayDescriptions || [],
        };
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

  /**
   * Lấy ảnh từ Google Places Photo API v1
   * Photo name format: "places/PLACE_ID/photos/PHOTO_ID"
   * Endpoint: https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=API_KEY
   */
  async getPlacePhoto(photoName: string, maxWidthPx: number = 1600): Promise<Buffer> {
    if (!this.googlePlacesApiKey) {
      throw new HttpException(
        'Google Places API key chưa được cấu hình.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!photoName) {
      throw new HttpException(
        'Photo name không được để trống.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Endpoint media của Google Places API v1
    // Format: https://places.googleapis.com/v1/places/{place_id}/photos/{photo_id}/media
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${this.googlePlacesApiKey}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(mediaUrl, {
          responseType: 'arraybuffer', // Lấy dữ liệu binary (ảnh)
          timeout: 10000,
        }),
      );

      // Trả về Buffer của ảnh
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Error fetching photo from Google Places API:', error);
      
      if (error.response) {
        // Lỗi từ Google Places API
        throw new HttpException(
          `Không thể lấy ảnh từ Google Places API: ${error.response.status} ${error.response.statusText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Các lỗi khác (network, timeout, ...)
      throw new HttpException(
        `Không thể kết nối tới Google Places Photo API: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}