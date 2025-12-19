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

  // Initialize itinerary with empty days based on durationDays
  const initializeEmptyItinerary = (): DayItinerary[] => {
    const days: DayItinerary[] = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < durationDays; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      days.push({
        day: i + 1,
        date: currentDate,
        places: [], // Empty places array - user will add POIs
      });
    }
    
    return days;
  };

  // Parse itinerary data from params OR initialize empty itinerary
  const [itinerary, setItinerary] = useState<DayItinerary[]>(() => {
    if (params.itineraryData) {
      try {
        const parsed = JSON.parse(params.itineraryData);
        return parsed.map((day: any) => ({
          ...day,
          date: new Date(day.date),
        }));
      } catch (error) {
        console.error('Failed to parse itinerary data:', error);
        return initializeEmptyItinerary();
      }
    }
    // No itinerary data provided, create empty structure
    return initializeEmptyItinerary();
  });
  
  const [travelModes, setTravelModes] = useState<{ [key: number]: string }>({});
  
  useEffect(() => {
    if (params.travelModes) {
      try {
        setTravelModes(JSON.parse(params.travelModes));
      } catch (error) {
        console.error('Failed to parse travel modes:', error);
      }
    }
  }, [params.travelModes]);

  const suggestedTitle =
    destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  const [isSaving, setIsSaving] = useState(false);
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [routeTitle, setRouteTitle] = useState(suggestedTitle);
  const [routeIdToConfirm, setRouteIdToConfirm] = useState<string | null>(null);
  
  // Initialize customRouteData with empty itinerary structure
  const [customRouteData, setCustomRouteData] = useState<any>(() => ({
    destination,
    title: suggestedTitle,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    start_location_text: currentLocationText,
    status: 'DRAFT',
    days: itinerary.map(day => ({
      day: day.day,
      dayNumber: day.day,
      places: day.places,
    })),
  }));
  
  // Weather warning modal states
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [weatherAlert, setWeatherAlert] = useState('');
  const [weatherSeverity, setWeatherSeverity] = useState<WeatherSeverity>('normal');
  const [pendingRouteData, setPendingRouteData] = useState<any>(null);

  // Update customRouteData when itinerary changes
  useEffect(() => {
    setCustomRouteData((prev: any) => ({
      ...prev,
      days: itinerary.map(day => ({
        day: day.day,
        dayNumber: day.day,
        places: day.places,
      })),
    }));
  }, [itinerary]);

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
        console.log('✅ Route saved successfully:', {
          route_id: result.route_id,
          hasDays: !!result.days,
          daysLength: result.days?.length,
          firstDayPlaces: result.days?.[0]?.places?.length,
        });
        
        // Validate and transform result structure
        if (!result.days || !Array.isArray(result.days)) {
          console.error('❌ Invalid result structure - missing days array');
          Alert.alert('Lỗi', 'Dữ liệu lộ trình không hợp lệ.');
          return;
        }
        
        // Ensure each day has places array and rename places to activities
        const transformedDays = result.days.map((day: any, idx: number) => {
          if (!day.places || !Array.isArray(day.places)) {
            console.warn(`⚠️ Day ${idx + 1} missing places array, initializing`);
            day.places = [];
          }
          
          console.log(`🔍 Day ${idx + 1} places:`, day.places.map((p: any) => ({
            name: p.name,
            hasLocation: !!p.location,
            location: p.location,
          })));
          
          // Transform places to activities for ItineraryViewScreen
          return {
            day: day.dayNumber || day.day || idx + 1,
            dayNumber: day.dayNumber || day.day || idx + 1,
            travel_mode: day.travelMode || 'driving',
            day_start_time: '09:00:00',
            activities: day.places.map((place: any, placeIdx: number) => {
              // Validate location
              const hasValidLocation = place.location && 
                                      typeof place.location.lat === 'number' && 
                                      typeof place.location.lng === 'number';
              
              if (!hasValidLocation) {
                console.warn(`⚠️ Place ${place.name} missing valid location:`, place.location);
              }
              
              return {
                name: place.name,
                google_place_id: place.placeId || place.google_place_id,
                location: hasValidLocation ? place.location : { lat: 0, lng: 0 },
                encoded_polyline: place.encoded_polyline || null,
                travel_duration_minutes: place.travel_duration_minutes,
                start_encoded_polyline: place.start_encoded_polyline || null,
                start_travel_duration_minutes: place.start_travel_duration_minutes,
                steps: place.steps,
              };
            }),
            // Keep original places for compatibility
            places: day.places,
          };
        });
        
        console.log('🔄 Transformed days to optimized_route format:', {
          daysCount: transformedDays.length,
          firstDayActivities: transformedDays[0]?.activities?.length,
        });
        
        // Transform result to customRouteData format for ItineraryViewScreen
        // Add route_data_json with optimized_route structure
        const transformedResult = {
          ...result,
          route_data_json: {
            destination: result.destination,
            start_location: result.start_location,
            start_location_text: result.start_location_text,
            start_date: result.start_date,
            end_date: result.end_date,
            duration_days: result.days.length,
            optimized_route: transformedDays,
            days: transformedDays, // Keep both for compatibility
          },
        };
        
        setCustomRouteData(transformedResult);
        
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
      {/* Always show ItineraryViewScreen - allow user to add places */}
      <ItineraryViewScreen
        visible
        routeId={routeIdToConfirm || ''}
        customRouteData={customRouteData}
        isManual={true}
        onClose={() => router.back()}
        footerContent={hasPlaces ? footerButtons : undefined}
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
});
