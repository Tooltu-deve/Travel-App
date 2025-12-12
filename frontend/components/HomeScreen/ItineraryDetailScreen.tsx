import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, enrichPlaceAPI } from '../../services/api';
import { POIDetailBottomSheet } from '../place/POIDetailBottomSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROUTE_COLORS = {
  glow: 'rgba(0, 163, 255, 0.25)',
  border: '#4DB8FF',
  main: COLORS.primary,
} as const;

interface ItineraryItem {
  day: number;
  time: string;
  activity: string;
  place: {
    name: string;
    address?: string;
    googlePlaceId?: string;
    location?: { lat: number; lng: number };
    rating?: number;
  };
  duration_minutes?: number;
  notes?: string;
  encoded_polyline?: string;
  start_location_polyline?: string;
  travel_duration_minutes?: number;
  travel_duration_from_start?: number;
  type?: 'start_location' | 'poi';
  ecs_score?: number;
}

interface ItineraryDetailScreenProps {
  itinerary: ItineraryItem[];
  itineraryId: string;
  startLocation?: string | { lat: number; lng: number };
  itineraryStatus?: 'DRAFT' | 'CONFIRMED' | null;
  setItineraryStatus?: (status: 'DRAFT' | 'CONFIRMED') => void;
  onClose: () => void;
  onConfirmSuccess?: () => void;
  onSendMessage?: (message: string) => void;
}

