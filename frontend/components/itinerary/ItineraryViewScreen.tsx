import React, { useState, useEffect, useRef, ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../constants';
import { TravelRoute, getRouteByIdAPI, enrichPlaceAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { POIDetailBottomSheet } from '../place/POIDetailBottomSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROUTE_COLORS = {
  glow: 'rgba(0, 163, 255, 0.25)',
  border: '#4DB8FF',
  main: COLORS.primary,
} as const;

const CARD_WIDTH = SCREEN_WIDTH - SPACING.lg * 2;

interface Activity {
  name: string;
  location: { lat: number; lng: number };
  estimated_arrival?: string;
  estimated_departure?: string;
  emotional_tags?: Record<string, number>;
  ecs_score?: number;
  travel_duration_minutes?: number;
  encoded_polyline?: string;
  google_place_id?: string;
  time?: string;
  activity?: string;
  place?: {
    name: string;
    location?: { coordinates: [number, number] };
    address?: string;
  };
}

interface DayPlan {
  day: number;
  activities: Activity[];
  day_start_time?: string;
  startLocationCoordinates?: { lat: number; lng: number };
}

// Custom itinerary DTO (partial) to support manual routes
interface CustomPlaceWithRoute {
  placeId: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  encoded_polyline?: string | null;
  travel_duration_minutes?: number | null;
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
}

export const ItineraryViewScreen: React.FC<ItineraryViewScreenProps> = ({
  visible,
  onClose,
  routeId,
  footerContent,
  customRouteData = null,
  isManual = false,
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

  // Sync custom route data (manual)
  useEffect(() => {
    if (customRouteData) {
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
          activities: (d.places || []).map((p) => ({
            name: p.name,
            location: p.location,
            google_place_id: (p as any).google_place_id || p.placeId,
            encoded_polyline: p.encoded_polyline || undefined,
            travel_duration_minutes:
              p.travel_duration_minutes != null ? Number(p.travel_duration_minutes) : undefined,
            estimated_arrival: (p as any).estimated_arrival,
            estimated_departure: (p as any).estimated_departure,
          })),
          day_start_time: (d as any).day_start_time,
        }))
      : []);

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

  // Get current day activities
  const currentDayData = optimizedRoute.find((d: DayPlan) => d.day === selectedDay);
  const activities: Activity[] = currentDayData?.activities || [];

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

  // Route segments for polylines
  const routeSegments = activities
    .map((activity) => decodePolyline(activity.encoded_polyline))
    .filter((segment) => segment.length > 1);

  // Update map region when day changes
  useEffect(() => {
    const region = calculateMapRegion(activities, startLocation);
    if (region) {
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 500);
    }
  }, [selectedDay, activities, startLocation]);

  // Fit to markers
  const handleFitToMarkers = () => {
    const coords = activities
      .map((a) => a.location || a.place?.location)
      .filter(Boolean)
      .map(toMapCoordinate)
      .filter(Boolean) as { latitude: number; longitude: number }[];

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
        openingHours: enrichedData.openingHours || enrichedData.opening_hours || null,
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
                  if (act.place) {
                    act.place.name = enrichedData.name;
                  }
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
                  key={`polyline-${idx}`}
                  coordinates={segment}
                  strokeColor={ROUTE_COLORS.main}
                  strokeWidth={3}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}

              {/* Start marker */}
              {startLocation && toMapCoordinate(startLocation) && (
                <Marker coordinate={toMapCoordinate(startLocation)!} title="Điểm bắt đầu">
                  <View style={styles.startMarker}>
                    <Text style={styles.markerText}>BĐ</Text>
                  </View>
                </Marker>
              )}

              {/* Markers */}
              {activities.map((activity, index) => {
                const coord = toMapCoordinate(activity.location || activity.place?.location);
                if (!coord) return null;

                return (
                  <Marker key={`marker-${index}`} coordinate={coord}>
                    <View style={styles.marker}>
                      <Text style={styles.markerText}>{index + 1}</Text>
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
            {activities.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome name="map-o" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyStateText}>Chưa có hoạt động nào</Text>
              </View>
            ) : (
              activities.map((activity, index) => {
                const activityName = activity.name || activity.place?.name || 'Hoạt động';
                const arrival = activity.estimated_arrival || activity.time;
                const departure = activity.estimated_departure;
                const duration = calculateDuration(arrival, departure);
                const travelTime = activity.travel_duration_minutes;
                const hasPhoto = activity.google_place_id; // Sẽ fetch ảnh khi click
                const rating = activity.ecs_score;

                return (
                  <View key={`activity-${index}`}>
                    {/* Travel time indicator */}
                    {index > 0 && travelTime && (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <FontAwesome name="car" size={12} color={COLORS.primary} />
                          <Text style={styles.travelTimeBadgeText}>{travelTime}m</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    )}

                    {/* Activity Card */}
                    <TouchableOpacity
                      style={styles.activityCard}
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

                      {/* Number Badge - Positioned Absolutely at Top-Left */}
                      <View style={styles.cardNumberBadge}>
                        <LinearGradient
                          colors={[COLORS.primary, COLORS.gradientSecondary]}
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

                          {/* Loading indicator */}
                          {isEnriching && (
                            <ActivityIndicator 
                              size="small" 
                              color={COLORS.primary} 
                              style={styles.cardLoader} 
                            />
                          )}
                        </View>

                        {/* Right: Arrow Icon */}
                        <View style={styles.cardArrow}>
                          <FontAwesome name="chevron-right" size={16} color={COLORS.primary} />
                        </View>
                      </View>

                      {/* Tap hint */}
                      <View style={styles.tapHint}>
                        <FontAwesome name="hand-pointer-o" size={10} color={COLORS.textSecondary} />
                        <Text style={styles.tapHintText}>Nhấn để xem chi tiết</Text>
                      </View>
                    </TouchableOpacity>
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

        {/* External footer actions (optional) */}
        {footerContent && <View style={styles.externalFooter}>{footerContent}</View>}
      </LinearGradient>
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  },
  markerText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: 'bold',
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
});

export default ItineraryViewScreen;
