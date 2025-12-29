import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { PlaceService } from './place.service';
import { Place } from './schemas/place.schema';
import { of, throwError } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('PlaceService - Google APIs', () => {
  let service: PlaceService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockPlaceModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    new: jest.fn(),
    constructor: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceService,
        {
          provide: getModelToken(Place.name),
          useValue: mockPlaceModel,
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GOOGLE_PLACES_API_KEY') {
                return 'test-api-key';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PlaceService>(PlaceService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enrichPlaceDetails', () => {
    const mockGooglePlaceId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
    const mockExistingPlace = {
      googlePlaceId: mockGooglePlaceId,
      name: 'Test Place',
      address: '123 Test St',
      location: {
        type: 'Point',
        coordinates: [0, 0],
      },
      lastEnrichedAt: null,
      save: jest.fn().mockResolvedValue(true),
    };

    it('should enrich place with Google Places API data', async () => {
      // Mock existing place
      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockExistingPlace),
      });

      // Mock Google Places API response
      const mockGoogleResponse = {
        data: {
          displayName: { text: 'Updated Place Name' },
          formattedAddress: '456 Updated St',
          location: { latitude: 10.123, longitude: 106.456 },
          rating: 4.5,
          editorialSummary: { text: 'A great place to visit' },
          websiteUri: 'https://example.com',
          internationalPhoneNumber: '+84 123 456 789',
          types: ['restaurant', 'food'],
          photos: [
            {
              name: 'photo1',
              widthPx: 800,
              heightPx: 600,
              authorAttributions: [
                {
                  displayName: 'John Doe',
                  uri: 'https://example.com/john',
                  photoUri: 'https://example.com/photo.jpg',
                },
              ],
            },
          ],
          reviews: [
            {
              name: 'review1',
              relativePublishTimeDescription: '1 month ago',
              rating: 5,
              text: { text: 'Great food!' },
              authorAttributions: [
                {
                  displayName: 'Jane Smith',
                  uri: 'https://example.com/jane',
                  photoUri: 'https://example.com/jane.jpg',
                },
              ],
            },
          ],
          regularOpeningHours: {
            openNow: true,
            weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'],
            periods: [
              { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
            ],
          },
          priceLevel: 2,
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockGoogleResponse as any));

      // Execute
      const result = await service.enrichPlaceDetails({
        googlePlaceId: mockGooglePlaceId,
        forceRefresh: true,
      });

      // Verify
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('https://places.googleapis.com/v1/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      );

      expect(mockExistingPlace.save).toHaveBeenCalled();
      expect(result).toHaveProperty('name', 'Updated Place Name');
      expect(result).toHaveProperty('address', '456 Updated St');
      expect(result).toHaveProperty('rating', 4.5);
      expect(result.photos).toHaveLength(1);
      expect(result.reviews).toHaveLength(1);
    });

    it('should handle invalid Place ID format', async () => {
      await expect(
        service.enrichPlaceDetails({
          googlePlaceId: 'custom_12345', // Invalid format
          forceRefresh: false,
        }),
      ).rejects.toThrow(HttpException);

      await expect(
        service.enrichPlaceDetails({
          googlePlaceId: 'activity-12345', // Invalid format
          forceRefresh: false,
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should create new POI if not exists in database', async () => {
      // Mock no existing place
      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const mockNewPlace = {
        googlePlaceId: mockGooglePlaceId,
        name: 'New Place',
        save: jest.fn().mockResolvedValue(true),
      };

      // Mock Google Places API response for initial creation
      const mockInitialResponse = {
        data: {
          displayName: { text: 'New Place' },
          formattedAddress: '789 New St',
          location: { latitude: 10.123, longitude: 106.456 },
          types: ['park'],
          rating: 4.0,
        },
      };

      // Mock the full enrichment response
      const mockEnrichedResponse = {
        data: {
          displayName: { text: 'New Place' },
          formattedAddress: '789 New St',
          location: { latitude: 10.123, longitude: 106.456 },
          types: ['park'],
          rating: 4.5,
          editorialSummary: { text: 'A nice park' },
          photos: [],
          reviews: [],
        },
      };

      jest.spyOn(httpService, 'get')
        .mockReturnValueOnce(of(mockInitialResponse as any)) // First call for creation
        .mockReturnValueOnce(of(mockEnrichedResponse as any)); // Second call for enrichment

      // Mock the model constructor to return our mock place
      const PlaceModelMock = jest.fn().mockImplementation((data) => {
        return {
          ...mockNewPlace,
          ...data,
          save: jest.fn().mockResolvedValue({ ...mockNewPlace, ...data }),
        };
      });

      // Replace the model in the service temporarily
      const originalModel = (service as any).placeModel;
      (service as any).placeModel = Object.assign(PlaceModelMock, {
        findOne: mockPlaceModel.findOne,
        findOneAndUpdate: mockPlaceModel.findOneAndUpdate,
      });

      try {
        // Execute
        const result = await service.enrichPlaceDetails({
          googlePlaceId: mockGooglePlaceId,
          forceRefresh: true,
        });

        // Verify HTTP calls were made
        expect(httpService.get).toHaveBeenCalled();
        expect(result).toBeDefined();
      } finally {
        // Restore original model
        (service as any).placeModel = originalModel;
      }
    });

    it('should handle Google API errors gracefully', async () => {
      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockExistingPlace),
      });

      // Mock Google API error
      const mockError = {
        response: {
          status: 404,
          data: {
            error: {
              message: 'Place not found',
            },
          },
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => mockError));

      await expect(
        service.enrichPlaceDetails({
          googlePlaceId: mockGooglePlaceId,
          forceRefresh: true,
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should not refresh if last enriched within 30 days and forceRefresh=false', async () => {
      const recentlyEnrichedPlace = {
        ...mockExistingPlace,
        lastEnrichedAt: new Date(), // Recent
      };

      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(recentlyEnrichedPlace),
      });

      const httpGetSpy = jest.spyOn(httpService, 'get');

      await service.enrichPlaceDetails({
        googlePlaceId: mockGooglePlaceId,
        forceRefresh: false,
      });

      // Should not call Google API
      expect(httpGetSpy).not.toHaveBeenCalled();
    });

    it('should handle missing API key', async () => {
      // Override config to return null for API key
      jest.spyOn(configService, 'get').mockReturnValue(null);

      // Create new service instance with null API key
      const testModule = await Test.createTestingModule({
        providers: [
          PlaceService,
          {
            provide: getModelToken(Place.name),
            useValue: mockPlaceModel,
          },
          {
            provide: HttpService,
            useValue: httpService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<PlaceService>(PlaceService);

      await expect(
        testService.enrichPlaceDetails({
          googlePlaceId: mockGooglePlaceId,
          forceRefresh: true,
        }),
      ).rejects.toThrow('Google Places API key chưa được cấu hình');
    });

    it('should handle photos and reviews correctly', async () => {
      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockExistingPlace),
      });

      const mockResponseWithMedia = {
        data: {
          displayName: 'Test Place',
          formattedAddress: '123 Test',
          location: { latitude: 10, longitude: 106 },
          photos: [
            {
              name: 'photo1',
              widthPx: 1920,
              heightPx: 1080,
              authorAttributions: [{ displayName: 'Author 1' }],
            },
            {
              name: 'photo2',
              widthPx: 1280,
              heightPx: 720,
              authorAttributions: [{ displayName: 'Author 2' }],
            },
          ],
          reviews: [
            { name: 'review1', rating: 5, text: { text: 'Excellent' } },
            { name: 'review2', rating: 4, text: { text: 'Good' } },
            { name: 'review3', rating: 5, text: { text: 'Amazing' } },
            { name: 'review4', rating: 3, text: { text: 'Ok' } },
            { name: 'review5', rating: 4, text: { text: 'Nice' } },
            { name: 'review6', rating: 5, text: { text: 'Perfect' } }, // Should be truncated (max 5)
          ],
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponseWithMedia as any));

      const result = await service.enrichPlaceDetails({
        googlePlaceId: mockGooglePlaceId,
        forceRefresh: true,
      });

      expect(result.photos).toHaveLength(2);
      expect(result.reviews).toHaveLength(5); // Max 5 reviews
      expect(result.photos[0]).toHaveProperty('widthPx', 1920);
      expect(result.reviews[0]).toHaveProperty('rating', 5);
    });

    it('should handle opening hours with periods correctly', async () => {
      mockPlaceModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockExistingPlace),
      });

      const mockResponseWithOpeningHours = {
        data: {
          displayName: 'Test Restaurant',
          regularOpeningHours: {
            openNow: true,
            weekdayDescriptions: [
              'Monday: 8:00 AM – 10:00 PM',
              'Tuesday: 8:00 AM – 10:00 PM',
            ],
            periods: [
              {
                open: { day: 1, hour: 8, minute: 0 },
                close: { day: 1, hour: 22, minute: 0 },
              },
              {
                open: { day: 2, hour: 8, minute: 0 },
                close: { day: 2, hour: 22, minute: 0 },
              },
            ],
          },
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponseWithOpeningHours as any));

      const result = await service.enrichPlaceDetails({
        googlePlaceId: mockGooglePlaceId,
        forceRefresh: true,
      });

      expect(result.openingHours).toBeDefined();
      expect(result.openingHours.openNow).toBe(true);
      expect(result.openingHours.periods).toHaveLength(2);
      expect(result.openingHours.weekdayDescriptions).toHaveLength(2);
    });
  });
});
