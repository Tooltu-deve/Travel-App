import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export interface UseLocationReturn {
  location: LocationCoordinates | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<LocationCoordinates | null>;
  hasPermission: boolean;
}

export const useLocation = (): UseLocationReturn => {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      console.debug('[useLocation] Permission status:', status);
      setHasPermission(status === 'granted');
    } catch (err: any) {
      console.error('[useLocation] Permission check error:', err);
      setError('Không thể kiểm tra quyền GPS');
    }
  };

  const requestLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    setLoading(true);
    setError(null);

    try {
      // Request permission if not granted
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== 'granted') {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
      }

      if (status !== 'granted') {
        const msg = 'Quyền truy cập GPS bị từ chối';
        setError(msg);
        setHasPermission(false);
        console.warn('[useLocation]', msg);
        return null;
      }

      setHasPermission(true);

      // Get current location
      console.debug('[useLocation] Requesting location with High accuracy...');
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
        maximumAge: 0,
      });

      const coords: LocationCoordinates = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy || undefined,
        altitude: currentLocation.coords.altitude || undefined,
        altitudeAccuracy: currentLocation.coords.altitudeAccuracy || undefined,
        heading: currentLocation.coords.heading || undefined,
        speed: currentLocation.coords.speed || undefined,
      };

      console.debug('[useLocation] Location obtained:', {
        lat: coords.latitude.toFixed(6),
        lng: coords.longitude.toFixed(6),
        accuracy: coords.accuracy,
      });
      setLocation(coords);
      return coords;
    } catch (err: any) {
      const errMsg = err?.message || 'Không thể lấy vị trí hiện tại';
      console.error('[useLocation] Error:', errMsg);
      setError(errMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    location,
    loading,
    error,
    requestLocation,
    hasPermission,
  };
};

export default useLocation;
