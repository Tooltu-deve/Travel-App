import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

// DTO (Data Transfer Object) dùng để validate data gửi lên từ client
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Password optional cho các tài khoản OAuth (Google/Facebook)
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  facebookId?: string;

  @IsOptional()
  isVerified?: boolean;

  @IsOptional()
  @IsString()
  verificationToken?: string;

  @IsOptional()
  verificationTokenExpiry?: Date;
}
