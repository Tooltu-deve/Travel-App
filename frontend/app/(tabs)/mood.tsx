import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import axios from "axios" ;
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
import { SPACING } from '../../constants';

const { width } = Dimensions.get('window');

const BASE_URL = "https://travel-app-r9qu.onrender.com/api/v1";

// Lấy danh sách mood có sẵn từ backend
async function fetchAvailableMoods() {
  try {
    const url = `${BASE_URL}/places/available-moods`;
    console.log('🔄 GET:', url);
    const res = await axios.get(url);
    console.log('✅ Available moods response:', res.data);
    return res.data;
  } catch (err: any) {
    console.error("❌ fetchAvailableMoods error:", {
      status: err?.response?.status,
      url: err?.config?.url,
      data: err?.response?.data,
      message: err.message
    });
    return [];
  }
}

// Lưu preferences của user
async function saveUserPreferences(moods: string[], token?: string) {
  try {
    const url = `${BASE_URL}/users/profile/preferences`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    console.log('🔄 POST:', url);
    console.log('📦 Body:', { preferences: moods });
    const res = await axios.post(url, { preferences: moods }, { headers });
    console.log('✅ Save preferences response:', res.data);
    return res.data;
  } catch (err: any) {
    console.error("❌ saveUserPreferences error:", {
      status: err?.response?.status,
      url: err?.config?.url,
      data: err?.response?.data,
      message: err.message
    });
    throw err;
  }
}

// Tìm kiếm địa điểm theo cảm xúc
async function searchPlacesByEmotion(emotions: string[]) {
  try {
    const url = `${BASE_URL}/places/search-by-emotion`;
    const body = { emotions, mode: 'any', limit: 30 };
    console.log('🔄 POST:', url);
    console.log('📦 Body:', body);
    const res = await axios.post(url, body);
    console.log('✅ Search response:', res.data);
    return res.data;
  } catch (err: any) {
    console.error("❌ searchPlacesByEmotion error:", {
      status: err?.response?.status,
      url: err?.config?.url,
      data: err?.response?.data,
      message: err.message
    });
    throw err;
  }
}


// -------------------- MOOD MAPPING --------------------
// Map UI mood IDs sang backend emotion tags
const MOOD_TO_TAGS: Record<string, string[]> = {
  'calm_relax': ['quiet', 'peaceful', 'relaxing'],
  'social_energy': ['crowded', 'lively', 'vibrant'],
  'romantic_private': ['romantic', 'good for couples'],
  'luxury_premium': ['expensive', 'luxury'],
  'budget_value': ['good value', 'cheap', 'affordable'],
  'tourist_hotspot': ['touristy'],
  'adventure_fun': ['adventurous', 'exciting'],
  'family_cozy': ['family friendly'],
  'modern_creative': ['trendy', 'instagrammable'],
  'spiritual_religious': ['spiritual', 'serene'],
  'local_authentic': ['local gem', 'authentic'],
};

// Convert selected mood IDs to backend emotion tags
function convertMoodsToEmotions(moodIds: string[]): string[] {
  const emotions = new Set<string>();
  moodIds.forEach(id => {
    const tags = MOOD_TO_TAGS[id] || [];
    tags.forEach(tag => emotions.add(tag));
  });
  return Array.from(emotions);
}

// -------------------- TYPES --------------------
interface MoodOption {
  id: string;
  label: string;
  description: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  image?: any;
  colors: [string, string];
}

// -------------------- CONSTANTS --------------------
const CARD_SIZE = (width - SPACING.lg * 3) / 2;
const CARD_WIDTH = CARD_SIZE;
const CARD_HEIGHT = CARD_SIZE;

