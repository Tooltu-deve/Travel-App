import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
    Param,
    ParseFloatPipe,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
    Res,
    ParseIntPipe as ParseIntQueryPipe,
} from '@nestjs/common';
import { PlaceService } from './place.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchPlaceDto } from './dto/search-place.dto';
import { EnrichPoiDto } from './dto/enrich-poi.dto';
import type { Response } from 'express';

@Controller('places') // Tất cả API sẽ bắt đầu bằng /api/v1/places
export class PlaceController {
    constructor(private readonly placeService: PlaceService) { }

    // POST /places
    // Bảo vệ: Chỉ người đã đăng nhập mới được tạo địa điểm
    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Body() createPlaceDto: CreatePlaceDto) {
        return this.placeService.create(createPlaceDto);
    }

    // GET /places
    // Công khai: Ai cũng có thể xem danh sách địa điểm
    @Get()
    findAll() {
        return this.placeService.findAll();
    }
    
    @Get('available-moods')
    getAvailableMoods() {
        return this.placeService.getAvailableMoods();
    }

    @Get('search-by-emotion')
    findEmotional(@Query() searchDto: SearchPlaceDto) {
        // Nhờ dùng DTO, NestJS sẽ tự động validate
        // (tags là bắt buộc, minScore/sortBy là tùy chọn)
        return this.placeService.searchByEmotions(searchDto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('enrich')
    @HttpCode(HttpStatus.OK)
    async enrichPlace(@Body() enrichDto: EnrichPoiDto) {
        const data = await this.placeService.enrichPlaceDetails(enrichDto);
        return {
            message: 'Enrich POI thành công',
            data,
        };
    }

    // GET /places/photo?name=places/.../photos/...&maxWidthPx=1600
    // Proxy endpoint để lấy ảnh từ Google Places Photo API v1
    // Photo name format: "places/PLACE_ID/photos/PHOTO_ID"
    @Get('photo')
    async getPlacePhoto(
        @Query('name') photoName: string,
        @Query('maxWidthPx', new ParseIntQueryPipe({ optional: true })) maxWidthPx?: number,
        @Res() res?: Response,
    ) {
        if (!photoName) {
            throw new HttpException(
                'Photo name (name) là tham số bắt buộc.',
                HttpStatus.BAD_REQUEST,
            );
        }

        try {
            const imageBuffer = await this.placeService.getPlacePhoto(
                photoName,
                maxWidthPx || 1600,
            );

            // Set headers để trả về ảnh
            res?.setHeader('Content-Type', 'image/jpeg');
            res?.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 năm
            res?.send(imageBuffer);
        } catch (error: any) {
            throw error;
        }
    }

    // GET /places/near?lon=...&lat=...&dist=...
    // API đặc biệt để tìm địa điểm lân cận
    @Get('near')
    findNear(
        @Query('lon', ParseFloatPipe) lon: number,
        @Query('lat', ParseFloatPipe) lat: number,
        @Query('dist', new ParseIntPipe({ optional: true })) dist?: number, // dist là tùy chọn
    ) {
        return this.placeService.findNear(lon, lat, dist);
    }

    // GET /places/:id
    // Công khai: Ai cũng có thể xem chi tiết
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.placeService.findOne(id);
    }

    // PATCH /places/:id
    // Bảo vệ: Chỉ người đã đăng nhập mới được sửa
    @UseGuards(JwtAuthGuard)
    @Patch(':id')
    update(@Param('id') id: string, @Body() updatePlaceDto: UpdatePlaceDto) {
        return this.placeService.update(id, updatePlaceDto);
    }

    // DELETE /places/:id
    // Bảo vệ: Chỉ người đã đăng nhập mới được xóa
    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.placeService.remove(id);
    }
}