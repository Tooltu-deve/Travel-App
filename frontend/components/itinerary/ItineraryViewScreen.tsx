import React, { useState, useEffect, useRef, ReactNode, useMemo } from 'react';
import { useFavorites } from '@/contexts/FavoritesContext';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
  FlatList,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';


import { COLORS, SPACING } from '@/constants';
import {
  getRouteByIdAPI,
  enrichPlaceAPI,
  autocompletePlacesAPI,
} from '@/services/api';
import { API_BASE_URL } from '@/services/api';


// Import POIDetailBottomSheet thật
import POIDetailBottomSheet from '../place/POIDetailBottomSheet';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MIN_DISTANCE_THRESHOLD_METERS = 30;
const ROUTE_COLORS = { main: '#4DB8FF', transit: '#F44336' };

// Helper function to calculate distance between two coordinates
const calculateDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Types
interface Activity {
  name: string;
  location?: { lat: number; lng: number };
  place?: { location: { lat: number; lng: number }; placeID?: string };
  google_place_id?: string;
  placeID?: string;
  encoded_polyline?: string;
  travel_duration_minutes?: number;
  estimated_arrival?: string;
  estimated_departure?: string;
  steps?: any[];
  start_encoded_polyline?: string;
  start_travel_duration_minutes?: number;
}

interface DayPlan {
  day: number;
  activities: Activity[];
  day_start_time?: string;
  startLocationCoordinates?: { lat: number; lng: number };
  travel_mode?: string;
}

interface TravelRoute {
  route_id: string;
  destination: string;
  status: 'DRAFT' | 'CONFIRMED' | 'MAIN';
  route_data_json: any;
  start_location?: { lat: number; lng: number };
  start_location_text?: string;
}

// Custom itinerary DTO (partial) to support manual routes
interface CustomPlaceWithRoute {
  placeId: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  encoded_polyline?: string | null;
  travel_duration_minutes?: number | null;
  google_place_id?: string;
}

interface CustomDayWithRoutes {
  dayNumber?: number;
  day?: number;
  places: CustomPlaceWithRoute[];
  startLocationCoordinates?: { lat: number; lng: number };
}

interface CustomItineraryResponse {
  route_id?: string;
  user_id?: string;
  title?: string;
  destination?: string;
  status?: 'DRAFT' | 'CONFIRMED' | 'MAIN';
  start_date?: string;
  end_date?: string;
  start_location?: { lat: number; lng: number };
  start_location_text?: string;
  route_data_json?: any;
  days?: CustomDayWithRoutes[];
}

interface ItineraryViewScreenProps {
  visible: boolean;
  onClose: () => void;
  routeId: string;
  footerContent?: ReactNode;
  customRouteData?: CustomItineraryResponse | null; // manual/custom itinerary data
  isManual?: boolean;
  overlayContent?: ReactNode;
  onProgressUpdate?: () => void; // callback to refresh progress when visited changes
}

