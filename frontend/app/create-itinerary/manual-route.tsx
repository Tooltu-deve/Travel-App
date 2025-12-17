import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { calculateRoutesAPI, updateCustomItineraryStatusAPI } from '@/services/api';
import { ItineraryViewScreen } from '@/components/itinerary/ItineraryViewScreen';
import WeatherWarningModal, { WeatherSeverity } from '@/components/WeatherWarningModal';

interface ManualRouteParams {
  startDate: string;
  endDate: string;
  destination: string;
  durationDays: string;
  currentLocationText: string;
  itineraryData?: string; // JSON string of itinerary data
  travelModes?: string; // JSON string of travel modes per day
}

interface PlaceItem {
  id: string;
  name: string;
  address: string;
  placeId: string;
  location: { lat: number; lng: number };
}

interface DayItinerary {
  day: number;
  date: Date;
  places: PlaceItem[];
}

export default function ManualRouteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as ManualRouteParams;
  
  const destination = params.destination || 'Lộ trình mới';
  const startDate = params.startDate ? new Date(params.startDate) : new Date();
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  const durationDays = parseInt(params.durationDays || '1', 10);
  const currentLocationText = params.currentLocationText || 'Vị trí hiện tại';

  // Parse itinerary data from params
  const [itinerary, setItinerary] = useState<DayItinerary[]>([]);
  const [travelModes, setTravelModes] = useState<{ [key: number]: string }>({});
  
  useEffect(() => {
    if (params.itineraryData) {
      try {
        const parsed = JSON.parse(params.itineraryData);
        setItinerary(parsed.map((day: any) => ({
          ...day,
          date: new Date(day.date),
        })));
      } catch (error) {
        console.error('Failed to parse itinerary data:', error);
      }
    }
    if (params.travelModes) {
      try {
        setTravelModes(JSON.parse(params.travelModes));
      } catch (error) {
        console.error('Failed to parse travel modes:', error);
      }
    }
  }, [params.itineraryData, params.travelModes]);

  const suggestedTitle =
    destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  const [isSaving, setIsSaving] = useState(false);
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [routeTitle, setRouteTitle] = useState(suggestedTitle);
  const [routeIdToConfirm, setRouteIdToConfirm] = useState<string | null>(null);
  const [customRouteData, setCustomRouteData] = useState<any>(null);
  
  // Weather warning modal states
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [weatherAlert, setWeatherAlert] = useState('');
  const [weatherSeverity, setWeatherSeverity] = useState<WeatherSeverity>('normal');
  const [pendingRouteData, setPendingRouteData] = useState<any>(null);

  // Check if there are any places in itinerary
  const hasPlaces = itinerary.some(day => day.places.length > 0);

  const handleSave = async () => {
    console.log('[ManualRoute] handleSave pressed');
    
    // Check if there are any places
    const totalPlaces = itinerary.reduce((sum, day) => sum + day.places.length, 0);
    if (totalPlaces === 0) {
      Alert.alert('Thông báo', 'Vui lòng thêm ít nhất một địa điểm vào lộ trình.');
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

      // Prepare payload for backend API
      const payload = {
        destination: destination,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        optimize: false,
        startLocationText: currentLocationText,
        days: itinerary.map((day) => {
          // Calculate start location for each day:
          // Day 1: Use current location text
          // Other days: Use last place of previous day, or fallback to current location
          let dayStartLocation = currentLocationText;
          if (day.day > 1) {
            const previousDay = itinerary[day.day - 2];
            if (previousDay && previousDay.places.length > 0) {
              const lastPlace = previousDay.places[previousDay.places.length - 1];
              dayStartLocation = lastPlace.address || currentLocationText;
            }
          }

          return {
            dayNumber: day.day,
            travelMode: travelModes[day.day] || 'driving', // Get travelMode for this specific day
            startLocation: dayStartLocation,
            places: day.places.map((place) => ({
              placeId: place.placeId,
              name: place.name,
              address: place.address,
            })),
          };
        }),
      };

      // Call backend API to calculate routes and save
      const result = await calculateRoutesAPI(payload, token);

      // Check weather warnings from backend
      const alerts = result?.alerts;
      if (Array.isArray(alerts) && alerts.length > 0) {
        const firstAlert = alerts[0];
        setWeatherSeverity(
          firstAlert.severity === 'danger' ? 'danger' : 
          firstAlert.severity === 'warning' ? 'warning' : 
          'normal'
        );
        setWeatherAlert(firstAlert.message || firstAlert.title || 'Có cảnh báo thời tiết');
        setPendingRouteData(result);
        setWeatherModalVisible(true);
        setIsSaving(false);
        return;
      }

      // Check if route_id exists in response
      if (result && result.route_id) {
        // Transform result to customRouteData format for ItineraryViewScreen
        setCustomRouteData(result);
        
        // Save route_id and show input title modal
        setRouteIdToConfirm(result.route_id);
        setRouteTitle(result.title || suggestedTitle);
        setIsNameModalVisible(true);
      } else {
        // Fallback: show error
        Alert.alert('Lỗi', 'Không thể lưu lộ trình. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.error('Save itinerary error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConfirm = async () => {
    console.log('[ManualRoute] handleSaveConfirm pressed', { routeId: routeIdToConfirm, title: routeTitle });
    
    if (!routeIdToConfirm || !routeTitle.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập tên lộ trình.');
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

      // Call update status API to set status to CONFIRMED and update title
      await updateCustomItineraryStatusAPI(
        routeIdToConfirm,
        'CONFIRMED',
        routeTitle.trim(),
        token
      );

      // Close modal and navigate
      setIsNameModalVisible(false);
      setRouteIdToConfirm(null);
      setRouteTitle('');

      Alert.alert('Thành công', 'Lộ trình đã được lưu thành công!', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/itinerary'),
        },
      ]);
    } catch (error: any) {
      console.error('Confirm title error:', error);
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
        onPress: () => {
          router.replace('/(tabs)/itinerary');
        },
      },
    ]);
  };

  // Handle weather warning continue
  const handleWeatherContinue = async () => {
    setWeatherModalVisible(false);
    // Use saved route data
    if (pendingRouteData && pendingRouteData.route_id) {
      setCustomRouteData(pendingRouteData);
      setRouteIdToConfirm(pendingRouteData.route_id);
      setRouteTitle(pendingRouteData.title || suggestedTitle);
      setIsNameModalVisible(true);
      setPendingRouteData(null);
    }
  };

  // Handle weather warning go back
  const handleWeatherGoBack = () => {
    setWeatherModalVisible(false);
    setPendingRouteData(null);
  };

  const footerButtons = (
    <View style={styles.footer}>
      <TouchableOpacity
        style={[styles.footerButton, styles.cancelButton]}
        onPress={handleCancel}
        disabled={isSaving}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelButtonText}>Hủy</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.confirmButton]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.7}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color={COLORS.textWhite} />
        ) : (
          <Text style={styles.confirmButtonText}>Lưu lộ trình</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      {/* Only show ItineraryViewScreen when we have customRouteData (after save) */}
      {customRouteData ? (
        <ItineraryViewScreen
          visible
          routeId={routeIdToConfirm || ''}
          customRouteData={customRouteData}
          isManual={true}
          onClose={() => router.back()}
          footerContent={footerButtons}
          overlayContent={
            isNameModalVisible && (
              <View style={styles.inlineModalOverlay} pointerEvents="box-none">
                <View style={styles.modalBackdrop} />
                <View style={styles.inlineModalContent}>
                  <Text style={styles.modalTitle}>Đặt tên lộ trình</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Nhập tên lộ trình"
                    value={routeTitle}
                    onChangeText={setRouteTitle}
                    autoFocus
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancel]}
                      onPress={() => setIsNameModalVisible(false)}
                      disabled={isSaving}
                    >
                      <Text style={styles.modalCancelText}>Hủy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalConfirm]}
                      onPress={handleSaveConfirm}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color={COLORS.textWhite} />
                      ) : (
                        <Text style={styles.modalConfirmText}>Lưu</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }
        />
      ) : (
        /* Empty state before saving - show preview interface */
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Xem trước lộ trình</Text>
          <Text style={styles.emptyMessage}>
            Nhấn "Lưu lộ trình" để xem chi tiết và lưu lại lộ trình của bạn.
          </Text>
          {footerButtons}
        </View>
      )}

      {/* Weather Warning Modal */}
      <WeatherWarningModal
        visible={weatherModalVisible}
        severity={weatherSeverity}
        alertMessage={weatherAlert}
        onContinue={handleWeatherContinue}
        onGoBack={handleWeatherGoBack}
      />
    </>
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
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  inlineModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    zIndex: 9999,
  },
  inlineModalContent: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  modalButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: SPACING.md,
  },
  modalCancel: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalConfirm: {
    backgroundColor: COLORS.primary,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  emptyMessage: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
});
