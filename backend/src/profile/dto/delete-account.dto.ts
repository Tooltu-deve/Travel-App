import { IsNotEmpty, IsString, MinLength } from 'class-validator';

// DTO dùng để validate data xóa account
// ⚠️ CHƯA IMPLEMENT - cần thêm logic soft/hard delete + GDPR compliance
export class DeleteAccountDto {
  // Password để verify identity trước khi xóa account
  @IsString()
  @IsNotEmpty({ message: 'Password không được để trống' })
  @MinLength(6, { message: 'Password phải có ít nhất 6 ký tự' })
  password: string;

  // Confirmation string - user phải nhập "DELETE" để confirm
  @IsString()
  @IsNotEmpty({ message: 'Cần xác nhận bằng cách nhập "DELETE"' })
  confirmation: string;
}