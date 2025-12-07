import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { getMoodsAPI, getFavoritesByMoodAPI, getPlaceByIdAPI, enrichPlaceAPI } from '../../services/api';
import { useFavorites } from '@/contexts/FavoritesContext';
import { translatePlaceType } from '../../constants/placeTypes';
import { POIDetailBottomSheet } from '@/components/place/POIDetailBottomSheet';

const renderStars = (rating?: number | null) => {
  const stars = [];
  let ratingText = '0.0';
  if (rating == null || Number.isNaN(rating)) {
    for (let i = 0; i < 5; i++) {
      stars.push(
        <FontAwesome key={`e-${i}`} name="star-o" size={14} color={COLORS.textSecondary} style={{ marginRight: 6 }} />,
      );
    }
  } else {
    ratingText = rating.toFixed(1);
    const full = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    for (let i = 0; i < full; i++) {
      stars.push(
        <FontAwesome key={`s-${i}`} name="star" size={14} color={COLORS.ratingAlt} style={{ marginRight: 6 }} />,
      );
    }
    if (hasHalf) {
      stars.push(
        <FontAwesome key="half" name="star-half-o" size={14} color={COLORS.ratingAlt} style={{ marginRight: 6 }} />,
      );
    }
    const current = stars.length;
    for (let i = current; i < 5; i++) {
      stars.push(
        <FontAwesome key={`e-${i}`} name="star-o" size={14} color={COLORS.textSecondary} style={{ marginRight: 6 }} />,
      );
    }
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}<Text style={styles.placeRating}>{ratingText}</Text></View>;
};

const normalizePlace = (p: any) => {
  let moods: string[] = [];
  if (Array.isArray(p.moods) && p.moods.length) moods = p.moods;
  else if (p.mood) moods = [p.mood];
  else if (p.type) moods = [p.type];

  if ((!moods || moods.length === 0) && p.emotionalTags) {
    try {
      const tagsObj: any = p.emotionalTags instanceof Map ? Object.fromEntries(p.emotionalTags) : p.emotionalTags;
      if (tagsObj && typeof tagsObj === 'object') {
        const entries = Object.entries(tagsObj) as [string, number][];
        if (entries.length) {
          entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
          moods = [entries[0][0]];
        }
      }
    } catch (e) {}
  }

  if (moods && moods.length) {
    moods = moods.map((m) => translatePlaceType(m));
  }

  const name = p.name || p.title || p.name_en || p.googlePlaceId || p.google_place_id || p.address || 'Không rõ';
  const address = typeof p.address === 'string' && p.address
    ? p.address
    : (typeof p.location === 'string' ? p.location : '');

  let ratingVal: number | null = null;
  if (typeof p.rating === 'number') ratingVal = p.rating;
  else if (typeof p.rating === 'string' && p.rating.trim() !== '') {
    const parsed = parseFloat(p.rating);
    if (!Number.isNaN(parsed)) ratingVal = parsed;
  }

  return {
    id: p.placeId || p.id || p._id || p.place_id || p.google_place_id || p.googlePlaceId || '',
    name,
    address,
    moods,
    rating: ratingVal,
    googlePlaceId: p.google_place_id || p.googlePlaceId || '',
  };
};

