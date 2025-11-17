import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUrl,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlaceTypes } from '../schemas/place.schema';

class LocationDto {
  @IsNumber({}, { each: true })
  @ArrayMinSize(2) 
  @ArrayMaxSize(2) 
  coordinates: number[]; // [longitude, latitude]
}

export class CreatePlaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(PlaceTypes)
  @IsOptional()
  type?: string;

  @IsArray()
  @IsUrl({}, { each: true }) // Đảm bảo mỗi phần tử là một URL
  @IsOptional()
  images?: string[];

  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ValidateNested() // Quan trọng: Validate đối tượng lồng nhau
  @Type(() => LocationDto) // Quan trọng: Giúp class-transformer biết đây là LocationDto
  @IsNotEmpty()
  location: LocationDto;
}