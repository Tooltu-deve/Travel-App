// FavoritesScreen - Trang danh sách yêu thích
import React, { useEffect, useState, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { getMoodsAPI, getFavoritesByMoodAPI, likePlaceAPI } from '@/services/api';
import { mockFavoritePlaces, getMockPlacesByMood, getMockMoods, MockFavoritePlace } from '../mockData';

// Mood translation mapping
const MOOD_TRANSLATIONS: { [key: string]: string } = {
  'adventurous': 'Phiêu lưu',
  'artistic': 'Nghệ thuật',
  'authentic': 'Chính thống',
  'comfortable': 'Thoải mái',
  'cozy': 'Ấm cúng',
  'creative': 'Sáng tạo',
  'crowded': 'Đông đúc',
  'cultural': 'Văn hóa',
  'exciting': 'Hào hứng',
  'faith': 'Tín ngưỡng',
  'family-friendly': 'Thân thiện với gia đình',
  'festive': 'Lễ hội',
  'genuine': 'Chân thực',
  'good for couples': 'Tốt cho cặp đôi',
  'historical': 'Lịch sử',
  'lively': 'Sôi động',
  'local_gem': 'Ngọc ẩn địa phương',
  'modern': 'Hiện đại',
  'peaceful': 'Yên bình',
  'quiet': 'Yên tĩnh',
  'relaxing': 'Thư giãn',
  'religious': 'Tôn giáo',
  'romantic': 'Lãng mạn',
  'scenic': 'Đẹp cảnh',
  'seaside': 'Biển',
  'spiritual': 'Tâm linh',
  'thrilling': 'Kích thích',
  'tourist-friendly': 'Thân thiện với du khách',
  'touristy': 'Du lịch',
  'traditional': 'Truyền thống',
  'vibrant': 'Sôi nổi',
  // Keep existing translations as fallback
  'Happy': 'Vui vẻ',
  'Sad': 'Buồn bã',
  'Adventurous': 'Phiêu lưu',
  'Relaxed': 'Thư giãn',
  'Excited': 'Hào hứng',
  'Peaceful': 'Yên bình',
  'Energetic': 'Năng động',
  'Curious': 'Tò mò',
  'Nostalgic': 'Hoài niệm',
  'Thrilled': 'Hào hứng',
  'Calm': 'Bình tĩnh',
  'Joyful': 'Vui mừng',
  'Melancholic': 'Buồn man mác',
  'Passionate': 'Đam mê',
  'Serene': 'Tĩnh lặng',
  'Playful': 'Đùa nghịch',
  'Contemplative': 'Suy tư',
  'Optimistic': 'Lạc quan',
  'Pensive': 'Trầm tư',
  'Cheerful': 'Vui tươi',
  'Gloomy': 'U ám',
  'Enthusiastic': 'Nhiệt tình',
  'Tranquil': 'Yên tĩnh',
  'Whimsical': 'Kỳ quặc',
  'Reflective': 'Suy ngẫm',
  'Ecstatic': 'Háo hức',
  'Solemn': 'Trang nghiêm',
  'Blissful': 'Hạnh phúc',
  'Melodramatic': 'Kịch tính',
  'Zen': 'Thiền',
  'Funky': 'Kỳ lạ',
  'Groovy': 'Tuyệt vời',
  'Chill': 'Thoải mái',
  'Lit': 'Sôi động',
  'Vibe': 'Không khí',
  'Mood': 'Tâm trạng',
};

// Function to translate mood
const translateMood = (mood: string): string => {
  return MOOD_TRANSLATIONS[mood] || mood; // Fallback to original if not found
};

interface FavoritePlace {
  id: string;
  name: string;
  address: string;
  mood: string; // For backward compatibility with API
  moods?: string[]; // New field for multiple moods
  rating: number | null;
}

const FavoritesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [moods, setMoods] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoritePlace[]>([]);
  const [isLoadingMoods, setIsLoadingMoods] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [moodsError, setMoodsError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState<string | null>(null);
  // Animation refs for staggered entrance when favorites change
  const animValues = useRef<Animated.Value[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchMoods = async () => {
      try {
        setIsLoadingMoods(true);
        setMoodsError(null);

        // Use mock data instead of API
        const mockMoods = getMockMoods();
        if (isMounted) {
          setMoods(mockMoods);
          if (mockMoods.length > 0) {
            setSelectedMood(mockMoods[0]);
          }
        }
      } catch (error: any) {
        console.error('❌ Fetch moods error:', error);
        if (isMounted) {
          setMoodsError(error.message || 'Không thể tải danh sách tâm trạng.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingMoods(false);
        }
      }
    };

    fetchMoods();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedMood) return;

    let isMounted = true;

    const fetchFavorites = async () => {
      try {
        setIsLoadingFavorites(true);
        setFavoritesError(null);

        // Use mock data instead of API
        const mockPlaces = getMockPlacesByMood(selectedMood);
        // Convert to expected format
        const formattedPlaces: FavoritePlace[] = mockPlaces.map(place => ({
          id: place.id,
          name: place.name,
          address: place.address,
          mood: selectedMood, // Set to selected mood for compatibility
          moods: place.moods,
          rating: place.rating
        }));

        if (isMounted) {
          // Initialize animated values before rendering the list so Animated.Views are bound
          animValues.current = formattedPlaces.map(() => new Animated.Value(0));

          setFavorites(formattedPlaces);

          // Start staggered entrance shortly after render begins
          setTimeout(() => {
            const animations = animValues.current.map(av =>
              Animated.timing(av, {
                toValue: 1,
                duration: 360,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
              })
            );

            Animated.stagger(80, animations).start();
          }, 50);
        }
      } catch (error: any) {
        console.error('❌ Fetch favorites error:', error);
        if (isMounted) {
          setFavoritesError(error.message || 'Không thể tải danh sách yêu thích.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingFavorites(false);
        }
      }
    };

    fetchFavorites();

    return () => {
      isMounted = false;
    };
  }, [selectedMood]);

  

  const renderStars = (rating: number | null) => {
    if (!rating) return null;

    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <FontAwesome key={i} name="star" size={14} color={COLORS.accent} />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <FontAwesome key="half" name="star-half-o" size={14} color={COLORS.accent} />
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <FontAwesome key={`empty-${i}`} name="star-o" size={14} color={COLORS.textSecondary} />
      );
    }

    return stars;
  };

  const handleLikePlace = async (placeId: string) => {
    try {
      setIsLiking(placeId);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // For mock data, just refetch the favorites for the current mood
      if (selectedMood) {
        const mockPlaces = getMockPlacesByMood(selectedMood);
        const formattedPlaces: FavoritePlace[] = mockPlaces.map(place => ({
          id: place.id,
          name: place.name,
          address: place.address,
          mood: selectedMood,
          moods: place.moods,
          rating: place.rating
        }));
        setFavorites(formattedPlaces);
      }
    } catch (error: any) {
      console.error('❌ Like place error:', error);
      // Handle error, maybe show alert
    } finally {
      setIsLiking(null);
    }
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
      >
        {/* Header */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.headerTextContainer}>
            <FontAwesome name="heart" size={26} color="#E53E3E" style={styles.headerIcon} />
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerTitle}>Yêu thích của tôi</Text>
              <Text style={styles.headerSubtitle}>Các địa điểm yêu thích theo tâm trạng</Text>
            </View>
          </View>
        </View>

        {/* Moods Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Chọn tâm trạng</Text>

          {isLoadingMoods && (
            <View style={styles.dataStateContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.dataStateText}>Đang tải tâm trạng...</Text>
            </View>
          )}

          {!isLoadingMoods && moodsError && (
            <View style={styles.dataStateContainer}>
              <FontAwesome name="exclamation-circle" size={18} color={COLORS.error} />
              <Text style={[styles.dataStateText, styles.errorText]}>
                {moodsError}
              </Text>
            </View>
          )}

          {!isLoadingMoods && !moodsError && moods.length === 0 && (
            <View style={styles.dataStateContainer}>
              <FontAwesome name="info-circle" size={18} color={COLORS.textSecondary} />
              <Text style={styles.dataStateText}>
                Chưa có tâm trạng nào.
              </Text>
            </View>
          )}

          {!isLoadingMoods && !moodsError && moods.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moodsContainer}
            >
              {moods.map((mood) => (
                <TouchableOpacity
                  key={mood}
                  style={[
                    styles.moodButton,
                    selectedMood === mood && styles.moodButtonSelected,
                  ]}
                  onPress={() => setSelectedMood(mood)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.moodButtonText,
                      selectedMood === mood && styles.moodButtonTextSelected,
                    ]}
                  >
                    {translateMood(mood)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Favorites Section */}
        {selectedMood && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>
              Địa điểm yêu thích - {translateMood(selectedMood)}
            </Text>

            {isLoadingFavorites && (
              <View style={styles.dataStateContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.dataStateText}>Đang tải địa điểm...</Text>
              </View>
            )}

            {!isLoadingFavorites && favoritesError && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="exclamation-circle" size={18} color={COLORS.error} />
                <Text style={[styles.dataStateText, styles.errorText]}>
                  {favoritesError}
                </Text>
              </View>
            )}

            {!isLoadingFavorites && !favoritesError && favorites.length === 0 && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="heart-o" size={18} color={COLORS.textSecondary} />
                <Text style={styles.dataStateText}>
                  Chưa có địa điểm yêu thích cho tâm trạng này.
                </Text>
              </View>
            )}

            {!isLoadingFavorites && !favoritesError && favorites.length > 0 && (
              favorites.map((place, index) => {
                const anim = animValues.current[index];
                const animatedStyle = anim
                  ? {
                      opacity: anim,
                      transform: [
                        {
                          translateY: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    }
                  : {};

                return (
                  <Animated.View key={place.id} style={[styles.placeCard, animatedStyle]}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.85)']}
                      style={styles.placeCardGradient}
                    >
                      <View style={styles.placeContent}>
                        <View style={styles.placeHeader}>
                          <View style={styles.placeInfo}>
                            <Text style={styles.placeName} numberOfLines={2}>
                              {place.name}
                            </Text>
                            <View style={styles.placeRow}>
                              <FontAwesome name="map-marker" size={14} color={COLORS.primary} />
                              <Text style={styles.placeAddress} numberOfLines={2}>
                                {place.address}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.placeActions}>
                            <TouchableOpacity
                              onPress={() => handleLikePlace(place.id)}
                              disabled={isLiking === place.id}
                              style={styles.likeButton}
                            >
                              <FontAwesome
                                name="heart"
                                size={24}
                                color={isLiking === place.id ? COLORS.textSecondary : '#E53E3E'}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={styles.placeFooter}>
                          <View style={styles.ratingContainer}>
                            {renderStars(place.rating)}
                            {place.rating && (
                              <Text style={styles.ratingText}>
                                {place.rating.toFixed(1)}
                              </Text>
                            )}
                          </View>
                          {place.moods && place.moods.length > 0 && (
                            <View style={styles.placeMoodsContainer}>
                              <Text style={styles.moodsLabel}>Tâm trạng:</Text>
                              <View style={styles.moodTags}>
                                {place.moods.slice(0, 3).map((mood, idx) => (
                                  <View key={idx} style={styles.moodTag}>
                                    <Text style={styles.moodTagText}>
                                      {translateMood(mood)}
                                    </Text>
                                  </View>
                                ))}
                                {place.moods.length > 3 && (
                                  <Text style={styles.moreMoodsText}>
                                    +{place.moods.length - 3}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </Animated.View>
                );
              })
            )}
          </View>
        )}
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
  },
  headerTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerIcon: {
    marginRight: SPACING.sm,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
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
  sectionContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  moodsContainer: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  moodButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.textWhite,
    borderWidth: 1,
    borderColor: 'transparent',
    /* Subtle shadow for modern card look */
    shadowColor: 'rgba(0,0,0,0.06)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    marginRight: SPACING.sm,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodButtonSelected: {
    backgroundColor: COLORS.textWhite,
    borderColor: COLORS.primary,
    borderWidth: 2,
    /* Slightly more prominent shadow when selected */
    shadowColor: 'rgba(0,123,255,0.06)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  moodButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  moodButtonTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  placeCard: {
    borderRadius: 20,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  placeCardGradient: {
    flex: 1,
  },
  placeContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  placeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  placeInfo: {
    flex: 1,
    gap: SPACING.sm,
  },
  placeName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    flex: 1,
  },
  placeActions: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  likeButton: {
    padding: SPACING.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
  },
  placeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  placeMoodsContainer: {
    flex: 1,
    gap: SPACING.xs,
  },
  moodsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moodTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    alignItems: 'center',
  },
  moodTag: {
    backgroundColor: 'rgba(0, 163, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(0, 163, 255, 0.2)',
  },
  moodTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
  },
  moreMoodsText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  placeAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    flex: 1,
  },
  dataStateContainer: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgMain,
  },
  dataStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  errorText: {
    color: COLORS.error,
    fontWeight: '600',
  },
});

export default FavoritesScreen;
