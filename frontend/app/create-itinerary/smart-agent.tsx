// SmartAgentFormScreen - Form tạo lộ trình với SmartAgent
import React, { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Text, 
  StyleSheet, 
  View, 
  ScrollView, 
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar, DateData } from 'react-native-calendars';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { generateRouteAPI, getProfileAPI, checkWeatherAPI, autocompletePlacesAPI } from '../../services/api';
import WeatherWarningModal, { WeatherSeverity } from '../../components/WeatherWarningModal';

const SmartAgentFormScreen: React.FC = () => {
      // Xử lý khi người dùng chọn "Tiếp tục" trong modal warning
      // Xử lý khi người dùng chọn "Tiếp tục" trong modal warning
      const handleWeatherContinue = async () => {
        setWeatherModalVisible(false);
        // Sử dụng route data đã được lưu trước đó
        if (pendingRouteData) {
          router.push({
            pathname: '/create-itinerary/route-preview',
            params: {
              routeData: JSON.stringify(pendingRouteData.route_data_json || {}),
              routeId: pendingRouteData.route_id,
              destination: destination,
              durationDays: String(calculateDurationDays()),
              currentLocation: JSON.stringify({
                address: currentLocationText.trim(),
              }),
            },
          });
          setPendingRouteData(null); // Clear pending data
        }
      };

      // Xử lý khi người dùng nhấn Quay lại
      const handleWeatherGoBack = () => {
        setWeatherModalVisible(false);
        setPendingRouteData(null); // Clear pending data khi quay lại
        setCurrentStep(1);
      };
    // Weather warning state
    const [weatherModalVisible, setWeatherModalVisible] = useState(false);
    const [weatherSeverity, setWeatherSeverity] = useState<WeatherSeverity>('normal');
    const [weatherAlert, setWeatherAlert] = useState<string>('');
    const [pendingRouteData, setPendingRouteData] = useState<any>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [destination, setDestination] = useState<string>('');
  const [profileMoods, setProfileMoods] = useState<string[]>([]);
  const [currentLocationText, setCurrentLocationText] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [travelMode, setTravelMode] = useState<'driving' | 'walking' | 'bicycling' | 'transit'>('driving');
  const [poiPerDay, setPoiPerDay] = useState<string>('3');
  const [currentStep, setCurrentStep] = useState<number>(1);
  
  // Autocomplete state
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<any[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [showAutocompleteSuggestions, setShowAutocompleteSuggestions] = useState(false);
  const [autocompleteSessionToken, setAutocompleteSessionToken] = useState<string>('');

  // ...existing code...

  // Danh sách các thành phố từ scrape_poi_reviews.py
  const vietnamCities = [
    'Hà Nội',
    'Thành phố Hồ Chí Minh',
    'Đà Nẵng',
    'Hải Phòng',
    'Cần Thơ',
    'Nha Trang',
    'Huế',
    'Vũng Tàu',
    'Hạ Long',
    'Đà Lạt',
    'Sa Pa',
    'Hội An',
    'Phú Quốc',
    'Phan Thiết',
    'Ninh Bình',
  ];

  const [isDestinationDropdownOpen, setIsDestinationDropdownOpen] = useState(false);

  useEffect(() => {
    // Set default start date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStartDate(tomorrow);
    // Default end date = start date + 2 (3-day trip)
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + 2);
    setEndDate(end);
  }, []);

  // Fetch profile to get moods
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const profile = await getProfileAPI(token);
        if (profile?.preferenced_tags && Array.isArray(profile.preferenced_tags)) {
          setProfileMoods(profile.preferenced_tags.map((t: any) => String(t)));
        }
      } catch (err) {
        console.warn('Fetch profile for moods failed', err);
      }
    };
    fetchProfile();
  }, []);

  // Generate session token for autocomplete on mount
  useEffect(() => {
    setAutocompleteSessionToken(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  // Debounced autocomplete handler
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentLocationText.trim().length >= 2 && destination) {
        try {
          setIsAutocompleteLoading(true);
          const token = await AsyncStorage.getItem('userToken');
          const suggestions = await autocompletePlacesAPI(
            currentLocationText,
            autocompleteSessionToken,
            destination,
            token || undefined
          );
          setAutocompleteSuggestions(suggestions || []);
          setShowAutocompleteSuggestions(true);
        } catch (error) {
          console.error('Autocomplete error:', error);
          setAutocompleteSuggestions([]);
        } finally {
          setIsAutocompleteLoading(false);
        }
      } else {
        setAutocompleteSuggestions([]);
        setShowAutocompleteSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [currentLocationText, destination, autocompleteSessionToken]);

  const handleGoBack = () => {
    router.back();
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const calculateDurationDays = (): number => {
    if (!startDate || !endDate) return 0;
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const handleSubmit = async () => {
    // Validation
    if (!destination.trim()) {
      Alert.alert('Lỗi', 'Vui lòng chọn điểm đến');
      return;
    }

    if (!startDate || !endDate) {
      Alert.alert('Lỗi', 'Vui lòng chọn ngày đi và ngày về');
      return;
    }
    // Tính duration days (bao gồm cả ngày đi và về)
    const diffMs = endDate.getTime() - startDate.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    if (days < 1) {
      Alert.alert('Lỗi', 'Ngày về phải sau ngày đi');
      return;
    }

    if (!currentLocationText.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ xuất phát');
      return;
    }

    if (!profileMoods || profileMoods.length === 0) {
      Alert.alert('Lỗi', 'Hồ sơ người dùng chưa có tâm trạng (moods). Vui lòng cập nhật profile.');
      return;
    }

    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để tạo lộ trình');
        router.replace('/(auth)/login');
        return;
      }
      const diffMs = endDate!.getTime() - startDate!.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      await proceedWithRouteGeneration(token, days);
    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Lỗi', error.message || 'Đã xảy ra lỗi khi tạo lộ trình. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // Hàm thực hiện tạo lộ trình (được gọi sau khi kiểm tra thời tiết)
  const proceedWithRouteGeneration = async (token: string, days: number) => {
    try {
      setIsLoading(true);
      // Prepare request body
      const requestBody: any = {
        destination: destination.trim(),
        user_mood: profileMoods,
        duration_days: days,
        start_location: currentLocationText.trim(),
        travel_mode: travelMode,
        poi_per_day: parseInt(poiPerDay) || 3,
      };
      if (startDate) {
        requestBody.start_datetime = startDate.toISOString();
      }
      requestBody.ecs_score_threshold = 0.1;
      console.log('📤 Generating route with:', requestBody);
      const response = await generateRouteAPI(token, requestBody);
      console.log('✅ Route generated:', response);

      // Kiểm tra cảnh báo thời tiết từ backend itinerary
      const route = response.route as any;
      const alerts = route?.alerts ?? route?.route_data_json?.alerts;
      if (Array.isArray(alerts) && alerts.length > 0) {
        const firstAlert = alerts[0];
        setWeatherSeverity(firstAlert.severity === 'danger' ? 'danger' : firstAlert.severity === 'warning' ? 'warning' : 'normal');
        setWeatherAlert(firstAlert.message || firstAlert.title || 'Có cảnh báo thời tiết');
        setPendingRouteData(route); // Lưu route data để sử dụng khi bấm "Tiếp tục"
        setWeatherModalVisible(true);
        setIsLoading(false);
        return;
      }

      // Nếu không có cảnh báo, chuyển sang màn hình preview
      router.push({
        pathname: '/create-itinerary/route-preview',
        params: {
          routeData: JSON.stringify(response.route?.route_data_json || {}),
          routeId: response.route?.route_id,
          destination: destination,
          durationDays: String(days),
          currentLocation: JSON.stringify({
            address: currentLocationText.trim(),
          }),
        },
      });
    } catch (error: any) {
      console.error('❌ Generate route error:', error);
      Alert.alert(
        'Lỗi',
        error.message || 'Đã xảy ra lỗi khi tạo lộ trình. Vui lòng thử lại.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ...existing code...

  const handleNextStep = () => {
    switch (currentStep) {
      case 1:
        if (!startDate) {
          Alert.alert('Lỗi', 'Vui lòng chọn ngày đi');
          return;
        }
        break;
      case 2:
        if (!endDate) {
          Alert.alert('Lỗi', 'Vui lòng chọn ngày về');
          return;
        }
        if (endDate < startDate!) {
          Alert.alert('Lỗi', 'Ngày về phải sau ngày đi');
          return;
        }
        break;
      case 3:
        if (!destination) {
          Alert.alert('Lỗi', 'Vui lòng chọn điểm đến');
          return;
        }
        break;
      case 4:
        if (!currentLocationText.trim()) {
          Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ xuất phát');
          return;
        }
        handleSubmit();
        return;
    }
    setCurrentStep(currentStep + 1);
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Chọn ngày đi';
      case 2:
        return 'Chọn ngày về';
      case 3:
        return 'Chọn điểm đến';
      case 4:
        return 'Thông tin hành trình';
      default:
        return 'Tạo lộ trình';
    }
  };

  const getStepSubtitle = () => {
    switch (currentStep) {
      case 1:
        return 'Bạn dự định đi du lịch vào ngày nào?';
      case 2:
        return 'Bạn dự định về vào ngày nào?';
      case 3:
        return 'Bạn muốn đi đâu?';
      case 4:
        return 'Chọn phương tiện, POI/ngày và địa chỉ xuất phát';
      default:
        return '';
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
  return (
          <View style={styles.stepContent}>
            <View style={styles.calendarContainer}>
              <Calendar
                minDate={new Date().toISOString().split('T')[0]}
                onDayPress={(day: DateData) => {
                  setStartDate(new Date(day.dateString));
                }}
                markedDates={
                  startDate
                    ? {
                        [startDate.toISOString().split('T')[0]]: {
                          selected: true,
                          selectedColor: COLORS.primary,
                        },
                      }
                    : {}
                }
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: COLORS.textSecondary,
                  selectedDayBackgroundColor: COLORS.primary,
                  selectedDayTextColor: COLORS.textWhite,
                  todayTextColor: COLORS.primary,
                  dayTextColor: COLORS.textMain,
                  textDisabledColor: COLORS.disabled,
                  arrowColor: COLORS.primary,
                  monthTextColor: COLORS.textDark,
                  indicatorColor: COLORS.primary,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
              />
            </View>
            {startDate && (
              <View style={styles.selectedDateContainer}>
                <FontAwesome name="calendar" size={18} color={COLORS.primary} />
                <Text style={styles.selectedDateText}>
                  Ngày đi: {formatDate(startDate)}
                </Text>
              </View>
            )}
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.calendarContainer}>
              <Calendar
                minDate={startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}
                onDayPress={(day: DateData) => {
                  setEndDate(new Date(day.dateString));
                }}
                markedDates={{
                  ...(startDate
                    ? {
                        [startDate.toISOString().split('T')[0]]: {
                          marked: true,
                          dotColor: COLORS.success,
                        },
                      }
                    : {}),
                  ...(endDate
                    ? {
                        [endDate.toISOString().split('T')[0]]: {
                          selected: true,
                          selectedColor: COLORS.primary,
                        },
                      }
                    : {}),
                }}
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: COLORS.textSecondary,
                  selectedDayBackgroundColor: COLORS.primary,
                  selectedDayTextColor: COLORS.textWhite,
                  todayTextColor: COLORS.primary,
                  dayTextColor: COLORS.textMain,
                  textDisabledColor: COLORS.disabled,
                  arrowColor: COLORS.primary,
                  monthTextColor: COLORS.textDark,
                  indicatorColor: COLORS.primary,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
              />
            </View>
            <View style={styles.dateInfoContainer}>
              <View style={styles.selectedDateContainer}>
                <FontAwesome name="calendar" size={18} color={COLORS.success} />
                <Text style={styles.selectedDateText}>
                  Ngày đi: {formatDate(startDate)}
                </Text>
              </View>
              {endDate && (
                <>
                  <View style={styles.selectedDateContainer}>
                    <FontAwesome name="calendar-check-o" size={18} color={COLORS.primary} />
                    <Text style={styles.selectedDateText}>
                      Ngày về: {formatDate(endDate)}
                    </Text>
                  </View>
                  <View style={styles.durationContainer}>
                    <FontAwesome name="clock-o" size={18} color={COLORS.accent} />
                    <Text style={styles.durationText}>
                      Tổng: {calculateDurationDays()} ngày
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
          <TouchableOpacity 
              style={styles.dropdownButton}
              onPress={() => setIsDestinationDropdownOpen(true)}
            activeOpacity={0.7}
          >
              <FontAwesome name="map-marker" size={18} color={destination ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.dropdownButtonText, !destination && styles.dropdownButtonTextPlaceholder]}>
                {destination || 'Chọn điểm đến...'}
              </Text>
              <FontAwesome name="chevron-down" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
            {destination && (
              <View style={styles.selectedDestinationContainer}>
                <FontAwesome name="check-circle" size={18} color={COLORS.success} />
                <Text style={styles.selectedDestinationText}>
                  Đã chọn: {destination}
                </Text>
          </View>
            )}
        </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            {/* Travel Mode */}
          <View style={styles.section}>
              <Text style={styles.label}>Phương tiện di chuyển</Text>
            <View style={styles.optionsRow}>
                {['driving','walking','bicycling','transit'].map((mode) => (
                <TouchableOpacity
                    key={mode}
                  style={[
                    styles.optionButton,
                      travelMode === mode && styles.optionButtonActive,
                  ]}
                    onPress={() => setTravelMode(mode as any)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                        travelMode === mode && styles.optionButtonTextActive,
                    ]}
                  >
                      {mode === 'driving' && 'Ô tô'}
                      {mode === 'walking' && 'Đi bộ'}
                      {mode === 'bicycling' && 'Xe đạp'}
                      {mode === 'transit' && 'Công cộng'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

            {/* POI mỗi ngày */}
          <View style={styles.section}>
              <Text style={styles.label}>Số điểm đến mỗi ngày</Text>
              <TextInput
                style={[styles.input, styles.departureInput]}
                placeholder="3"
                placeholderTextColor={COLORS.textSecondary}
                value={poiPerDay}
                onChangeText={setPoiPerDay}
                keyboardType="numeric"
              />
          </View>

          {/* Current Location with Autocomplete */
          <View style={styles.section}>
              <Text style={styles.label}>Địa điểm xuất phát *</Text>
              <View style={styles.autocompleteContainer}>
                <TextInput
                  style={[styles.input, styles.departureInput]}
                  placeholder="Ví dụ: Hà Nội, 123 Đường ABC, Quận 1, TP.HCM..."
                  placeholderTextColor={COLORS.textSecondary}
                  value={currentLocationText}
                  onChangeText={(text) => {
                    setCurrentLocationText(text);
                    if (text.trim().length < 2) {
                      setShowAutocompleteSuggestions(false);
                    }
                  }}
                  onFocus={() => {
                    if (currentLocationText.trim().length >= 2) {
                      setShowAutocompleteSuggestions(true);
                    }
                  }}
                  multiline={false}
                  numberOfLines={1}
                  returnKeyType="done"
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                {isAutocompleteLoading && (
                  <View style={styles.autocompleteLoadingContainer}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                )}
                {showAutocompleteSuggestions && autocompleteSuggestions.length > 0 && (
                  <View style={styles.autocompleteSuggestionsContainer}>
                    <ScrollView 
                      style={styles.autocompleteSuggestionsList}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled={true}
                    >
                      {autocompleteSuggestions.map((suggestion, index) => (
                        <TouchableOpacity
                          key={suggestion.place_id || index}
                          style={styles.autocompleteSuggestionItem}
                          onPress={() => {
                            setCurrentLocationText(suggestion.description);
                            setShowAutocompleteSuggestions(false);
                            setAutocompleteSuggestions([]);
                          }}
                          activeOpacity={0.7}
                        >
                          <FontAwesome name="map-marker" size={16} color={COLORS.primary} />
                          <View style={styles.autocompleteSuggestionTextContainer}>
                            <Text style={styles.autocompleteSuggestionMainText}>
                              {suggestion.structured_formatting?.main_text || suggestion.description}
                            </Text>
                            {suggestion.structured_formatting?.secondary_text && (
                              <Text style={styles.autocompleteSuggestionSecondaryText}>
                                {suggestion.structured_formatting.secondary_text}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
              <Text style={styles.hint}>
                Nhập địa chỉ xuất phát (gợi ý giới hạn trong {destination})
              </Text>
            </View>
          }

            {/* Summary */}
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Tóm tắt</Text>
              <View style={styles.summaryItem}>
                <FontAwesome name="calendar" size={16} color={COLORS.textSecondary} />
                <Text style={styles.summaryText}>
                  {formatDate(startDate)} - {formatDate(endDate)} ({calculateDurationDays()} ngày)
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <FontAwesome name="map-marker" size={16} color={COLORS.textSecondary} />
                <Text style={styles.summaryText}>{destination}</Text>
              </View>
              <View style={styles.summaryItem}>
                <FontAwesome name="car" size={16} color={COLORS.textSecondary} />
                <Text style={styles.summaryText}>
                  Phương tiện: {travelMode === 'driving' && 'Ô tô'}
                  {travelMode === 'walking' && ' Đi bộ'}
                  {travelMode === 'bicycling' && ' Xe đạp'}
                  {travelMode === 'transit' && ' Công cộng'}
            </Text>
          </View>
              <View style={styles.summaryItem}>
                <FontAwesome name="map-pin" size={16} color={COLORS.textSecondary} />
                <Text style={styles.summaryText}>
                  {poiPerDay} POI/ngày
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

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
            onPress={handleGoBack}
                activeOpacity={0.7}
              >
            <FontAwesome name="arrow-left" size={20} color={COLORS.textDark} />
              </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{getStepTitle()}</Text>
            <Text style={styles.headerSubtitle}>{getStepSubtitle()}</Text>
          </View>
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4].map((step) => (
            <React.Fragment key={step}>
              <View style={styles.progressStepContainer}>
              <TouchableOpacity
                  style={[
                    styles.progressDot,
                    currentStep >= step && styles.progressDotActive,
                    currentStep === step && styles.progressDotCurrent,
                  ]}
                  onPress={() => setCurrentStep(step)}
                activeOpacity={0.7}
              >
                  {currentStep > step ? (
                    <FontAwesome name="check" size={12} color={COLORS.textWhite} />
                  ) : (
                    <Text
                      style={[
                        styles.progressDotText,
                        currentStep >= step && styles.progressDotTextActive,
                      ]}
                    >
                      {step}
                </Text>
                  )}
              </TouchableOpacity>
                {step < 4 && (
                  <View
                    style={[
                      styles.progressLine,
                      currentStep > step && styles.progressLineActive,
                    ]}
                  />
                )}
              </View>
            </React.Fragment>
          ))}
          </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.lg }}
          >
            {renderStepContent()}
          </ScrollView>
        </View>

        {/* Destination Dropdown Modal */}
          <Modal
          visible={isDestinationDropdownOpen}
            transparent={true}
            animationType="fade"
          onRequestClose={() => setIsDestinationDropdownOpen(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
            onPress={() => setIsDestinationDropdownOpen(false)}
            >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Chọn điểm đến</Text>
                  <TouchableOpacity
                  onPress={() => setIsDestinationDropdownOpen(false)}
                    style={styles.modalCloseButton}
                  >
                    <FontAwesome name="times" size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              <ScrollView style={styles.modalScrollView}>
                {vietnamCities.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[
                      styles.modalItem,
                      destination === city && styles.modalItemActive,
                    ]}
                    onPress={() => {
                      setDestination(city);
                      setIsDestinationDropdownOpen(false);
                  }}
                    activeOpacity={0.7}
                  >
                    <FontAwesome
                      name="map-marker"
                      size={18}
                      color={destination === city ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modalItemText,
                        destination === city && styles.modalItemTextActive,
                      ]}
                    >
                      {city}
                    </Text>
                    {destination === city && (
                      <FontAwesome name="check" size={16} color={COLORS.primary} />
                    )}
                    </TouchableOpacity>
                ))}
              </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity 
            style={[styles.footerButton, styles.nextButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleNextStep}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={styles.nextButtonText}>
              {currentStep === 4 
                ? (isLoading ? 'Đang tạo...' : 'Tạo lộ trình') 
                : 'Tiếp theo'}
            </Text>
            <FontAwesome
              name={currentStep === 4 ? 'check' : 'arrow-right'}
              size={16}
              color={COLORS.textWhite}
            />
          </TouchableOpacity>
        </View>

        {/* Weather Warning Modal */}
                <WeatherWarningModal
                  visible={weatherModalVisible}
                  severity={weatherSeverity}
                  alertMessage={weatherAlert}
                  destination={destination}
                  onContinue={handleWeatherContinue}
                  onGoBack={handleWeatherGoBack}
                  onClose={() => setWeatherModalVisible(false)}
                />
        {/* ...bỏ modal cảnh báo thời tiết... */}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTextContainer: {
    flex: 1,
    gap: SPACING.xs / 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  formContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    gap: SPACING.lg,
  },
  section: {
    gap: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: COLORS.textMain,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  optionButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  optionButtonTextActive: {
    color: COLORS.textWhite,
  },
  locationInputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  geocodeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  geocodeButtonDisabled: {
    opacity: 0.6,
  },
  coordsDisplay: {
    marginTop: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  coordsText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xs / 2,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: SPACING.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },
  dropdownButton: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 15,
    color: COLORS.textMain,
    flex: 1,
  },
  dropdownButtonTextPlaceholder: {
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
  },
  dropdownList: {
    maxHeight: 400,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.bgLightBlue,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textMain,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  datetimeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  datetimeButton: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  datetimeButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  datetimeButtonTextPlaceholder: {
    color: COLORS.textSecondary,
  },
  pickerModalContent: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pickerModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  calendar: {
    borderRadius: 12,
    padding: SPACING.md,
  },
  timePickerContainer: {
    flexDirection: 'row',
    padding: SPACING.md,
    maxHeight: 300,
  },
  timePickerColumn: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  timePickerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  timePickerScroll: {
    maxHeight: 250,
    width: '100%',
  },
  timeOption: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: 'center',
  },
  timeOptionActive: {
    backgroundColor: COLORS.primary,
  },
  timeOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  timeOptionTextActive: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  timePickerConfirmButton: {
    margin: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    alignItems: 'center',
  },
  timePickerConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  // iOS DateTimePicker styles
  iosPickerModalContent: {
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iosPickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iosPickerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  iosPickerCancelButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  iosPickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  iosPickerDoneButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  iosPickerContainer: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  iosDateTimePicker: {
    width: '100%',
    height: 200,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalItemActive: {
    backgroundColor: COLORS.bgLightBlue,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textMain,
  },
  modalItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: 'transparent',
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: SPACING.md,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  // Wizard styles (similar to manual-form)
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  progressStepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  progressDotCurrent: {
    borderColor: COLORS.accent,
    borderWidth: 3,
  },
  progressDotText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  progressDotTextActive: {
    color: COLORS.textWhite,
  },
  progressLine: {
    width: 40,
    height: 3,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.xs,
  },
  progressLineActive: {
    backgroundColor: COLORS.primary,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  stepContent: {
    gap: SPACING.lg,
  },
  calendarContainer: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgMain,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  dateInfoContainer: {
    gap: SPACING.sm,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgLightBlue,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
  },
  durationText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  selectedDestinationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgLightBlue,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
  },
  selectedDestinationText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  summaryContainer: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  summaryText: {
    fontSize: 15,
    color: COLORS.textMain,
  },
  autocompleteContainer: {
    position: 'relative',
  },
  departureInput: {
    minHeight: 56,
    paddingVertical: SPACING.lg,
  },
  autocompleteLoadingContainer: {
    position: 'absolute',
    right: SPACING.md,
    top: SPACING.lg,
  },
  autocompleteSuggestionsContainer: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgMain,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    maxHeight: 250,
    zIndex: 1000,
  },
  autocompleteSuggestionsList: {
    maxHeight: 250,
  },
  autocompleteSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  autocompleteSuggestionTextContainer: {
    flex: 1,
    gap: SPACING.xs / 2,
  },
  autocompleteSuggestionMainText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  autocompleteSuggestionSecondaryText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});

export default SmartAgentFormScreen;

