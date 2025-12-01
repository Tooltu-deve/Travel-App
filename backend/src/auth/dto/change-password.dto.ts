import { IsString, MinLength, IsNotEmpty } from 'class-validator';

// DTO dùng để validate data đổi password
export class ChangePasswordDto {
  // Password hiện tại (dùng để verify identity)
  @IsString()
  @IsNotEmpty({ message: 'Password hiện tại không được để trống' })
  currentPassword: string;

  // Password mới (min 6 ký tự, sẽ được hash trước khi lưu DB)
  @IsString()
  @MinLength(6, { message: 'Password mới phải có ít nhất 6 ký tự' })
  newPassword: string;
}
