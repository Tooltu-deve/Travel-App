import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from "axios";
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SPACING } from '../../../constants';
import { API_BASE_URL } from '@/services/api';

const { width } = Dimensions.get('window');

// Lưu preferences của user
async function saveUserPreferences(moods: string[], token: string) {
  try {
    await axios.patch(
      `${API_BASE_URL}/api/v1/users/profile`,
      { preferencedTags: moods },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return true;
  } catch (err) {
    console.error("❌ saveUserPreferences error:", err);
    return false;
  }
}

// -------------------- TYPES --------------------
interface MoodOption {
  id: string;
  label: string;
  image: any;
}

// -------------------- CONSTANTS --------------------
const CARD_SIZE = (width - SPACING.lg * 3) / 2;

const MOOD_OPTIONS: readonly MoodOption[] = [
  { id: 'calm_relax', label: 'Yên tĩnh & Thư giãn', image: require('../../../assets/images/moods/calm_relax.jpg') },
  { id: 'social_energy', label: 'Náo nhiệt & Xã hội', image: require('../../../assets/images/moods/social_energy.jpg') },
  { id: 'romantic_private', label: 'Lãng mạn & Riêng tư', image: require('../../../assets/images/moods/romantic_private.jpg') },
  { id: 'coastal_resort', label: 'Ven biển & Nghỉ dưỡng', image: require('../../../assets/images/moods/coastal_resort.jpg') },
  { id: 'festive_vibrant', label: 'Lễ hội & Sôi động', image: require('../../../assets/images/moods/festive_vibrant.png') },
  { id: 'tourist_hotspot', label: 'Điểm thu hút khách du lịch', image: require('../../../assets/images/moods/tourist_hotspot.jpg') },
  { id: 'adventure_fun', label: 'Mạo hiểm & Thú vị', image: require('../../../assets/images/moods/adventure_fun.jpg') },
  { id: 'family_cozy', label: 'Gia đình & Thoải mái', image: require('../../../assets/images/moods/family_cozy.jpg') },
  { id: 'modern_creative', label: 'Hiện đại & Sáng tạo', image: require('../../../assets/images/moods/modern_creative.png') },
  { id: 'historic_tradition', label: 'Lịch sử & Truyền thống', image: require('../../../assets/images/moods/historic-tradition.jpg') },
  { id: 'spiritual_religious', label: 'Tâm linh & Tôn giáo', image: require('../../../assets/images/moods/spiritual_religious.jpeg') },
  { id: 'local_authentic', label: 'Địa phương & Đích thực', image: require('../../../assets/images/moods/local_authentic.jpg') },
  { id: 'nature', label: 'Cảnh quan thiên nhiên', image: require('../../../assets/images/moods/nature.jpg') },
] as const;

// -------------------- COMPONENT: MoodCard --------------------
const MoodCard: React.FC<{
  mood: MoodOption;
  isSelected: boolean;
  isDisabled: boolean;
  onPress: (moodId: string) => void;
}> = React.memo(({ mood, isSelected, isDisabled, onPress }) => {
  const handlePress = useCallback(() => {
    if (!isDisabled) onPress(mood.id);
  }, [mood.id, onPress, isDisabled]);

  return (
    <TouchableOpacity
      activeOpacity={isDisabled ? 1 : 0.95}
      onPress={handlePress}
      disabled={isDisabled}
      style={[styles.moodCard, isSelected && styles.selectedCard]}
    >
      <ImageBackground
        source={mood.image}
        style={styles.cardImage}
        imageStyle={{ borderRadius: CARD_SIZE / 2 }}
        resizeMode="cover"
      >
        <View style={[styles.cardGradient, { borderRadius: CARD_SIZE / 2 }]}>
          {isSelected && <View style={styles.selectedOverlay} />}
          <View style={styles.imageOverlay} />
          {isDisabled && <View style={styles.disabledOverlay} />}

          <View style={styles.iconTopRight}>
            {isSelected ? (
              <View style={styles.checkmarkCircle}>
                <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
              </View>
            ) : (
              <View style={styles.dot} />
            )}
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.moodLabel} numberOfLines={2} adjustsFontSizeToFit>
              {mood.label.replace('&', '\n&')}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
});

// -------------------- MAIN SCREEN --------------------
export default function MoodSelectionScreen() {
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleMoodSelect = useCallback((moodId: string) => {
    setSelectedMoods((prev) => {
      if (prev.includes(moodId)) return prev.filter((id) => id !== moodId);
      if (prev.length >= 3) return prev;
      return [...prev, moodId];
    });
  }, []);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem('hasCompletedMoodSelection', 'true');
    router.replace('/(tabs)');
  }, [router]);

  const handleContinue = useCallback(async () => {
    if (selectedMoods.length === 0) return;

    setLoading(true);
    try {
      const moodLabels = selectedMoods
        .map(id => MOOD_OPTIONS.find(m => m.id === id)?.label)
        .filter(Boolean) as string[];

      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        await saveUserPreferences(moodLabels, token);
      }
      await AsyncStorage.setItem('hasCompletedMoodSelection', 'true');
      router.replace('/(tabs)');
    } catch (error) {
      // Vẫn chuyển trang dù lỗi
      await AsyncStorage.setItem('hasCompletedMoodSelection', 'true');
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  }, [selectedMoods, router]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Bỏ qua</Text>
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.mainHeroTitle}>Chọn tâm trạng của bạn</Text>
            <Text style={styles.subtitleCentered}>
              Chúng tôi sẽ gợi ý trải nghiệm phù hợp theo cảm xúc hiện tại của bạn.
            </Text>
          </View>
        </View>

        <View style={styles.moodGrid}>
          {MOOD_OPTIONS.map((mood) => {
            const isSelected = selectedMoods.includes(mood.id);
            const isDisabled = !isSelected && selectedMoods.length >= 3;
            return (
              <MoodCard
                key={`mood-${mood.id}`}
                mood={mood}
                isSelected={isSelected}
                isDisabled={isDisabled}
                onPress={handleMoodSelect}
              />
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.continueButton, loading && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Đang xử lý...' : selectedMoods.length > 0 ? `Tiếp tục với [${selectedMoods.length}] tâm trạng` : 'Chọn ít nhất 1 tâm trạng'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// -------------------- STYLES --------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D6EAF8',
  },
  scrollContent: {
    paddingTop: SPACING.xl + 20,
    paddingBottom: 100,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
  },
  titleContainer: {
    gap: SPACING.xs,
    alignItems: 'center',
  },
  mainHeroTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1565C0',
    textAlign: 'center',
    lineHeight: 54,
    letterSpacing: 1,
    marginTop: SPACING.md,
    marginBottom: SPACING.md + 4,
    paddingVertical: 4,
    fontFamily: Platform.select({
      ios: 'HelveticaNeue-Black',
      android: 'sans-serif-black',
    }),
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitleCentered: {
    fontSize: 15,
    color: '#4D5E6F',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
    marginBottom: SPACING.lg,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  moodCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
    overflow: 'hidden',
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#42A5F5',
  },
  cardImage: {
    flex: 1,
  },
  cardGradient: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  iconTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  checkmarkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#42A5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#D6EAF8',
    borderTopWidth: 1,
    borderTopColor: 'rgba(66, 165, 245, 0.1)',
  },
  continueButton: {
    backgroundColor: '#42A5F5',
    borderRadius: 32,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#42A5F5',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