export const ItineraryDetailScreen: React.FC<ItineraryDetailScreenProps> = ({
  itinerary,
  itineraryId,
  startLocation,
  itineraryStatus: parentItineraryStatus,
  setItineraryStatus: setParentItineraryStatus,
  onClose,
  onConfirmSuccess,
  onSendMessage,
}) => {
  const { token, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const mapRef = useRef<MapView>(null);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [geocodedStartLocation, setGeocodedStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [startLocationPolyline, setStartLocationPolyline] = useState<string | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [selectedPlaceData, setSelectedPlaceData] = useState<any>(null);
  const [isEnriching, setIsEnriching] = useState(false);

  const itineraryStatus = parentItineraryStatus ?? null;
  const setItineraryStatus = setParentItineraryStatus || (() => { });

  // Group items by day
  const itemsByDay = itinerary.reduce((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>);

  const sortedDays = Object.keys(itemsByDay)
    .map(Number)
    .sort((a, b) => a - b);

  const currentDayItems = itemsByDay[selectedDay] || [];

  // Extract start_location_polyline from first item of current day
  useEffect(() => {
    if (currentDayItems.length > 0) {
      const firstItemOfDay = currentDayItems[0];
      console.log('[ItineraryDetailScreen] First item of day', selectedDay, ':', {
        name: firstItemOfDay.place?.name,
        hasPolyline: !!firstItemOfDay.start_location_polyline,
        polylineLength: firstItemOfDay.start_location_polyline?.length,
        type: firstItemOfDay.type,
        location: firstItemOfDay.place?.location,
      });

      // Use start_location_polyline if available, otherwise set null
      // (will still render if we have geocodedStartLocation and first item location)
      if (firstItemOfDay.start_location_polyline) {
        setStartLocationPolyline(firstItemOfDay.start_location_polyline);
      } else {
        setStartLocationPolyline(null);
      }
    } else {
      setStartLocationPolyline(null);
    }
  }, [currentDayItems, selectedDay]);

  // Geocode start location
  useEffect(() => {
    if (!startLocation || !token) return;
    if (typeof startLocation === 'object' && startLocation.lat && startLocation.lng) {
      setGeocodedStartLocation(startLocation);
      console.debug('[ItineraryDetailScreen] Start location:', startLocation);
      return;
    }
  }, [startLocation, token]);

  // Debug: Log itinerary data
  useEffect(() => {
    console.debug('[ItineraryDetailScreen] Itinerary data:', {
      length: itinerary.length,
      firstItem: itinerary[0],
      hasPolylines: itinerary.some(item => item.encoded_polyline),
      hasStartLocationPolyline: itinerary.some(item => item.start_location_polyline),
      startLocationPolyline,
      selectedDay,
      sortedDays,
      currentDayItems: currentDayItems.map(item => item.place?.name),
      startLocation,
      geocodedStartLocation,
    });
  }, [itinerary, startLocation, geocodedStartLocation, selectedDay, sortedDays, startLocationPolyline, currentDayItems]);

  // Decode polyline
  const decodePolyline = (encoded?: string) => {
    if (!encoded) return [];
    const points: { latitude: number; longitude: number }[] = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let shift = 0, result = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0; result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  // Convert to map coordinate
  const toMapCoordinate = (point?: { lat: number; lng: number }) => {
    if (!point) return null;
    return { latitude: point.lat, longitude: point.lng };
  };

  // Calculate map region
  const calculateMapRegion = (items: ItineraryItem[]) => {
    const coords: { latitude: number; longitude: number }[] = [];

    if (geocodedStartLocation) {
      coords.push({ latitude: geocodedStartLocation.lat, longitude: geocodedStartLocation.lng });
    }

    items.forEach((item) => {
      if (item.place?.location) {
        const coord = toMapCoordinate(item.place.location);
        if (coord) coords.push(coord);
      }
    });

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

  // Update map region when day changes
  useEffect(() => {
    if (currentDayItems.length > 0) {
      const region = calculateMapRegion(currentDayItems);
      if (region) {
        setMapRegion(region);
        mapRef.current?.animateToRegion(region, 500);
      }
    }
  }, [selectedDay]);

  // Handle fit to markers
  const handleFitToMarkers = () => {
    const coords: { latitude: number; longitude: number }[] = [];
    if (geocodedStartLocation) {
      coords.push({ latitude: geocodedStartLocation.lat, longitude: geocodedStartLocation.lng });
    }
    currentDayItems.forEach((item) => {
      if (item.place?.location) {
        const coord = toMapCoordinate(item.place.location);
        if (coord) coords.push(coord);
      }
    });

    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
        animated: true,
      });
    }
  };

  // Handle activity press
  const handleActivityPress = async (activity: ItineraryItem) => {
    if (activity.type === 'start_location') {
      Alert.alert('Điểm khởi hành', 'Đây là điểm khởi hành của bạn.');
      return;
    }

    const googlePlaceId = activity.place?.googlePlaceId;
    if (!googlePlaceId) {
      Alert.alert('Thông báo', 'Địa điểm này chưa có Google Place ID.');
      return;
    }

    setIsEnriching(true);
    try {
      const userToken = token || await AsyncStorage.getItem('userToken');
      if (!userToken) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để xem chi tiết địa điểm.');
        return;
      }

      const response = await enrichPlaceAPI(userToken, googlePlaceId, true);
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
        reviews: (enrichedData.reviews || []).map((review: any) => {
          let authorName = 'Người dùng ẩn danh';
          if (review.authorAttributions) {
            if (Array.isArray(review.authorAttributions) && review.authorAttributions.length > 0) {
              authorName = review.authorAttributions[0]?.displayName || 'Người dùng ẩn danh';
            } else if (typeof review.authorAttributions === 'object') {
              authorName = review.authorAttributions.displayName || 'Người dùng ẩn danh';
            }
          }
          return {
            authorName,
            rating: review.rating,
            text: review.text,
            relativePublishTimeDescription: review.relativePublishTimeDescription,
            publishTime: review.relativePublishTimeDescription,
            authorAttributions: review.authorAttributions,
          };
        }),
        type: enrichedData.type,
        types: enrichedData.types,
        location: enrichedData.location,
        openingHours: enrichedData.openingHours,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
    } catch (error: any) {
      console.error('[Activity Detail] Error enriching POI:', error);
      Alert.alert('Lỗi', error.message || 'Không thể tải thông tin chi tiết địa điểm.');
    } finally {
      setIsEnriching(false);
    }
  };

  // Handle confirm
  const confirmItinerary = async () => {
    if (itineraryStatus === 'CONFIRMED') {
      Alert.alert('Thông báo', 'Lộ trình này đã được xác nhận rồi!');
      return;
    }

    if (!itineraryId) {
      Alert.alert('Lỗi', 'Không có lộ trình để xác nhận');
      return;
    }

    Alert.alert(
      'Xác nhận lộ trình',
      'Sau khi xác nhận, lộ trình không thể chỉnh sửa thêm. Bạn có chắc chắn?',
      [
        { text: 'Hủy', onPress: () => { }, style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setIsConfirming(true);
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 120000);

              const response = await fetch(
                `${API_BASE_URL}/api/v1/ai/itineraries/${itineraryId}/confirm`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  signal: controller.signal,
                }
              );

              clearTimeout(timeoutId);

              if (response.status === 401) {
                signOut();
                return;
              }

              if (response.ok) {
                const data = await response.json();
                setItineraryStatus('CONFIRMED');
                Alert.alert('Thành công', 'Lộ trình đã được xác nhận!', [
                  {
                    text: 'OK',
                    onPress: () => {
                      onConfirmSuccess?.();
                      onClose();
                    },
                  },
                ]);
              } else {
                const errData = await response.json().catch(() => ({}));
                Alert.alert('Lỗi', errData?.message || `Lỗi: ${response.status}`);
              }
            } catch (error: any) {
              console.error('[Confirm Itinerary] Exception:', error);
              Alert.alert('Lỗi', 'Không thể xác nhận lộ trình. Vui lòng thử lại.');
            } finally {
              setIsConfirming(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.gradientBackground}
      >
        {/* Header */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Chi tiết lộ trình
            </Text>
            <Text style={styles.headerSubtitle}>
              {sortedDays.length} ngày • {itinerary.length} hoạt động
            </Text>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Map */}
          {mapRegion && (
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={mapRegion}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={true}
                toolbarEnabled={false}
              >
                {/* Start Location Marker */}
                {geocodedStartLocation && (
                  <Marker
                    coordinate={{
                      latitude: geocodedStartLocation.lat,
                      longitude: geocodedStartLocation.lng,
                    }}
                    title="Điểm xuất phát"
                  >
                    <View style={styles.startMarker}>
                      <MaterialCommunityIcons
                        name="map-marker-check"
                        size={16}
                        color={COLORS.textWhite}
                      />
                    </View>
                  </Marker>
                )}

                {/* Markers for activities - exclude start_location */}
                {currentDayItems.map((item, index) => {
                  if (item.type === 'start_location') return null;

                  const coord = item.place?.location
                    ? toMapCoordinate(item.place.location)
                    : null;
                  if (!coord) return null;

                  const displayIndex = currentDayItems
                    .filter((it, idx) => idx <= index && it.type !== 'start_location')
                    .length;

                  return (
                    <Marker
                      key={`marker-${index}`}
                      coordinate={coord}
                      title={item.place.name}
                      description={item.activity}
                    >
                      <View style={styles.marker}>
                        <Text style={styles.markerText}>{displayIndex}</Text>
                      </View>
                    </Marker>
                  );
                })}

                {/* Polyline from start location to first activity of each day */}
                {geocodedStartLocation && startLocationPolyline && (
                  <React.Fragment>
                    <Polyline
                      coordinates={decodePolyline(startLocationPolyline)}
                      strokeColor={ROUTE_COLORS.main}
                      strokeWidth={3}
                      lineJoin="round"
                      lineCap="round"
                    />
                    <Polyline
                      coordinates={decodePolyline(startLocationPolyline)}
                      strokeColor={ROUTE_COLORS.glow}
                      strokeWidth={3}
                      lineJoin="round"
                      lineCap="round"
                    />
                  </React.Fragment>
                )}

                {/* Fallback: Direct line from start location to first activity if no polyline */}
                {geocodedStartLocation && !startLocationPolyline && currentDayItems.length > 0 && (
                  (() => {
                    const firstItem = currentDayItems.find(item => item.type !== 'start_location');
                    const firstItemCoord = firstItem?.place?.location ? toMapCoordinate(firstItem.place.location) : null;

                    if (firstItemCoord) {
                      const directLineCoords = [
                        { latitude: geocodedStartLocation.lat, longitude: geocodedStartLocation.lng },
                        { latitude: firstItemCoord.latitude, longitude: firstItemCoord.longitude },
                      ];

                      return (
                        <React.Fragment>
                          <Polyline
                            coordinates={directLineCoords}
                            strokeColor={ROUTE_COLORS.main}
                            strokeWidth={4}
                            lineJoin="round"
                            lineCap="round"
                            lineDashPattern={[5, 5]}
                          />
                          <Polyline
                            coordinates={directLineCoords}
                            strokeColor={ROUTE_COLORS.glow}
                            strokeWidth={8}
                            lineJoin="round"
                            lineCap="round"
                            lineDashPattern={[5, 5]}
                          />
                        </React.Fragment>
                      );
                    }
                    return null;
                  })()
                )}

                {/* Route polylines */}
                {currentDayItems.map((item, index) => {
                  if (index === currentDayItems.length - 1) return null;

                  const nextItem = currentDayItems[index + 1];

                  // Skip if no polyline
                  if (!item.encoded_polyline) {
                    console.warn(`[Map] Item ${index}: No encoded_polyline. Item:`, item);
                    return null;
                  }

                  const routeCoords = decodePolyline(item.encoded_polyline);
                  if (routeCoords.length < 2) {
                    console.warn(`[Map] Item ${index}: Polyline decode failed. Coords:`, routeCoords);
                    return null;
                  }

                  console.log(`[Map] Item ${index} (${item.place.name}): Polyline rendered with ${routeCoords.length} points`);

                  return (
                    <React.Fragment key={`route-${index}`}>
                      <Polyline
                        coordinates={routeCoords}
                        strokeColor={ROUTE_COLORS.main}
                        strokeWidth={3}
                        lineJoin="round"
                        lineCap="round"
                      />
                      <Polyline
                        coordinates={routeCoords}
                        strokeColor={ROUTE_COLORS.glow}
                        strokeWidth={3}
                        lineJoin="round"
                        lineCap="round"
                      />
                    </React.Fragment>
                  );
                })}
              </MapView>

              {/* Map Controls */}
              <View style={styles.mapControls}>
                <TouchableOpacity
                  style={styles.mapControlButton}
                  onPress={handleFitToMarkers}
                >
                  <MaterialCommunityIcons
                    name="crosshairs-gps"
                    size={20}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Day Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {sortedDays.map((day) => (
              <TouchableOpacity
                key={`tab-${day}`}
                style={[styles.tab, selectedDay === day && styles.tabActive]}
                onPress={() => setSelectedDay(day)}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectedDay === day && styles.tabTextActive,
                  ]}
                >
                  Ngày {day}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Activities */}
          <View style={styles.activitiesSection}>
            {currentDayItems.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="calendar-blank"
                  size={48}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.emptyStateText}>Không có hoạt động</Text>
              </View>
            ) : (
              currentDayItems.map((item, index) => {
                if (item.type === 'start_location') return null;

                const displayIndex = currentDayItems
                  .filter((it, idx) => idx <= index && it.type !== 'start_location')
                  .length;

                return (
                  <React.Fragment key={`activity-${index}`}>
                    <TouchableOpacity
                      style={styles.activityCard}
                      onPress={() => handleActivityPress(item)}
                      disabled={isEnriching}
                      activeOpacity={0.7}
                    >
                      <LinearGradient
                        colors={[COLORS.primary + '15', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardGradientOverlay}
                      />

                      <View style={styles.cardNumberBadge}>
                        <LinearGradient
                          colors={[COLORS.primary, COLORS.gradientSecondary]}
                          style={styles.numberBadgeGradient}
                        >
                          <Text style={styles.numberBadgeText}>{displayIndex}</Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.cardContent}>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {item.place.name}
                          </Text>
                          <View style={styles.cardRow}>
                            <FontAwesome
                              name="clock-o"
                              size={12}
                              color={COLORS.primary}
                            />
                            <Text style={styles.cardTime}>⏰ {item.time}</Text>
                            {item.duration_minutes && (
                              <Text style={styles.cardTime}>
                                {' '}
                                • {item.duration_minutes} phút
                              </Text>
                            )}
                          </View>
                          {item.place.rating && (
                            <View style={styles.cardRow}>
                              <MaterialCommunityIcons
                                name="star"
                                size={12}
                                color="#FFB800"
                              />
                              <Text style={styles.cardRating}>
                                {item.place.rating.toFixed(1)}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.cardArrow}>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={20}
                            color={COLORS.primary}
                          />
                        </View>
                      </View>

                      <View style={styles.tapHint}>
                        <FontAwesome
                          name="hand-pointer-o"
                          size={10}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.tapHintText}>Nhấn để xem chi tiết</Text>
                      </View>
                    </TouchableOpacity>

                    {index < currentDayItems.length - 1 && (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <MaterialCommunityIcons
                            name="car"
                            size={12}
                            color={COLORS.primary}
                          />
                          <Text style={styles.travelTimeBadgeText}>Di chuyển</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Confirm Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (isConfirming || itineraryStatus === 'CONFIRMED') &&
              styles.confirmButtonDisabled,
            ]}
            onPress={confirmItinerary}
            disabled={isConfirming || itineraryStatus === 'CONFIRMED'}
          >
            <LinearGradient
              colors={
                isConfirming || itineraryStatus === 'CONFIRMED'
                  ? [COLORS.disabled, COLORS.disabled]
                  : [COLORS.primary, COLORS.gradientSecondary]
              }
              style={styles.confirmButtonGradient}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color={COLORS.textWhite} />
              ) : itineraryStatus === 'CONFIRMED' ? (
                <>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color={COLORS.textWhite}
                  />
                  <Text style={styles.confirmButtonText}>Đã xác nhận</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color={COLORS.textWhite}
                  />
                  <Text style={styles.confirmButtonText}>Xác nhận lộ trình</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* POI Detail Bottom Sheet */}
        <POIDetailBottomSheet
          visible={isBottomSheetVisible}
          placeData={selectedPlaceData}
          onClose={() => {
            setIsBottomSheetVisible(false);
            setSelectedPlaceData(null);
          }}
        />
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  gradientBackground: {
    flex: 1,
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
  content: {
    flex: 1,
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
  activitiesSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: 120,
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
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.primary + '10',
    position: 'relative',
  },
  cardGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
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
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    paddingLeft: SPACING.xl + 44,
    gap: SPACING.md,
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
  },
  tapHintText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.bgMain,
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.3,
  },
  confirmButtonDisabled: {
    shadowOpacity: 0.1,
    elevation: 1,
  },
});

export default ItineraryDetailScreen;
