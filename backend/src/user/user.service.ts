import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findOneByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email }).exec();
  }

  async findOneById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findOneByProviderId(
    providerId: string,
    provider: 'google' | 'facebook',
  ): Promise<UserDocument | null> {
    const query = { [`${provider}Id`]: providerId };
    return this.userModel.findOne(query).exec();
  }

  async linkProviderToUser(
    userId: string,
    providerId: string,
    provider: 'google' | 'facebook',
  ): Promise<UserDocument | null> {
    const query = { [`${provider}Id`]: providerId };
    return this.userModel
      .findByIdAndUpdate(userId, { $set: query }, { new: true })
      .exec();
  }

  async update(
    userId: string,
    updateData: Partial<User>,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .exec();
  }
}

