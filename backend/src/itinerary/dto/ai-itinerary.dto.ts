import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAiItineraryDto {
    @ApiProperty({
        description: 'Session ID từ AI chat',
        example: 'user123_20251124_204402',
    })
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({
        description: 'Tiêu đề lộ trình',
        example: 'Hà Nội 2 ngày - Cặp đôi văn hóa',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Sở thích đã thu thập',
        example: {
            travel_style: 'cultural',
            group_type: 'couple',
            budget_range: 'mid-range',
            duration: '2_days'
        },
    })
    @IsObject()
    preferences: Record<string, any>;

    @ApiProperty({
        description: 'Chi tiết lộ trình',
        type: Array,
    })
    @IsArray()
    itinerary: any[];

    @ApiPropertyOptional({
        description: 'Metadata từ AI agent',
    })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;

    @ApiPropertyOptional({
        description: 'Tags cho lộ trình',
        example: ['cultural', 'couple', 'hanoi'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiPropertyOptional({
        description: 'Ghi chú cá nhân',
    })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({
        description: 'Ngày dự kiến đi',
        example: '2025-12-01',
    })
    @IsOptional()
    @IsString()
    travel_date?: string;
}

export class UpdateAiItineraryDto {
    @ApiPropertyOptional({
        description: 'Tiêu đề lộ trình',
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({
        description: 'Trạng thái lộ trình',
        enum: ['draft', 'completed', 'saved', 'archived'],
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        description: 'Tags',
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiPropertyOptional({
        description: 'Ghi chú',
    })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({
        description: 'Đánh dấu yêu thích',
    })
    @IsOptional()
    @IsBoolean()
    is_favorite?: boolean;

    @ApiPropertyOptional({
        description: 'Đánh giá (1-5 sao)',
        minimum: 1,
        maximum: 5,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(5)
    rating?: number;

    @ApiPropertyOptional({
        description: 'Feedback cho lộ trình',
    })
    @IsOptional()
    @IsString()
    feedback?: string;
}

export class AiItineraryQueryDto {
    @ApiPropertyOptional({
        description: 'Trạng thái lộ trình',
        enum: ['draft', 'completed', 'saved', 'archived'],
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        description: 'Tags để lọc',
    })
    @IsOptional()
    @IsString()
    tags?: string;

    @ApiPropertyOptional({
        description: 'Chỉ lấy yêu thích',
    })
    @IsOptional()
    @IsString()
    is_favorite?: string;

    @ApiPropertyOptional({
        description: 'Số lượng kết quả (default: 10)',
        example: '10',
    })
    @IsOptional()
    @IsString()
    limit?: string;

    @ApiPropertyOptional({
        description: 'Bỏ qua số lượng (pagination)',
        example: '0',
    })
    @IsOptional()
    @IsString()
    skip?: string;
}