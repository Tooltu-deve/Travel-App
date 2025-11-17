import { IsEmail, IsNotEmpty } from 'class-validator';

// DTO dùng để validate data đổi email
// ⚠️ CHƯA IMPLEMENT - cần thêm logic verification email
export class ChangeEmailDto {
  // Email mới (phải là email hợp lệ, chưa được sử dụng)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email mới không được để trống' })
  newEmail: string;

  // Password để verify identity trước khi đổi email
  @IsNotEmpty({ message: 'Password không được để trống' })
  password: string;
}
