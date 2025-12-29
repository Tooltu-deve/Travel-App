import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { PlaceService } from '../../src/place/place.service';
import { PlaceModule } from '../../src/place/place.module';

/**
 * Integration Tests for Place Service
 * Tests với MongoDB thật và Google Places API thật
 * 
 * Chạy: npm run test:integration
 * 
 * YÊU CẦU:
 * - MongoDB đang chạy
 * - GOOGLE_PLACES_API_KEY trong .env
 * - MONGODB_URI trong .env (hoặc dùng test database)
 */
describe('PlaceService Integration Tests', () => {
  let app: INestApplication;
  let placeService: PlaceService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test', // Dùng .env.test cho integration testing
        }),
        MongooseModule.forRoot(
          process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/smartgo-test',
        ),
        PlaceModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    placeService = moduleFixture.get<PlaceService>(PlaceService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('enrichPlaceDetails - Real Google API', () => {
    it('should enrich a real place from Google Places API', async () => {
      const realPlaceId = 'ChIJw4_R5YApdTER5VValB4E-MU'; // Nhà thờ Đức Bà Sài Gòn

      const result = await placeService.enrichPlaceDetails({
        googlePlaceId: realPlaceId,
        forceRefresh: false,
      });

      expect(result).toBeDefined();
      expect(result.googlePlaceId).toBe(realPlaceId);
      expect(result.name).toBeDefined();
      expect(result.location).toBeDefined();
      expect(result.location.coordinates).toHaveLength(2);
    }, 15000); // Timeout 15s cho API call thật

    it('should handle invalid place ID gracefully', async () => {
      await expect(
        placeService.enrichPlaceDetails({
          googlePlaceId: 'invalid-place-id-12345',
          forceRefresh: false,
        }),
      ).rejects.toThrow();
    }, 10000);
  });
});
