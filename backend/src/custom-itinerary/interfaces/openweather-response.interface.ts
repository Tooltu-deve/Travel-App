/**
 * Interfaces cho OpenWeather API Response
 * Tuân thủ coding convention: PascalCase cho interfaces
 * Separation of Concerns: Tách biệt API response types khỏi domain models
 */

export interface OpenWeatherAlert {
  sender_name: string;
  event: string;
  start: number;
  end: number;
  description: string;
  tags: string[];
}

export interface OpenWeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface OpenWeatherTemp {
  day: number;
  min: number;
  max: number;
  night: number;
  eve: number;
  morn: number;
}

export interface OpenWeatherDailyForecast {
  dt: number;
  sunrise: number;
  sunset: number;
  temp: OpenWeatherTemp;
  feels_like: {
    day: number;
    night: number;
    eve: number;
    morn: number;
  };
  pressure: number;
  humidity: number;
  dew_point: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather: OpenWeatherCondition[];
  clouds: number;
  pop: number;
  rain?: number;
  snow?: number;
  uvi: number;
}

export interface OpenWeatherResponse {
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
  current?: any;
  daily?: OpenWeatherDailyForecast[];
  alerts?: OpenWeatherAlert[];
}
