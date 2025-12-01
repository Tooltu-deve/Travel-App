import { IsArray, IsString, IsOptional } from 'class-validator';

/**
 * DTO (Data Transfer Object) này dùng để validate
 * dữ liệu khi user cập nhật sở thích (moods) của họ.
 */
export class UpdateUserPreferencesDto {
  @IsArray()
  @IsString({ each: true }) // Đảm bảo mỗi phần tử trong mảng là 1 string
  @IsOptional()
  preferencedTags: string[]; // vd: ['romantic', 'quiet', 'local gem']
}