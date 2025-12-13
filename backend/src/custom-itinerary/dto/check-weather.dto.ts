import { IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

/**
 * DTO kiểm tra thời tiết
 * Tuân thủ naming convention: camelCase trong code
 */
export class CheckWeatherDto {
  @IsISO8601()
  @IsNotEmpty({ message: 'Ngày đi không được để trống' })
  departureDate: string;

  @IsISO8601()
  @IsNotEmpty({ message: 'Ngày về không được để trống' })
  returnDate: string;

  @IsString()
  @IsNotEmpty({ message: 'Địa điểm đến không được để trống' })
  destination: string;
}
