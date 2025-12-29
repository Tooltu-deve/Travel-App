import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { ItineraryService } from './itinerary.service';
import { Place } from '../place/schemas/place.schema';
import { Itinerary } from './schemas/itinerary.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PlaceService } from '../place/place.service';
import { of, throwError } from 'rxjs';

describe('ItineraryService - Weather APIs', () => {
  let service: ItineraryService;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItineraryService,
        {
          provide: getModelToken(Place.name),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(Itinerary.name),
          useValue: {
            create: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
          },
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
              if (key === 'OPENWEATHER_API_KEY') return 'test-api-key';
              if (key === 'AI_OPTIMIZER_SERVICE_URL') return 'http://localhost:8000';
              if (key === 'GOOGLE_DIRECTIONS_API_KEY') return 'test-google-key';
              if (key === 'GOOGLE_ROUTES_API_KEY') return 'test-routes-key';
              return null;
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
        {
          provide: PlaceService,
          useValue: {
            enrichPlaceDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ItineraryService>(ItineraryService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('fetchWeatherData', () => {
    it('should fetch weather data from OpenWeather One Call API', async () => {
      const mockWeatherResponse = {
        data: {
          current: {
            dt: 1640000000,
            temp: 25,
            feels_like: 27,
            humidity: 70,
            wind_speed: 5,
            visibility: 10000,
            weather: [
              {
                main: 'Clear',
                description: 'clear sky',
              },
            ],
          },
          daily: [
            {
              dt: 1640000000,
              temp: { day: 28, night: 22 },
              wind_speed: 4,
              weather: [{ main: 'Clouds', description: 'few clouds' }],
            },
          ],
          alerts: [],
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockWeatherResponse as any));

      const result = await (service as any).fetchWeatherData(10.8231, 106.6297);

      expect(result).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.current.temp).toBe(25);
    });

    it('should fallback to Forecast API when One Call API requires subscription', async () => {
      const mockError = {
        response: {
          status: 401,
        },
      };

      const mockCurrentWeather = {
        data: {
          main: { temp: 25, feels_like: 27, humidity: 70 },
          weather: [{ main: 'Clear', description: 'clear sky' }],
          wind: { speed: 5 },
          visibility: 10000,
          name: 'Ho Chi Minh City',
        },
      };

      const mockForecast = {
        data: {
          list: [
            {
              dt: 1640000000,
              main: { temp: 28 },
              weather: [{ main: 'Clouds', description: 'few clouds' }],
              wind: { speed: 4 },
            },
          ],
        },
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValueOnce(throwError(() => mockError)) // One Call fails
        .mockReturnValueOnce(of(mockCurrentWeather as any)) // Current weather succeeds
        .mockReturnValueOnce(of(mockForecast as any)); // Forecast succeeds

      const result = await (service as any).fetchWeatherData(10.8231, 106.6297);

      expect(result).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.forecast).toBeDefined();
    });

    it('should return null when API key is missing', async () => {
      const moduleWithoutKey: TestingModule = await Test.createTestingModule({
        providers: [
          ItineraryService,
          {
            provide: getModelToken(Place.name),
            useValue: {},
          },
          {
            provide: getModelToken(Itinerary.name),
            useValue: {},
          },
          {
            provide: HttpService,
            useValue: { get: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null), // No API key
            },
          },
          {
            provide: NotificationsService,
            useValue: {},
          },
          {
            provide: PlaceService,
            useValue: {},
          },
        ],
      }).compile();

      const serviceWithoutKey = moduleWithoutKey.get<ItineraryService>(ItineraryService);
      const result = await (serviceWithoutKey as any).fetchWeatherData(10.8231, 106.6297);

      expect(result).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      const mockError = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        message: 'Request failed',
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValueOnce(throwError(() => mockError)) // One Call fails
        .mockReturnValueOnce(throwError(() => mockError)) // Current fails
        .mockReturnValueOnce(throwError(() => mockError)); // Forecast fails

      const result = await (service as any).fetchWeatherData(10.8231, 106.6297);

      expect(result).toBeNull();
    });
  });

  describe('isBadWeather', () => {
    it('should detect heavy rain as bad weather', () => {
      const mockWeatherData = {
        current: {
          dt: Math.floor(Date.now() / 1000),
          weather: [
            {
              main: 'Rain',
              description: 'heavy rain',
            },
          ],
        },
      };

      const tripStart = new Date();
      const result = (service as any).isBadWeather(mockWeatherData, tripStart, 3);

      expect(result).toBe(true);
    });

    it('should detect strong wind as bad weather', () => {
      const mockWeatherData = {
        current: {
          dt: Math.floor(Date.now() / 1000),
          wind_speed: 20, // > 15 m/s threshold
          weather: [{ main: 'Clear' }],
        },
      };

      const tripStart = new Date();
      const result = (service as any).isBadWeather(mockWeatherData, tripStart, 3);

      expect(result).toBe(true);
    });

    it('should detect thunderstorm as bad weather', () => {
      const mockWeatherData = {
        daily: [
          {
            dt: Math.floor(Date.now() / 1000),
            weather: [
              {
                main: 'Thunderstorm',
                description: 'thunderstorm with rain',
              },
            ],
          },
        ],
      };

      const tripStart = new Date();
      const result = (service as any).isBadWeather(mockWeatherData, tripStart, 3);

      expect(result).toBe(true);
    });

    it('should return false for good weather conditions', () => {
      const mockWeatherData = {
        current: {
          dt: Math.floor(Date.now() / 1000),
          wind_speed: 5,
          weather: [
            {
              main: 'Clear',
              description: 'clear sky',
            },
          ],
        },
        daily: [
          {
            dt: Math.floor(Date.now() / 1000),
            wind_speed: 4,
            weather: [{ main: 'Clouds', description: 'few clouds' }],
          },
        ],
      };

      const tripStart = new Date();
      const result = (service as any).isBadWeather(mockWeatherData, tripStart, 3);

      expect(result).toBe(false);
    });

    it('should only check weather within trip date range', () => {
      const now = new Date();
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + 10); // 10 days from now

      const mockWeatherData = {
        daily: [
          {
            dt: Math.floor(futureDate.getTime() / 1000), // Outside trip range
            weather: [{ main: 'Rain', description: 'heavy rain' }],
          },
        ],
      };

      const tripStart = new Date(); // Today
      const result = (service as any).isBadWeather(mockWeatherData, tripStart, 3); // 3 days trip

      expect(result).toBe(false); // Should ignore weather outside trip range
    });
  });

  describe('isOutdoorPoi', () => {
    it('should identify beach as outdoor POI', () => {
      const poi = {
        types: ['beach', 'tourist_attraction'],
      };

      const result = (service as any).isOutdoorPoi(poi);
      expect(result).toBe(true);
    });

    it('should identify park as outdoor POI', () => {
      const poi = {
        types: ['park', 'point_of_interest'],
      };

      const result = (service as any).isOutdoorPoi(poi);
      expect(result).toBe(true);
    });

    it('should not identify restaurant as outdoor POI', () => {
      const poi = {
        types: ['restaurant', 'food'],
      };

      const result = (service as any).isOutdoorPoi(poi);
      expect(result).toBe(false);
    });

    it('should not identify museum as outdoor POI', () => {
      const poi = {
        types: ['museum', 'cultural'],
      };

      const result = (service as any).isOutdoorPoi(poi);
      expect(result).toBe(false);
    });
  });

  describe('filterByWeather', () => {
    it('should filter outdoor POIs when weather is bad', async () => {
      const mockPois = [
        { name: 'Beach', types: ['beach'], location: { coordinates: [0, 0] } },
        { name: 'Museum', types: ['museum'], location: { coordinates: [0, 0] } },
        { name: 'Park', types: ['park'], location: { coordinates: [0, 0] } },
        { name: 'Restaurant', types: ['restaurant'], location: { coordinates: [0, 0] } },
      ];

      const mockWeatherData = {
        current: {
          weather: [{ main: 'Rain', description: 'heavy rain' }],
        },
      };

      jest.spyOn(service as any, 'fetchWeatherData').mockResolvedValue(mockWeatherData);
      jest.spyOn(service as any, 'isBadWeather').mockReturnValue(true);
      jest.spyOn(service as any, 'isOutdoorPoi').mockImplementation((poi: any) => {
        return ['beach', 'park'].includes(poi.types[0]);
      });

      const result = await (service as any).filterByWeather(
        mockPois,
        { lat: 10, lng: 106 },
        new Date().toISOString(),
        3,
      );

      expect(result.pois).toHaveLength(2); // Only Museum and Restaurant
      expect(result.alerts).toContainEqual(
        expect.objectContaining({
          type: 'routing',
          title: expect.stringContaining('thời tiết xấu'),
        }),
      );
    });

    it('should keep all POIs when weather is good', async () => {
      const mockPois = [
        { name: 'Beach', types: ['beach'], location: { coordinates: [0, 0] } },
        { name: 'Park', types: ['park'], location: { coordinates: [0, 0] } },
      ];

      const mockWeatherData = {
        current: {
          weather: [{ main: 'Clear', description: 'clear sky' }],
        },
      };

      jest.spyOn(service as any, 'fetchWeatherData').mockResolvedValue(mockWeatherData);
      jest.spyOn(service as any, 'isBadWeather').mockReturnValue(false);

      const result = await (service as any).filterByWeather(
        mockPois,
        { lat: 10, lng: 106 },
        new Date().toISOString(),
        3,
      );

      expect(result.pois).toHaveLength(2); // All POIs kept
      expect(result.stopDueToOfficialAlert).toBe(false);
    });

    it('should stop route creation when official weather alert exists', async () => {
      const mockPois = [
        { name: 'Beach', types: ['beach'] },
        { name: 'Museum', types: ['museum'] },
      ];

      const now = new Date();
      const alertStart = new Date(now);
      const alertEnd = new Date(now);
      alertEnd.setDate(alertEnd.getDate() + 2);

      const mockWeatherData = {
        alerts: [
          {
            event: 'Severe Thunderstorm Warning',
            sender_name: 'National Weather Service',
            description: 'Severe thunderstorm with heavy rain and strong winds',
            start: Math.floor(alertStart.getTime() / 1000),
            end: Math.floor(alertEnd.getTime() / 1000),
            tags: ['Thunderstorm', 'Wind'],
          },
        ],
      };

      jest.spyOn(service as any, 'fetchWeatherData').mockResolvedValue(mockWeatherData);

      const result = await (service as any).filterByWeather(
        mockPois,
        { lat: 10, lng: 106 },
        new Date().toISOString(),
        3,
      );

      expect(result.pois).toHaveLength(0); // No POIs returned
      expect(result.stopDueToOfficialAlert).toBe(true);
      expect(result.alerts).toContainEqual(
        expect.objectContaining({
          type: 'official',
          severity: 'danger',
        }),
      );
    });
  });
});