const FavoritesScreen: React.FC = () => {
  const [moods, setMoods] = useState<Array<{ key: string; label: string }>>([]);
  const [selectedMood, setSelectedMood] = useState<string>('all');
  const [moodsExpanded, setMoodsExpanded] = useState<boolean>(false);
  const moodScales = useRef<Record<string, Animated.Value>>({}).current;
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    moods.forEach((m) => {
      if (!moodScales[m.key]) {
        moodScales[m.key] = new Animated.Value(m.key === selectedMood ? 1.06 : 1);
      }
    });
    prevSelectedRef.current = selectedMood;
  }, [moods]);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev && moodScales[prev]) {
      Animated.timing(moodScales[prev], { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    if (selectedMood && moodScales[selectedMood]) {
      Animated.timing(moodScales[selectedMood], { toValue: 1.06, duration: 180, useNativeDriver: true }).start();
    }
    prevSelectedRef.current = selectedMood;
  }, [selectedMood]);

  const { favorites: ctxFavorites, toggleLike, refreshFavorites } = useFavorites();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState<string | null>(null);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [selectedPlaceData, setSelectedPlaceData] = useState<any>(null);
  const [isEnriching, setIsEnriching] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setMoods([{ key: 'all', label: 'Tất cả' }]);
          return;
        }
        const res = await getMoodsAPI(token);
        const raw = Array.isArray(res?.moods) ? res.moods : [];
        const map = new Map<string, { key: string; label: string }>();
        raw.forEach((m: string) => {
          const key = String(m);
          if (!map.has(key)) {
            map.set(key, { key, label: translatePlaceType(m) });
          }
        });
        let translated = Array.from(map.values());
        translated.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
        const list = [{ key: 'all', label: 'Tất cả' }, ...translated];
        setMoods(list);
      } catch (e: any) {
        setError(e?.message || 'Không thể tải danh sách thể loại');
        setMoods([{ key: 'all', label: 'Tất cả' }]);
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setFavorites([]);
          setIsLoading(false);
          return;
        }

        let places: any[] = [];
        if (selectedMood === 'all') {
          const list = Array.isArray(ctxFavorites) ? ctxFavorites : [];
          places = list.map(normalizePlace).filter(p => p.name !== 'Không rõ');
        } else {
          const remote = await getFavoritesByMoodAPI(token, selectedMood);
          if (Array.isArray(remote)) {
            places = await Promise.all(remote.map(async (p: any) => {
              let norm = normalizePlace(p);
              const hasGoogleId = !!norm.googlePlaceId;
              const possibleId = p.place_id || p.placeId || p._id || p.id || norm.id;
              if (!hasGoogleId && possibleId) {
                try {
                  const detail = await getPlaceByIdAPI(possibleId);
                  if (detail) {
                    norm = normalizePlace({ ...detail, ...p });
                  }
                } catch (e) {}
              }
              return norm;
            }));
          }
        }

        if (!mounted) return;

        // Enrich từng place có googlePlaceId để lấy thông tin mới nhất
        const enrichedPlaces = await Promise.all(
          places.map(async (place) => {
            if (!place.googlePlaceId) {
              return place; // Giữ nguyên nếu không có googlePlaceId
            }

            try {
              // Enrich để lấy thông tin mới nhất (không force refresh để tránh tốn API calls)
              const response = await enrichPlaceAPI(token, place.googlePlaceId, false);
              const enrichedData = response?.data || response;

              if (enrichedData) {
                // Cập nhật thông tin từ enriched data
                return {
                  ...place,
                  name: enrichedData.name || place.name,
                  address: enrichedData.address || place.address,
                  rating: enrichedData.rating ?? place.rating,
                  // Giữ lại các thông tin khác
                };
              }
            } catch (error: any) {
              console.warn(`[Favorites] Failed to enrich place ${place.googlePlaceId}:`, error.message);
              // Nếu enrich thất bại, giữ nguyên thông tin cũ
            }

            return place;
          })
        );

        if (!mounted) return;
        setFavorites(enrichedPlaces.sort((a, b) => a.id.localeCompare(b.id)));
      } catch (e: any) {
        setError(e?.message || 'Không thể tải địa điểm yêu thích');
        setFavorites([]);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ctxFavorites, selectedMood]);

  const handleLikePlace = async (placeId: string, googlePlaceId?: string) => {
    const id = googlePlaceId || placeId;
    setIsLiking(id);
    try {
      await toggleLike(id);
      setFavorites((prev) => prev.filter((p) => p.id !== placeId));
      refreshFavorites().catch(() => {});
    } catch (e: any) {
      if (e?.message?.includes('Place không tồn tại')) {
        setFavorites((prev) => prev.filter((p) => p.id !== placeId));
        refreshFavorites().catch(() => {});
      } else {
        setError(e?.message || 'Không thể cập nhật yêu thích');
      }
    } finally {
      setIsLiking(null);
    }
  };

  // Handle click vào POI card - enrich POI và hiển thị bottom sheet
  const handlePlacePress = async (place: any) => {
    const googlePlaceId = place.googlePlaceId;
    if (!googlePlaceId) {
      Alert.alert('Thông báo', 'Địa điểm này chưa có Google Place ID.');
      return;
    }

    setIsEnriching(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để xem chi tiết địa điểm.');
        router.push('/(auth)/login');
        return;
      }

      // Gọi enrich API để cập nhật thông tin POI
      // Force refresh để đảm bảo lấy dữ liệu mới bằng tiếng Việt từ Google Places API
      const response = await enrichPlaceAPI(token, googlePlaceId, true);
      
      // Map dữ liệu từ enriched response sang format mà bottom sheet hiểu
      const enrichedData = response?.data || response;
      const mappedPlaceData = {
        _id: enrichedData.googlePlaceId,
        googlePlaceId: enrichedData.googlePlaceId,
        name: enrichedData.name,
        address: enrichedData.address,
        formatted_address: enrichedData.address,
        description: enrichedData.description || enrichedData.editorialSummary,
        editorialSummary: enrichedData.editorialSummary,
        rating: enrichedData.rating,
        user_ratings_total: enrichedData.reviews?.length || 0,
        contactNumber: enrichedData.contactNumber,
        phone: enrichedData.contactNumber,
        websiteUri: enrichedData.websiteUri,
        website: enrichedData.websiteUri,
        photos: enrichedData.photos || [],
        reviews: enrichedData.reviews?.map((review: any) => {
          // Debug: Log review data để kiểm tra
          console.log('[Favorites] Review data:', JSON.stringify(review, null, 2));
          
          // Lấy tên tác giả từ authorAttributions
          let authorName = 'Người dùng ẩn danh';
          if (review.authorAttributions) {
            if (Array.isArray(review.authorAttributions) && review.authorAttributions.length > 0) {
              const firstAttr = review.authorAttributions[0];
              authorName = firstAttr?.displayName || firstAttr?.name || 'Người dùng ẩn danh';
            } else if (typeof review.authorAttributions === 'object') {
              authorName = review.authorAttributions.displayName || review.authorAttributions.name || 'Người dùng ẩn danh';
            }
          }
          
          return {
            authorName,
            rating: review.rating,
            text: review.text,
            relativePublishTimeDescription: review.relativePublishTimeDescription,
            publishTime: review.relativePublishTimeDescription, // Giữ lại để backward compatible
            authorAttributions: review.authorAttributions, // Giữ lại để có thể fallback
          };
        }) || [],
        type: enrichedData.type,
        types: enrichedData.types,
        location: enrichedData.location,
        openingHours: enrichedData.openingHours,
        emotionalTags: enrichedData.emotionalTags,
        budgetRange: enrichedData.budgetRange,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
    } catch (error: any) {
      console.error('❌ Error enriching POI:', error);
      Alert.alert(
        'Lỗi',
        error.message || 'Không thể tải thông tin chi tiết địa điểm. Vui lòng thử lại.'
      );
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <LinearGradient
      colors={[
        COLORS.gradientStart,
        COLORS.gradientBlue1,
        COLORS.gradientBlue2,
        COLORS.gradientBlue3,
      ]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.headerContainer, { paddingTop: insets.top - SPACING.sm }]}> 
          <View style={styles.headerRow}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Yêu thích của tôi</Text>
              <Text style={styles.headerSubtitle}>Các địa điểm yêu thích theo tâm trạng</Text>
            </View>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setMoodsExpanded((s) => !s)}
              accessibilityLabel={moodsExpanded ? 'Thu gọn thể loại' : 'Mở rộng thể loại'}
            >
              <FontAwesome name={moodsExpanded ? 'list' : 'th-large'} size={18} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {moodsExpanded ? (
          <View style={styles.moodsGrid}>
            {moods.map((mood) => {
              const scale = moodScales[mood.key] || new Animated.Value(1);
              if (!moodScales[mood.key]) moodScales[mood.key] = scale;
              return (
                <Animated.View key={mood.key} style={{ transform: [{ scale }] }}>
                  <TouchableOpacity
                    style={[styles.moodButton, selectedMood === mood.key && styles.moodButtonSelected]}
                    onPress={() => {
                      const prev = prevSelectedRef.current;
                      if (prev && moodScales[prev]) {
                        Animated.timing(moodScales[prev], { toValue: 1, duration: 150, useNativeDriver: true }).start();
                      }
                      Animated.timing(scale, { toValue: 1.06, duration: 180, useNativeDriver: true }).start();
                      prevSelectedRef.current = mood.key;
                      setSelectedMood(mood.key);
                    }}
                  >
                    <Text style={[styles.moodText, selectedMood === mood.key && { color: '#fff' }]}>{mood.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.sm, marginBottom: SPACING.md }} contentContainerStyle={{ paddingHorizontal: 4 }}>
            {moods.map((mood) => {
              const scale = moodScales[mood.key] || new Animated.Value(1);
              if (!moodScales[mood.key]) moodScales[mood.key] = scale;
              return (
                <Animated.View key={mood.key} style={{ transform: [{ scale }], marginRight: SPACING.sm }}>
                  <TouchableOpacity
                    style={[styles.moodButton, selectedMood === mood.key && styles.moodButtonSelected]}
                    onPress={() => {
                      const prev = prevSelectedRef.current;
                      if (prev && moodScales[prev]) {
                        Animated.timing(moodScales[prev], { toValue: 1, duration: 150, useNativeDriver: true }).start();
                      }
                      Animated.timing(scale, { toValue: 1.06, duration: 180, useNativeDriver: true }).start();
                      prevSelectedRef.current = mood.key;
                      setSelectedMood(mood.key);
                    }}
                  >
                    <Text style={[styles.moodText, selectedMood === mood.key && { color: '#fff' }]}>{mood.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>Địa điểm yêu thích - Tất cả</Text>

        <View style={styles.listContainer}>
          {!isLoading && favorites.length === 0 && (
            <View style={styles.emptyWrap}>
              <FontAwesome name="heart-o" size={48} color={COLORS.borderLight} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>Bạn chưa có địa điểm yêu thích</Text>
              <Text style={styles.emptySubtitle}>Thêm địa điểm bạn thích để lưu lại và xem sau.</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/') }>
                <Text style={styles.emptyButtonText}>Khám phá địa điểm</Text>
              </TouchableOpacity>
            </View>
          )}
          {favorites.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={styles.card}
              onPress={() => handlePlacePress(place)}
              disabled={isEnriching}
              activeOpacity={0.7}
            >
              <View style={styles.cardInner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName} numberOfLines={2}>{place.name}</Text>
                  <View style={styles.rowSmall}>
                    <FontAwesome name="map-marker" size={12} color={COLORS.primary} />
                    <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
                  </View>
                  <View style={[styles.rowSmall, { marginTop: 8, alignItems: 'center' }]}> 
                    {renderStars(place.rating)}
                  </View>
                  <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
                    {place.moods && place.moods.slice(0, 3).map((m: string, i: number) => (
                      <View key={i} style={styles.moodPill}><Text style={styles.moodPillText}>{m}</Text></View>
                    ))}
                    {place.moods && place.moods.length > 3 && (
                      <View style={styles.moodPill}><Text style={styles.moodPillText}>+{place.moods.length - 3}</Text></View>
                    )}
                  </View>
                  {isEnriching && place.googlePlaceId === selectedPlaceData?.googlePlaceId && (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 8 }} />
                  )}
                </View>
                <TouchableOpacity
                  style={styles.heartFloat}
                  onPress={(e) => {
                    e.stopPropagation(); // Ngăn trigger handlePlacePress
                    handleLikePlace(place.id, place.googlePlaceId);
                  }}
                  disabled={isLiking !== null}
                >
                  <FontAwesome name="heart" size={18} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* POI Detail Bottom Sheet */}
      <POIDetailBottomSheet
        visible={isBottomSheetVisible}
        placeData={selectedPlaceData}
        onClose={() => {
          setIsBottomSheetVisible(false);
          setSelectedPlaceData(null);
        }}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: SPACING.md, color: COLORS.textDark },
  error: { color: COLORS.error, marginBottom: SPACING.md },
  moodRow: { flexDirection: 'row', marginBottom: SPACING.md, flexWrap: 'wrap' },
  moodButton: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 20, backgroundColor: COLORS.textWhite, borderWidth: 1, borderColor: COLORS.borderLight, marginRight: SPACING.sm },
  moodButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  moodText: { fontWeight: '700', color: COLORS.textDark },
  toggleButton: { padding: 8, marginLeft: SPACING.sm },
  moodsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm, marginBottom: SPACING.md, paddingHorizontal: 4 },
  listContainer: { flexDirection: 'column', gap: SPACING.md },
  card: { backgroundColor: COLORS.textWhite, borderRadius: 12, padding: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, borderWidth: 1, borderColor: COLORS.borderLight },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start' },
  placeName: { fontSize: 16, fontWeight: '800', color: COLORS.textDark, flex: 1 },
  placeAddress: { color: COLORS.textSecondary, marginLeft: 6, marginTop: 2 },
  rowSmall: { flexDirection: 'row', alignItems: 'center' },
  moodPill: { backgroundColor: 'rgba(0,163,255,0.08)', borderRadius: 12, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: 'rgba(0,163,255,0.12)', marginRight: SPACING.xs, marginTop: SPACING.xs },
  moodPillText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  placeRating: { color: COLORS.ratingAlt, marginLeft: 8, fontWeight: '700' },
  heartFloat: { width: 38, height: 38, borderRadius: 20, backgroundColor: COLORS.textWhite, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4, marginLeft: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark, marginBottom: SPACING.sm, marginTop: SPACING.md },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.lg, paddingHorizontal: SPACING.md },
  emptyIcon: { marginBottom: SPACING.sm },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: SPACING.xs, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, textAlign: 'center' },
  emptyButton: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 8 },
  emptyButtonText: { color: '#fff', fontWeight: '700' },
  headerContainer: {
    paddingHorizontal: 0,
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
});

export default FavoritesScreen;
