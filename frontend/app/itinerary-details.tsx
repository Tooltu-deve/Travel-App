import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS, SPACING } from '../constants';
import { TravelRoute, getRouteByIdAPI, enrichPlaceAPI } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { POIDetailBottomSheet } from '../components/place/POIDetailBottomSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROUTE_COLORS = {
  glow: 'rgba(0, 163, 255, 0.25)',
  border: '#4DB8FF',
  main: COLORS.primary,
} as const;

interface Step {
  travel_mode: string;
  encoded_polyline: string;
  instruction: string;
}

interface Activity {
  name: string;
  location: { lat: number; lng: number };
  estimated_arrival?: string;
  estimated_departure?: string;
  emotional_tags?: Record<string, number>;
  ecs_score?: number;
  travel_duration_minutes?: number;
  encoded_polyline?: string;
  steps?: Step[];
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
}

export default function ItineraryDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as { routeId: string };
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [routeDetails, setRouteDetails] = useState<TravelRoute | null>(null);
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

  // Fetch route details
  useEffect(() => {
    const fetchRouteDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setError('Vui lòng đăng nhập lại');
          return;
        }

        const response = await getRouteByIdAPI(token, params.routeId);
        setRouteDetails(response.route);
      } catch (err: any) {
        console.error('Error fetching route details:', err);
        setError(err.message || 'Không thể tải chi tiết lộ trình');
      } finally {
        setIsLoading(false);
      }
    };

    if (params.routeId) {
      fetchRouteDetails();
    }
  }, [params.routeId]);

  // Parse route data
  const routeData = routeDetails?.route_data_json as any;
  const optimizedRoute = routeData?.optimized_route || [];
  const totalDays = optimizedRoute.length || routeDetails?.duration_days || 1;

  const title =
    routeDetails?.title ||
    routeData?.summary?.title ||
    routeData?.metadata?.title ||
    `Lộ trình ${routeDetails?.destination || ''}`;

  const destination =
    routeDetails?.destination ||
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
  const calculateMapRegion = (activities: Activity[]) => {
    const coords: { latitude: number; longitude: number }[] = [];

    // Add start location if available
    if (routeDetails?.start_location) {
      coords.push({
        latitude: routeDetails.start_location.lat,
        longitude: routeDetails.start_location.lng,
      });
    }

    // Add activity coordinates
    const activityCoords = activities
      .map((a) => a.location || a.place?.location)
      .filter(Boolean)
      .map(toMapCoordinate)
      .filter(Boolean) as { latitude: number; longitude: number }[];

    coords.push(...activityCoords);

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
  const routeSegments = (() => {
    const segments: { points: { latitude: number; longitude: number }[]; mode: string }[] = [];

    activities.forEach((activity) => {
      if (activity.steps && activity.steps.length > 0) {
        activity.steps.forEach((step) => {
          const decoded = decodePolyline(step.encoded_polyline);
          if (decoded.length > 1) {
            segments.push({
              points: decoded,
              mode: step.travel_mode,
            });
          }
        });
      } else {
        const decoded = decodePolyline(activity.encoded_polyline);
        if (decoded.length > 1) {
          segments.push({
            points: decoded,
            mode: 'DRIVE', // Default
          });
        }
      }
    });

    return segments.filter((segment) => segment.points.length > 1);
  })();

  // Update map region when day changes
  useEffect(() => {
    const region = calculateMapRegion(activities);
    if (region) {
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 500);
    }
  }, [selectedDay, activities]);

  // Fit to markers
  const handleFitToMarkers = () => {
    const coords: { latitude: number; longitude: number }[] = [];

    // Add start location if available
    if (routeDetails?.start_location) {
      coords.push({
        latitude: routeDetails.start_location.lat,
        longitude: routeDetails.start_location.lng,
      });
    }

    // Add activity coordinates
    const activityCoords = activities
      .map((a) => a.location || a.place?.location)
      .filter(Boolean)
      .map(toMapCoordinate)
      .filter(Boolean) as { latitude: number; longitude: number }[];

    coords.push(...activityCoords);

    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  // Handle activity press
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
        return;
      }

      const response = await enrichPlaceAPI(token, placeId, false);
      const enrichedData = response?.data || response;

      const mappedPlaceData = {
        _id: enrichedData.googlePlaceId,
        googlePlaceId: enrichedData.googlePlaceId,
        name: enrichedData.name,
        address: enrichedData.address,
        formatted_address: enrichedData.address,
        description: enrichedData.description || enrichedData.editorialSummary,
        editorialSummary: enrichedData.editorialSummary,
        rating: enrichedData.rating,
        user_ratings_total: enrichedData.reviews?.length || 0,
        contactNumber: enrichedData.contactNumber,
        phone: enrichedData.contactNumber,
        websiteUri: enrichedData.websiteUri,
        website: enrichedData.websiteUri,
        photos: enrichedData.photos || [],
        reviews: enrichedData.reviews?.map((review: any) => ({
          authorName: review.authorAttributions?.[0]?.displayName || 
                     review.authorAttributions?.displayName || 
                     'Người dùng ẩn danh',
          rating: review.rating,
          text: review.text,
          relativePublishTimeDescription: review.relativePublishTimeDescription,
          publishTime: review.relativePublishTimeDescription,
          authorAttributions: review.authorAttributions,
        })) || [],
        type: enrichedData.type,
        types: enrichedData.types,
        location: enrichedData.location,
        openingHours: enrichedData.openingHours,
        priceLevel: enrichedData.priceLevel,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
    } catch (err: any) {
      console.error('Error enriching place:', err);
      Alert.alert('Lỗi', err.message || 'Không thể tải thông tin địa điểm');
    } finally {
      setIsEnriching(false);
    }
  };

  if (isLoading) {
    return (
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.container}
      >
        <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Đang tải chi tiết lộ trình...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.container}
      >
        <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
          <FontAwesome name="exclamation-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textDark} />
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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
                    segment.mode === 'TRANSIT' ? '#4CAF50' : ROUTE_COLORS.main
                  }
                  strokeWidth={3}
                  lineDashPattern={segment.mode === 'WALK' ? [20, 10] : undefined}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}

              {/* Markers */}
              {/* Start Location Marker */}
              {routeDetails?.start_location && (
                <Marker 
                  key={`start-location-${selectedDay}`}
                  coordinate={{
                    latitude: routeDetails.start_location.lat,
                    longitude: routeDetails.start_location.lng,
                  }}
                >
                  <View style={styles.startMarker}>
                    <Text style={styles.markerText}>BĐ</Text>
                  </View>
                </Marker>
              )}

              {/* Activity Markers */}
              {activities.map((activity, index) => {
                const coord = toMapCoordinate(activity.location || activity.place?.location);
                if (!coord) return null;

                return (
                  <Marker key={`marker-${selectedDay}-${index}`} coordinate={coord}>
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
              // travel_duration_minutes của activity hiện tại là thời gian di chuyển từ điểm trước đó đến nó
              const travelTimeRaw = activity.travel_duration_minutes;
              const travelTime = travelTimeRaw != null ? Math.round(travelTimeRaw) : null;
              const rating = activity.ecs_score;

              return (
                <View key={`activity-${index}`}>
                  {/* Travel time indicator */}
                  {index > 0 && travelTime != null && (
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
                    <LinearGradient
                      colors={[COLORS.primary + '15', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradientOverlay}
                    />

                    <View style={styles.cardContent}>
                      <View style={styles.numberBadge}>
                        <LinearGradient
                          colors={[COLORS.primary, COLORS.gradientSecondary]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.numberBadgeGradient}
                        >
                          <Text style={styles.numberBadgeText}>{index + 1}</Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {activityName}
                        </Text>
                        
                        <View style={styles.cardRow}>
                          <FontAwesome name="clock-o" size={12} color={COLORS.primary} />
                          <Text style={styles.cardTime}>
                            {formatTime(arrival)}
                            {duration && ` • ${duration}`}
                          </Text>
                        </View>

                        {rating !== undefined && (
                          <View style={styles.cardRow}>
                            <FontAwesome name="star" size={12} color="#FFB800" />
                            <Text style={styles.cardRating}>
                              Phù hợp: {rating.toFixed(1)}/10
                            </Text>
                          </View>
                        )}

                        {isEnriching && (
                          <ActivityIndicator 
                            size="small" 
                            color={COLORS.primary} 
                            style={styles.cardLoader} 
                          />
                        )}
                      </View>

                      <View style={styles.cardArrow}>
                        <FontAwesome name="chevron-right" size={16} color={COLORS.primary} />
                      </View>
                    </View>

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
      </ScrollView>

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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  scrollView: {
    flex: 1,
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
  activityCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.primary + '10',
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
    fontSize: 18,
    fontWeight: 'bold',
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
});
