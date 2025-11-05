import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { isEmail, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { isDeepStrictEqual } from 'util';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string | null;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsString()
  facebookId?: string;
}

export type UserDocument = Document & {
  _id: Types.ObjectId;
  email: string;
  password?: string | null;
  fullName: string;
  avatar?: string;
  googleId?: string;
  facebookId?: string;
  id: string;
};

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class User {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, index: true })
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @Prop({ type: String, required: false, default: null })
  password?: string | null;

  @Prop({ type: String, required: true })
  fullName: string;

  @Prop({ type: String, required: false })
  avatar?: string;

  @Prop({ type: String, unique: true, sparse: true, required: false })
  googleId?: string;

  @Prop({ type: String, unique: true, sparse: true, required: false })
  facebookId?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Tự động hash password TRƯỚC KHI LƯU (nếu password được cung cấp)
UserSchema.pre<UserDocument>('save', async function (next) {
  // Chỉ hash nếu password được thay đổi (hoặc là user mới)
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

