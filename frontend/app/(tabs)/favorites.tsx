// FavoritesScreen - Trang danh sách yêu thích
import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { getMoodsAPI, getFavoritesByMoodAPI, likePlaceAPI } from '@/services/api';

interface FavoritePlace {
  id: string;
  name: string;
  address: string;
  mood: string;
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

  useEffect(() => {
    let isMounted = true;

    const fetchMoods = async () => {
      try {
        setIsLoadingMoods(true);
        setMoodsError(null);

        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setMoodsError('Bạn cần đăng nhập để xem yêu thích.');
          return;
        }

        const response = await getMoodsAPI(token);
        if (isMounted) {
          setMoods(response.moods || []);
          if (response.moods && response.moods.length > 0) {
            setSelectedMood(response.moods[0]);
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

        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setFavoritesError('Bạn cần đăng nhập để xem yêu thích.');
          return;
        }

        const response = await getFavoritesByMoodAPI(token, selectedMood);
        if (isMounted) {
          setFavorites(response || []);
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

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        // Handle no token, maybe show error
        return;
      }

      await likePlaceAPI(token, placeId);

      // After liking/unliking, refetch the favorites for the current mood
      if (selectedMood) {
        const response = await getFavoritesByMoodAPI(token, selectedMood);
        setFavorites(response || []);
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
            <Text style={styles.headerTitle}>Yêu thích của tôi</Text>
            <Text style={styles.headerSubtitle}>Các địa điểm yêu thích theo tâm trạng</Text>
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
                    {mood}
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
              Địa điểm yêu thích - {selectedMood}
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
              favorites.map((place) => (
                <View key={place.id} style={styles.placeCard}>
                  <View style={styles.placeContent}>
                    <View style={styles.placeHeader}>
                      <Text style={styles.placeName} numberOfLines={2}>
                        {place.name}
                      </Text>
                      <View style={styles.placeActions}>
                        <TouchableOpacity
                          onPress={() => handleLikePlace(place.id)}
                          disabled={isLiking === place.id}
                          style={styles.likeButton}
                        >
                          <FontAwesome
                            name="heart"
                            size={20}
                            color={isLiking === place.id ? COLORS.textSecondary : COLORS.accent}
                          />
                        </TouchableOpacity>
                        <View style={styles.ratingContainer}>
                          {renderStars(place.rating)}
                          {place.rating && (
                            <Text style={styles.ratingText}>
                              {place.rating.toFixed(1)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={styles.placeBody}>
                      <View style={styles.placeRow}>
                        <FontAwesome name="map-marker" size={14} color={COLORS.primary} />
                        <Text style={styles.placeAddress} numberOfLines={2}>
                          {place.address}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
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
    gap: SPACING.xs / 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerSubtitle: {
    fontSize: 16,
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
  },
  moodButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 25,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moodButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  moodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  moodButtonTextSelected: {
    color: COLORS.textWhite,
  },
  placeCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
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
  placeName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    flex: 1,
  },
  placeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  likeButton: {
    padding: SPACING.xs,
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
  placeBody: {
    gap: SPACING.sm,
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
