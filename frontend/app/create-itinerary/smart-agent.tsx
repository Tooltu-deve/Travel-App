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
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { generateRouteAPI } from '../../services/api';

const getStyles = (darkMode: boolean) => StyleSheet.create({
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
    color: darkMode ? COLORS.primary : COLORS.textDark,
    letterSpacing: 0.5,
    textShadowColor: darkMode ? 'rgba(0,163,255,0.10)' : 'rgba(0, 163, 255, 0.15)',
    textShadowOffset: { width: 0, height: darkMode ? 1 : 2 },
    textShadowRadius: darkMode ? 4 : 8,
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
    backgroundColor: darkMode ? '#2A2A2A' : COLORS.bgMain,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: darkMode ? '#E0E0E0' : COLORS.textMain,
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
    color: darkMode ? '#E0E0E0' : COLORS.textDark,
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
    backgroundColor: darkMode ? '#232323' : COLORS.bgMain,
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
    color: darkMode ? '#E0E0E0' : COLORS.textMain,
  },
  optionButtonTextActive: {
    color: COLORS.textWhite,
  },
  locationInputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  locationTextInput: {
    flex: 1,
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
    color: darkMode ? '#E0E0E0' : COLORS.textMain,
  },
  hint: {
    fontSize: 12,
    color: darkMode ? '#E0E0E0' : COLORS.textSecondary,
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
    backgroundColor: darkMode ? '#2A2A2A' : COLORS.bgMain,
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
    color: darkMode ? '#E0E0E0' : COLORS.textMain,
    flex: 1,
  },
  dropdownButtonTextPlaceholder: {
    color: darkMode ? '#808080' : COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: darkMode ? '#2A2A2A' : COLORS.bgMain,
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
    color: darkMode ? '#FFFFFF' : COLORS.textDark,
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
    color: darkMode ? '#FFFFFF' : COLORS.textMain,
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
});

const SmartAgentFormScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { darkMode } = require('@/contexts/ThemeContext').useTheme();
  const styles = getStyles(darkMode);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [budget, setBudget] = useState<string>('affordable');
  const [destination, setDestination] = useState<string>('');
  const [userMood, setUserMood] = useState<string>('');
  const [durationDays, setDurationDays] = useState<string>('3');
  const [currentLocationText, setCurrentLocationText] = useState<string>('');
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  // Available options - Sử dụng đúng các giá trị budget từ database
  const budgetOptions = [
    { value: 'free', label: 'Miễn phí' },
    { value: 'cheap', label: 'Rẻ' },
    { value: 'affordable', label: 'Hợp lý' },
    { value: 'expensive', label: 'Đắt' },
  ];

  const moodOptions = [
    'adventurous', 'relaxed', 'romantic', 'family-friendly', 
    'cultural', 'nature', 'foodie', 'nightlife'
  ];

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
    
    // Set default time to 9:00 AM
    const defaultTime = new Date();
    defaultTime.setHours(9, 0, 0, 0);
    setStartTime(defaultTime);
  }, []);

  const handleGoBack = () => {
    router.back();
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address.trim()) {
      return null;
    }

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) {
      throw new Error('Google Geocoding API key chưa được cấu hình. Vui lòng thêm EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY vào .env');
    }

    try {
      setIsGeocoding(true);
      const encodedAddress = encodeURIComponent(address);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng,
        };
      } else {
        const errorMessage = data.error_message || `Geocoding failed: ${data.status}`;
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('❌ Geocoding error:', error);
      throw error;
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleGeocodeLocation = async () => {
    if (!currentLocationText.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ');
      return;
    }

    try {
      const coords = await geocodeAddress(currentLocationText);
      if (coords) {
        setCurrentLocationCoords(coords);
        Alert.alert(
          'Thành công',
          `Đã tìm thấy vị trí:\nLatitude: ${coords.lat.toFixed(6)}\nLongitude: ${coords.lng.toFixed(6)}`
        );
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy vị trí cho địa chỉ này');
      }
    } catch (error: any) {
      Alert.alert('Lỗi', error.message || 'Không thể chuyển đổi địa chỉ thành tọa độ');
      setCurrentLocationCoords(null);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!destination.trim()) {
      Alert.alert('Lỗi', 'Vui lòng chọn điểm đến');
      return;
    }

    if (!userMood.trim()) {
      Alert.alert('Lỗi', 'Vui lòng chọn tâm trạng');
      return;
    }

    const days = parseInt(durationDays);
    if (isNaN(days) || days < 1) {
      Alert.alert('Lỗi', 'Số ngày phải lớn hơn 0');
      return;
    }

    if (!currentLocationCoords) {
      Alert.alert('Lỗi', 'Vui lòng nhập và xác nhận vị trí hiện tại');
      return;
    }

    try {
      setIsLoading(true);

      // Get token from AsyncStorage
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để tạo lộ trình');
        router.replace('/(auth)/login');
        return;
      }

      // Prepare request body
      const requestBody: any = {
        budget,
        destination: destination.trim(),
        user_mood: userMood.trim(),
        duration_days: days,
        current_location: {
          lat: currentLocationCoords.lat,
          lng: currentLocationCoords.lng,
        },
      };

      // Add optional fields
      if (startDate && startTime) {
        // Combine date and time into ISO 8601 format
        const dateTime = new Date(startDate);
        dateTime.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), 0);
        requestBody.start_datetime = dateTime.toISOString();
      }

      // Set default ECS score threshold to 0.1
      requestBody.ecs_score_threshold = 0.1;

      console.log('📤 Generating route with:', requestBody);

      // Call API
      const response = await generateRouteAPI(token, requestBody);

      console.log('✅ Route generated:', response);

      // Navigate to route preview screen
      router.push({
        pathname: '/create-itinerary/route-preview',
        params: {
          routeData: JSON.stringify(response.route.route_data_json),
          routeId: response.route.route_id,
          destination: destination,
          durationDays: durationDays,
          currentLocation: JSON.stringify({
            lat: currentLocationCoords.lat,
            lng: currentLocationCoords.lng,
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

  return (
    <LinearGradient
      colors={darkMode ? ['#181A20', '#181A20'] : [COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={darkMode ? [0, 1] : [0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <ScrollView 
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
      >
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
            <Text style={styles.headerTitle}>Tạo với SmartAgent</Text>
            <Text style={styles.headerSubtitle}>Nhập thông tin để tạo lộ trình</Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Budget Selection */}
          <View style={styles.section}>
            <Text style={styles.label}>Ngân sách *</Text>
            <View style={styles.optionsRow}>
              {budgetOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    budget === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setBudget(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      budget === option.value && styles.optionButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Destination */}
          <View style={styles.section}>
            <Text style={styles.label}>Điểm đến *</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setIsDestinationDropdownOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dropdownButtonText, !destination && styles.dropdownButtonTextPlaceholder]}>
                {destination || 'Chọn thành phố...'}
              </Text>
              <FontAwesome name="chevron-down" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
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
                  <Text style={styles.modalTitle}>Chọn thành phố</Text>
                  <TouchableOpacity
                    onPress={() => setIsDestinationDropdownOpen(false)}
                    style={styles.modalCloseButton}
                  >
                    <FontAwesome name="times" size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={vietnamCities}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        destination === item && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setDestination(item);
                        setIsDestinationDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          destination === item && styles.dropdownItemTextActive,
                        ]}
                      >
                        {item}
                      </Text>
                      {destination === item && (
                        <FontAwesome name="check" size={16} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                  style={styles.dropdownList}
                />
              </View>
            </TouchableOpacity>
          </Modal>

          {/* User Mood */}
          <View style={styles.section}>
            <Text style={styles.label}>Tâm trạng *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: adventurous, relaxed, romantic..."
              placeholderTextColor={COLORS.textSecondary}
              value={userMood}
              onChangeText={setUserMood}
            />
            <Text style={styles.hint}>
              Gợi ý: adventurous, relaxed, romantic, family-friendly, cultural, nature, foodie, nightlife
            </Text>
          </View>

          {/* Duration Days */}
          <View style={styles.section}>
            <Text style={styles.label}>Số ngày du lịch *</Text>
            <TextInput
              style={styles.input}
              placeholder="3"
              placeholderTextColor={COLORS.textSecondary}
              value={durationDays}
              onChangeText={setDurationDays}
              keyboardType="numeric"
            />
          </View>

          {/* Current Location */}
          <View style={styles.section}>
            <Text style={styles.label}>Vị trí hiện tại *</Text>
            <View style={styles.locationInputRow}>
              <TextInput
                style={[styles.input, styles.locationTextInput]}
                placeholder="Ví dụ: Hà Nội, 123 Đường ABC, Quận 1, TP.HCM..."
                placeholderTextColor={COLORS.textSecondary}
                value={currentLocationText}
                onChangeText={setCurrentLocationText}
                editable={!isGeocoding}
              />
              <TouchableOpacity
                style={[styles.geocodeButton, isGeocoding && styles.geocodeButtonDisabled]}
                onPress={handleGeocodeLocation}
                disabled={isGeocoding}
                activeOpacity={0.7}
              >
                {isGeocoding ? (
                  <ActivityIndicator size="small" color={COLORS.textWhite} />
                ) : (
                  <FontAwesome name="map-marker" size={16} color={COLORS.textWhite} />
                )}
              </TouchableOpacity>
            </View>
            {currentLocationCoords && (
              <View style={styles.coordsDisplay}>
                <Text style={styles.coordsText}>
                  <FontAwesome name="check-circle" size={14} color={COLORS.success} />{' '}
                  Tọa độ: {currentLocationCoords.lat.toFixed(6)}, {currentLocationCoords.lng.toFixed(6)}
                </Text>
              </View>
            )}
            <Text style={styles.hint}>
              Nhập địa chỉ và nhấn nút để chuyển đổi thành tọa độ GPS
            </Text>
          </View>

          {/* Start Date and Time */}
          <View style={styles.section}>
            <Text style={styles.label}>Thời gian khởi hành (Tùy chọn)</Text>
            <View style={styles.datetimeRow}>
              {/* Date Picker */}
              <TouchableOpacity
                style={styles.datetimeButton}
                onPress={() => setIsDatePickerOpen(true)}
                activeOpacity={0.7}
              >
                <FontAwesome name="calendar" size={16} color={COLORS.primary} />
                <Text style={[styles.datetimeButtonText, !startDate && styles.datetimeButtonTextPlaceholder]}>
                  {startDate
                    ? startDate.toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : 'Chọn ngày'}
                </Text>
                <FontAwesome name="chevron-down" size={12} color={COLORS.textSecondary} />
              </TouchableOpacity>

              {/* Time Picker */}
              <TouchableOpacity
                style={styles.datetimeButton}
                onPress={() => setIsTimePickerOpen(true)}
                activeOpacity={0.7}
              >
                <FontAwesome name="clock-o" size={16} color={COLORS.primary} />
                <Text style={[styles.datetimeButtonText, !startTime && styles.datetimeButtonTextPlaceholder]}>
                  {startTime
                    ? startTime.toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'Chọn giờ'}
                </Text>
                <FontAwesome name="chevron-down" size={12} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {startDate && startTime && (
              <Text style={styles.hint}>
                Đã chọn: {startDate.toLocaleDateString('vi-VN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })} lúc {startTime.toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </View>

          {/* Date Picker Modal */}
          <Modal
            visible={isDatePickerOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsDatePickerOpen(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setIsDatePickerOpen(false)}
            >
              <View style={styles.pickerModalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.pickerModalHeader}>
                  <Text style={styles.pickerModalTitle}>Chọn ngày</Text>
                  <TouchableOpacity
                    onPress={() => setIsDatePickerOpen(false)}
                    style={styles.modalCloseButton}
                  >
                    <FontAwesome name="times" size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Calendar
                  current={startDate ? startDate.toISOString().split('T')[0] : undefined}
                  minDate={new Date().toISOString().split('T')[0]}
                  maxDate={(() => {
                    const maxDate = new Date();
                    maxDate.setDate(maxDate.getDate() + 365);
                    return maxDate.toISOString().split('T')[0];
                  })()}
                  onDayPress={(day: { dateString: string }) => {
                    const selectedDate = new Date(day.dateString);
                    setStartDate(selectedDate);
                    setIsDatePickerOpen(false);
                  }}
                  markedDates={{
                    ...(startDate && {
                      [startDate.toISOString().split('T')[0]]: {
                        selected: true,
                        selectedColor: COLORS.primary,
                        selectedTextColor: COLORS.textWhite,
                      },
                    }),
                  }}
                  theme={{
                    backgroundColor: COLORS.bgMain,
                    calendarBackground: COLORS.bgMain,
                    textSectionTitleColor: COLORS.textMain,
                    selectedDayBackgroundColor: COLORS.primary,
                    selectedDayTextColor: COLORS.textWhite,
                    todayTextColor: COLORS.primary,
                    dayTextColor: COLORS.textMain,
                    textDisabledColor: COLORS.textSecondary,
                    dotColor: COLORS.primary,
                    selectedDotColor: COLORS.textWhite,
                    arrowColor: COLORS.primary,
                    monthTextColor: COLORS.textDark,
                    textDayFontWeight: '500',
                    textMonthFontWeight: '700',
                    textDayHeaderFontWeight: '600',
                    textDayFontSize: 14,
                    textMonthFontSize: 18,
                    textDayHeaderFontSize: 13,
                  }}
                  style={styles.calendar}
                />
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Time Picker - Using @react-native-community/datetimepicker */}
          {isTimePickerOpen && Platform.OS === 'android' && (
            <DateTimePicker
              value={startTime || new Date()}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={(event: any, selectedTime?: Date) => {
                setIsTimePickerOpen(false);
                if (event.type === 'set' && selectedTime) {
                  setStartTime(selectedTime);
                }
              }}
            />
          )}
          
          {/* iOS Time Picker Modal - Only show on iOS */}
          {Platform.OS === 'ios' && isTimePickerOpen && (
            <Modal
              visible={isTimePickerOpen}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setIsTimePickerOpen(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setIsTimePickerOpen(false)}
              >
                <View style={styles.iosPickerModalContent}>
                  <View style={styles.iosPickerModalHeader}>
                    <TouchableOpacity
                      onPress={() => setIsTimePickerOpen(false)}
                      style={styles.iosPickerCancelButton}
                    >
                      <Text style={styles.iosPickerCancelText}>Hủy</Text>
                    </TouchableOpacity>
                    <Text style={styles.iosPickerModalTitle}>Chọn giờ</Text>
                    <TouchableOpacity
                      onPress={() => setIsTimePickerOpen(false)}
                      style={styles.iosPickerDoneButton}
                    >
                      <Text style={styles.iosPickerDoneText}>Xong</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.iosPickerContainer}>
                    <DateTimePicker
                      value={startTime || new Date()}
                      mode="time"
                      is24Hour={true}
                      display="spinner"
                      onChange={(event: any, selectedTime?: Date) => {
                        if (event.type === 'set' && selectedTime) {
                          setStartTime(selectedTime);
                        }
                      }}
                      style={styles.iosDateTimePicker}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.gradientSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButtonGradient}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.textWhite} />
              ) : (
                <>
                  <FontAwesome name="magic" size={18} color={COLORS.textWhite} />
                  <Text style={styles.submitButtonText}>Tạo lộ trình</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default SmartAgentFormScreen;

