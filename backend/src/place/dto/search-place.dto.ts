import { IsOptional, IsString, IsNumber, Min, Max, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchPlaceDto {
    @IsString()
    @IsNotEmpty()
    // Người dùng sẽ gửi tags dạng: "romantic,quiet,lively"
    tags: string;

    @IsNumber()
    @Min(0)
    @Max(1)
    @IsOptional()
    @Type(() => Number) // Tự động chuyển string từ query param sang number
    // Điểm cảm xúc tối thiểu (ví dụ: 0.5)
    minScore: number = 0.4; // Đặt giá trị mặc định

    @IsString()
    @IsIn(['emotion', 'rating']) // Chỉ cho phép 2 giá trị này
    @IsOptional()
    // Sắp xếp theo: 'emotion' (điểm của tag đầu tiên) hoặc 'rating' (đánh giá chung)
    sortBy: string = 'emotion';
}