import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PlaceService } from './place/place.service';
import * as fs from 'fs';
import * as path from 'path';
import { PlaceSeedDto } from './place/dto/place-seed.dto';


async function bootstrap() {
  console.log('Bắt đầu quá trình seed dữ liệu địa điểm...');

  // 1. Khởi động NestJS Application Context
  const app = await NestFactory.createApplicationContext(AppModule);

  // 2. Lấy (inject) PlaceService
  const placeService = app.get(PlaceService);

  try {
    // 3. Đọc file JSON
    console.log('Đọc file JSON...');
    const filePath = path.join(
      __dirname,
      'place/data/poi_location_details.json',
    );
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const placesData: PlaceSeedDto[] = JSON.parse(fileContent);

    if (!Array.isArray(placesData)) {
      throw new Error('Dữ liệu JSON không phải là một mảng (array).');
    }

    console.log(`Tìm thấy ${placesData.length} địa điểm trong file JSON.`);

    let createdCount = 0;
    let updatedCount = 0;

    // 4. Lặp qua từng địa điểm và thực hiện "UPSERT"
    for (const place of placesData) {
      if (!place.placeID) {
        console.warn('Bỏ qua địa điểm không có placeID:', place.name);
        continue;
      }
      
      // Kiểm tra xem địa điểm đã tồn tại chưa (dựa trên googlePlaceId)
      const existingPlace = await placeService.upsertPlace(place);

      // Cập nhật bộ đếm
      // Mongoose trả về 'true' cho $setOnInsert nếu là tạo mới
      if (existingPlace.isNew) {
        createdCount++;
      } else {
        updatedCount++;
      }
    }

    // 5. In kết quả
    console.log('--- Hoàn thành seed ---');
    console.log(`Đã tạo mới: ${createdCount} địa điểm.`);
    console.log(`Đã cập nhật: ${updatedCount} địa điểm.`);

  } catch (error) {
    console.error('LỖI trong quá trình seed:', error);
  } finally {
    // 6. Đóng ứng dụng
    await app.close();
  }
}

bootstrap();