export const ItineraryViewScreen: React.FC<ItineraryViewScreenProps> = ({
  visible,
  onClose,
  routeId,
  footerContent,
  customRouteData = null,
  isManual = false,
  overlayContent,
  onProgressUpdate,
}) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [routeDetails, setRouteDetailsInternal] = useState<TravelRoute | CustomItineraryResponse | null>(
    customRouteData,
  );
  
  // Wrapper to log state changes
  const setRouteDetails = (newRouteDetails: TravelRoute | CustomItineraryResponse | null | ((prev: TravelRoute | CustomItineraryResponse | null) => TravelRoute | CustomItineraryResponse | null)) => {
    console.log('🔄 setRouteDetails called');
    if (typeof newRouteDetails === 'function') {
      setRouteDetailsInternal((prev) => {
        const result = newRouteDetails(prev);
        console.log('📊 RouteDetails updated (function):', {
          hadPrev: !!prev,
          hasResult: !!result,
          routeDataJson: !!(result as any)?.route_data_json,
          optimizedRoute: (result as any)?.route_data_json?.optimized_route?.length || 0,
        });
        return result;
      });
    } else {
      console.log('📊 RouteDetails updated (direct):', {
        hasRouteDetails: !!newRouteDetails,
        routeDataJson: !!(newRouteDetails as any)?.route_data_json,
        optimizedRoute: (newRouteDetails as any)?.route_data_json?.optimized_route?.length || 0,
      });
      setRouteDetailsInternal(newRouteDetails);
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayInternal, setSelectedDayInternal] = useState<number>(1);
  
  // Wrapper to log day changes
  const selectedDay = selectedDayInternal;
  const setSelectedDay = (day: number | ((prev: number) => number)) => {
    const newDay = typeof day === 'function' ? day(selectedDayInternal) : day;
    console.log('📅 Day changed:', selectedDayInternal, '->', newDay);
    setSelectedDayInternal(newDay);
  };
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [selectedPlaceData, setSelectedPlaceData] = useState<any>(null);
  const [isEnriching, setIsEnriching] = useState(false);

  // POI replacement modal state
  const [isReplacePOIModalVisible, setIsReplacePOIModalVisible] = useState(false);
  const [replacingPOI, setReplacingPOI] = useState<Activity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  
  // Add POI modal state
  const [isAddPOIModalVisible, setIsAddPOIModalVisible] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addAutocompleteResults, setAddAutocompleteResults] = useState<any[]>([]);
  const [isAddSearching, setIsAddSearching] = useState(false);
  const [addSessionToken, setAddSessionToken] = useState<string>('');
  const [isUsingFavorites, setIsUsingFavorites] = useState(false);
  const currentAddSearchRef = useRef<string>('');
  const [insertPosition, setInsertPosition] = useState<number>(-1); // -1 = cuối danh sách, 0 = đầu, 1 = sau POI thứ 1, etc.
  
  // Favorites from context
  const { favorites: favoritesPlaces, refreshFavorites } = useFavorites();
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  
  // Ref to track current search query to prevent stale searches from overriding favorites
  const currentSearchRef = useRef<string>('');

  // Visited activities state for MAIN routes
  const [visitedActivities, setVisitedActivities] = useState<Set<string>>(new Set());

  // Animation state for visit button
  const [animatingButtons, setAnimatingButtons] = useState<Set<string>>(new Set());

  // Track expanded opening hours
  const [expandedOpeningHours, setExpandedOpeningHours] = useState<Set<string>>(new Set());

  // Track enriched activities to avoid re-enriching - use ref to avoid dependency loop
  const enrichedActivitiesRef = useRef<Set<string>>(new Set());
  const enrichingInProgressRef = useRef<Set<string>>(new Set());
  // Trigger enrich when route changes
  const [refreshEnrichKey, setRefreshEnrichKey] = useState(0);

  // Sync custom route data (manual)
  useEffect(() => {
    if (customRouteData) {
      console.log('\n📝 [Frontend] Received customRouteData:', customRouteData);
      console.log('   - Has days:', !!customRouteData.days);
      console.log('   - Days count:', customRouteData.days?.length);
      
      if (customRouteData.days?.[0]?.places) {
        const firstPlace = customRouteData.days[0].places[0];
        console.log('   - First place of first day:', firstPlace?.name);
        console.log('   - First place start_encoded_polyline:', !!(firstPlace as any)?.start_encoded_polyline);
        console.log('   - First place start_travel_duration_minutes:', (firstPlace as any)?.start_travel_duration_minutes);
        console.log('   - First place encoded_polyline:', !!firstPlace?.encoded_polyline);
        console.log('   - First place travel_duration_minutes:', firstPlace?.travel_duration_minutes);
        
        const lastPlace = customRouteData.days[0].places[customRouteData.days[0].places.length - 1];
        console.log('   - Last place of first day:', lastPlace?.name);
        console.log('   - Last place encoded_polyline:', !!lastPlace?.encoded_polyline);
        console.log('   - Last place travel_duration_minutes:', lastPlace?.travel_duration_minutes);
      }
      // Reset enrich state and trigger enrich again
      enrichedActivitiesRef.current = new Set();
      enrichingInProgressRef.current = new Set();
      setRefreshEnrichKey(k => k + 1);
      setRouteDetails(customRouteData);
      setIsLoading(false);
      setError(null);
    }
  }, [customRouteData]);
  
  // Debug: Log when routeDetails changes
  useEffect(() => {
    if (routeDetails) {
      const routeData = (routeDetails as any).route_data_json || routeDetails;
      console.log('🔍 RouteDetails changed:', {
        hasRouteDetails: !!routeDetails,
        hasRouteDataJson: !!(routeDetails as any).route_data_json,
        optimizedRouteLength: routeData.optimized_route?.length || 0,
        selectedDay,
        currentDayDataExists: !!currentDayData,
      });
    }
  }, [routeDetails]);

  // Fetch AI route details when not provided externally
  useEffect(() => {
    if (!visible || !routeId || customRouteData) return;

    const fetchRouteDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setError('Vui lòng đăng nhập lại');
          return;
        }

        const response = await getRouteByIdAPI(token, routeId);
        // Reset enrich state and trigger enrich again
        enrichedActivitiesRef.current = new Set();
        enrichingInProgressRef.current = new Set();
        setRefreshEnrichKey(k => k + 1);
        setRouteDetails(response.route);
      } catch (err: any) {
        console.error('Error fetching route details:', err);
        setError(err.message || 'Không thể tải chi tiết lộ trình');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRouteDetails();
  }, [visible, routeId, customRouteData]);

  // Parse route data - with null safety (support manual/custom itinerary structure)
  const routeData = (routeDetails as any)?.route_data_json || (routeDetails as any) || {};
  const isManualRoute = isManual || !!customRouteData || Array.isArray(routeData?.days);

  // Normalize optimized_route: prefer existing optimized_route; fallback to days array from custom itinerary
  const optimizedRoute: DayPlan[] =
    routeData?.optimized_route ||
    (Array.isArray(routeData?.days)
      ? routeData.days.map((d: CustomDayWithRoutes, idx: number) => ({
          day: d.day ?? d.dayNumber ?? idx + 1,
          activities: (d.places || []).map((p) => {
            const activity = {
              name: p.name,
              location: p.location,
              google_place_id: (p as any).google_place_id || p.placeId,
              encoded_polyline: p.encoded_polyline || undefined,
              travel_duration_minutes:
                p.travel_duration_minutes != null ? Number(p.travel_duration_minutes) : undefined,
              estimated_arrival: (p as any).estimated_arrival,
              estimated_departure: (p as any).estimated_departure,
              start_encoded_polyline: (p as any).start_encoded_polyline || undefined,
              start_travel_duration_minutes: (p as any).start_travel_duration_minutes != null 
                ? Number((p as any).start_travel_duration_minutes) 
                : undefined,
            };
            return activity;
          }),
          day_start_time: (d as any).day_start_time,
        }))
      : []);
  
  // Log normalized route data
  if (optimizedRoute.length > 0 && routeDetails) {
    console.log('\n📋 [Frontend] Normalized optimizedRoute:');
    console.log('   - Total days:', optimizedRoute.length);
    optimizedRoute.forEach((day, dayIdx) => {
      console.log(`   Day ${day.day}:`);
      day.activities?.forEach((act, actIdx) => {
        console.log(`      POI ${actIdx} (${act.name}):`);
        if (actIdx === 0) {
          console.log(`         - start_encoded_polyline: ${!!(act as any).start_encoded_polyline}`);
          console.log(`         - start_travel_duration_minutes: ${(act as any).start_travel_duration_minutes ?? 'undefined'}`);
        }
        console.log(`         - encoded_polyline: ${!!act.encoded_polyline}`);
        console.log(`         - travel_duration_minutes: ${act.travel_duration_minutes ?? 'undefined'}`);
      });
    });
  }

  const totalDays = optimizedRoute.length || (routeDetails as any)?.duration_days || 1;

  // Start location (for start marker)
  const startLocation =
    (routeDetails as any)?.start_location ||
    routeData?.start_location ||
    routeData?.metadata?.start_location ||
    routeData?.startLocation ||
    // Fallback to first day's startLocationCoordinates if top-level is missing
    routeData?.days?.[0]?.startLocationCoordinates ||
    routeData?.startLocationCoordinates ||
    optimizedRoute?.[0]?.startLocationCoordinates ||
    null;

  // Get route status
  const status = (routeDetails as any)?.status;

  // Load visited activities for MAIN routes and handle route switching
  useEffect(() => {
    const handleMainRouteChange = async () => {
      if (status === 'MAIN' && routeId) {
        try {
          // Get the current main route ID
          const currentMainRouteId = await AsyncStorage.getItem('current_main_route_id');
          
          // If this route is newly promoted to MAIN
          if (currentMainRouteId !== routeId) {
            console.log('New MAIN route detected:', routeId, 'Previous:', currentMainRouteId);
            
            // Clear visited data of old main route
            if (currentMainRouteId) {
              const oldVisitedKey = `visited_${currentMainRouteId}`;
              await AsyncStorage.removeItem(oldVisitedKey);
              console.log('Cleared visited data for old MAIN route:', currentMainRouteId);
            }
            
            // Clear visited data of current route (fresh start)
            const visitedKey = `visited_${routeId}`;
            await AsyncStorage.removeItem(visitedKey);
            setVisitedActivities(new Set());
            
            // Set this route as current main
            await AsyncStorage.setItem('current_main_route_id', routeId);
            console.log('Reset visited data for new MAIN route:', routeId);
          } else {
            // Same main route, load existing visited data
            const visitedKey = `visited_${routeId}`;
            const visitedData = await AsyncStorage.getItem(visitedKey);
            if (visitedData) {
              const visitedArray: string[] = JSON.parse(visitedData);
              const visitedSet = new Set(visitedArray);
              setVisitedActivities(visitedSet);
            }
          }
        } catch (error) {
          console.error('Error handling main route change:', error);
        }
      } else if (status !== 'MAIN') {
        // Not a main route, clear visited state
        setVisitedActivities(new Set());
      }
    };

    handleMainRouteChange();
  }, [status, routeId]);

  // Get title
  const title =
    (routeDetails as any)?.title ||
    routeData?.summary?.title ||
    routeData?.metadata?.title ||
    `Lộ trình ${(routeDetails as any)?.destination || ''}`;

  // Get destination
  const destination =
    (routeDetails as any)?.destination ||
    routeData?.destination ||
    routeData?.city ||
    'Điểm đến';

  // Get start location name
  const startLocationName =
    (routeDetails as any)?.start_location_text ||
    routeData?.start_location_text ||
    'Điểm bắt đầu';

  // Format time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  // Calculate duration
  const calculateDuration = (arrival?: string, departure?: string) => {
    if (!arrival || !departure) return null;
    const diff = new Date(departure).getTime() - new Date(arrival).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
  };

  // Decode polyline
  const decodePolyline = (encoded?: string) => {
    if (!encoded) return [];
    const points: { latitude: number; longitude: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  // Get current day activities - use useMemo to prevent creating new array reference on every render
  const currentDayData = useMemo(
    () => {
      console.log('🔄 Recalculating currentDayData:', {
        hasOptimizedRoute: !!optimizedRoute,
        isArray: Array.isArray(optimizedRoute),
        selectedDay,
        routeLength: optimizedRoute?.length,
      });
      
      if (!optimizedRoute || !Array.isArray(optimizedRoute)) {
        console.warn('⚠️ optimizedRoute is not valid');
        return undefined;
      }
      
      const dayData = optimizedRoute.find((d: DayPlan) => d?.day === selectedDay);
      console.log('🔍 Found dayData:', {
        found: !!dayData,
        hasActivities: !!dayData?.activities,
        activitiesLength: dayData?.activities?.length,
      });
      
      return dayData;
    },
    [optimizedRoute, selectedDay, routeDetails]
  );
  const activities: Activity[] = useMemo(
    () => {
      try {
        console.log('🔄 Recalculating activities for day:', selectedDay);
        if (!currentDayData) {
          console.warn('⚠️ currentDayData is null/undefined');
          return [];
        }
        if (!currentDayData.activities) {
          console.warn('⚠️ currentDayData.activities is null/undefined');
          return [];
        }
        if (!Array.isArray(currentDayData.activities)) {
          console.warn('⚠️ currentDayData.activities is not an array:', typeof currentDayData.activities);
          return [];
        }
        console.log('✅ Activities loaded:', currentDayData.activities.length);
        return currentDayData.activities;
      } catch (error) {
        console.error('❌ Error in activities useMemo:', error);
        return [];
      }
    },
    [currentDayData, selectedDay]
  );

  // Auto-enrich disabled - Opening hours will only be fetched when user taps on activity
  // useEffect(() => {
  //   const enrichCurrentDayActivities = async () => {
  //     // ... auto-enrich logic removed to avoid unnecessary API calls
  //   };
  //   enrichCurrentDayActivities();
  // }, [selectedDay, activities.length, routeDetails?.route_id, refreshEnrichKey]);

  // Convert to map coordinate
  const toMapCoordinate = (point?: { lat: number; lng: number } | { coordinates: [number, number] }) => {
    if (!point) return null;
    if ('lat' in point) {
      return { latitude: point.lat, longitude: point.lng };
    }
    if ('coordinates' in point) {
      return { latitude: point.coordinates[1], longitude: point.coordinates[0] };
    }
    return null;
  };

  // Calculate map region
  const calculateMapRegion = (
    activities: Activity[],
    center?: { lat: number; lng: number },
  ) => {
    if ((!activities || activities.length === 0) && !center) return null;

    const coords = activities
      .map((a) => a.location || a.place?.location)
      .filter(Boolean)
      .map(toMapCoordinate)
      .filter(Boolean) as { latitude: number; longitude: number }[];

    if (center) {
      const c = toMapCoordinate(center);
      if (c) coords.push(c);
    }

    if (coords.length === 0) return null;

    const latitudes = coords.map((c) => c.latitude);
    const longitudes = coords.map((c) => c.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = (maxLat - minLat) * 1.5 || 0.01;
    const lngDelta = (maxLng - minLng) * 1.5 || 0.01;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  // Toggle visited activity for MAIN routes
  const toggleVisited = async (day: number, activityIndex: number) => {
    if (status !== 'MAIN' || !routeId) return;

    const activityKey = `${day}-${activityIndex}`;

    // Trigger animation
    setAnimatingButtons(prev => new Set(prev).add(activityKey));
    setTimeout(() => {
      setAnimatingButtons(prev => {
        const newSet = new Set(prev);
        newSet.delete(activityKey);
        return newSet;
      });
    }, 300);

    const newVisited = new Set(visitedActivities);
    if (newVisited.has(activityKey)) {
      newVisited.delete(activityKey);
    } else {
      newVisited.add(activityKey);
    }
    setVisitedActivities(newVisited);

    // Save to AsyncStorage
    try {
      const visitedKey = `visited_${routeId}`;
      await AsyncStorage.setItem(visitedKey, JSON.stringify([...newVisited]));
      // Trigger progress update callback
      if (onProgressUpdate) {
        onProgressUpdate();
      }
    } catch (error) {
      console.error('Error saving visited activities:', error);
    }
  };

  // Route segments for polylines (bao gồm đoạn từ điểm bắt đầu đến POI đầu tiên nếu có)
    const routeSegments = (() => {
      console.log('\n🗺️ [Frontend] Building route segments for map...');
      console.log('   - Start location:', startLocation);
      console.log('   - Activities count:', activities.length);
      
      // Build a single ordered route: Start -> POI1 -> POI2 -> ...
      const fullPoints: { latitude: number; longitude: number }[] = [];

      const pushIfNew = (pt?: { latitude: number; longitude: number }) => {
        if (!pt) return;
        const last = fullPoints[fullPoints.length - 1];
        if (!last || last.latitude !== pt.latitude || last.longitude !== pt.longitude) {
          fullPoints.push(pt);
        }
      };

      // Start -> first POI (ensure route begins at explicit start coord then follows encoded segment or direct line)
      if (startLocation && activities.length > 0) {
        const startCoord = toMapCoordinate(startLocation as any);
        if (activities[0]?.start_encoded_polyline) {
          const decoded = decodePolyline(activities[0].start_encoded_polyline);
          console.log('   ✅ Using start_encoded_polyline with', decoded.length, 'points');
          // Prepend explicit start coordinate when available to guarantee Start -> POI order
          if (startCoord) pushIfNew(startCoord);
          decoded.forEach(p => pushIfNew({ latitude: p.latitude, longitude: p.longitude }));
        } else {
          const firstCoord = toMapCoordinate(activities[0]?.location as any);
          if (startCoord) pushIfNew(startCoord);
          if (firstCoord) pushIfNew(firstCoord);
          if (!startCoord || !firstCoord) console.log('   ⚠️ Missing start or first POI coordinates for fallback');
        }
      } else if (activities.length > 0 && activities[0]?.location) {
        pushIfNew(toMapCoordinate(activities[0].location as any) as any);
      }

      // Append each activity's encoded_polyline or its coordinate
      activities.forEach((activity, idx) => {
        if (activity.encoded_polyline) {
          const decoded = decodePolyline(activity.encoded_polyline);
          if (decoded.length > 0) {
            console.log(`   ✅ Appending encoded_polyline for activity ${idx} (${activity.name}) with ${decoded.length} points`);
            decoded.forEach(p => pushIfNew({ latitude: p.latitude, longitude: p.longitude }));
            return;
          }
        }
        const coord = toMapCoordinate(activity.location as any);
        if (coord) pushIfNew(coord);
      });

      if (fullPoints.length > 1) {
        console.log('   📊 Simplified route created with', fullPoints.length, 'points');
        return [{ points: fullPoints, mode: 'DRIVE' }];
      }

      console.log('   ⚠️ Not enough points to build simplified route');
      return [];
    })();

  // Update map region when day changes
  useEffect(() => {
    const region = calculateMapRegion(activities, startLocation);
    if (region) {
      setMapRegion((prev) => {
        // Chỉ update nếu region thực sự thay đổi (tránh vòng lặp)
        if (
          !prev ||
          Math.abs(prev.latitude - region.latitude) > 0.0001 ||
          Math.abs(prev.longitude - region.longitude) > 0.0001 ||
          Math.abs(prev.latitudeDelta - region.latitudeDelta) > 0.0001 ||
          Math.abs(prev.longitudeDelta - region.longitudeDelta) > 0.0001
        ) {
          mapRef.current?.animateToRegion(region, 500);
          return region;
        }
        return prev;
      });
    }
  }, [selectedDay, activities, startLocation]);

  // Fit to markers
  const handleFitToMarkers = () => {
    const coords = [
      ...(startLocation ? [toMapCoordinate(startLocation)] : []),
      ...activities
      .map((a) => a.location || a.place?.location)
      .filter(Boolean)
        .map(toMapCoordinate),
    ].filter(Boolean) as { latitude: number; longitude: number }[];

    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  // Handle activity press - enrich and show detail
  const handleActivityPress = async (activity: Activity) => {
    const placeId = activity.google_place_id;
    if (!placeId) {
      Alert.alert('Thông báo', 'Địa điểm này chưa có Google Place ID.');
      return;
    }

    setIsEnriching(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để xem chi tiết địa điểm.');
        setIsEnriching(false);
        return;
      }

      // Enrich place data
      const response = await enrichPlaceAPI(token, placeId, false);
      
      // Kiểm tra response có lỗi không
      if (response?.statusCode || response?.error || (response?.message && response.message.includes('invalid'))) {
        const errorMessage = response.message || response.error?.message || 'Lỗi khi lấy thông tin địa điểm từ Google Places API';
        console.error('Enrich API error:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // Backend trả về { message: '...', data: {...} }
      const enrichedData = response?.data || response;
      
      if (!enrichedData) {
        throw new Error('Không nhận được dữ liệu từ server');
      }

      // Map photos - đảm bảo structure đúng
      const photosArray = Array.isArray(enrichedData.photos) 
        ? enrichedData.photos.map((photo: any) => ({
            name: photo.name,
            widthPx: photo.widthPx,
            heightPx: photo.heightPx,
            authorAttributions: photo.authorAttributions || [],
          }))
        : [];

      // Map to bottom sheet format
      const mappedPlaceData = {
        _id: enrichedData.googlePlaceId || placeId,
        googlePlaceId: enrichedData.googlePlaceId || placeId,
        name: enrichedData.name || activity.name || 'Không có tên',
        address: enrichedData.address || enrichedData.formatted_address || '',
        formatted_address: enrichedData.address || enrichedData.formatted_address || '',
        description: enrichedData.description || enrichedData.editorialSummary || '',
        editorialSummary: enrichedData.editorialSummary || '',
        rating: enrichedData.rating || 0,
        user_ratings_total: enrichedData.reviews?.length || enrichedData.user_ratings_total || 0,
        contactNumber: enrichedData.contactNumber || enrichedData.phone || '',
        phone: enrichedData.contactNumber || enrichedData.phone || '',
        websiteUri: enrichedData.websiteUri || enrichedData.website || '',
        website: enrichedData.websiteUri || enrichedData.website || '',
        photos: photosArray,
        reviews: (enrichedData.reviews || []).map((review: any) => ({
          authorName: review.authorAttributions?.[0]?.displayName || 
                     review.authorAttributions?.displayName || 
                     review.authorName ||
                     'Người dùng ẩn danh',
          rating: review.rating || 0,
          text: review.text || '',
          relativePublishTimeDescription: review.relativePublishTimeDescription || review.publishTime || '',
          publishTime: review.relativePublishTimeDescription || review.publishTime || '',
          authorAttributions: review.authorAttributions || [],
        })),
        type: enrichedData.type || '',
        types: enrichedData.types || [],
        location: enrichedData.location || activity.location,
        openingHours: enrichedData.openingHours || enrichedData.opening_hours || 
          (enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions ? {
            weekdayDescriptions: enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions
          } : null),
        priceLevel: enrichedData.priceLevel || enrichedData.price_level || null,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
      
      // Cập nhật lại tên POI trong routeDetails với tên tiếng Việt từ enriched data
      if (enrichedData.name && routeDetails) {
        const updatedRouteDetails = JSON.parse(JSON.stringify(routeDetails)); // Deep clone
        const routeDataToUpdate = updatedRouteDetails.route_data_json || updatedRouteDetails;
        
        // Normalize placeId để so sánh (có thể có hoặc không có prefix "places/")
        const normalizedPlaceId = placeId.replace(/^places\//, '');
        const enrichedPlaceId = (enrichedData.googlePlaceId || '').replace(/^places\//, '');
        
        // Tìm và cập nhật trong optimized_route
        if (routeDataToUpdate.optimized_route && Array.isArray(routeDataToUpdate.optimized_route)) {
          routeDataToUpdate.optimized_route.forEach((day: DayPlan) => {
            if (day.activities && Array.isArray(day.activities)) {
              day.activities.forEach((act: Activity) => {
                const actPlaceId = (act.google_place_id || '').replace(/^places\//, '');
                if (actPlaceId === normalizedPlaceId || actPlaceId === enrichedPlaceId) {
                  act.name = enrichedData.name;
                  // Lưu thông tin giờ mở cửa vào activity với fallback
                  (act as any).openingHours = enrichedData.openingHours || enrichedData.opening_hours || 
                    (enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions ? {
                      weekdayDescriptions: enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions
                    } : null);
                }
              });
            }
          });
        }
        
        // Tìm và cập nhật trong days (custom itinerary)
        if (routeDataToUpdate.days && Array.isArray(routeDataToUpdate.days)) {
          routeDataToUpdate.days.forEach((day: CustomDayWithRoutes) => {
            if (day.places && Array.isArray(day.places)) {
              day.places.forEach((place: CustomPlaceWithRoute) => {
                const placeIdToMatch = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
                if (placeIdToMatch === normalizedPlaceId || placeIdToMatch === enrichedPlaceId) {
                  place.name = enrichedData.name;
                  // Lưu thông tin giờ mở cửa vào place với fallback
                  (place as any).openingHours = enrichedData.openingHours || enrichedData.opening_hours || 
                    (enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions ? {
                      weekdayDescriptions: enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions
                    } : null);
                }
              });
            }
          });
        }
        
        if (updatedRouteDetails.route_data_json) {
          updatedRouteDetails.route_data_json = routeDataToUpdate;
        } else {
          Object.assign(updatedRouteDetails, routeDataToUpdate);
        }
        
        setRouteDetails(updatedRouteDetails);
        console.log(`✅ Đã cập nhật tên POI thành tiếng Việt: ${enrichedData.name}`);
      }
    } catch (err: any) {
      console.error('Error enriching place:', err);
      Alert.alert('Lỗi', err.message || 'Không thể tải thông tin địa điểm');
    } finally {
      setIsEnriching(false);
    }
  };

  // Reset session token khi đóng modal (bắt đầu phiên tìm kiếm mới)
  useEffect(() => {
    if (!isReplacePOIModalVisible) {
      // Reset session token khi đóng modal để bắt đầu phiên mới
      setSessionToken('');
      setAutocompleteResults([]);
      setSearchQuery('');
    }
  }, [isReplacePOIModalVisible]);
  
  // Reset Add POI modal session token khi đóng
  useEffect(() => {
    if (!isAddPOIModalVisible) {
      setAddSessionToken('');
      setAddAutocompleteResults([]);
      setAddSearchQuery('');
    }
  }, [isAddPOIModalVisible]);

  // Debounced search for autocomplete
  useEffect(() => {
    if (!isReplacePOIModalVisible) {
      return;
    }

    // Update current search ref
    currentSearchRef.current = searchQuery;

    // Khi xóa hết text → Kết thúc session cũ, tạo session mới, hiển thị favorites NGAY LẬP TỨC
    if (!searchQuery.trim()) {
      // Tạo session token mới (bắt đầu phiên tìm kiếm mới)
      const newSessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      console.log('🆕 Session ended. Created new session token:', newSessionToken);
      setSessionToken(newSessionToken);
      
      // Transform favorites to match autocomplete format
      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
        placeId: fav.googlePlaceId || fav.placeId || fav.id,
        googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
        text: fav.name,
        name: fav.name,
        address: fav.address || fav.formatted_address || '',
        description: fav.address || fav.formatted_address || '',
        structuredFormat: {
          mainText: fav.name,
          secondaryText: fav.address || fav.formatted_address || '',
        },
        rating: fav.rating,
        isFavorite: true,
      }));
      
      console.log('💖 Showing favorites:', transformedFavorites.length, 'items');
      setAutocompleteResults(transformedFavorites);
      setIsSearching(false); // Đảm bảo không hiển thị loading
      return; // QUAN TRỌNG: Return ngay để không chạy debounce và không bị timeout cũ override
    }

    // Khi có nhập, gọi API tìm kiếm và đánh dấu favorites
    const timeoutId = setTimeout(async () => {
      const searchQuerySnapshot = searchQuery; // Capture search query at the time of API call
      setIsSearching(true);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        // Sử dụng session token trong API call
        const response = await autocompletePlacesAPI(
          searchQuerySnapshot.trim(), 
          sessionToken || undefined, 
          destination, 
          token
        );
        
        // ⚠️ CRITICAL: Check if search query has changed - nếu đã xóa hết thì không update
        if (currentSearchRef.current !== searchQuerySnapshot) {
          console.log('⏭️ Search query changed, ignoring stale results');
          return;
        }
        
        const predictionsRaw = Array.isArray(response)
          ? response
          : response.predictions || response.suggestions || [];
        
        const normalized = (predictionsRaw || []).slice(0, 5).map((p: any) => {
          const placeId = p.place_id || p.placeId;
          const normalizedPlaceId = placeId?.replace(/^places\//, '');
          
          // Kiểm tra xem placeId có trong favorites không
          const isFavorite = favoritesPlaces.some(fav => {
            const favPlaceId = (fav.googlePlaceId || fav.placeId)?.replace(/^places\//, '');
            return favPlaceId && normalizedPlaceId && favPlaceId === normalizedPlaceId;
          });
          
          // Backend returns { description, place_id, structured_formatting }
          if (p.place_id && p.description) {
            return {
              placeId: p.place_id,
              text: p.description,
              structuredFormat: {
                mainText: p.structured_formatting?.main_text,
                secondaryText: p.structured_formatting?.secondary_text,
              },
              isFavorite, // Đánh dấu nếu là favorite
            };
          }
          // Fallback: keep original shape (Google suggestions)
          return {
            placeId: p.placeId || p.place_id,
            text: p.text?.text || p.text || p.description,
            structuredFormat: {
              mainText: p.structuredFormat?.mainText || p.structured_formatting?.main_text,
              secondaryText: p.structuredFormat?.secondaryText || p.structured_formatting?.secondary_text,
            },
            isFavorite, // Đánh dấu nếu là favorite
          };
        });
        
        // 🔍 Filter favorites that match search query
        const searchLower = searchQuerySnapshot.toLowerCase().trim();
        const matchedFavorites = favoritesPlaces
          .filter((fav: any) => {
            const name = fav.name?.toLowerCase() || '';
            const address = (fav.address || fav.formatted_address || '').toLowerCase();
            return name.includes(searchLower) || address.includes(searchLower);
          })
          .map((fav: any) => {
            const favPlaceId = fav.googlePlaceId || fav.placeId || fav.id;
            const normalizedFavPlaceId = favPlaceId?.replace(/^places\//, '');
            
            // Check if already in API results
            const alreadyInResults = normalized.some((item: any) => {
              const itemPlaceId = (item.placeId || '')?.replace(/^places\//, '');
              return itemPlaceId === normalizedFavPlaceId;
            });
            
            // Only add if not already in results
            if (!alreadyInResults) {
              return {
                placeId: favPlaceId,
                googlePlaceId: favPlaceId,
                text: fav.name,
                name: fav.name,
                address: fav.address || fav.formatted_address || '',
                description: fav.address || fav.formatted_address || '',
                structuredFormat: {
                  mainText: fav.name,
                  secondaryText: fav.address || fav.formatted_address || '',
                },
                rating: fav.rating,
                isFavorite: true,
              };
            }
            return null;
          })
          .filter(Boolean); // Remove nulls
        
        // Combine: matched favorites first, then API results
        const combined = [...matchedFavorites, ...normalized];
        
        console.log(`🔍 Search "${searchQuerySnapshot}": ${matchedFavorites.length} matched favorites + ${normalized.length} API results`);
        setAutocompleteResults(combined);
      } catch (error: any) {
        console.error('Autocomplete error:', error);
        setAutocompleteResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
    // ⚠️ KHÔNG thêm sessionToken vào dependency array để tránh infinite loop:
    // - Nếu thêm sessionToken → useEffect chạy → setSessionToken → sessionToken thay đổi → useEffect chạy lại → vòng lặp!
    // - Session token chỉ cần được tạo khi searchQuery thay đổi (xóa hết text)
  }, [searchQuery, isReplacePOIModalVisible, favoritesPlaces, destination]);
  
  // Debounced search for Add POI autocomplete
  useEffect(() => {
    if (!isAddPOIModalVisible) {
      return;
    }

    currentAddSearchRef.current = addSearchQuery;

    if (!addSearchQuery.trim()) {
      const newSessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      console.log('🆕 Add POI session ended. Created new session token:', newSessionToken);
      setAddSessionToken(newSessionToken);
      
      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
        placeId: fav.googlePlaceId || fav.placeId || fav.id,
        googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
        text: fav.name,
        name: fav.name,
        address: fav.address || fav.formatted_address || '',
        description: fav.address || fav.formatted_address || '',
        structuredFormat: {
          mainText: fav.name,
          secondaryText: fav.address || fav.formatted_address || '',
        },
        rating: fav.rating,
        isFavorite: true,
      }));
      
      console.log('💖 Showing favorites in Add POI modal:', transformedFavorites.length, 'items');
      setAddAutocompleteResults(transformedFavorites);
      setIsAddSearching(false);
      return;
    }
    
    // Nếu bật favorites mode, chỉ tìm trong favorites
    if (isUsingFavorites) {
      const filtered = favoritesPlaces
        .filter((fav: any) => 
          fav.name?.toLowerCase().includes(addSearchQuery.toLowerCase()) ||
          fav.address?.toLowerCase().includes(addSearchQuery.toLowerCase())
        )
        .map((fav: any) => ({
          placeId: fav.googlePlaceId || fav.placeId || fav.id,
          googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
          text: fav.name,
          name: fav.name,
          address: fav.address || fav.formatted_address || '',
          description: fav.address || fav.formatted_address || '',
          structuredFormat: {
            mainText: fav.name,
            secondaryText: fav.address || fav.formatted_address || '',
          },
          rating: fav.rating,
          isFavorite: true,
        }));
      setAddAutocompleteResults(filtered);
      setIsAddSearching(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      const searchQuerySnapshot = addSearchQuery;
      setIsAddSearching(true);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const response = await autocompletePlacesAPI(
          searchQuerySnapshot.trim(), 
          addSessionToken || undefined, 
          destination, 
          token
        );
        
        if (currentAddSearchRef.current !== searchQuerySnapshot) {
          console.log('⚠️ Search query changed, ignoring stale Add POI results');
          return;
        }
        
        const predictionsRaw = Array.isArray(response)
          ? response
          : response.predictions || response.suggestions || [];
        
        const favoritePlaceIds = new Set(favoritesPlaces.map((fav: any) => 
          (fav.googlePlaceId || fav.placeId || fav.id || '').replace(/^places\//, '')
        ));
        
        const predictions = predictionsRaw.map((pred: any) => {
          const placeId = (pred.placeId || pred.place_id || '').replace(/^places\//, '');
          const isFavorite = favoritePlaceIds.has(placeId);
          
          return {
            placeId: pred.placeId || pred.place_id,
            googlePlaceId: pred.placeId || pred.place_id,
            text: pred.text?.text || pred.text || pred.description,
            name: pred.text?.text || pred.text || pred.description,
            address: pred.structuredFormat?.secondaryText || '',
            description: pred.structuredFormat?.secondaryText || '',
            structuredFormat: pred.structuredFormat || {
              mainText: pred.text?.text || pred.text || pred.description,
              secondaryText: pred.structuredFormat?.secondaryText || '',
            },
            isFavorite,
          };
        });
        
        setAddAutocompleteResults(predictions);
      } catch (error: any) {
        console.error('Add POI autocomplete error:', error);
      } finally {
        setIsAddSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [addSearchQuery, isAddPOIModalVisible, favoritesPlaces, destination]);

  // Handle replace POI button press
  const handleReplacePOI = async (activity: Activity, event: any) => {
    event.stopPropagation();
    setReplacingPOI(activity);
    setSearchQuery('');
    // Luôn đồng bộ favorites từ context (có thể gọi refreshFavorites nếu muốn đảm bảo mới nhất)
    // Transform favorites to match autocomplete format
    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
      placeId: fav.googlePlaceId || fav.placeId || fav.id,
      googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
      text: fav.name,
      name: fav.name,
      address: fav.address || fav.formatted_address || '',
      description: fav.address || fav.formatted_address || '',
      structuredFormat: {
        mainText: fav.name,
        secondaryText: fav.address || fav.formatted_address || '',
      },
      rating: fav.rating,
      isFavorite: true,
    }));
    setAutocompleteResults(transformedFavorites);
    setIsReplacePOIModalVisible(true);
  };
  
  // Handle add POI button press
  const handleAddPOI = () => {
    setAddSearchQuery('');
    setIsUsingFavorites(false);
    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
      placeId: fav.googlePlaceId || fav.placeId || fav.id,
      googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
      text: fav.name,
      name: fav.name,
      address: fav.address || fav.formatted_address || '',
      description: fav.address || fav.formatted_address || '',
      structuredFormat: {
        mainText: fav.name,
        secondaryText: fav.address || fav.formatted_address || '',
      },
      rating: fav.rating,
      isFavorite: true,
    }));
    setAddAutocompleteResults(transformedFavorites);
    setInsertPosition(-1); // Reset về cuối danh sách
    setIsAddPOIModalVisible(true);
  };
  
  // Toggle favorites mode for Add POI
  const toggleAddFavoritesMode = async () => {
    if (isUsingFavorites) {
      // Tắt favorites mode, hiện tất cả
      setIsUsingFavorites(false);
      setAddSearchQuery('');
      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
        placeId: fav.googlePlaceId || fav.placeId || fav.id,
        googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
        text: fav.name,
        name: fav.name,
        address: fav.address || fav.formatted_address || '',
        description: fav.address || fav.formatted_address || '',
        structuredFormat: {
          mainText: fav.name,
          secondaryText: fav.address || fav.formatted_address || '',
        },
        rating: fav.rating,
        isFavorite: true,
      }));
      setAddAutocompleteResults(transformedFavorites);
    } else {
      // Bật favorites mode
      setIsUsingFavorites(true);
      setAddSearchQuery('');
      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
        placeId: fav.googlePlaceId || fav.placeId || fav.id,
        googlePlaceId: fav.googlePlaceId || fav.placeId || fav.id,
        text: fav.name,
        name: fav.name,
        address: fav.address || fav.formatted_address || '',
        description: fav.address || fav.formatted_address || '',
        structuredFormat: {
          mainText: fav.name,
          secondaryText: fav.address || fav.formatted_address || '',
        },
        rating: fav.rating,
        isFavorite: true,
      }));
      setAddAutocompleteResults(transformedFavorites);
    }
  };

  // Handle delete POI
  const handleDeletePOI = async (activity: any, dayIndex: number, activityIndex: number, event: any) => {
    event?.stopPropagation();
    Alert.alert(
      'Xóa địa điểm',
      `Bạn có chắc chắn muốn xóa "${activity.name || 'địa điểm này'}" khỏi lộ trình?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            if (!routeDetails) return;

            try {
              setIsUpdatingRoute(true);
              
              const token = await AsyncStorage.getItem('userToken');
              if (!token) {
                Alert.alert('Lỗi', 'Bạn cần đăng nhập để xóa địa điểm.');
                setIsUpdatingRoute(false);
                return;
              }

              // Deep clone routeData (giữ nguyên destination, duration_days, start_datetime, metadata)
              const routeData = (routeDetails as any).route_data_json || routeDetails;
              const updatedRoute = JSON.parse(JSON.stringify(routeData));

              // Xóa POI trong optimized_route (AI route)
              if (updatedRoute.optimized_route && Array.isArray(updatedRoute.optimized_route)) {
                updatedRoute.optimized_route.forEach((day: any, idx: number) => {
                  if (day.day === dayIndex && day.activities) {
                    day.activities.splice(activityIndex, 1);
                  }
                  // Ensure required fields
                  if (!day.travel_mode) day.travel_mode = 'driving';
                  if (!day.day_start_time) day.day_start_time = '09:00:00';
                  if (day.day === undefined) day.day = idx + 1;
                });
              }

              // Xóa POI trong days (custom itinerary)
              if (updatedRoute.days && Array.isArray(updatedRoute.days)) {
                updatedRoute.days.forEach((day: any) => {
                  const dayNum = day.day ?? day.dayNumber;
                  if (dayNum === dayIndex && day.places) {
                    day.places.splice(activityIndex, 1);
                  }
                });
              }

              // Call API
              const response = await fetch(`${API_BASE_URL}/api/v1/itineraries/custom-route`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  route: {
                    route_id: (routeDetails as any).route_id,
                    start_location:
                      (routeDetails as any).start_location ||
                      routeData.start_location ||
                      routeData.metadata?.start_location ||
                      undefined,
                    route_data_json: updatedRoute,
                  },
                  message: 'Xóa địa điểm khỏi lộ trình',
                }),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Network error' }));
                throw new Error(errorData.message || 'Không thể cập nhật lộ trình');
              }

              const result = await response.json();
              if (result.route) {
                // Validate backend response structure
                console.log('🔍 Validating backend response for delete...');
                if (!result.route.route_data_json) {
                  throw new Error('Backend không trả về route_data_json');
                }
                
                const routeDataJson = result.route.route_data_json;
                console.log('🔍 route_data_json type:', typeof routeDataJson);
                
                // Parse if it's string
                let parsedRouteData = routeDataJson;
                if (typeof routeDataJson === 'string') {
                  try {
                    parsedRouteData = JSON.parse(routeDataJson);
                    console.log('✅ Parsed route_data_json from string');
                  } catch (e) {
                    console.error('❌ Failed to parse route_data_json:', e);
                    throw new Error('Dữ liệu lộ trình không hợp lệ');
                  }
                }
                
                // Validate optimized_route structure
                if (!parsedRouteData.optimized_route || !Array.isArray(parsedRouteData.optimized_route)) {
                  console.error('❌ Invalid optimized_route structure:', parsedRouteData);
                  throw new Error('Cấu trúc dữ liệu lộ trình không hợp lệ');
                }
                
                // Ensure all days have activities array
                parsedRouteData.optimized_route.forEach((day: any, idx: number) => {
                  if (!day.activities) {
                    console.warn(`⚠️ Day ${idx + 1} missing activities, initializing empty array`);
                    day.activities = [];
                  } else if (!Array.isArray(day.activities)) {
                    console.warn(`⚠️ Day ${idx + 1} activities is not array, converting:`, day.activities);
                    day.activities = [];
                  }
                });
                
                console.log('✅ Validation passed. Days:', parsedRouteData.optimized_route.length);
                
                const mergedRoute = {
                  ...result.route,
                  route_data_json: parsedRouteData,
                  start_location:
                    result.route.start_location ||
                    (routeDetails as any)?.start_location ||
                    routeData.start_location ||
                    null,
                };
                
                // Reset enrich state
                enrichedActivitiesRef.current = new Set();
                enrichingInProgressRef.current = new Set();
                setRefreshEnrichKey(k => k + 1);
                
                setRouteDetails(mergedRoute);
                Alert.alert('Thành công', 'Đã xóa địa điểm khỏi lộ trình');
              }
            } catch (error: any) {
              console.error('❌ Error deleting POI:', error);
              Alert.alert('Lỗi', error.message || 'Không thể xóa địa điểm');
            } finally {
              setIsUpdatingRoute(false);
            }
          },
        },
      ]
    );
  };



  // Toggle opening hours expansion
  const toggleOpeningHours = (activityKey: string) => {
    setExpandedOpeningHours(prev => {
      const newSet = new Set(prev);
      if (newSet.has(activityKey)) {
        newSet.delete(activityKey);
      } else {
        newSet.add(activityKey);
      }
      return newSet;
    });
  };

  // Render right actions for swipe (edit and delete buttons)
  const renderRightActions = (index: number) => () => {
    return (
      <View style={styles.swipeActionsContainer}>
        {/* Edit Button */}
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeEditButton]}
          onPress={() => {
            // Handle edit action - show place replacement modal
            const activity = activities[index];
            if (activity) {
              handleActivityPress(activity);
            }
          }}
        >
          <FontAwesome name="pencil" size={20} color={COLORS.textWhite} />
        </TouchableOpacity>

        {/* Delete Button */}
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeDeleteButton]}
          onPress={(event) => {
            // Handle delete action
            const activity = activities[index];
            if (activity) {
              handleDeletePOI(activity, selectedDay, index, event);
            }
          }}
        >
          <FontAwesome name="trash-o" size={20} color={COLORS.textWhite} />
        </TouchableOpacity>
      </View>
    );
  };



  // Handle select new POI from autocomplete
  const handleSelectNewPOI = async (suggestion: any) => {
    if (!replacingPOI || !routeDetails) {
      return;
    }

    // Lấy placeId từ suggestion (hỗ trợ cả favorites và autocomplete)
    const placeId = suggestion.googlePlaceId || suggestion.placeId || suggestion.place_id;
    if (!placeId) {
      Alert.alert('Lỗi', 'Không tìm thấy Place ID.');
      return;
    }

    // Chuẩn hoá Place ID để so sánh
    const normalizedNewPlaceId = (placeId || '').replace(/^places\//, '');
    const oldNormalizedPlaceId = (replacingPOI.google_place_id || '').replace(/^places\//, '');

    // Kiểm tra địa điểm mới có trùng với địa điểm đang thay thế không
    if (normalizedNewPlaceId === oldNormalizedPlaceId) {
      Alert.alert(
        'Địa điểm trùng lặp',
        'Địa điểm bạn chọn trùng với địa điểm hiện tại. Vui lòng chọn địa điểm khác.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsUpdatingRoute(true);
    
    // Tìm index của địa điểm đang được thay thế
    const routeData = (routeDetails as any).route_data_json || routeDetails;
    let replacingIndex = -1;
    
    // Tìm trong optimized_route (AI route)
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      const currentDay = routeData.optimized_route.find((d: any) => d.day === selectedDay);
      if (currentDay?.activities && Array.isArray(currentDay.activities)) {
        replacingIndex = currentDay.activities.findIndex((act: any) => {
          const actNorm = (act.google_place_id || '').replace(/^places\//, '');
          return actNorm === oldNormalizedPlaceId;
        });
      }
    }
    
    // Tìm trong days (custom itinerary)
    if (replacingIndex === -1 && routeData.days && Array.isArray(routeData.days)) {
      const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === selectedDay);
      if (currentDay?.places && Array.isArray(currentDay.places)) {
        replacingIndex = currentDay.places.findIndex((place: any) => {
          const placeNorm = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
          return placeNorm === oldNormalizedPlaceId;
        });
      }
    }
    
    // Kiểm tra địa điểm mới có trùng place_id với địa điểm khác không (chỉ kiểm tra trong ngày đang chọn)
    let existingPlaceName = '';
    let existingPlaceId = '';
    let existingPlaceIndex = -1;

    // Kiểm tra trùng place_id trong optimized_route (AI route)
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      const currentDay = routeData.optimized_route.find((d: any) => d.day === selectedDay);
      if (currentDay?.activities && Array.isArray(currentDay.activities)) {
        for (let i = 0; i < currentDay.activities.length; i++) {
          const act = currentDay.activities[i];
          const actNorm = (act.google_place_id || '').replace(/^places\//, '');
          if (actNorm === normalizedNewPlaceId && actNorm !== oldNormalizedPlaceId) {
            existingPlaceName = act.name || 'Địa điểm này';
            existingPlaceId = actNorm;
            existingPlaceIndex = i;
            break;
          }
        }
      }
    }

    // Kiểm tra trùng place_id trong days (custom itinerary)
    if (!existingPlaceId && routeData.days && Array.isArray(routeData.days)) {
      const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === selectedDay);
      if (currentDay?.places && Array.isArray(currentDay.places)) {
        for (let i = 0; i < currentDay.places.length; i++) {
          const place = currentDay.places[i];
          const placeNorm = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
          if (placeNorm === normalizedNewPlaceId && placeNorm !== oldNormalizedPlaceId) {
            existingPlaceName = place.name || 'Địa điểm này';
            existingPlaceId = placeNorm;
            existingPlaceIndex = i;
            break;
          }
        }
      }
    }

    // Nếu đã tìm thấy trùng place_id, kiểm tra xem có cạnh nhau không
    if (existingPlaceId) {
      const isAdjacent = Math.abs(existingPlaceIndex - replacingIndex) <= 1;
      
      if (isAdjacent) {
        // Cạnh nhau → CHẶN, bắt người dùng chọn lại
        Alert.alert(
          'Địa điểm trùng lặp',
          `"${existingPlaceName}" đã có ở vị trí kế bên trong ngày ${selectedDay}. Vui lòng chọn địa điểm khác.`,
          [{ text: 'OK' }]
        );
        setIsUpdatingRoute(false);
        return;
      }
      // Không cạnh nhau → Cho phép, chỉ thông báo
      console.log(`ℹ️ Địa điểm "${existingPlaceName}" đã có trong ngày nhưng không cạnh nhau (index ${existingPlaceIndex} vs ${replacingIndex}), vẫn cho phép.`);
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để thay đổi địa điểm.');
        return;
      }

      // Enrich ngay lập tức để lấy đầy đủ thông tin (tên, tọa độ, address)
      let enrichedData: any = null;
      try {
        const enrichResp = await enrichPlaceAPI(token, placeId, false);
        enrichedData = enrichResp?.data || enrichResp || null;
      } catch (e: any) {
        console.error('Enrich khi thay POI thất bại:', e);
        Alert.alert('Lỗi', e?.message || 'Không thể lấy thông tin địa điểm mới');
        return;
      }

      // Chuẩn hóa tên và tọa độ
      const newName =
        enrichedData?.name ||
        enrichedData?.displayName?.text ||
        suggestion.text?.text ||
        suggestion.text ||
        suggestion.description ||
        'Địa điểm mới';
      const coords =
        enrichedData?.location?.coordinates ||
        (enrichedData?.location?.lat !== undefined && enrichedData?.location?.lng !== undefined
          ? [enrichedData.location.lng, enrichedData.location.lat]
          : undefined);

      // Lấy tọa độ của địa điểm mới
      let newLat: number | undefined;
      let newLng: number | undefined;
      if (coords && Array.isArray(coords) && coords.length === 2) {
        newLng = coords[0];
        newLat = coords[1];
      } else if (enrichedData?.location?.lat !== undefined && enrichedData?.location?.lng !== undefined) {
        newLat = enrichedData.location.lat;
        newLng = enrichedData.location.lng;
      }

      // Kiểm tra địa điểm quá gần với các địa điểm khác trong cùng ngày (khác place_id nhưng cùng vị trí)
      if (newLat !== undefined && newLng !== undefined) {
        let closePlaceName = '';
        let closePlaceId = '';
        let closePlaceIndex = -1;

        // Kiểm tra trong optimized_route (AI route) - chỉ trong ngày đang chọn
        if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
          const currentDay = routeData.optimized_route.find((d: any) => d.day === selectedDay);
          if (currentDay?.activities && Array.isArray(currentDay.activities)) {
            for (let i = 0; i < currentDay.activities.length; i++) {
              const act = currentDay.activities[i];
              // Bỏ qua địa điểm đang thay thế
              const actNorm = (act.google_place_id || '').replace(/^places\//, '');
              if (actNorm === oldNormalizedPlaceId) continue;

              if (act.location?.lat !== undefined && act.location?.lng !== undefined) {
                const distance = calculateDistanceMeters(newLat, newLng, act.location.lat, act.location.lng);
                if (distance < MIN_DISTANCE_THRESHOLD_METERS) {
                  closePlaceName = act.name || 'Địa điểm này';
                  closePlaceId = actNorm;
                  closePlaceIndex = i;
                  break;
                }
              }
            }
          }
        }

        // Kiểm tra trong days (custom itinerary) - chỉ trong ngày đang chọn
        if (!closePlaceId && routeData.days && Array.isArray(routeData.days)) {
          const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === selectedDay);
          if (currentDay?.places && Array.isArray(currentDay.places)) {
            for (let i = 0; i < currentDay.places.length; i++) {
              const place = currentDay.places[i];
              // Bỏ qua địa điểm đang thay thế
              const placeNorm = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
              if (placeNorm === oldNormalizedPlaceId) continue;

              if (place.location?.lat !== undefined && place.location?.lng !== undefined) {
                const distance = calculateDistanceMeters(newLat, newLng, place.location.lat, place.location.lng);
                if (distance < MIN_DISTANCE_THRESHOLD_METERS) {
                  closePlaceName = place.name || 'Địa điểm này';
                  closePlaceId = placeNorm;
                  closePlaceIndex = i;
                  break;
                }
              }
            }
          }
        }

        // Nếu tìm thấy địa điểm gần, kiểm tra xem có cạnh nhau không
        if (closePlaceId) {
          const isAdjacent = Math.abs(closePlaceIndex - replacingIndex) <= 1;
          
          if (isAdjacent) {
            // Cạnh nhau → CHẶN, bắt người dùng chọn lại
            Alert.alert(
              'Địa điểm quá gần',
              `"${closePlaceName}" (cách địa điểm bạn chọn dưới 30m) đã có ở vị trí kế bên trong ngày ${selectedDay}. Vui lòng chọn địa điểm khác.`,
              [{ text: 'OK' }]
            );
            setIsUpdatingRoute(false);
            return;
          }
          // Không cạnh nhau → Cho phép, chỉ log
          console.log(`ℹ️ Địa điểm "${closePlaceName}" cách dưới 30m nhưng không cạnh nhau (index ${closePlaceIndex} vs ${replacingIndex}), vẫn cho phép.`);
        }
      }

      // Chuẩn hoá Place ID, thêm prefix nếu thiếu
      const placeIdForSend = placeId.startsWith('places/') ? placeId : `places/${normalizedNewPlaceId}`;

      // Build updated route payload (sử dụng lại routeData đã parse ở trên)
      const updatedRoute = JSON.parse(JSON.stringify(routeData)); // Deep clone

      // Find and replace POI in optimized_route
      if (updatedRoute.optimized_route && Array.isArray(updatedRoute.optimized_route)) {
        updatedRoute.optimized_route.forEach((day: DayPlan, dayIndex: number) => {
          if (day.activities && Array.isArray(day.activities)) {
            // Chỉ thay thế POI tại đúng ngày và đúng index
            if (day.day === selectedDay) {
              day.activities.forEach((act: Activity, actIndex: number) => {
                const actNorm = (act.google_place_id || '').replace(/^places\//, '');
                // Kiểm tra đúng index để tránh thay thế nhiều POI cùng place_id
                if (actNorm === oldNormalizedPlaceId && actIndex === replacingIndex) {
                  act.google_place_id = placeIdForSend;
                  act.name = newName;
                  if (coords && Array.isArray(coords) && coords.length === 2) {
                    act.location = { lat: coords[1], lng: coords[0] };
                  }
                }
              });
            }
            // Ensure travel_mode, day_start_time, day are present
            if (!day.travel_mode) day.travel_mode = 'driving';
            if (!day.day_start_time) day.day_start_time = '09:00:00';
            if (day.day === undefined) day.day = dayIndex + 1;
          }
        });
      }

      // Find and replace POI in days (custom itinerary)
      if (updatedRoute.days && Array.isArray(updatedRoute.days)) {
        updatedRoute.days.forEach((day: CustomDayWithRoutes) => {
          if (day.places && Array.isArray(day.places)) {
            // Chỉ thay thế POI tại đúng ngày và đúng index
            const dayNum = day.day ?? day.dayNumber;
            if (dayNum === selectedDay) {
              day.places.forEach((place: CustomPlaceWithRoute, placeIndex: number) => {
                const currentPlaceId = (place.google_place_id || place.placeId || '').replace(/^places\//, '');
                // Kiểm tra đúng index để tránh thay thế nhiều POI cùng place_id
                if (currentPlaceId === oldNormalizedPlaceId && placeIndex === replacingIndex) {
                  place.google_place_id = placeIdForSend;
                  place.placeId = placeIdForSend;
                  place.name = newName;
                  if (coords && Array.isArray(coords) && coords.length === 2) {
                    place.location = { lat: coords[1], lng: coords[0] };
                  }
                }
              });
            }
          }
        });
      }

      // Call API to update route
      const routeId = (routeDetails as any).route_id;
      
      console.log('🔄 Updating route:', {
        routeId,
        apiUrl: `${API_BASE_URL}/api/v1/itineraries/custom-route`,
        hasToken: !!token,
      });
      
      const response = await fetch(`${API_BASE_URL}/api/v1/itineraries/custom-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          route: {
            route_id: routeId,
            start_location:
              (routeDetails as any).start_location ||
              routeData.start_location ||
              routeData.metadata?.start_location ||
              undefined,
            route_data_json: updatedRoute,
          },
          message: 'Cập nhật địa điểm trong lộ trình',
        }),
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        console.error('❌ API Error:', errorData);
        throw new Error(errorData.message || `HTTP ${response.status}: Không thể cập nhật lộ trình`);
      }

      const result = await response.json();
      console.log('✅ Update successful:', result);
      
      if (result.route) {
        // Validate backend response structure
        console.log('🔍 Validating backend response for replace...');
        if (!result.route.route_data_json) {
          throw new Error('Backend không trả về route_data_json');
        }
        
        const routeDataJson = result.route.route_data_json;
        console.log('🔍 route_data_json type:', typeof routeDataJson);
        
        // Parse if it's string
        let parsedRouteData = routeDataJson;
        if (typeof routeDataJson === 'string') {
          try {
            parsedRouteData = JSON.parse(routeDataJson);
            console.log('✅ Parsed route_data_json from string');
          } catch (e) {
            console.error('❌ Failed to parse route_data_json:', e);
            throw new Error('Dữ liệu lộ trình không hợp lệ');
          }
        }
        
        // Validate optimized_route structure
        if (!parsedRouteData.optimized_route || !Array.isArray(parsedRouteData.optimized_route)) {
          console.error('❌ Invalid optimized_route structure:', parsedRouteData);
          throw new Error('Cấu trúc dữ liệu lộ trình không hợp lệ');
        }
        
        // Ensure all days have activities array
        parsedRouteData.optimized_route.forEach((day: any, idx: number) => {
          if (!day.activities) {
            console.warn(`⚠️ Day ${idx + 1} missing activities, initializing empty array`);
            day.activities = [];
          } else if (!Array.isArray(day.activities)) {
            console.warn(`⚠️ Day ${idx + 1} activities is not array, converting:`, day.activities);
            day.activities = [];
          }
        });
        
        console.log('✅ Validation passed. Days:', parsedRouteData.optimized_route.length);
        
        // Giữ lại start_location nếu response không có
        const mergedRoute = {
          ...result.route,
          route_data_json: parsedRouteData,
          start_location:
            result.route.start_location ||
            (routeDetails as any)?.start_location ||
            routeData.start_location ||
            routeData.metadata?.start_location ||
            null,
        };
        // Reset enrich state and trigger enrich again
        enrichedActivitiesRef.current = new Set();
        enrichingInProgressRef.current = new Set();
        setRefreshEnrichKey(k => k + 1);
        setRouteDetails(mergedRoute);
        setIsReplacePOIModalVisible(false);
        setReplacingPOI(null);
        setSearchQuery('');
        // Reset session token
        setSessionToken('');
        // Reset về ngày 1 và fit lại map
        setSelectedDay(1);
        setTimeout(() => handleFitToMarkers(), 0);
        Alert.alert('Thành công', 'Địa điểm đã được cập nhật.');
      }
    } catch (error: any) {
      console.error('❌ Error updating route:', error);
      
      // Hiển thị lỗi chi tiết hơn
      let errorMessage = 'Không thể cập nhật địa điểm.';
      
      if (error.message.includes('Network request failed')) {
        errorMessage = 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Lỗi', errorMessage);
    } finally {
      setIsUpdatingRoute(false);
    }
  };
  
  // Handle select POI from Add POI modal
  const handleSelectAddPOI = async (suggestion: any) => {
    if (!routeDetails) {
      return;
    }

    const placeId = suggestion.googlePlaceId || suggestion.placeId || suggestion.place_id;
    if (!placeId) {
      Alert.alert('Lỗi', 'Không tìm thấy Place ID.');
      return;
    }

    const normalizedNewPlaceId = (placeId || '').replace(/^places\//, '');

    setIsUpdatingRoute(true);
    
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập.');
        return;
      }

      // Enrich để lấy đầy đủ thông tin
      let enrichedData: any = null;
      try {
        enrichedData = await enrichPlaceAPI(token, placeId, false);
        enrichedData = enrichedData?.data || enrichedData;
      } catch (e: any) {
        console.warn('Failed to enrich place, using basic info:', e.message);
      }

      const newName =
        enrichedData?.name ||
        enrichedData?.displayName?.text ||
        suggestion.text?.text ||
        suggestion.text ||
        suggestion.description ||
        'Địa điểm mới';
      const coords =
        enrichedData?.location?.coordinates ||
        (enrichedData?.location?.lat !== undefined && enrichedData?.location?.lng !== undefined
          ? [enrichedData.location.lng, enrichedData.location.lat]
          : undefined);

      let newLat: number | undefined;
      let newLng: number | undefined;
      if (coords && Array.isArray(coords) && coords.length === 2) {
        [newLng, newLat] = coords;
      } else if (enrichedData?.location?.lat !== undefined && enrichedData?.location?.lng !== undefined) {
        newLat = enrichedData.location.lat;
        newLng = enrichedData.location.lng;
      }

      // Kiểm tra trùng place_id trong ngày hiện tại
      const routeData = (routeDetails as any).route_data_json || routeDetails;
      let existingPlaceName = '';
      let existingPlaceId = '';

      if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
        const currentDay = routeData.optimized_route.find((d: any) => d.day === selectedDay);
        if (currentDay?.activities && Array.isArray(currentDay.activities)) {
          for (const activity of currentDay.activities) {
            const activityPlaceId = (activity.google_place_id || '').replace(/^places\//, '');
            if (activityPlaceId === normalizedNewPlaceId) {
              existingPlaceName = activity.name;
              existingPlaceId = activityPlaceId;
              break;
            }
          }
        }
      }

      if (routeData.days && Array.isArray(routeData.days)) {
        const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === selectedDay);
        if (currentDay?.places && Array.isArray(currentDay.places)) {
          for (const place of currentDay.places) {
            const placePlaceId = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
            if (placePlaceId === normalizedNewPlaceId) {
              existingPlaceName = place.name;
              existingPlaceId = placePlaceId;
              break;
            }
          }
        }
      }

      // Kiểm tra địa điểm quá gần với các địa điểm khác (trước khi kiểm tra trùng)
      if (newLat !== undefined && newLng !== undefined) {
        if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
          const currentDay = routeData.optimized_route.find((d: any) => d.day === selectedDay);
          if (currentDay?.activities && Array.isArray(currentDay.activities)) {
            for (const activity of currentDay.activities) {
              const existingPlaceId = (activity.google_place_id || '').replace(/^places\//, '');
              if (existingPlaceId === normalizedNewPlaceId) continue;

              const activityLat = activity.location?.lat || activity.place?.location?.lat;
              const activityLng = activity.location?.lng || activity.place?.location?.lng;
              if (activityLat !== undefined && activityLng !== undefined) {
                const distance = calculateDistanceMeters(newLat, newLng, activityLat, activityLng);
                if (distance < MIN_DISTANCE_THRESHOLD_METERS) {
                  Alert.alert(
                    'Địa điểm quá gần',
                    `Địa điểm mới nằm quá gần địa điểm "${activity.name}" (${Math.round(distance)}m). Vui lòng chọn địa điểm khác xa hơn.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }
              }
            }
          }
        }

        if (routeData.days && Array.isArray(routeData.days)) {
          const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === selectedDay);
          if (currentDay?.places && Array.isArray(currentDay.places)) {
            for (const place of currentDay.places) {
              const existingPlaceId = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
              if (existingPlaceId === normalizedNewPlaceId) continue;

              const placeLat = place.location?.lat;
              const placeLng = place.location?.lng;
              if (placeLat !== undefined && placeLng !== undefined) {
                const distance = calculateDistanceMeters(newLat, newLng, placeLat, placeLng);
                if (distance < MIN_DISTANCE_THRESHOLD_METERS) {
                  Alert.alert(
                    'Địa điểm quá gần',
                    `Địa điểm mới nằm quá gần địa điểm "${place.name}" (${Math.round(distance)}m). Vui lòng chọn địa điểm khác xa hơn.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }
              }
            }
          }
        }
      }

      const placeIdForSend = placeId.startsWith('places/') ? placeId : `places/${normalizedNewPlaceId}`;
      
      // Function thực hiện thêm POI
      const performAddPOI = async () => {
        try {
          // Build updated route payload - THÊM POI vào cuối danh sách
          const updatedRoute = JSON.parse(JSON.stringify(routeData));
          
          console.log('📍 Starting to add POI:', {
            selectedDay,
            newName,
            placeIdForSend,
            hasOptimizedRoute: !!updatedRoute.optimized_route,
            hasDays: !!updatedRoute.days,
            optimizedRouteDays: updatedRoute.optimized_route?.map((d: any) => d.day),
            daysArray: updatedRoute.days?.map((d: any) => d.day ?? d.dayNumber),
          });

          let poiAdded = false;

          // Thêm vào optimized_route
          if (updatedRoute.optimized_route && Array.isArray(updatedRoute.optimized_route)) {
            // Đảm bảo tất cả các ngày có travel_mode và day_start_time
            updatedRoute.optimized_route.forEach((day: any, idx: number) => {
              if (!day.travel_mode) day.travel_mode = 'driving';
              if (!day.day_start_time) day.day_start_time = '09:00:00';
              if (day.day === undefined) day.day = idx + 1;
            });

            const dayIndex = updatedRoute.optimized_route.findIndex((d: any) => d.day === selectedDay);
            console.log('🔍 optimized_route dayIndex:', dayIndex);
            if (dayIndex !== -1) {
              if (!updatedRoute.optimized_route[dayIndex].activities) {
                updatedRoute.optimized_route[dayIndex].activities = [];
              }
              
              const newActivity = {
                name: newName,
                location: newLat !== undefined && newLng !== undefined ? { lat: newLat, lng: newLng } : undefined,
                google_place_id: placeIdForSend,
              };
              
              // Insert vào vị trí được chọn
              if (insertPosition === -1) {
                // Thêm vào cuối
                updatedRoute.optimized_route[dayIndex].activities.push(newActivity);
              } else if (insertPosition === 0) {
                // Thêm vào đầu
                updatedRoute.optimized_route[dayIndex].activities.unshift(newActivity);
              } else {
                // Thêm vào sau POI thứ insertPosition
                updatedRoute.optimized_route[dayIndex].activities.splice(insertPosition, 0, newActivity);
              }
              
              console.log('✅ Added to optimized_route at position', insertPosition, 'total activities:', updatedRoute.optimized_route[dayIndex].activities.length);
              poiAdded = true;
            } else {
              console.warn('⚠️ Day not found in optimized_route');
            }
          }

          // Thêm vào days (custom itinerary)
          if (updatedRoute.days && Array.isArray(updatedRoute.days)) {
            const dayIndex = updatedRoute.days.findIndex((d: any) => (d.day ?? d.dayNumber) === selectedDay);
            console.log('🔍 days dayIndex:', dayIndex);
            if (dayIndex !== -1) {
              if (!updatedRoute.days[dayIndex].places) {
                updatedRoute.days[dayIndex].places = [];
              }
              
              const newPlace = {
                name: newName,
                placeId: placeIdForSend,
                google_place_id: placeIdForSend,
                location: newLat !== undefined && newLng !== undefined ? { lat: newLat, lng: newLng } : undefined,
              };
              
              // Insert vào vị trí được chọn
              if (insertPosition === -1) {
                // Thêm vào cuối
                updatedRoute.days[dayIndex].places.push(newPlace);
              } else if (insertPosition === 0) {
                // Thêm vào đầu
                updatedRoute.days[dayIndex].places.unshift(newPlace);
              } else {
                // Thêm vào sau POI thứ insertPosition
                updatedRoute.days[dayIndex].places.splice(insertPosition, 0, newPlace);
              }
              
              console.log('✅ Added to days at position', insertPosition, 'total places:', updatedRoute.days[dayIndex].places.length);
              poiAdded = true;
            } else {
              console.warn('⚠️ Day not found in days array');
            }
          }
          
          if (!poiAdded) {
            throw new Error('Không tìm thấy ngày trong lộ trình để thêm POI');
          }

          // Call API to update route
          const routeId = (routeDetails as any).route_id;
          const response = await fetch(`${API_BASE_URL}/api/v1/itineraries/custom-route`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              route: {
                route_id: routeId,
                start_location:
                  (routeDetails as any).start_location ||
                  routeData.start_location ||
                  routeData.metadata?.start_location ||
                  undefined,
                route_data_json: updatedRoute,
              },
              message: 'Thêm địa điểm mới vào lộ trình',
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API error:', errorText);
            throw new Error(errorText || 'Failed to add POI');
          }

          const result = await response.json();
          console.log('✅ API response:', result);
          
          if (result.route) {
            // Validate backend response structure
            console.log('🔍 Validating backend response...');
            if (!result.route.route_data_json) {
              throw new Error('Backend không trả về route_data_json');
            }
            
            const routeDataJson = result.route.route_data_json;
            console.log('🔍 route_data_json type:', typeof routeDataJson);
            
            // Parse if it's string
            let parsedRouteData = routeDataJson;
            if (typeof routeDataJson === 'string') {
              try {
                parsedRouteData = JSON.parse(routeDataJson);
                console.log('✅ Parsed route_data_json from string');
              } catch (e) {
                console.error('❌ Failed to parse route_data_json:', e);
                throw new Error('Dữ liệu lộ trình không hợp lệ');
              }
            }
            
            // Validate optimized_route structure
            if (!parsedRouteData.optimized_route || !Array.isArray(parsedRouteData.optimized_route)) {
              console.error('❌ Invalid optimized_route structure:', parsedRouteData);
              throw new Error('Cấu trúc dữ liệu lộ trình không hợp lệ');
            }
            
            // Ensure all days have activities array
            parsedRouteData.optimized_route.forEach((day: any, idx: number) => {
              if (!day.activities) {
                console.warn(`⚠️ Day ${idx + 1} missing activities, initializing empty array`);
                day.activities = [];
              } else if (!Array.isArray(day.activities)) {
                console.warn(`⚠️ Day ${idx + 1} activities is not array, converting:`, day.activities);
                day.activities = [];
              }
            });
            
            console.log('✅ Validation passed. Days:', parsedRouteData.optimized_route.length);
            
            const updatedRouteFromBackend = {
              ...routeDetails,
              route_data_json: parsedRouteData,
            };
            
            // Validate selectedDay is still valid
            const totalDaysAfterUpdate = parsedRouteData.optimized_route?.length || 0;
            console.log('🔍 Validating selectedDay:', { selectedDay, totalDaysAfterUpdate });
            
            if (selectedDay > totalDaysAfterUpdate) {
              console.warn('⚠️ selectedDay out of range, resetting to 1');
              setSelectedDay(1);
            }
            
            enrichedActivitiesRef.current = new Set();
            enrichingInProgressRef.current = new Set();
            setRefreshEnrichKey(k => k + 1);
            
            console.log('✅ Setting new route details');
            setRouteDetails(updatedRouteFromBackend);
            setIsAddPOIModalVisible(false);
            
            // Small delay to ensure state updates
            setTimeout(() => {
              console.log('✅ Add POI complete');
              Alert.alert(
                'Thành công',
                'Đã thêm địa điểm vào lộ trình.',
                [{ text: 'OK' }]
              );
            }, 100);
          }
        } catch (error: any) {
          console.error('❌ Error in performAddPOI:', error);
          Alert.alert('Lỗi', error.message || 'Không thể thêm địa điểm.');
        }
      };
      
      // Nếu POI trùng, hiện cảnh báo và chờ xác nhận
      if (existingPlaceId) {
        Alert.alert(
          'Cảnh báo',
          `Địa điểm "${existingPlaceName}" đã có trong ngày này. Bạn có chắc muốn thêm lại?`,
          [
            { 
              text: 'Hủy', 
              style: 'cancel', 
              onPress: () => {
                setIsUpdatingRoute(false);
              }
            },
            { 
              text: 'Thêm', 
              style: 'default',
              onPress: async () => {
                await performAddPOI();
                setIsUpdatingRoute(false);
              }
            }
          ]
        );
        return; // QUAN TRỌNG: Return để chờ user chọn
      }
      
      // Nếu không trùng, thêm POI luôn
      await performAddPOI();
    } catch (error: any) {
      console.error('❌ Error adding POI:', error);
      Alert.alert('Lỗi', error.message || 'Không thể thêm địa điểm.');
    } finally {
      setIsUpdatingRoute(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.gradientContainer}
      >
        {/* Loading State */}
        {isLoading && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tải chi tiết lộ trình...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <View style={styles.centerContainer}>
            <FontAwesome name="exclamation-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {!isLoading && !error && routeDetails && (
          <>
            {/* Header */}
            <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
              <TouchableOpacity onPress={onClose} style={styles.backButton}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
              <View style={styles.headerTextContainer}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {destination} • {totalDays} ngày
                </Text>
              </View>
            </View>

      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollView 
          style={styles.container} 
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
        {/* Map */}
        {mapRegion && (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={mapRegion}
              region={mapRegion}
              showsUserLocation={false}
              showsMyLocationButton={false}
            >
              {/* Polylines */}
              {routeSegments.map((segment, idx) => (
                <Polyline
                  key={`polyline-${selectedDay}-${idx}`}
                  coordinates={segment.points}
                  strokeColor={
                    segment.mode === 'TRANSIT' ? '#F44336' : ROUTE_COLORS.main
                  }
                  strokeWidth={segment.mode === 'TRANSIT' ? 6 : 4}
                  lineDashPattern={segment.mode === 'WALK' ? [20, 10] : undefined}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}

              {/* Start marker */}
              {startLocation && toMapCoordinate(startLocation) && (
                <Marker 
                  key={`start-${selectedDay}`}
                  coordinate={toMapCoordinate(startLocation)!} 
                  title="Điểm bắt đầu"
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <View style={styles.markerContainer}>
                    <View style={styles.startMarker}>
                      <Text style={styles.markerText}>BĐ</Text>
                    </View>
                  </View>
                </Marker>
              )}

              {/* Markers */}
              {activities.map((activity, index) => {
                const coord = toMapCoordinate(activity.location || activity.place?.location);
                if (!coord) return null;

                // Check for duplicate coordinates and apply offset
                const duplicateIndex = activities.slice(0, index).findIndex((prevActivity, prevIndex) => {
                  const prevCoord = toMapCoordinate(prevActivity.location || prevActivity.place?.location);
                  return prevCoord && 
                         Math.abs(prevCoord.latitude - coord.latitude) < 0.00001 && 
                         Math.abs(prevCoord.longitude - coord.longitude) < 0.00001;
                });
                
                // Apply small offset if duplicate found (shift by ~10 meters)
                const offsetCoord = duplicateIndex >= 0 
                  ? {
                      latitude: coord.latitude + (index - duplicateIndex) * 0.0001,
                      longitude: coord.longitude + (index - duplicateIndex) * 0.0001
                    }
                  : coord;

                const isVisited = status === 'MAIN' && visitedActivities.has(`${selectedDay}-${index}`);
                const placeId = activity.place?.placeID || activity.placeID || activity.google_place_id || `activity-${index}`;
                
                return (
                  <Marker 
                    key={`marker-${selectedDay}-${placeId}-${index}`} 
                    coordinate={offsetCoord}
                    anchor={{ x: 0.5, y: 1 }}
                  >
                    <View style={styles.markerContainer}>
                      <View style={[styles.marker, isVisited && styles.markerVisited]}>
                        {isVisited ? (
                          <MaterialCommunityIcons name="check" size={16} color={COLORS.textWhite} />
                        ) : (
                          <Text style={styles.markerText}>{index + 1}</Text>
                        )}
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            {/* Map Controls */}
            <View style={styles.mapControls}>
              <TouchableOpacity style={styles.mapControlButton} onPress={handleFitToMarkers}>
                <MaterialCommunityIcons name="fit-to-page-outline" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Day Tabs */}
        {totalDays > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.tab, selectedDay === day && styles.tabActive]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.tabText, selectedDay === day && styles.tabTextActive]}>
                  Ngày {day}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Activities */}
        <View style={styles.activitiesContainer}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.activitiesContent}>
                {/* Start point card (hiển thị trước POI đầu tiên) */}
              {startLocation && activities.length > 0 && (
                <View>
                  <View style={styles.activityCard}>
                    <LinearGradient
                      colors={[COLORS.success + '15', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradientOverlay}
                    />
                    <View style={styles.cardNumberBadge}>
                      <LinearGradient
                        colors={[COLORS.success, COLORS.gradientSecondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.numberBadgeGradient}
                      >
                        <Text style={styles.numberBadgeText}>BĐ</Text>
                      </LinearGradient>
                    </View>
                    <View style={styles.cardContent}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {startLocationName}
                        </Text>
                        <View style={styles.cardRow}>
                          <FontAwesome name="map-marker" size={12} color={COLORS.primary} />
                          <Text style={styles.cardTime}>Điểm xuất phát của lộ trình</Text>
                        </View>
                      </View>
                    </View>
                    {/* Spacer hint để chiều cao tương đương các thẻ POI */}
                    <View style={styles.tapHint}>
                      <FontAwesome name="map-pin" size={10} color={COLORS.textSecondary} />
                      <Text style={styles.tapHintText}>Điểm bắt đầu</Text>
                    </View>
                  </View>

                  {/* Travel time from start to first POI (fallback to travel_duration_minutes if start_* missing) */}
                  {(() => {
                    const startToFirst =
                      activities[0]?.start_travel_duration_minutes ??
                      // Nếu không có start_travel_duration_minutes, dùng travel_duration_minutes của POI đầu tiên
                      // (vì travel_duration_minutes của POI là thời gian đi từ điểm trước đó đến nó)
                      activities[0]?.travel_duration_minutes ??
                      null;
                    if (startToFirst == null) return null;
                    const rounded = Math.round(startToFirst);
                    return (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <FontAwesome name="car" size={12} color={COLORS.primary} />
                          <Text style={styles.travelTimeBadgeText}>{rounded}m</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    );
                  })()}
                </View>
              )}

            {(() => {
              try {
                console.log('🎨 Rendering activities:', {
                  selectedDay,
                  activitiesLength: activities?.length,
                  activitiesType: Array.isArray(activities),
                  currentDayData: !!currentDayData,
                  status
                });
                
                if (!activities || activities.length === 0) {
                  return (
                    <View style={styles.emptyState}>
                      <FontAwesome name="map-o" size={48} color={COLORS.textSecondary} />
                      <Text style={styles.emptyStateText}>Chưa có hoạt động nào</Text>
                      {status === 'DRAFT' && (
                        <TouchableOpacity
                          style={styles.addPOIButton}
                          onPress={handleAddPOI}
                          activeOpacity={0.7}
                        >
                          <FontAwesome name="plus" size={16} color={COLORS.textWhite} />
                          <Text style={styles.addPOIButtonText}>Thêm địa điểm</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }
                
                // DRAFT routes (AI và Manual): Danh sách các POI
                if (status === 'DRAFT') {
                  return Array.isArray(activities) && activities.map((activity, index) => {
                    if (!activity) {
                      console.warn(`⚠️ Null activity at index ${index}`);
                      return null;
                    }
                    const activityName = activity.name || 'Hoạt động';
                const arrival = activity.estimated_arrival;
                const departure = activity.estimated_departure;
                const duration = calculateDuration(arrival, departure);
                // travel_duration_minutes của activity hiện tại là thời gian di chuyển từ điểm trước đó đến nó
                const travelTimeRaw = activity.travel_duration_minutes;
                // Làm tròn thời gian di chuyển thành số nguyên
                const travelTime = travelTimeRaw != null ? Math.round(travelTimeRaw) : null;
                const showTravelIndicator =
                  travelTime != null && (!startLocation ? true : index > 0);
                const hasPhoto = activity.google_place_id; // Sẽ fetch ảnh khi click
                const rating = (activity as any).ecs_score || (activity as any).rating;
                const isVisited = status === 'MAIN' && visitedActivities.has(`${selectedDay}-${index}`);

                // Render swipe actions inline
                const renderLeftActionsInline = () => (
                  <View style={styles.swipeActionsContainer}>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeDeleteButton]}
                      onPress={(event) => handleDeletePOI(activity, selectedDay, index, event)}
                    >
                      <FontAwesome name="trash-o" size={24} color={COLORS.textWhite} />
                      <Text style={styles.swipeActionText}>Xóa</Text>
                    </TouchableOpacity>
                  </View>
                );

                const renderRightActionsInline = () => (
                  <View style={styles.swipeActionsContainer}>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeEditButton]}
                      onPress={(event) => handleReplacePOI(activity, event)}
                    >
                      <FontAwesome name="exchange" size={24} color={COLORS.textWhite} />
                      <Text style={styles.swipeActionText}>Thay</Text>
                    </TouchableOpacity>
                  </View>
                );

                return (
                    <View key={`activity-${index}`}>
                      {/* Travel time indicator - hiển thị từ điểm bắt đầu đến POI đầu tiên hoặc giữa các POI */}
                    {showTravelIndicator && (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <FontAwesome name="car" size={12} color={COLORS.primary} />
                          <Text style={styles.travelTimeBadgeText}>{travelTime}m</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    )}

                    {/* Activity Card - with Swipeable for DRAFT mode */}
                    <Swipeable
                      renderLeftActions={renderLeftActionsInline}
                      renderRightActions={renderRightActionsInline}
                      overshootLeft={false}
                      overshootRight={false}
                      friction={2}
                      leftThreshold={40}
                      rightThreshold={40}
                    >
                        <TouchableOpacity
                          style={[styles.activityCard, isVisited && styles.activityCardVisited]}
                          onPress={() => handleActivityPress(activity)}
                          disabled={isEnriching}
                          activeOpacity={0.7}
                        >
                          {/* Card Header with gradient */}
                          <LinearGradient
                            colors={[COLORS.primary + '15', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cardGradientOverlay}
                          />

                          {/* Visited overlay gradient */}
                          {isVisited && (
                            <LinearGradient
                              colors={[COLORS.success + '10', 'transparent']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.cardVisitedOverlay}
                            />
                          )}

                          {/* Number Badge - Positioned Absolutely at Top-Left */}
                          <View style={[styles.cardNumberBadge, isVisited && styles.cardNumberBadgeVisited]}>
                            <LinearGradient
                              colors={[isVisited ? '#66BB6A' : COLORS.primary, isVisited ? '#66BB6A' : COLORS.gradientSecondary]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.numberBadgeGradient}
                            >
                              <Text style={styles.numberBadgeText}>{index + 1}</Text>
                            </LinearGradient>
                          </View>

                          <View style={styles.cardContent}>
                            {/* Center: Info */}
                            <View style={styles.cardInfo}>
                              <Text style={styles.cardTitle} numberOfLines={2}>
                                {activityName}
                              </Text>
                              
                              {/* Time Row */}
                              <View style={styles.cardRow}>
                                <FontAwesome name="clock-o" size={12} color={COLORS.primary} />
                                <Text style={styles.cardTime}>
                                {isManualRoute
                                  ? 'Thời gian tự chọn'
                                  : `${formatTime(arrival)}${duration ? ` • ${duration}` : ''}`}
                                </Text>
                              </View>

                              {/* Opening Hours Row - Expandable */}
                              {(() => {
                                const openingHours = (activity as any).openingHours;
                                const activityKey = `${selectedDay}-${index}`;
                                const isExpanded = expandedOpeningHours.has(activityKey);
                                
                                if (openingHours?.weekdayDescriptions) {
                                  const today = new Date().getDay();
                                  const dayIndex = today === 0 ? 6 : today - 1;
                                  const todayHours = openingHours.weekdayDescriptions[dayIndex];
                                  
                                  if (isExpanded) {
                                    // Show all days
                                    return (
                                      <View style={styles.expandedOpeningHoursContainer}>
                                        {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                                          <Text key={idx} style={styles.expandedOpeningHoursText}>
                                            {dayHours}
                                          </Text>
                                        ))}
                                        <TouchableOpacity onPress={() => toggleOpeningHours(activityKey)}>
                                          <Text style={styles.expandedOpeningHoursToggle}>Thu gọn ↑</Text>
                                        </TouchableOpacity>
                                      </View>
                                    );
                                  } else if (todayHours) {
                                    // Show today only
                                    const hoursText = todayHours.split(': ')[1] || todayHours;
                                    return (
                                      <TouchableOpacity 
                                        style={styles.cardRow} 
                                        onPress={() => toggleOpeningHours(activityKey)}
                                      >
                                        <FontAwesome name="calendar" size={11} color={COLORS.textSecondary} />
                                        <Text style={styles.cardOpeningHours} numberOfLines={1}>
                                          {hoursText}
                                        </Text>
                                        <Text style={styles.expandMoreIndicator}> ↓</Text>
                                      </TouchableOpacity>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* Loading indicator */}
                              {isEnriching && (
                                <ActivityIndicator 
                                  size="small" 
                                  color={COLORS.primary} 
                                  style={styles.cardLoader} 
                                />
                              )}
                            </View>
                          </View>

                          {/* Tap hint */}
                          <View style={styles.tapHint}>
                            <FontAwesome name="hand-pointer-o" size={10} color={COLORS.textSecondary} />
                            <Text style={styles.tapHintText}>Vuốt: Xóa/Thay • Nhấn: Chi tiết</Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    </View>
                  );
                  });
                }
                
                // CONFIRMED/MAIN routes: Không cho kéo thả, chỉ hiển thị list
                return Array.isArray(activities) && activities.map((activity, index) => {
                if (!activity) return null;
                const activityName = activity.name || 'Hoạt động';
                const arrival = activity.estimated_arrival;
                const departure = activity.estimated_departure;
                const duration = calculateDuration(arrival, departure);
                const travelTimeRaw = activity.travel_duration_minutes;
                const travelTime = travelTimeRaw != null ? Math.round(travelTimeRaw) : null;
                const showTravelIndicator =
                  travelTime != null && (!startLocation ? true : index > 0);
                const hasPhoto = activity.google_place_id;
                const rating = (activity as any).ecs_score || (activity as any).rating;
                const isVisited = status === 'MAIN' && visitedActivities.has(`${selectedDay}-${index}`);
                
                // Render swipe actions cho DRAFT manual routes
                const renderLeftActions = () => (
                  <View style={styles.swipeActionsContainer}>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeDeleteButton]}
                      onPress={(event) => handleDeletePOI(activity, selectedDay, index, event)}
                    >
                      <FontAwesome name="trash-o" size={24} color={COLORS.textWhite} />
                      <Text style={styles.swipeActionText}>Xóa</Text>
                    </TouchableOpacity>
                  </View>
                );

                const renderRightActions = () => (
                  <View style={styles.swipeActionsContainer}>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeEditButton]}
                      onPress={(event) => handleReplacePOI(activity, event)}
                    >
                      <FontAwesome name="exchange" size={24} color={COLORS.textWhite} />
                      <Text style={styles.swipeActionText}>Thay</Text>
                    </TouchableOpacity>
                  </View>
                );

                return (
                  <View key={`activity-${index}`}>
                    {/* Travel time indicator */}
                    {showTravelIndicator && (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <FontAwesome name="car" size={12} color={COLORS.primary} />
                          <Text style={styles.travelTimeBadgeText}>{travelTime}m</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    )}

                    {status === 'DRAFT' ? (
                      // DRAFT manual routes: Cho phép swipe để xóa/thay
                      <Swipeable
                        renderLeftActions={renderLeftActions}
                        renderRightActions={renderRightActions}
                        overshootLeft={false}
                        overshootRight={false}
                      >
                        <TouchableOpacity
                          style={[styles.activityCard, isVisited && styles.activityCardVisited]}
                          onPress={() => handleActivityPress(activity)}
                          disabled={isEnriching}
                          activeOpacity={0.7}
                        >
                          {/* Card Header with gradient */}
                          <LinearGradient
                              colors={[COLORS.primary + '15', 'transparent']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.cardGradientOverlay}
                            />

                            {/* Visited overlay gradient */}
                            {isVisited && (
                              <LinearGradient
                                colors={[COLORS.success + '10', 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.cardVisitedOverlay}
                              />
                            )}

                            {/* Number Badge - Positioned Absolutely at Top-Left */}
                            <View style={[styles.cardNumberBadge, isVisited && styles.cardNumberBadgeVisited]}>
                              <LinearGradient
                                colors={[isVisited ? '#66BB6A' : COLORS.primary, isVisited ? '#66BB6A' : COLORS.gradientSecondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.numberBadgeGradient}
                              >
                                <Text style={styles.numberBadgeText}>{index + 1}</Text>
                              </LinearGradient>
                            </View>

                            <View style={styles.cardContent}>
                              {/* Center: Info */}
                              <View style={styles.cardInfo}>
                                <Text style={styles.cardTitle} numberOfLines={2}>
                                  {activityName}
                                </Text>
                                
                                {/* Time Row */}
                                <View style={styles.cardRow}>
                                  <FontAwesome name="clock-o" size={12} color={COLORS.primary} />
                                  <Text style={styles.cardTime}>
                                  {isManualRoute
                                    ? 'Thời gian tự chọn'
                                    : `${formatTime(arrival)}${duration ? ` • ${duration}` : ''}`}
                                  </Text>
                                </View>

                                {/* Opening Hours Row - Expandable for MAIN mode */}
                                {(() => {
                                  const openingHours = (activity as any).openingHours;
                                  const activityKey = `${selectedDay}-${index}`;
                                  const isExpanded = expandedOpeningHours.has(activityKey);
                                  
                                  if (openingHours?.weekdayDescriptions) {
                                    const today = new Date().getDay();
                                    const dayIndex = today === 0 ? 6 : today - 1;
                                    const todayHours = openingHours.weekdayDescriptions[dayIndex];
                                    
                                    if (isExpanded) {
                                      // Show all days
                                      return (
                                        <View style={styles.expandedOpeningHoursContainer}>
                                          {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                                            <Text key={idx} style={styles.expandedOpeningHoursText}>
                                              {dayHours}
                                            </Text>
                                          ))}
                                          <TouchableOpacity onPress={() => toggleOpeningHours(activityKey)}>
                                            <Text style={styles.expandedOpeningHoursToggle}>Thu gọn ↑</Text>
                                          </TouchableOpacity>
                                        </View>
                                      );
                                    } else if (todayHours) {
                                      // Show today only
                                      const hoursText = todayHours.split(': ')[1] || todayHours;
                                      return (
                                        <TouchableOpacity 
                                          style={styles.cardRow} 
                                          onPress={() => toggleOpeningHours(activityKey)}
                                        >
                                          <FontAwesome name="calendar" size={11} color={COLORS.textSecondary} />
                                          <Text style={styles.cardOpeningHours} numberOfLines={1}>
                                            {hoursText}
                                          </Text>
                                          <Text style={styles.expandMoreIndicator}> ↓</Text>
                                        </TouchableOpacity>
                                      );
                                    }
                                  }
                                  return null;
                                })()}

                                {/* Loading indicator */}
                                {isEnriching && (
                                  <ActivityIndicator 
                                    size="small" 
                                    color={COLORS.primary} 
                                    style={styles.cardLoader} 
                                  />
                                )}
                              </View>

                              {/* Right: Visit Check Button - Only show for main routes */}
                              {status === 'MAIN' && (
                                <TouchableOpacity
                                  style={[
                                    styles.cardVisitButton,
                                    visitedActivities.has(`${selectedDay}-${index}`) && styles.cardVisitButtonChecked,
                                    animatingButtons.has(`${selectedDay}-${index}`) && styles.cardVisitButtonAnimating
                                  ]}
                                  onPress={() => toggleVisited(selectedDay, index)}
                                  activeOpacity={0.7}
                                >
                                  {visitedActivities.has(`${selectedDay}-${index}`) ? (
                                    <LinearGradient
                                      colors={['#66BB6A', '#66BB6A']}
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={styles.cardVisitButtonGradient}
                                    >
                                      <MaterialCommunityIcons
                                        name="check"
                                        size={22}
                                        color={COLORS.textWhite}
                                      />
                                    </LinearGradient>
                                  ) : (
                                    <MaterialCommunityIcons
                                      name="check"
                                      size={22}
                                      color={COLORS.textSecondary}
                                    />
                                  )}
                                </TouchableOpacity>
                              )}
                            </View>

                          {/* Tap hint */}
                          <View style={styles.tapHint}>
                            <FontAwesome name="hand-pointer-o" size={10} color={COLORS.textSecondary} />
                            <Text style={styles.tapHintText}>Vuốt: Xóa/Thay • Nhấn: Chi tiết</Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    ) : (
                      // CONFIRMED/MAIN routes: Chỉ xem, không cho chỉnh sửa
                      <TouchableOpacity
                        style={[styles.activityCard, isVisited && styles.activityCardVisited]}
                        onPress={() => handleActivityPress(activity)}
                        disabled={isEnriching}
                        activeOpacity={0.7}
                      >
                        {/* Card Header with gradient */}
                        <LinearGradient
                            colors={[COLORS.primary + '15', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cardGradientOverlay}
                          />

                          {/* Visited overlay gradient */}
                          {isVisited && (
                            <LinearGradient
                              colors={[COLORS.success + '10', 'transparent']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.cardVisitedOverlay}
                            />
                          )}

                          {/* Number Badge - Positioned Absolutely at Top-Left */}
                          <View style={[styles.cardNumberBadge, isVisited && styles.cardNumberBadgeVisited]}>
                            <LinearGradient
                              colors={[isVisited ? '#66BB6A' : COLORS.primary, isVisited ? '#66BB6A' : COLORS.gradientSecondary]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.numberBadgeGradient}
                            >
                              <Text style={styles.numberBadgeText}>{index + 1}</Text>
                            </LinearGradient>
                          </View>

                          <View style={styles.cardContent}>
                            {/* Center: Info */}
                            <View style={styles.cardInfo}>
                              <Text style={styles.cardTitle} numberOfLines={2}>
                                {activityName}
                              </Text>
                              
                              {/* Time Row */}
                              <View style={styles.cardRow}>
                                <FontAwesome name="clock-o" size={12} color={COLORS.primary} />
                                <Text style={styles.cardTime}>
                                {isManualRoute
                                  ? 'Thời gian tự chọn'
                                  : `${formatTime(arrival)}${duration ? ` • ${duration}` : ''}`}
                                </Text>
                              </View>

                              {/* Opening Hours Row - Expandable for MAIN mode */}
                              {(() => {
                                const openingHours = (activity as any).openingHours;
                                const activityKey = `${selectedDay}-${index}`;
                                const isExpanded = expandedOpeningHours.has(activityKey);
                                
                                if (openingHours?.weekdayDescriptions) {
                                  const today = new Date().getDay();
                                  const dayIndex = today === 0 ? 6 : today - 1;
                                  const todayHours = openingHours.weekdayDescriptions[dayIndex];
                                  
                                  if (isExpanded) {
                                    // Show all days
                                    return (
                                      <View style={styles.expandedOpeningHoursContainer}>
                                        {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                                          <Text key={idx} style={styles.expandedOpeningHoursText}>
                                            {dayHours}
                                          </Text>
                                        ))}
                                        <TouchableOpacity onPress={() => toggleOpeningHours(activityKey)}>
                                          <Text style={styles.expandedOpeningHoursToggle}>Thu gọn ↑</Text>
                                        </TouchableOpacity>
                                      </View>
                                    );
                                  } else if (todayHours) {
                                    // Show today only
                                    const hoursText = todayHours.split(': ')[1] || todayHours;
                                    return (
                                      <TouchableOpacity 
                                        style={styles.cardRow} 
                                        onPress={() => toggleOpeningHours(activityKey)}
                                      >
                                        <FontAwesome name="calendar" size={11} color={COLORS.textSecondary} />
                                        <Text style={styles.cardOpeningHours} numberOfLines={1}>
                                          {hoursText}
                                        </Text>
                                        <Text style={styles.expandMoreIndicator}> ↓</Text>
                                      </TouchableOpacity>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* Loading indicator */}
                              {isEnriching && (
                                <ActivityIndicator 
                                  size="small" 
                                  color={COLORS.primary} 
                                  style={styles.cardLoader} 
                                />
                              )}
                            </View>

                            {/* Right: Visit Check Button - Only show for main routes */}
                            {status === 'MAIN' && (
                              <TouchableOpacity
                                style={[
                                  styles.cardVisitButton,
                                  visitedActivities.has(`${selectedDay}-${index}`) && styles.cardVisitButtonChecked,
                                  animatingButtons.has(`${selectedDay}-${index}`) && styles.cardVisitButtonAnimating
                                ]}
                                onPress={() => toggleVisited(selectedDay, index)}
                                activeOpacity={0.7}
                              >
                                {visitedActivities.has(`${selectedDay}-${index}`) ? (
                                  <LinearGradient
                                    colors={['#66BB6A', '#66BB6A']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.cardVisitButtonGradient}
                                  >
                                    <MaterialCommunityIcons
                                      name="check"
                                      size={22}
                                      color={COLORS.textWhite}
                                    />
                                  </LinearGradient>
                                ) : (
                                  <MaterialCommunityIcons
                                    name="check"
                                    size={22}
                                    color={COLORS.textSecondary}
                                  />
                                )}
                              </TouchableOpacity>
                            )}
                          </View>

                        {/* Tap hint */}
                        <View style={styles.tapHint}>
                          <FontAwesome name="hand-pointer-o" size={10} color={COLORS.textSecondary} />
                          <Text style={styles.tapHintText}>Nhấn để xem chi tiết</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              });
          } catch (error) {
            console.error('❌ Error rendering activities:', error);
            return (
              <View style={styles.emptyState}>
                <FontAwesome name="exclamation-circle" size={48} color={COLORS.error} />
                <Text style={styles.emptyStateText}>Lỗi hiển thị hoạt động</Text>
                <Text style={styles.errorText}>{String(error)}</Text>
              </View>
            );
          }
        })()}
            
            {/* Add POI Button for DRAFT routes */}
            {status === 'DRAFT' && activities.length > 0 && (
              <TouchableOpacity
                style={styles.addPOIButtonBottom}
                onPress={handleAddPOI}
                activeOpacity={0.7}
                disabled={isUpdatingRoute}
              >
                <FontAwesome name="plus-circle" size={20} color={COLORS.primary} />
                <Text style={styles.addPOIButtonBottomText}>Thêm địa điểm</Text>
              </TouchableOpacity>
            )}
            </View>
          </GestureHandlerRootView>
        </View>
      </ScrollView>
      </GestureHandlerRootView>
          </>
        )}

        {/* POI Detail Bottom Sheet */}
        {selectedPlaceData && (
          <POIDetailBottomSheet
            visible={isBottomSheetVisible}
            onClose={() => {
              setIsBottomSheetVisible(false);
              setSelectedPlaceData(null);
            }}
            placeData={selectedPlaceData}
          />
        )}

        {overlayContent}
        {/* External footer actions (optional) */}
        {footerContent && <View style={styles.externalFooter}>{footerContent}</View>}
      </LinearGradient>

      {/* Replace POI Modal */}
      <Modal
        visible={isReplacePOIModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsReplacePOIModalVisible(false)}
      >
        <View style={styles.replaceModalContainer}>
          <View style={styles.replaceModalContent}>
            <View style={styles.replaceModalHeader}>
              <Text style={styles.replaceModalTitle}>Thay đổi địa điểm</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsReplacePOIModalVisible(false);
                  setReplacingPOI(null);
                  setSearchQuery('');
                }}
                style={styles.replaceModalCloseButton}
              >
                <FontAwesome name="close" size={20} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            {replacingPOI && (
              <View style={styles.currentPOIInfo}>
                <Text style={styles.currentPOILabel}>Địa điểm hiện tại:</Text>
                <Text style={styles.currentPOIName}>{replacingPOI.name || 'Không có tên'}</Text>
              </View>
            )}

            <View style={styles.searchInputContainer}>
              <FontAwesome name="search" size={18} color={COLORS.textSecondary} />
              
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm kiếm địa điểm thay thế..."
                placeholderTextColor={COLORS.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
              />
              {isSearching && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: SPACING.sm }} />
              )}
            </View>

            <FlatList
              data={autocompleteResults}
              keyExtractor={(item, index) => item.placeId || item.place_id || `suggestion-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.autocompleteItem}
                  onPress={() => handleSelectNewPOI(item)}
                  disabled={isUpdatingRoute}
                >
                  <View style={[styles.autocompleteItemIcon, item.isFavorite && styles.autocompleteItemIconFavorite]}>
                    {item.isFavorite ? (
                      <FontAwesome name="heart" size={20} color="#E91E63" />
                    ) : (
                      <FontAwesome name="map-marker" size={20} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={styles.autocompleteItemContent}>
                    <Text style={styles.autocompleteItemName} numberOfLines={1}>
                      {item.name || item.text?.text || item.text || item.description || 'Không có tên'}
                    </Text>
                    {(item.address || item.structuredFormat?.secondaryText || item.description) && (
                      <Text style={styles.autocompleteItemAddress} numberOfLines={1}>
                        {item.address || item.structuredFormat?.secondaryText || item.description}
                      </Text>
                    )}
                    {item.rating && (
                      <View style={styles.ratingContainer}>
                        <FontAwesome name="star" size={14} color="#FFB800" />
                        <Text style={styles.ratingText}>{item.rating}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isSearching && searchQuery.trim() ? (
                  <View style={styles.noResultsContainer}>
                    <Text style={styles.noResultsText}>
                      Không tìm thấy kết quả
                    </Text>
                  </View>
                ) : !isSearching && favoritesPlaces.length === 0 ? (
                  <View style={styles.noResultsContainer}>
                    <Text style={styles.noResultsText}>
                      Chưa có địa điểm yêu thích
                    </Text>
                  </View>
                ) : null
              }
              style={styles.autocompleteContainer}
            />

            {isUpdatingRoute && (
              <View style={styles.updatingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.updatingText}>Đang cập nhật lộ trình...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      
      {/* Add POI Modal */}
      <Modal
        visible={isAddPOIModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddPOIModalVisible(false)}
      >
        <View style={styles.replaceModalContainer}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsAddPOIModalVisible(false)}
          />
          <View style={styles.replaceModalContent}>
            {/* Header */}
            <View style={styles.replaceModalHeader}>
              <Text style={styles.replaceModalTitle}>Thêm địa điểm</Text>
              <TouchableOpacity
                onPress={() => setIsAddPOIModalVisible(false)}
                style={styles.replaceModalCloseButton}
              >
                <FontAwesome name="times" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            {/* Insert Position Selector */}
            <View style={styles.insertPositionContainer}>
              <Text style={styles.insertPositionLabel}>Vị trí thêm:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.insertPositionScroll}
                contentContainerStyle={styles.insertPositionScrollContent}
              >
                <TouchableOpacity
                  style={[
                    styles.insertPositionButton,
                    insertPosition === 0 && styles.insertPositionButtonActive
                  ]}
                  onPress={() => setInsertPosition(0)}
                >
                  <Text style={[
                    styles.insertPositionButtonText,
                    insertPosition === 0 && styles.insertPositionButtonTextActive
                  ]}>Đầu danh sách</Text>
                </TouchableOpacity>
                
                {activities.map((_, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.insertPositionButton,
                      insertPosition === idx + 1 && styles.insertPositionButtonActive
                    ]}
                    onPress={() => setInsertPosition(idx + 1)}
                  >
                    <Text style={[
                      styles.insertPositionButtonText,
                      insertPosition === idx + 1 && styles.insertPositionButtonTextActive
                    ]}>Sau điểm {idx + 1}</Text>
                  </TouchableOpacity>
                ))}
                
                <TouchableOpacity
                  style={[
                    styles.insertPositionButton,
                    insertPosition === -1 && styles.insertPositionButtonActive
                  ]}
                  onPress={() => setInsertPosition(-1)}
                >
                  <Text style={[
                    styles.insertPositionButtonText,
                    insertPosition === -1 && styles.insertPositionButtonTextActive
                  ]}>Cuối danh sách</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Search Input with Favorites Toggle */}
            <View style={styles.searchContainerWrapper}>
              {/* Favorites Toggle Button - Outside search box */}
              <TouchableOpacity
                style={[
                  styles.favoritesToggleButton,
                  isUsingFavorites && styles.favoritesToggleButtonActive
                ]}
                onPress={toggleAddFavoritesMode}
                activeOpacity={0.7}
              >
                <FontAwesome 
                  name={isUsingFavorites ? "heart" : "heart-o"} 
                  size={20} 
                  color={isUsingFavorites ? COLORS.textWhite : COLORS.primary} 
                />
              </TouchableOpacity>
              
              {/* Search Input Box */}
              <View style={styles.searchInputContainer}>
                <FontAwesome name="search" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm kiếm địa điểm..."
                  placeholderTextColor={COLORS.textSecondary}
                  value={addSearchQuery}
                  onChangeText={setAddSearchQuery}
                  autoFocus
                />
                {addSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setAddSearchQuery('');
                      const newSessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                      setAddSessionToken(newSessionToken);
                    }}
                  >
                    <FontAwesome name="times-circle" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
                {isAddSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
              </View>
            </View>
            
            {/* Hint text */}
            {!addSearchQuery.trim() && (
              <View style={styles.searchHintContainer}>
                <FontAwesome name="lightbulb-o" size={14} color={COLORS.primary} />
                <Text style={styles.searchHintText}>
                  {isUsingFavorites 
                    ? `Đang tìm trong ${favoritesPlaces.length} địa điểm yêu thích`
                    : 'Nhập tên địa điểm, nhà hàng, khách sạn, điểm du lịch...'}
                </Text>
              </View>
            )}
            
            {/* Status hint khi dùng favorites mode */}
            {isUsingFavorites && addSearchQuery.trim() && (
              <View style={styles.searchHintContainer}>
                <FontAwesome name="info-circle" size={14} color={COLORS.primary} />
                <Text style={styles.searchHintText}>
                  Đang tìm trong {favoritesPlaces.length} địa điểm yêu thích
                </Text>
              </View>
            )}

            {/* Search Results */}
            <ScrollView
              style={styles.autocompleteContainer}
              keyboardShouldPersistTaps="handled"
            >
              {addAutocompleteResults.length > 0 ? (
                addAutocompleteResults.map((result, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.autocompleteItem}
                    onPress={() => handleSelectAddPOI(result)}
                    disabled={isUpdatingRoute}
                  >
                    <View style={[
                      styles.autocompleteItemIcon,
                      result.isFavorite && styles.autocompleteItemIconFavorite
                    ]}>
                      <FontAwesome
                        name={result.isFavorite ? "heart" : "map-marker"}
                        size={16}
                        color={result.isFavorite ? "#E91E63" : COLORS.primary}
                      />
                    </View>
                    <View style={styles.autocompleteItemContent}>
                      <Text style={styles.autocompleteItemName} numberOfLines={1}>
                        {result.name || result.text}
                      </Text>
                      {result.address && (
                        <Text style={styles.autocompleteItemAddress} numberOfLines={1}>
                          {result.address}
                        </Text>
                      )}
                      {result.rating && (
                        <View style={styles.ratingContainer}>
                          <FontAwesome name="star" size={12} color="#F59E0B" />
                          <Text style={styles.ratingText}>{result.rating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noResultsContainer}>
                  <FontAwesome name="search" size={48} color={COLORS.textSecondary} opacity={0.3} />
                  <Text style={styles.noResultsText}>
                    {addSearchQuery.trim() ? 'Không tìm thấy địa điểm nào' : 'Tìm kiếm hoặc chọn từ yêu thích'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Loading Indicator */}
            {isUpdatingRoute && (
              <View style={styles.updatingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.updatingText}>Đang thêm địa điểm...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: SPACING.md,
  },
  closeButtonText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.32,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: SPACING.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  startMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bgMain,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bgMain,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'visible',
  },
  markerContainer: {
    overflow: 'visible',
  },
  markerText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: 'bold',
  },
  markerVisited: {
    backgroundColor: '#66BB6A',
    borderColor: '#66BB6A',
    shadowColor: '#66BB6A',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'visible',
  },
  tabsContainer: {
    backgroundColor: 'transparent',
    paddingVertical: SPACING.md,
  },
  tabsScrollContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  tab: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    marginRight: SPACING.sm,
    borderRadius: SPACING.lg,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  activitiesContainer: {
    flex: 1,
  },
  activitiesContent: {
    padding: SPACING.lg,
    paddingBottom: 140, // Extra padding để tránh bị che bởi footer buttons
  },
  emptyState: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  // Travel time indicator
  travelTimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  travelDashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  travelTimebadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs / 2,
    backgroundColor: COLORS.primary + '15',
    borderRadius: SPACING.lg,
    marginHorizontal: SPACING.sm,
  },
  travelTimeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Activity Card - Modern Design
  activityCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    marginBottom: SPACING.md,
    overflow: 'visible', // Changed to visible to show badge overflow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.primary + '10',
    position: 'relative',
  },
  activityCardVisited: {
    borderColor: '#66BB6A',
    borderWidth: 2,
    shadowColor: '#66BB6A',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  activityCardDragging: {
    opacity: 0.8,
    transform: [{ scale: 1.05 }],
    shadowColor: COLORS.primary,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  cardNumberBadge: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  cardNumberBadgeVisited: {
    shadowColor: '#66BB6A',
  },
  cardNumberBadgeTop: {
    position: 'absolute',
    top: -12,
    left: SPACING.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    display: 'none', // Hide this
  },
  cardGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  cardVisitedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    borderRadius: SPACING.lg,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    // Dành chỗ cho huy hiệu (badge rộng 44 + margin), tránh đè lên text
    paddingLeft: SPACING.xl + 44,
    gap: SPACING.md,
  },
  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  numberBadgeGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  cardInfo: {
    flex: 1,
    gap: SPACING.xs / 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: 0.2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardTime: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  cardOpeningHours: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  cardRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFB800',
  },
  cardLoader: {
    marginTop: SPACING.xs,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.xs / 2,
  },
  tapHintText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  cardReplaceButton: {
    width: 70,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  cardReplaceButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  cardVisitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4DB8FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
    transform: [{ scale: 1 }],
  },
  cardVisitButtonChecked: {
    backgroundColor: '#66BB6A',
    borderColor: '#66BB6A',
    shadowColor: '#66BB6A',
    shadowOpacity: 0.4,
    transform: [{ scale: 1.05 }],
  },
  cardVisitButtonAnimating: {
    transform: [{ scale: 1.2 }],
  },
  cardVisitButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replaceModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  replaceModalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: SPACING.lg,
    borderTopRightRadius: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  replaceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  replaceModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  replaceModalCloseButton: {
    padding: SPACING.xs,
  },
  currentPOIInfo: {
    backgroundColor: COLORS.primary + '10',
    padding: SPACING.md,
    borderRadius: SPACING.md,
    marginBottom: SPACING.md,
  },
  currentPOILabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs / 2,
  },
  currentPOIName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  searchContainerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: COLORS.textDark,
  },
  autocompleteContainer: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  autocompleteItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  autocompleteItemIconFavorite: {
    backgroundColor: '#FCE4EC',
  },
  autocompleteItemContent: {
    flex: 1,
  },
  autocompleteItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.xs / 2,
  },
  autocompleteItemAddress: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  noResultsText: {
    textAlign: 'center',
    padding: SPACING.lg,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  favoritesToggleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.textWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritesToggleButtonActive: {
    backgroundColor: '#E91E63',
    borderColor: '#E91E63',
  },
  searchHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  searchHintText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
    flex: 1,
  },
  updatingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  updatingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  externalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg + 8,
    paddingTop: SPACING.md,
    backgroundColor: 'transparent',
  },
  // Insert Position Selector Styles
  insertPositionContainer: {
    marginBottom: SPACING.md,
  },
  insertPositionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.sm,
  },
  insertPositionScroll: {
    maxHeight: 50,
  },
  insertPositionScrollContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  insertPositionButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  insertPositionButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  insertPositionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  insertPositionButtonTextActive: {
    color: COLORS.textWhite,
  },
  // Swipe Actions Styles
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  swipeActionButton: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs / 2,
  },
  swipeEditButton: {
    backgroundColor: COLORS.primary,
  },
  swipeDeleteButton: {
    backgroundColor: '#E91E63',
  },
  swipeActionText: {
    color: COLORS.textWhite,
    fontSize: 11,
    fontWeight: '600',
  },
  // Expanded Opening Hours Styles
  expandedOpeningHoursContainer: {
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: SPACING.sm,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
  },
  expandedOpeningHoursText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  expandedOpeningHoursToggle: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: SPACING.xs / 2,
  },
  expandMoreIndicator: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  addPOIButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: SPACING.lg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addPOIButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  addPOIButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  addPOIButtonBottomText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default ItineraryViewScreen;