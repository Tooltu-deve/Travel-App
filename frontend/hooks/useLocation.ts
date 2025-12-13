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
  isInitialized: boolean; // Track if initial auto-request is complete
}

export const useLocation = (): UseLocationReturn => {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Auto-request permission and get location on mount (silent check only)
  useEffect(() => {
    checkInitialPermission();
  }, []);

  const checkInitialPermission = async () => {
    try {
      // Only CHECK permission, don't request yet
      const { status } = await Location.getForegroundPermissionsAsync();
      console.debug('[useLocation] Initial permission status:', status);

      if (status === 'granted') {
        setHasPermission(true);
        // If already granted, fetch location automatically
        await fetchCurrentLocation();
      } else {
        setHasPermission(false);
      }
    } catch (err: any) {
      console.error('[useLocation] Initial permission check error:', err);
    } finally {
      setIsInitialized(true);
    }
  };

  const fetchCurrentLocation = async (): Promise<LocationCoordinates | null> => {
    try {
      console.debug('[useLocation] Fetching current location...');
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
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
      const errMsg = err?.message || 'Không thể lấy vị trí';
      console.error('[useLocation] Fetch location error:', errMsg);
      throw err;
    }
  };

  const requestLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    setLoading(true);
    setError(null);

    try {
      // Check current permission status
      let { status } = await Location.getForegroundPermissionsAsync();
      console.debug('[useLocation] Current permission status:', status);

      // REQUEST permission if not granted (this will show the popup!)
      if (status !== 'granted') {
        console.debug('[useLocation] Requesting GPS permission...');
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
        console.debug('[useLocation] Permission request result:', status);
      }

      if (status !== 'granted') {
        const msg = 'Quyền truy cập GPS bị từ chối';
        setError(msg);
        setHasPermission(false);
        console.warn('[useLocation]', msg);
        return null;
      }

      setHasPermission(true);

      // Fetch and return current location
      return await fetchCurrentLocation();
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
    isInitialized,
  };
};

export default useLocation;
