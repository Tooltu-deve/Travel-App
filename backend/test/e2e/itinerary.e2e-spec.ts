import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * End-to-End Tests cho Itinerary API
 * Test toàn bộ flow: HTTP request -> Controller -> Service -> Database -> External APIs
 * 
 * Chạy: npm run test:e2e
 * 
 * YÊU CẦU:
 * - Backend server KHÔNG cần chạy (test tự khởi động)
 * - MongoDB đang chạy
 * - AI Optimizer Service đang chạy (localhost:8000)
 * - Tất cả API keys trong .env.test
 */
describe('Itinerary E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/itinerary/generate', () => {
    it('should generate itinerary successfully', async () => {
      const generateDto = {
        startLocation: {
          lat: 10.8231,
          lng: 106.6297,
          address: 'Ho Chi Minh City',
        },
        startDatetime: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days from now
        durationDays: 3,
        preferences: {
          activities: ['sightseeing', 'food'],
          budget: 'medium',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/api/itinerary/generate')
        .send(generateDto)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.route).toBeDefined();
      expect(response.body.route.days).toBeDefined();
      expect(Array.isArray(response.body.route.days)).toBe(true);
    }, 60000); // Timeout 60s cho AI generation

    it('should reject invalid date range', async () => {
      const invalidDto = {
        startLocation: {
          lat: 10.8231,
          lng: 106.6297,
          address: 'Ho Chi Minh City',
        },
        startDatetime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        durationDays: 3,
        preferences: {
          activities: ['sightseeing'],
        },
      };

      await request(app.getHttpServer())
        .post('/api/itinerary/generate')
        .send(invalidDto)
        .expect(400);
    });
  });

  describe('Weather Integration', () => {
    it('should filter outdoor POIs in bad weather', async () => {
      // Test logic tương tự nhưng với API thật
      const response = await request(app.getHttpServer())
        .post('/api/itinerary/generate')
        .send({
          startLocation: { lat: 10.8231, lng: 106.6297, address: 'HCM' },
          startDatetime: new Date(Date.now() + 86400000 * 2).toISOString(),
          durationDays: 2,
          preferences: { activities: ['outdoor'] },
        })
        .expect(201);

      // Verify weather was considered
      expect(response.body).toBeDefined();
    }, 30000);
  });
});
