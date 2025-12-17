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
  Animated,
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
  place?: { location: { lat: number; lng: number } };
  google_place_id?: string;
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

  const [routeDetails, setRouteDetails] = useState<TravelRoute | CustomItineraryResponse | null>(
    customRouteData,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
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
    () => optimizedRoute.find((d: DayPlan) => d.day === selectedDay),
    [optimizedRoute, selectedDay]
  );
  const activities: Activity[] = useMemo(
    () => currentDayData?.activities || [],
    [currentDayData]
  );

  // Auto-enrich all activities of current day to get opening hours
  useEffect(() => {
    const enrichCurrentDayActivities = async () => {
      if (!activities || activities.length === 0 || !routeDetails) return;

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        console.log('⚠️ No token, skipping opening hours enrichment');
        return;
      }

      // Process all activities in parallel with timeout
      const enrichPromises = activities.map(async (activity, index) => {
        const placeId = activity.google_place_id;
        if (!placeId) return;

        // Create unique key for this activity
        const enrichKey = `${selectedDay}-${index}-${placeId}`;
        
        // Skip if already enriched or currently enriching
        if (enrichedActivitiesRef.current.has(enrichKey) || enrichingInProgressRef.current.has(enrichKey)) {
          return;
        }

        // Skip if already has openingHours
        if ((activity as any).openingHours) {
          enrichedActivitiesRef.current.add(enrichKey);
          return;
        }

        // Mark as enriching
        enrichingInProgressRef.current.add(enrichKey);

        try {
          // Add timeout to prevent hanging (5s)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          
          const enrichPromise = enrichPlaceAPI(token, placeId, false);
          const response = await Promise.race([enrichPromise, timeoutPromise]) as any;
          
          const enrichedData = response?.data || response;

          if (!enrichedData) {
            enrichedActivitiesRef.current.add(enrichKey);
            return;
          }

          // Try to get opening hours from multiple sources
          let openingHours = enrichedData.openingHours || enrichedData.opening_hours || null;
          
          // Fallback to weekdayDescriptions if openingHours is not available
          if (!openingHours && (enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions)) {
            openingHours = {
              weekdayDescriptions: enrichedData.weekdayDescriptions || enrichedData.weekday_descriptions
            };
          }
          
          if (openingHours) {
            // Update routeDetails immediately
            setRouteDetails(prevDetails => {
              if (!prevDetails) return prevDetails;
              
              try {
                const updatedDetails = JSON.parse(JSON.stringify(prevDetails));
                const routeDataToUpdate = updatedDetails.route_data_json || updatedDetails;
                
                const normalizedPlaceId = placeId.replace(/^places\//, '');
                const enrichedPlaceId = (enrichedData.googlePlaceId || '').replace(/^places\//, '');

                // Update in optimized_route
                if (routeDataToUpdate.optimized_route && Array.isArray(routeDataToUpdate.optimized_route)) {
                  routeDataToUpdate.optimized_route.forEach((day: DayPlan) => {
                    if (day.day !== selectedDay) return;
                    if (day.activities && Array.isArray(day.activities)) {
                      day.activities.forEach((act: Activity) => {
                        const actPlaceId = (act.google_place_id || '').replace(/^places\//, '');
                        if (actPlaceId === normalizedPlaceId || actPlaceId === enrichedPlaceId) {
                          (act as any).openingHours = openingHours;
                        }
                      });
                    }
                  });
                }

                // Update in days (custom itinerary)
                if (routeDataToUpdate.days && Array.isArray(routeDataToUpdate.days)) {
                  routeDataToUpdate.days.forEach((day: CustomDayWithRoutes) => {
                    if ((day.day ?? day.dayNumber) !== selectedDay) return;
                    if (day.places && Array.isArray(day.places)) {
                      day.places.forEach((place: CustomPlaceWithRoute) => {
                        const placeIdToMatch = ((place as any).google_place_id || place.placeId || '').replace(/^places\//, '');
                        if (placeIdToMatch === normalizedPlaceId || placeIdToMatch === enrichedPlaceId) {
                          (place as any).openingHours = openingHours;
                        }
                      });
                    }
                  });
                }

                if (updatedDetails.route_data_json) {
                  updatedDetails.route_data_json = routeDataToUpdate;
                } else {
                  Object.assign(updatedDetails, routeDataToUpdate);
                }
                
                return updatedDetails;
              } catch (updateErr) {
                console.warn(`⚠️ Error updating route details for ${activity.name}:`, updateErr);
                return prevDetails; // Return unchanged if update fails
              }
            });
            
            enrichedActivitiesRef.current.add(enrichKey);
          } else {
            enrichedActivitiesRef.current.add(enrichKey); // Mark as enriched even if no opening hours
          }
        } catch (err: any) {
          // Skip silently - mark as enriched to avoid retry
          enrichedActivitiesRef.current.add(enrichKey);
        } finally {
          enrichingInProgressRef.current.delete(enrichKey);
        }
      });

      // Wait for all enrichments to complete (or fail gracefully)
      await Promise.allSettled(enrichPromises);
    };

    enrichCurrentDayActivities();
  }, [selectedDay, activities.length, routeDetails?.route_id, refreshEnrichKey]); // Thêm refreshEnrichKey để trigger lại enrich khi route thay đổi

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
      
      const segments: { points: { latitude: number; longitude: number }[]; mode: string }[] = [];

      // Đoạn từ điểm bắt đầu đến POI đầu tiên
      if (startLocation && activities.length > 0) {
        console.log('   - Checking first activity for start_encoded_polyline...');
        console.log('     First activity:', activities[0]?.name);
        console.log('     Has start_encoded_polyline:', !!activities[0]?.start_encoded_polyline);
        
        if (activities[0]?.start_encoded_polyline) {
          const decoded = decodePolyline(activities[0].start_encoded_polyline);
          console.log('     ✅ Decoded start polyline, points:', decoded.length);
          segments.push({
            points: decoded,
            mode: 'DRIVE', // Default to DRIVE for start segment
          });
        } else {
          console.log('     ⚠️ No start_encoded_polyline found for first activity');
        }
      }

      activities.forEach((activity, idx) => {
        console.log(`   - Processing POI ${idx} (${activity.name})...`);
        console.log(`     Has encoded_polyline: ${!!activity.encoded_polyline}`);
        console.log(`     Has steps: ${!!activity.steps}`);
        
        if (activity.steps && activity.steps.length > 0) {
          activity.steps.forEach((step, stepIdx) => {
            const decoded = decodePolyline(step.encoded_polyline);
            if (decoded.length > 1) {
              console.log(`       Step ${stepIdx}: ${decoded.length} points`);
              segments.push({
                points: decoded,
                mode: step.travel_mode,
              });
            }
          });
        } else {
          const decoded = decodePolyline(activity.encoded_polyline);
          if (decoded.length > 1) {
            console.log(`     ✅ Decoded polyline: ${decoded.length} points`);
            segments.push({
              points: decoded,
              mode: 'DRIVE', // Default
            });
          } else {
            console.log(`     ⚠️ No valid polyline (${decoded.length} points)`);
          }
        }
      });

      console.log(`   📊 Total segments created: ${segments.length}`);
      return segments.filter((segment) => segment.points.length > 1);
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
        setAutocompleteResults(normalized);
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
                const mergedRoute = {
                  ...result.route,
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

  // Handle move POI up/down
  const handleMovePOI = async (dayIndex: number, activityIndex: number, direction: 'up' | 'down', event: any) => {
    event?.stopPropagation();
    if (!routeDetails) return;

    const newIndex = direction === 'up' ? activityIndex - 1 : activityIndex + 1;

    // ✅ CRITICAL: Check bounds BEFORE any processing
    const routeData = (routeDetails as any).route_data_json || routeDetails;
    let activitiesCount = 0;
    
    // Get activities count for the current day
    if (routeData.optimized_route && Array.isArray(routeData.optimized_route)) {
      const currentDay = routeData.optimized_route.find((d: any) => d.day === dayIndex);
      activitiesCount = currentDay?.activities?.length || 0;
    } else if (routeData.days && Array.isArray(routeData.days)) {
      const currentDay = routeData.days.find((d: any) => (d.day ?? d.dayNumber) === dayIndex);
      activitiesCount = currentDay?.places?.length || 0;
    }
    
    // Early return if out of bounds
    if (newIndex < 0 || newIndex >= activitiesCount) {
      console.log(`⚠️ Cannot move: newIndex ${newIndex} out of bounds (0-${activitiesCount - 1})`);
      return;
    }

    try {
      setIsUpdatingRoute(true);
      
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để thay đổi thứ tự.');
        setIsUpdatingRoute(false);
        return;
      }

      // Deep clone routeData (giữ nguyên destination, duration_days, start_datetime, metadata)
      const updatedRoute = JSON.parse(JSON.stringify(routeData));

      // Move POI trong optimized_route (AI route)
      if (updatedRoute.optimized_route && Array.isArray(updatedRoute.optimized_route)) {
        updatedRoute.optimized_route.forEach((day: any, idx: number) => {
          if (day.day === dayIndex && day.activities) {
            // Swap (bounds already checked above)
            const temp = day.activities[activityIndex];
            day.activities[activityIndex] = day.activities[newIndex];
            day.activities[newIndex] = temp;
          }
          // Ensure required fields
          if (!day.travel_mode) day.travel_mode = 'driving';
          if (!day.day_start_time) day.day_start_time = '09:00:00';
          if (day.day === undefined) day.day = idx + 1;
        });
      }

      // Move POI trong days (custom itinerary)
      if (updatedRoute.days && Array.isArray(updatedRoute.days)) {
        updatedRoute.days.forEach((day: any) => {
          const dayNum = day.day ?? day.dayNumber;
          if (dayNum === dayIndex && day.places) {
            // Swap (bounds already checked above)
            const temp = day.places[activityIndex];
            day.places[activityIndex] = day.places[newIndex];
            day.places[newIndex] = temp;
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
          message: 'Thay đổi thứ tự địa điểm',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || 'Không thể cập nhật lộ trình');
      }

      const result = await response.json();
      if (result.route) {
        const mergedRoute = {
          ...result.route,
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
        
        // ✅ Success feedback
        Alert.alert('Thành công', 'Đã thay đổi thứ tự địa điểm');
      }
    } catch (error: any) {
      console.error('❌ Error moving POI:', error);
      Alert.alert('Lỗi', error.message || 'Không thể thay đổi thứ tự');
    } finally {
      setIsUpdatingRoute(false);
    }
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
  const renderRightActions = (index: number) => (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

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
          <Animated.View style={{ transform: [{ scale }] }}>
            <FontAwesome name="pencil" size={20} color={COLORS.textWhite} />
          </Animated.View>
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
          <Animated.View style={{ transform: [{ scale }] }}>
            <FontAwesome name="trash-o" size={20} color={COLORS.textWhite} />
          </Animated.View>
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
        // Giữ lại start_location nếu response không có
        const mergedRoute = {
          ...result.route,
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

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
                const placeId = activity.google_place_id || `activity-${index}`;
                
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

            {activities.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome name="map-o" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyStateText}>Chưa có hoạt động nào</Text>
              </View>
            ) : (
              activities.map((activity, index) => {
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

                    {/* Swipeable Activity Card - Only swipeable in DRAFT mode */}
                    {status === 'DRAFT' ? (
                      <Swipeable
                        renderRightActions={renderRightActions(index)}
                        overshootRight={false}
                        friction={2}
                      >
                        <TouchableOpacity
                          style={[styles.activityCard, isVisited && styles.activityCardVisited]}
                          onPress={() => handleActivityPress(activity)}
                          disabled={isEnriching}
                          activeOpacity={0.7}
                        >
                          {/* Card content goes here - same as below */}
                          <LinearGradient
                            colors={[COLORS.primary + '15', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cardGradientOverlay}
                          />

                          {/* Number Badge */}
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

                              {/* Opening Hours Row */}
                              {(() => {
                                const openingHours = (activity as any).openingHours;
                                const activityKey = `${selectedDay}-${index}`;
                                const isExpanded = expandedOpeningHours.has(activityKey);
                                
                                if (openingHours?.weekdayDescriptions) {
                                  const today = new Date().getDay();
                                  const dayIndex = today === 0 ? 6 : today - 1;
                                  const todayHours = openingHours.weekdayDescriptions[dayIndex];
                                  
                                  return (
                                    <View style={styles.openingHoursContainer}>
                                      {todayHours && (
                                        <TouchableOpacity 
                                          style={styles.cardRow}
                                          onPress={() => toggleOpeningHours(activityKey)}
                                          activeOpacity={0.7}
                                        >
                                          <FontAwesome name="calendar" size={11} color={COLORS.textSecondary} />
                                          <Text style={styles.cardOpeningHours} numberOfLines={1}>
                                            {todayHours.split(': ')[1] || todayHours}
                                          </Text>
                                          <FontAwesome 
                                            name={isExpanded ? "chevron-up" : "chevron-down"} 
                                            size={10} 
                                            color={COLORS.textSecondary}
                                            style={{ marginLeft: 4 }}
                                          />
                                        </TouchableOpacity>
                                      )}
                                      
                                      {isExpanded && (
                                        <View style={styles.allHoursContainer}>
                                          {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                                            <Text key={idx} style={styles.dayHoursText}>
                                              {dayHours}
                                            </Text>
                                          ))}
                                        </View>
                                      )}
                                    </View>
                                  );
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

                            {/* Right: Drag Handle */}
                            <View style={styles.cardDragHandle}>
                              <MaterialCommunityIcons name="drag-vertical" size={24} color={COLORS.textSecondary} />
                            </View>
                          </View>

                          {/* Tap hint */}
                          <View style={styles.tapHint}>
                            <FontAwesome name="hand-pointer-o" size={10} color={COLORS.textSecondary} />
                            <Text style={styles.tapHintText}>Nhấn để xem chi tiết</Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    ) : (
                      /* Non-swipeable card for MAIN routes */
                      <TouchableOpacity
                        style={[styles.activityCard, isVisited && styles.activityCardVisited]}
                        onPress={() => handleActivityPress(activity)}
                        disabled={isEnriching}
                        activeOpacity={0.7}
                      >
                        {/* Card content - same as above but with visit button instead of drag handle */}
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

                          {/* Opening Hours Row */}
                          {(() => {
                            const openingHours = (activity as any).openingHours;
                            const activityKey = `${selectedDay}-${index}`;
                            const isExpanded = expandedOpeningHours.has(activityKey);
                            
                            if (openingHours?.weekdayDescriptions) {
                              const today = new Date().getDay();
                              const dayIndex = today === 0 ? 6 : today - 1;
                              const todayHours = openingHours.weekdayDescriptions[dayIndex];
                              
                              return (
                                <View style={styles.openingHoursContainer}>
                                  {/* Today's hours */}
                                  {todayHours && (
                                    <TouchableOpacity 
                                      style={styles.cardRow}
                                      onPress={() => toggleOpeningHours(activityKey)}
                                      activeOpacity={0.7}
                                    >
                                      <FontAwesome name="calendar" size={11} color={COLORS.textSecondary} />
                                      <Text style={styles.cardOpeningHours} numberOfLines={1}>
                                        {todayHours.split(': ')[1] || todayHours}
                                      </Text>
                                      <FontAwesome 
                                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                                        size={10} 
                                        color={COLORS.textSecondary}
                                        style={{ marginLeft: 4 }}
                                      />
                                    </TouchableOpacity>
                                  )}
                                  
                                  {/* All week hours (when expanded) */}
                                  {isExpanded && (
                                    <View style={styles.allHoursContainer}>
                                      {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                                        <Text key={idx} style={styles.dayHoursText}>
                                          {dayHours}
                                        </Text>
                                      ))}
                                    </View>
                                  )}
                                </View>
                              );
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

                        {/* Right: Drag Handle - Only show for draft routes */}
                        {status === 'DRAFT' && (
                          <View style={styles.cardDragHandle}>
                            <MaterialCommunityIcons name="drag-vertical" size={24} color={COLORS.textSecondary} />
                          </View>
                        )}

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
              })
            )}
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: SPACING.xxxl,
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
    flex: 1,
  },
  openingHoursContainer: {
    width: '100%',
  },
  allHoursContainer: {
    marginTop: SPACING.xs,
    paddingLeft: SPACING.md,
    paddingTop: SPACING.xs,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
  },
  dayHoursText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  cardActionButtons: {
    flexDirection: 'row',
    gap: SPACING.xs / 2,
    alignItems: 'center',
  },
  cardActionButton: {
    width: 30,
    height: 30,
    borderRadius: SPACING.sm,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActionButtonDisabled: {
    opacity: 0.3,
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
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgLightBlue,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  favoritesToggleButtonActive: {
    backgroundColor: COLORS.primary,
  },
  searchHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  searchHintText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
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
  // Swipe actions styles
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  swipeActionButton: {
    width: 70,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeEditButton: {
    backgroundColor: COLORS.primary,
  },
  swipeDeleteButton: {
    backgroundColor: '#EF5350',
  },
  // Drag handle styles
  cardDragHandle: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: SPACING.sm,
  },
});

export default ItineraryViewScreen;
