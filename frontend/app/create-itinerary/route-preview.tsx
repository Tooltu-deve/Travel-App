import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import polyline from '@mapbox/polyline';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { deleteRouteAPI, updateRouteStatusAPI } from '@/services/api';

const ROUTE_COLORS = {
  glow: 'rgba(255, 99, 132, 0.25)',
  border: '#FFD966',
  main: '#FF4D6D',
} as const;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Activity {
  name: string;
  location: { lat: number; lng: number };
  estimated_arrival: string;
  estimated_departure: string;
  emotional_tags?: Record<string, number>;
  ecs_score?: number;
  travel_duration_minutes?: number;
  encoded_polyline?: string;
  google_place_id?: string;
}

interface DayPlan {
  day: number;
  activities: Activity[];
  day_start_time: string;
}

interface RouteData {
  optimized_route: DayPlan[];
}

interface RoutePreviewParams {
  routeData: string; // JSON string của route data
  routeId: string;
  destination: string;
  durationDays: string;
  currentLocation?: string; // JSON string của current location { lat, lng }
}

export default function RoutePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as RoutePreviewParams;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [routeTitle, setRouteTitle] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isTitleModalVisible, setIsTitleModalVisible] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const destination = params.destination || 'Điểm đến';
  const durationDays = parseInt(params.durationDays || '1');
  const suggestedTitle =
    destination && destination !== 'Điểm đến'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  // Parse route data từ params
  useEffect(() => {
    try {
      if (params.routeData) {
        const parsed = JSON.parse(params.routeData);
        setRouteData(parsed);
        if (parsed?.metadata?.title) {
          setRouteTitle(parsed.metadata.title);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing route data:', error);
      Alert.alert('Lỗi', 'Không thể tải dữ liệu lộ trình. Vui lòng thử lại.');
      router.back();
    }
  }, [params.routeData]);

  useEffect(() => {
    try {
      if (params.currentLocation) {
        const currentLoc = JSON.parse(params.currentLocation);
        setCurrentLocation(currentLoc);
      } else if (routeData?.optimized_route?.[0]?.activities?.[0]?.location) {
        setCurrentLocation(routeData.optimized_route[0].activities[0].location);
      }
    } catch (error) {
      console.error('❌ Error parsing current location:', error);
    }
  }, [params.currentLocation, routeData?.optimized_route]);

  const calculateMapRegion = (
    activities: Activity[],
    center?: { lat: number; lng: number },
  ) => {
    if ((!activities || activities.length === 0) && !center) return null;

    const latValues = activities.map((a) => a.location.lat);
    const lngValues = activities.map((a) => a.location.lng);

    if (center) {
      latValues.push(center.lat);
      lngValues.push(center.lng);
    }

    const minLat = Math.min(...latValues);
    const maxLat = Math.max(...latValues);
    const minLng = Math.min(...lngValues);
    const maxLng = Math.max(...lngValues);

    const latitudeDelta = Math.max((maxLat - minLat) * 1.5, 0.01);
    const longitudeDelta = Math.max((maxLng - minLng) * 1.5, 0.01);

    return {
      latitude: center ? center.lat : (minLat + maxLat) / 2,
      longitude: center ? center.lng : (minLng + maxLng) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  };

  // Format time
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Tính duration
  const calculateDuration = (arrival: string, departure: string) => {
    const arrivalTime = new Date(arrival);
    const departureTime = new Date(departure);
    const diffMs = departureTime.getTime() - arrivalTime.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    return diffMinutes;
  };

  // Format emotional tags
  const formatTags = (tags?: Record<string, number>) => {
    if (!tags) return [];
    return Object.entries(tags)
      .filter(([_, score]) => score > 0.2) // Chỉ hiển thị tags có score > 0.2
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 3) // Chỉ lấy top 3
      .map(([tag, score]) => `${tag} (${score.toFixed(2)})`);
  };

  const handleConfirm = async (titleValue?: string) => {
    if (!params.routeId) {
      Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
      return;
    }

    setIsLoading(true);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để lưu lộ trình.');
        router.replace('/(auth)/login');
        return;
      }

      const finalTitleRaw = (titleValue ?? routeTitle).trim();
      const finalTitle =
        finalTitleRaw.length > 0
          ? finalTitleRaw
          : suggestedTitle;

      setRouteTitle(finalTitle);

      await updateRouteStatusAPI(token, params.routeId, {
        status: 'CONFIRMED',
        title: finalTitle,
      });
      
      Alert.alert(
        'Thành công',
        'Lộ trình đã được lưu thành công!',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/itinerary'),
          },
        ]
      );
    } catch (error: any) {
      console.error('❌ Update route status error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPress = () => {
    setTitleInput(routeTitle || suggestedTitle);
    setIsTitleModalVisible(true);
  };

  const handleTitleModalClose = () => {
    if (!isLoading) {
      setIsTitleModalVisible(false);
    }
  };

  const handleTitleSubmit = () => {
    const trimmed = titleInput.trim();
    if (!trimmed) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên lộ trình.');
      return;
    }
    setIsTitleModalVisible(false);
    setRouteTitle(trimmed);
    handleConfirm(trimmed);
  };

  // Handle cancel
  const handleDeleteRoute = async () => {
    if (!params.routeId) {
      Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
      return;
    }

    setIsDeleting(true);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để thực hiện thao tác này.');
        router.replace('/(auth)/login');
        return;
      }

      await deleteRouteAPI(token, params.routeId);
      Alert.alert('Đã hủy', 'Lộ trình nháp đã được xóa.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/itinerary'),
        },
      ]);
    } catch (error: any) {
      console.error('❌ Delete route error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể hủy lộ trình. Vui lòng thử lại.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Hủy lộ trình', 'Bạn có chắc chắn muốn hủy lộ trình này?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Có',
        style: 'destructive',
        onPress: handleDeleteRoute,
      },
    ]);
  };

  // Get current day activities
  const currentDayData = routeData?.optimized_route?.find(d => d.day === selectedDay);
  const activities = currentDayData?.activities || [];

  const toMapCoordinate = (point?: { lat: number; lng: number }) => {
    if (!point) return null;
    return { latitude: point.lat, longitude: point.lng };
  };

  const decodePolyline = (encoded?: string) => {
    if (!encoded) return [];
    try {
      const decoded = polyline.decode(encoded) as [number, number][];
      return decoded.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
    } catch (error) {
      console.error('❌ Polyline decode error:', error);
      return [];
    }
  };

  const routeSegments = activities
    .map((activity) => decodePolyline(activity.encoded_polyline))
    .filter((segment) => segment.length > 1);

  useEffect(() => {
    if (!currentLocation) return;
    const nextRegion = calculateMapRegion(activities, currentLocation);
    if (nextRegion) {
      setMapRegion(nextRegion);
      if (mapRef.current) {
        mapRef.current.animateToRegion(nextRegion, 800);
      }
    }
  }, [activities, currentLocation]);

  if (!routeData) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải lộ trình...</Text>
      </View>
    );
  }

  const resolvedRegion =
    mapRegion ||
    (currentLocation
      ? {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : {
          latitude: 16.0471,
          longitude: 108.2062,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        });

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-left" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Lộ Trình {destination}</Text>
            <Text style={styles.headerSubtitle}>{durationDays} Ngày</Text>
          </View>
        </View>

        {/* Map View */}
        <View style={styles.mapContainer}>
          {resolvedRegion && (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={resolvedRegion}
              region={mapRegion || undefined}
              showsUserLocation={false}
              showsMyLocationButton={false}
              toolbarEnabled={false}
            >
              {/* Start location marker */}
              {currentLocation && (
                <Marker
                  coordinate={toMapCoordinate(currentLocation)!}
                  title="Điểm Bắt đầu"
                  pinColor={COLORS.success}
                >
                  <View style={styles.startMarker}>
                    <Text style={styles.startMarkerText}>BĐ</Text>
                  </View>
                </Marker>
              )}

              {/* Activity markers */}
              {activities.map((activity, index) => (
                <Marker
                  key={activity.google_place_id || index}
                  coordinate={toMapCoordinate(activity.location)!}
                  title={activity.name}
                >
                  <View style={styles.marker}>
                    <Text style={styles.markerText}>{index + 1}</Text>
                  </View>
                </Marker>
              ))}

              {/* Route polylines with glow + border layers */}
              {routeSegments.map((segment, index) => (
                <React.Fragment key={`segment-${index}`}>
                  <Polyline
                    coordinates={segment}
                    strokeColor={ROUTE_COLORS.glow}
                    strokeWidth={10}
                    zIndex={9}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Polyline
                    coordinates={segment}
                    strokeColor={ROUTE_COLORS.border}
                    strokeWidth={6}
                    zIndex={10}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Polyline
                    coordinates={segment}
                    strokeColor={ROUTE_COLORS.main}
                    strokeWidth={4}
                    zIndex={11}
                    lineCap="round"
                    lineJoin="round"
                  />
                </React.Fragment>
              ))}
            </MapView>
          )}

          {/* Map Controls */}
          <View style={styles.mapControls}>
            <TouchableOpacity
              style={styles.mapControlButton}
              onPress={() => {
                if (mapRef.current && mapRegion) {
                  mapRef.current.animateToRegion(mapRegion, 1000);
                }
              }}
            >
              <FontAwesome name="expand" size={16} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {routeData.optimized_route.map((day) => (
              <TouchableOpacity
                key={day.day}
                style={[
                  styles.tab,
                  selectedDay === day.day && styles.tabActive,
                ]}
                onPress={() => setSelectedDay(day.day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectedDay === day.day && styles.tabTextActive,
                  ]}
                >
                  NGÀY {day.day}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Activities List */}
        <ScrollView
          style={styles.activitiesContainer}
          contentContainerStyle={styles.activitiesContent}
          showsVerticalScrollIndicator={false}
        >
          {activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Không có hoạt động nào trong ngày này</Text>
            </View>
          ) : (
            activities.map((activity, index) => {
              const duration = calculateDuration(
                activity.estimated_arrival,
                activity.estimated_departure
              );
              const tags = formatTags(activity.emotional_tags);
              const hasTravelTime = index > 0 && activity.travel_duration_minutes;

              return (
                <View key={activity.google_place_id || index} style={styles.activityCard}>
                  {/* Activity Number and Name */}
                  <View style={styles.activityHeader}>
                    <View style={styles.activityNumber}>
                      <Text style={styles.activityNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityName}>{activity.name}</Text>
                    </View>
                  </View>

                  {/* Travel Time */}
                  {hasTravelTime && (
                    <View style={styles.travelTimeContainer}>
                      <FontAwesome name="car" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.travelTimeText}>
                        Di chuyển: {activity.travel_duration_minutes} phút
                      </Text>
                    </View>
                  )}

                  {/* Time Range */}
                  <View style={styles.timeContainer}>
                    <Text style={styles.timeText}>
                      {formatTime(activity.estimated_arrival)} - {formatTime(activity.estimated_departure)}
                    </Text>
                    <Text style={styles.durationText}>({duration} phút)</Text>
                  </View>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      <Text style={styles.tagsLabel}>Tags: </Text>
                      <Text style={styles.tagsText}>{tags.join(', ')}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Footer Actions */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            style={[styles.footerButton, styles.cancelButton]}
            onPress={handleCancel}
            disabled={isDeleting || isLoading}
            activeOpacity={0.7}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={COLORS.textDark} />
            ) : (
              <Text style={styles.cancelButtonText}>Hủy</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerButton, styles.confirmButton]}
            onPress={handleConfirmPress}
            disabled={isLoading || isDeleting}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.textWhite} />
            ) : (
              <Text style={styles.confirmButtonText}>Xác Nhận Lưu</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={isTitleModalVisible}
        onRequestClose={handleTitleModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Đặt tên cho lộ trình</Text>
            <Text style={styles.modalSubtitle}>
              Hãy nhập tên để dễ dàng quản lý trong danh sách lộ trình của bạn.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={suggestedTitle}
              placeholderTextColor={COLORS.textSecondary}
              value={titleInput}
              onChangeText={setTitleInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={handleTitleModalClose}
                disabled={isLoading}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleTitleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.modalConfirmText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.35,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: SPACING.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  startMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.bgMain,
  },
  startMarkerText: {
    color: COLORS.textWhite,
    fontSize: 10,
    fontWeight: 'bold',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.bgMain,
  },
  markerText: {
    color: COLORS.textWhite,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabsContainer: {
    backgroundColor: 'transparent',
    paddingVertical: SPACING.sm,
  },
  tabsScrollContent: {
    paddingHorizontal: SPACING.lg,
  },
  tab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.md,
    borderRadius: SPACING.md,
    backgroundColor: COLORS.bgCard,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.textWhite,
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
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  activityCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  activityNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  activityNumberText: {
    color: COLORS.textWhite,
    fontSize: 14,
    fontWeight: 'bold',
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  travelTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  travelTimeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  timeText: {
    fontSize: 14,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  durationText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.xs,
  },
  tagsLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tagsText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.bgCard,
    marginRight: SPACING.md,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    borderRadius: SPACING.lg,
    backgroundColor: COLORS.bgMain,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.textDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: SPACING.md,
  },
  modalCancelButton: {
    backgroundColor: COLORS.bgCard,
  },
  modalConfirmButton: {
    backgroundColor: COLORS.primary,
  },
  modalCancelText: {
    color: COLORS.textDark,
    fontWeight: '600',
  },
  modalConfirmText: {
    color: COLORS.textWhite,
    fontWeight: '600',
  },
});

