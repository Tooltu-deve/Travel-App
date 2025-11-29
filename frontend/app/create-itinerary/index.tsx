// CreateItineraryScreen - Màn hình chọn phương thức tạo lộ trình
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Text, 
  StyleSheet, 
  View, 
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';

const CreateItineraryScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { darkMode } = require('@/contexts/ThemeContext').useTheme();

  const handleSmartAgent = () => {
    router.push('/create-itinerary/smart-agent');
  };

  const handleManual = () => {
    // TODO: Navigate to manual creation screen
    console.log('Create manually');
    // router.push('/create-itinerary/manual');
  };

  const handleGoBack = () => {
    router.back();
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
            style={[styles.backButton, darkMode && { backgroundColor: '#23262F', borderColor: '#363A45', shadowColor: 'transparent' }]}
            onPress={handleGoBack}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-left" size={20} color={darkMode ? '#fff' : COLORS.textDark} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.headerTitle, darkMode && { color: '#fff', textShadowColor: 'transparent' }]}>Tạo lộ trình mới</Text>
            <Text style={[styles.headerSubtitle, darkMode && { color: '#4DD0E1' }]}>Chọn phương thức tạo lộ trình</Text>
          </View>
        </View>

        {/* Options Container */}
        <View style={styles.optionsContainer}>
          {/* Smart Agent Option */}
          <TouchableOpacity 
            style={[styles.optionCard, darkMode && { shadowColor: 'transparent', backgroundColor: '#23262F', borderColor: '#2196F3', borderWidth: 2 }]}
            onPress={handleSmartAgent}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={darkMode ? ['#23262F', '#23262F'] : [COLORS.primary, COLORS.gradientSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.optionCardGradient}
            >
              <View style={[styles.optionIconContainer, darkMode && { backgroundColor: '#181A20' }] }>
                <FontAwesome name="magic" size={32} color={darkMode ? '#4DD0E1' : COLORS.textWhite} />
              </View>
              <Text style={[styles.optionTitle, darkMode && { color: '#fff', textShadowColor: 'transparent' }]}>Tạo với SmartAgent</Text>
              <Text style={[styles.optionDescription, darkMode && { color: '#E0E0E0', textShadowColor: 'transparent' }] }>
                Sử dụng AI để tạo lộ trình tự động dựa trên sở thích và tâm trạng của bạn
              </Text>
              <View style={styles.optionFeatures}>
                <View style={styles.featureItem}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.textWhite} />
                  <Text style={[styles.featureText, darkMode && { color: '#E0E0E0' }]}>Tự động đề xuất địa điểm</Text>
                </View>
                <View style={styles.featureItem}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.textWhite} />
                  <Text style={[styles.featureText, darkMode && { color: '#E0E0E0' }]}>Tối ưu hóa thời gian</Text>
                </View>
                <View style={styles.featureItem}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.textWhite} />
                  <Text style={[styles.featureText, darkMode && { color: '#E0E0E0' }]}>Cá nhân hóa theo tâm trạng</Text>
                </View>
              </View>
              <View style={[styles.optionBadge, darkMode && { backgroundColor: '#4DD0E1', shadowColor: 'transparent' }] }>
                <Text style={[styles.optionBadgeText, darkMode && { color: '#181A20' }]}>Đề xuất</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Manual Option */}
          <TouchableOpacity 
            style={[styles.optionCard, darkMode && { shadowColor: 'transparent', backgroundColor: '#23262F', borderColor: '#2196F3', borderWidth: 2 }]}
            onPress={handleManual}
            activeOpacity={0.9}
          >
            <View style={[styles.manualCard, darkMode && { backgroundColor: '#23262F', borderColor: '#2196F3' }] }>
              <View style={[styles.optionIconContainerManual, darkMode && { backgroundColor: '#181A20' }] }>
                <FontAwesome name="edit" size={32} color={darkMode ? '#4DD0E1' : COLORS.primary} />
              </View>
              <Text style={[styles.optionTitleManual, darkMode && { color: '#fff' }]}>Tạo lộ trình thủ công</Text>
              <Text style={[styles.optionDescriptionManual, darkMode && { color: '#E0E0E0' }] }>
                Tự tay thiết kế lộ trình của bạn, chọn từng địa điểm và sắp xếp theo ý muốn
              </Text>
              <View style={styles.optionFeaturesManual}>
                <View style={styles.featureItemManual}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.primary} />
                  <Text style={[styles.featureTextManual, darkMode && { color: '#E0E0E0' }]}>Kiểm soát hoàn toàn</Text>
                </View>
                <View style={styles.featureItemManual}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.primary} />
                  <Text style={[styles.featureTextManual, darkMode && { color: '#E0E0E0' }]}>Chọn địa điểm yêu thích</Text>
                </View>
                <View style={styles.featureItemManual}>
                  <FontAwesome name="check-circle" size={14} color={darkMode ? '#4DD0E1' : COLORS.primary} />
                  <Text style={[styles.featureTextManual, darkMode && { color: '#E0E0E0' }]}>Tùy chỉnh chi tiết</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  optionsContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    gap: SPACING.lg,
  },
  optionCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  optionCardGradient: {
    padding: SPACING.xl,
    gap: SPACING.md,
    position: 'relative',
  },
  manualCard: {
    backgroundColor: COLORS.bgMain,
    padding: SPACING.xl,
    gap: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 24,
  },
  optionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  optionIconContainerManual: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.bgLightBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  optionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  optionTitleManual: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  optionDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textWhite,
    lineHeight: 22,
    opacity: 0.95,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  optionDescriptionManual: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  optionFeatures: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  optionFeaturesManual: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureItemManual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textWhite,
    opacity: 0.9,
  },
  featureTextManual: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  optionBadge: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: 0.5,
  },
});

export default CreateItineraryScreen;