const MOOD_OPTIONS: readonly MoodOption[] = [
  {
    id: 'calm_relax',
    label: 'Yên tĩnh & Thư giãn',
    description: '',
    image: require('../../assets/images/moods/calm_relax.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'social_energy',
    label: 'Náo nhiệt & Xã hội',
    description: '',
    image: require('../../assets/images/moods/social_energy.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'romantic_private',
    label: 'Lãng mạn & Riêng tư',
    description: '',
    image: require('../../assets/images/moods/romantic_private.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'luxury_premium',
    label: 'Đắt đỏ & Sang trọng',
    description: '',
    image: require('../../assets/images/moods/luxury_premium.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'budget_value',
    label: 'Đáng tiền & Giá rẻ',
    description: '',
    image: require('../../assets/images/moods/budget_value.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'tourist_hotspot',
    label: 'Điểm thu hút khách du lịch',
    description: '',
    image: require('../../assets/images/moods/tourist_hotspot.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'adventure_fun',
    label: 'Mạo hiểm & Thú vị',
    description: '',
    image: require('../../assets/images/moods/adventure_fun.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'family_cozy',
    label: 'Gia đình & Thoải mái',
    description: '',
    image: require('../../assets/images/moods/family_cozy.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'modern_creative',
    label: 'Hiện đại & Sáng tạo',
    description: '',
    image: require('../../assets/images/moods/modern_creative.png'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'spiritual_religious',
    label: 'Tâm linh & Tôn giáo',
    description: '',
    image: require('../../assets/images/moods/spiritual_religious.jpeg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
  {
    id: 'local_authentic',
    label: 'Địa phương & Đích thực',
    description: '',
    image: require('../../assets/images/moods/local_authentic.jpg'),
    colors: ['#FFFFFF', '#F5F5F5'],
  },
] as const; 

// -------------------- COMPONENT: MoodCard --------------------
const MoodCard: React.FC<{
  mood: MoodOption;
  isSelected: boolean;
  onPress: (moodId: string) => void;
}> = ({ mood, isSelected, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(mood.id);
  }, [mood.id, onPress]);

  const contentView = (
    <>
      {isSelected && <View style={styles.selectedOverlay} />}
      {mood.image && <View style={styles.imageOverlay} />}

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
        <View style={styles.textContainer}>
          <Text style={styles.moodLabel} numberOfLines={2} adjustsFontSizeToFit>
            {mood.label.replace('&', '\n&')}
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={handlePress}
      style={[styles.moodCard, isSelected && styles.selectedCard]}
    >
      {mood.image ? (
        <ImageBackground
            source={mood.image}
            style={{ flex: 1 }}
            imageStyle={{
              borderRadius: CARD_SIZE / 2,
              width: '100%',
              height: '100%',
            }}
            resizeMode="cover"
          >
            <View
              style={[
                styles.cardGradient,
                { borderRadius: CARD_SIZE / 2 },
            ]}
          >
            {contentView}
          </View>
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={mood.colors}
          style={[styles.cardGradient, { borderRadius: CARD_SIZE / 2 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {contentView}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
};

// -------------------- MAIN SCREEN --------------------
export default function MoodScreen() {
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableMoods, setAvailableMoods] = useState<string[]>([]);

  // Load available moods từ backend khi mount
  useEffect(() => {
    const loadMoods = async () => {
      const moods = await fetchAvailableMoods();
      if (moods.length > 0) {
        setAvailableMoods(moods);
        console.log('Available moods từ backend:', moods);
      } else {
        console.log('Sử dụng moods mặc định');
      }
    };
    loadMoods();
  }, []);

  const handleMoodSelect = useCallback((moodId: string) => {
    setSelectedMoods((prev) =>
      prev.includes(moodId)
        ? prev.filter((id) => id !== moodId)
        : [...prev, moodId]
    );
  }, []);

  const handleContinue = useCallback(async () => {
    if (selectedMoods.length === 0) {
      console.log('Chưa chọn tâm trạng nào');
      return;
    }

    try {
      setLoading(true);
      
      // Convert mood IDs sang backend emotion tags
      const emotions = convertMoodsToEmotions(selectedMoods);
      console.log('Selected moods:', selectedMoods);
      console.log('Converted emotions:', emotions);
      
      // 1. Lưu preferences (mood IDs)
      try {
        await saveUserPreferences(selectedMoods);
        console.log('✅ Đã lưu preferences');
      } catch (prefErr) {
        console.warn('⚠️ Không thể lưu preferences (có thể chưa đăng nhập)');
      }
      
      // 2. Tìm kiếm địa điểm (dùng emotion tags)
      const places = await searchPlacesByEmotion(emotions);
      console.log('✅ Tìm thấy', places.length, 'địa điểm');
      
      // TODO: Điều hướng tới màn hình kết quả với places
      
    } catch (error: any) {
      console.error('Lỗi:', error?.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMoods]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={32} color="#1A1A1A" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.mainHeroTitle}>Chọn tâm trạng của bạn</Text>
            <Text style={styles.subtitleCentered}>
              Chúng tôi sẽ gợi ý trải nghiệm phù hợp theo cảm xúc hiện tại của bạn.
            </Text>
          </View>
        </View>

        <View style={styles.moodGrid}>
          {MOOD_OPTIONS.map((mood) => (
            <MoodCard
              key={`mood-${mood.id}`}
              mood={mood}
              isSelected={selectedMoods.includes(mood.id)}
              onPress={handleMoodSelect}
            />
          ))}
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
            {loading ? 'Đang tìm kiếm...' : `Tiếp tục với [${selectedMoods.length}] tâm trạng`}
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
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    marginLeft: -8,
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
  cardWrapper: {
    borderRadius: CARD_SIZE / 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: 'hidden',
  },

  moodCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 0,
  },

  selectedCard: {
    borderWidth: 2,
    borderColor: '#42A5F5',
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
  textContainer: {
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