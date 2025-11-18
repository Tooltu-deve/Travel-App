// Response DTOs - Type-safe response objects cho API responses
// Không cần validation decorators vì đây là OUTPUT, không phải INPUT

// Response cho GET /profile - thông tin user (không bao gồm password)
export class ProfileResponseDto {
  _id: string;
  email: string;
  fullName: string;
  avatar?: string;
  googleId?: string;
  facebookId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Response cho PATCH /profile - success message + updated user data
export class ProfileSuccessResponseDto {
  message: string;
  user: ProfileResponseDto;
}

// Response cho PATCH /profile/password - simple success message
export class ChangePasswordResponseDto {
  message: string;
}
