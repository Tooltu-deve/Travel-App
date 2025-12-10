import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { updateRouteStatusAPI, deleteRouteAPI } from '@/services/api';
import { ItineraryViewScreen } from '@/components/itinerary/ItineraryViewScreen';

interface RoutePreviewParams {
  routeId?: string;
  destination?: string;
}

export default function RoutePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as RoutePreviewParams;
  const routeId = params.routeId;
  const destination = params.destination || 'Lộ trình mới';

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const suggestedTitle =
    destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  const handleSave = async () => {
    if (!routeId) {
      Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
      return;
    }
    setIsSaving(true);
    try {
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
        title: suggestedTitle,
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
      setIsSaving(false);
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

  // Handle click vào activity card - enrich POI và hiển thị bottom sheet
  const handleActivityPress = async (activity: Activity) => {
    if (!activity.google_place_id) {
      Alert.alert('Thông báo', 'Địa điểm này chưa có Google Place ID.');
      return;
    }

    setIsEnriching(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để xem chi tiết địa điểm.');
        router.replace('/(auth)/login');
        return;
      }

      // Gọi enrich API để cập nhật thông tin POI
      // Force refresh để đảm bảo lấy dữ liệu mới bằng tiếng Việt từ Google Places API
      const response = await enrichPlaceAPI(token, activity.google_place_id, true);
      
      // Map dữ liệu từ enriched response sang format mà bottom sheet hiểu
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
        reviews: enrichedData.reviews?.map((review: any) => {
          // Debug: Log review data để kiểm tra
          console.log('[RoutePreview] Review data:', JSON.stringify(review, null, 2));
          
          // Lấy tên tác giả từ authorAttributions
          let authorName = 'Người dùng ẩn danh';
          if (review.authorAttributions) {
            if (Array.isArray(review.authorAttributions) && review.authorAttributions.length > 0) {
              const firstAttr = review.authorAttributions[0];
              authorName = firstAttr?.displayName || firstAttr?.name || 'Người dùng ẩn danh';
            } else if (typeof review.authorAttributions === 'object') {
              authorName = review.authorAttributions.displayName || review.authorAttributions.name || 'Người dùng ẩn danh';
            }
          }
          
          return {
            authorName,
            rating: review.rating,
            text: review.text,
            relativePublishTimeDescription: review.relativePublishTimeDescription,
            publishTime: review.relativePublishTimeDescription, // Giữ lại để backward compatible
            authorAttributions: review.authorAttributions, // Giữ lại để có thể fallback
          };
        }) || [],
        type: enrichedData.type,
        types: enrichedData.types,
        location: enrichedData.location,
        openingHours: enrichedData.openingHours,
        emotionalTags: enrichedData.emotionalTags,
        budgetRange: enrichedData.budgetRange,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
    } catch (error: any) {
      console.error('❌ Error enriching POI:', error);
      Alert.alert(
        'Lỗi',
        error.message || 'Không thể tải thông tin chi tiết địa điểm. Vui lòng thử lại.'
      );
    } finally {
      setIsEnriching(false);
    }
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
              const hasTravelTime = index > 0 && activity.travel_duration_minutes;

              return (
                <TouchableOpacity
                  key={activity.google_place_id || index}
                  style={styles.activityCard}
                  onPress={() => handleActivityPress(activity)}
                  disabled={isEnriching}
                  activeOpacity={0.7}
                >
                  {/* Activity Number and Name */}
                  <View style={styles.activityHeader}>
                    <View style={styles.activityNumber}>
                      <Text style={styles.activityNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityName}>{activity.name}</Text>
                      {isEnriching && activity.google_place_id === selectedPlaceData?.googlePlaceId && (
                        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 4 }} />
                      )}
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
                </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
});

