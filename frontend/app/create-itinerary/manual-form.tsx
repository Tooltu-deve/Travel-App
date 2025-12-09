// ManualFormScreen - Form nhập thông tin tạo lộ trình thủ công
import React, { useState, useEffect, useRef } from 'react';
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
  FlatList,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';

const ManualFormScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Form state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [destination, setDestination] = useState<string>('');
  const [currentLocationText, setCurrentLocationText] = useState<string>('');
  
  // Modal states
  const [isDestinationDropdownOpen, setIsDestinationDropdownOpen] = useState(false);

  // Current step (for wizard-like flow)
  const [currentStep, setCurrentStep] = useState<number>(1);

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

  const handleNextStep = () => {
    // Validation cho từng bước
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

  const handleSubmit = () => {
    const durationDays = calculateDurationDays();
    
    // Navigate to manual preview screen
    router.push({
      pathname: '/create-itinerary/manual-preview' as any,
      params: {
        startDate: startDate!.toISOString(),
        endDate: endDate!.toISOString(),
        destination: destination,
        durationDays: durationDays.toString(),
        currentLocationText: currentLocationText,
      },
    });
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
        return 'Vị trí hiện tại';
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
        return 'Nhập địa chỉ bắt đầu của bạn';
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
            <View style={styles.locationSection}>
              <Text style={styles.locationLabel}>Nhập địa chỉ xuất phát</Text>
              <TextInput
                style={styles.locationInput}
                placeholder="Ví dụ: Hà Nội, 123 Nguyễn Huệ, Quận 1, TP.HCM..."
                placeholderTextColor={COLORS.textSecondary}
                value={currentLocationText}
                onChangeText={setCurrentLocationText}
                multiline
                numberOfLines={2}
              />
              <Text style={styles.locationHint}>
                Nhập địa chỉ nơi bạn xuất phát
              </Text>
            </View>

            {currentLocationText.trim() && (
              <View style={styles.coordsContainer}>
                <View style={styles.coordsHeader}>
                  <FontAwesome name="check-circle" size={20} color={COLORS.success} />
                  <Text style={styles.coordsTitle}>Địa chỉ đã nhập</Text>
                </View>
                <Text style={styles.coordsText}>
                  {currentLocationText}
                </Text>
              </View>
            )}

            {/* Summary */}
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Tóm tắt lộ trình</Text>
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
          {renderStepContent()}
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
            style={[styles.footerButton, styles.nextButton]}
            onPress={handleNextStep}
            activeOpacity={0.7}
          >
            <Text style={styles.nextButtonText}>
              {currentStep === 4 ? 'Tiếp tục' : 'Tiếp theo'}
            </Text>
            <FontAwesome
              name={currentStep === 4 ? 'check' : 'arrow-right'}
              size={16}
              color={COLORS.textWhite}
            />
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
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
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
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
    borderColor: COLORS.border,
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
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.bgMain,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textMain,
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
    borderRadius: SPACING.xl,
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
    borderBottomColor: COLORS.border,
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
    backgroundColor: COLORS.bgCard,
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
    fontWeight: '600',
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
  locationSection: {
    gap: SPACING.sm,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  locationInputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  locationInput: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.textMain,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  locationHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  coordsContainer: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  coordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  coordsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.success,
  },
  coordsInfo: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  coordsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
});

export default ManualFormScreen;
