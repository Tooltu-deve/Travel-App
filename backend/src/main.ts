import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Kích hoạt CORS để React Native có thể gọi API
  app.enableCors();

  // Sử dụng ValidationPipe toàn cục để tự động validate DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Đặt prefix global cho API, ví dụ: /api/v1/auth/login
  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT || 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
