import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

// DTO (Data Transfer Object) dùng để validate data gửi lên từ client
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;
}
