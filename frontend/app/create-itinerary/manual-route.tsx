// ManualRouteScreen - Màn hình tạo lộ trình thủ công với wizard steps
import React, { useState, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Danh sách thành phố Việt Nam
const VIETNAM_CITIES = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Nha Trang',
  'Đà Lạt',
  'Huế',
  'Hội An',
  'Phú Quốc',
  'Vũng Tàu',
  'Phan Thiết',
  'Hạ Long',
  'Sa Pa',
  'Ninh Bình',
];

// Định nghĩa các bước
const STEPS = [
  { id: 0, title: 'Ngày đi', icon: 'calendar' },
  { id: 1, title: 'Ngày về', icon: 'calendar-check-o' },
  { id: 2, title: 'Vị trí xuất phát', icon: 'map-marker' },
  { id: 3, title: 'Điểm đến', icon: 'flag' },
];

const ManualRouteScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Current step state
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Form states
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date(Date.now() + 86400000)); // +1 day
  const [currentLocationText, setCurrentLocationText] = useState('');
  const [destination, setDestination] = useState('');

  // UI states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);

  const handleGoBack = () => {
    router.back();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const calculateDays = () => {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? 1 : diffDays + 1;
  };

  const getDurationText = () => `${calculateDays()} NGÀY`;

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      if (currentStep === 0) {
        setStartDate(selectedDate);
        if (selectedDate > endDate) {
          setEndDate(new Date(selectedDate.getTime() + 86400000));
        }
      } else if (currentStep === 1) {
        if (selectedDate < startDate) {
          Alert.alert('Lỗi', 'Ngày về không thể trước ngày đi');
          return;
        }
        setEndDate(selectedDate);
      }
    }
  };

  const handleSelectDestination = (city: string) => {
    setDestination(city);
    setShowDestinationModal(false);
  };

  // Animation khi chuyển step
  const animateStepChange = (newStep: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    setCurrentStep(newStep);
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      animateStepChange(currentStep - 1);
    }
  };

  const goToNextStep = () => {
    if (currentStep < STEPS.length - 1) {
      animateStepChange(currentStep + 1);
    }
  };

  const validateAndContinue = () => {
    if (!currentLocationText.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập vị trí xuất phát');
      animateStepChange(2);
      return;
    }
    if (!destination) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn điểm đến');
      animateStepChange(3);
      return;
    }

    router.push({
      pathname: '/create-itinerary/manual-place-selection',
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationDays: calculateDays().toString(),
        currentLocation: currentLocationText,
        currentLocationLat: '0',
        currentLocationLng: '0',
        destination,
      },
    });
  };

  // Render nội dung cho từng step
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Ngày đi
        return (
          <View style={styles.stepContent}>
            <View style={styles.stepIconContainer}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                style={styles.stepIconGradient}
              >
                <FontAwesome name="calendar" size={40} color={COLORS.textWhite} />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Chọn ngày đi</Text>
            <Text style={styles.stepDescription}>Bạn muốn bắt đầu chuyến đi khi nào?</Text>
            
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <FontAwesome name="calendar" size={24} color={COLORS.primary} />
              <Text style={styles.datePickerText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
          </View>
        );

      case 1: // Ngày về
        return (
          <View style={styles.stepContent}>
            <View style={styles.stepIconContainer}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                style={styles.stepIconGradient}
              >
                <FontAwesome name="calendar-check-o" size={40} color={COLORS.textWhite} />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Chọn ngày về</Text>
            <Text style={styles.stepDescription}>Bạn dự định kết thúc chuyến đi khi nào?</Text>
            
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <FontAwesome name="calendar-check-o" size={24} color={COLORS.primary} />
              <Text style={styles.datePickerText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
          </View>
        );

      case 2: // Vị trí xuất phát
        return (
          <View style={styles.stepContent}>
            <View style={styles.stepIconContainer}>
              <LinearGradient
                colors={[COLORS.accent, '#FF8C42']}
                style={styles.stepIconGradient}
              >
                <FontAwesome name="map-marker" size={40} color={COLORS.textWhite} />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Vị trí xuất phát</Text>
            <Text style={styles.stepDescription}>Bạn sẽ xuất phát từ đâu?</Text>
            
            <TextInput
              style={styles.locationInputFull}
              placeholder="Nhập địa chỉ của bạn..."
              placeholderTextColor={COLORS.textSecondary}
              value={currentLocationText}
              onChangeText={setCurrentLocationText}
              multiline={false}
            />

            {currentLocationText.trim().length > 0 && (
              <View style={styles.coordsConfirmed}>
                <FontAwesome name="check-circle" size={16} color={COLORS.success} />
                <Text style={styles.coordsConfirmedText}>Đã nhập vị trí</Text>
              </View>
            )}
          </View>
        );

      case 3: // Điểm đến
        return (
          <View style={styles.stepContent}>
            <View style={styles.stepIconContainer}>
              <LinearGradient
                colors={[COLORS.error, '#FF6B8A']}
                style={styles.stepIconGradient}
              >
                <FontAwesome name="flag" size={40} color={COLORS.textWhite} />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Điểm đến</Text>
            <Text style={styles.stepDescription}>Bạn muốn đến đâu?</Text>
            
            <TouchableOpacity
              style={styles.destinationButton}
              onPress={() => setShowDestinationModal(true)}
              activeOpacity={0.8}
            >
              <FontAwesome name="flag" size={20} color={destination ? COLORS.error : COLORS.textSecondary} />
              <Text style={[styles.destinationText, !destination && styles.destinationPlaceholder]}>
                {destination || 'Chọn thành phố...'}
              </Text>
              <FontAwesome name="chevron-down" size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {destination && (
              <View style={styles.destinationConfirmed}>
                <FontAwesome name="check-circle" size={16} color={COLORS.success} />
                <Text style={styles.destinationConfirmedText}>Đã chọn điểm đến</Text>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  // Modal chọn thành phố
  const CitySelectionModal = () => (
    <Modal visible={showDestinationModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Chọn điểm đến</Text>
            <TouchableOpacity onPress={() => setShowDestinationModal(false)} style={styles.modalCloseButton}>
              <FontAwesome name="times" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {VIETNAM_CITIES.map((city) => (
              <TouchableOpacity
                key={city}
                style={[styles.modalItem, destination === city && styles.modalItemSelected]}
                onPress={() => handleSelectDestination(city)}
              >
                <FontAwesome name="map-marker" size={16} color={destination === city ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[styles.modalItemText, destination === city && styles.modalItemTextSelected]}>
                  {city}
                </Text>
                {destination === city && (
                  <FontAwesome name="check" size={16} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack} activeOpacity={0.7}>
            <FontAwesome name="arrow-left" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Tạo lộ trình thủ công</Text>
            <Text style={styles.headerSubtitle}>Bước {currentStep + 1} / {STEPS.length}</Text>
          </View>
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          {STEPS.map((step, index) => (
            <View key={step.id} style={styles.progressItem}>
              <View
                style={[
                  styles.progressDot,
                  index <= currentStep && styles.progressDotActive,
                  index < currentStep && styles.progressDotCompleted,
                ]}
              >
                {index < currentStep ? (
                  <FontAwesome name="check" size={10} color={COLORS.textWhite} />
                ) : (
                  <Text style={[styles.progressDotText, index <= currentStep && styles.progressDotTextActive]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {index < STEPS.length - 1 && (
                <View style={[styles.progressLine, index < currentStep && styles.progressLineActive]} />
              )}
            </View>
          ))}
        </View>

        {/* Step Content Card */}
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Animated.View style={{ opacity: fadeAnim }}>
              {renderStepContent()}
            </Animated.View>
          </View>
        </View>

        {/* Navigation Arrows */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity
            style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
            onPress={goToPrevStep}
            disabled={currentStep === 0}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-left" size={24} color={currentStep === 0 ? COLORS.textSecondary : COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.navIndicator}>
            {STEPS.map((_, index) => (
              <View
                key={index}
                style={[styles.navDot, index === currentStep && styles.navDotActive]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.navButton, currentStep === STEPS.length - 1 && styles.navButtonDisabled]}
            onPress={goToNextStep}
            disabled={currentStep === STEPS.length - 1}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-right" size={24} color={currentStep === STEPS.length - 1 ? COLORS.textSecondary : COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Continue Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={validateAndContinue}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.gradientSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueButtonGradient}
            >
              <Text style={styles.continueButtonText}>TIẾP TỤC CHỌN ĐỊA ĐIỂM</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={currentStep === 0 ? startDate : endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={currentStep === 0 ? new Date() : startDate}
        />
      )}

      {/* City Selection Modal */}
      <CitySelectionModal />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
  },
  progressDotCompleted: {
    backgroundColor: COLORS.success,
  },
  progressDotText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  progressDotTextActive: {
    color: COLORS.textWhite,
  },
  progressLine: {
    width: 50,
    height: 4,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 6,
  },
  progressLineActive: {
    backgroundColor: COLORS.success,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    marginBottom: -SPACING.md,
  },
  card: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 24,
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    minHeight: 320,
  },
  stepContent: {
    alignItems: 'center',
  },
  stepIconContainer: {
    marginBottom: SPACING.lg,
  },
  stepIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: `${COLORS.primary}10`,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    width: '100%',
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
    marginTop: SPACING.lg,
  },
  durationBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  locationInputFull: {
    width: '100%',
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  coordsConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  coordsConfirmedText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  destinationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: `${COLORS.primary}10`,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    width: '100%',
  },
  destinationText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  destinationPlaceholder: {
    color: COLORS.textSecondary,
  },
  destinationConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  destinationConfirmedText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  navDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
  },
  navDotActive: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.xs,
  },
  continueButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  continueButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalList: {
    paddingHorizontal: SPACING.lg,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalItemSelected: {
    backgroundColor: `${COLORS.primary}10`,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: 12,
    borderBottomWidth: 0,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  modalItemTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});

export default ManualRouteScreen;
