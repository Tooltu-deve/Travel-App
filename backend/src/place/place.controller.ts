import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Query,
    ParseFloatPipe,
    ParseIntPipe,
} from '@nestjs/common';
import { PlaceService } from './place.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchPlaceDto } from './dto/search-place.dto';

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