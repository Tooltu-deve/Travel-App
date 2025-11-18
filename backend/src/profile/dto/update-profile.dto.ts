import { IsOptional, IsString, MinLength, MaxLength, IsUrl } from 'class-validator';

// DTO dùng để validate data update profile
export class UpdateProfileDto {
  // Tên đầy đủ (optional, min 2, max 100 ký tự)
  @IsOptional()
  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Tên không được quá 100 ký tự' })
  fullName?: string;

  // URL avatar (optional, phải là URL hợp lệ)
  @IsOptional()
  @IsString({ message: 'Avatar phải là chuỗi ký tự' })
  @IsUrl({}, { message: 'Avatar phải là URL hợp lệ' })
  avatar?: string;
}