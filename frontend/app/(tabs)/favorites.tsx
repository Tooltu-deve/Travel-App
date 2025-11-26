import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { getMoodsAPI, getFavoritesByMoodAPI } from '../../services/api';
import { useFavorites } from '@/contexts/FavoritesContext';
import { translatePlaceType } from '../../constants/placeTypes';

// Small helper to render star icons for a rating (0-5) using gold color
const renderStars = (rating?: number | null) => {
  const stars = [];
  let ratingText = '0.0';
  // support decimal ratings (4.5 -> 4 full + 1 half)
  if (rating == null || Number.isNaN(rating)) {
    // show 0 filled stars
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
  // Build moods array from several possible backend shapes
  let moods: string[] = [];
  if (Array.isArray(p.moods) && p.moods.length) moods = p.moods;
  else if (p.mood) moods = [p.mood];
  else if (p.type) moods = [p.type];

  // If still empty, try to derive top mood from emotionalTags (object or Map-like)
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
    } catch (e) {
      // ignore and keep moods empty
    }
  }

  // translate known backend keys to Vietnamese labels
  if (moods && moods.length) {
    moods = moods.map((m) => translatePlaceType(m));
  }

  const name = p.name || p.title || p.name_en || p.googlePlaceId || p.google_place_id || p.address || 'Không rõ';

  // Ensure we only use string values for address (location may be GeoJSON object)
  const address = typeof p.address === 'string' && p.address
    ? p.address
    : (typeof p.location === 'string' ? p.location : '');

  // coerce rating if string
  let ratingVal: number | null = null;
  if (typeof p.rating === 'number') ratingVal = p.rating;
  else if (typeof p.rating === 'string' && p.rating.trim() !== '') {
    const parsed = parseFloat(p.rating);
    if (!Number.isNaN(parsed)) ratingVal = parsed;
  }

  return {
    id: p.placeId || p.id || p._id || p.google_place_id || p.googlePlaceId || '',
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

  // ensure we have Animated.Value for each mood, initialize selected with slightly larger scale
  useEffect(() => {
    moods.forEach((m) => {
      if (!moodScales[m.key]) {
        moodScales[m.key] = new Animated.Value(m.key === selectedMood ? 1.06 : 1);
      }
    });
    // ensure previous ref starts at selected
    prevSelectedRef.current = selectedMood;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moods]);

  // animate whenever selectedMood changes
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev && moodScales[prev]) {
      Animated.timing(moodScales[prev], { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    if (selectedMood && moodScales[selectedMood]) {
      Animated.timing(moodScales[selectedMood], { toValue: 1.06, duration: 180, useNativeDriver: true }).start();
    }
    prevSelectedRef.current = selectedMood;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMood]);
  const { favorites: ctxFavorites, toggleLike, refreshFavorites } = useFavorites();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState<string | null>(null);

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
        // translate mood/type keys to Vietnamese labels for UI and keep original keys
        let translated = raw.map((m: string) => ({ key: String(m), label: translatePlaceType(m) }));
        // Sort alphabetically by translated label (Vietnamese collation). Keep the 'all' chip first.
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

  // derive displayed favorites from context + selectedMood
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (selectedMood === 'all') {
          const list = Array.isArray(ctxFavorites) ? ctxFavorites : [];
          const mapped = list.map(normalizePlace).sort((a, b) => a.id.localeCompare(b.id));
          if (!mounted) return;
          setFavorites(mapped);
          return;
        }

        // call backend to get favorites filtered by mood key
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setFavorites([]);
          return;
        }
        const remote = await getFavoritesByMoodAPI(token, selectedMood);
        if (!mounted) return;
        if (Array.isArray(remote)) {
          const mapped = remote.map((p: any) => normalizePlace(p));
          setFavorites(mapped);
        } else {
          setFavorites([]);
        }
      } catch (e: any) {
        setError(e?.message || 'Không thể tải địa điểm yêu thích');
        setFavorites([]);
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
      // remove locally to give immediate feedback
      setFavorites((prev) => prev.filter((p) => p.id !== placeId));
      // refresh context in background
      refreshFavorites().catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Không thể cập nhật yêu thích');
    } finally {
      setIsLiking(null);
    }
  };

  const renderPlaceCard = (place: any) => {
    return (
      <View key={place.id} style={styles.card}>
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
          </View>

          <TouchableOpacity
            style={styles.heartFloat}
            onPress={() => handleLikePlace(place.id, place.googlePlaceId)}
            disabled={isLiking !== null}
          >
            <FontAwesome name="heart" size={18} color="#E53E3E" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientBlue1]} style={styles.container}>
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
              // ensure presence in map
              if (!moodScales[mood.key]) moodScales[mood.key] = scale;
              return (
                <Animated.View key={mood.key} style={{ transform: [{ scale }] }}>
                  <TouchableOpacity
                    style={[styles.moodButton, selectedMood === mood.key && styles.moodButtonSelected]}
                    onPress={() => {
                      // animate previous back to normal
                      const prev = prevSelectedRef.current;
                      if (prev && moodScales[prev]) {
                        Animated.timing(moodScales[prev], { toValue: 1, duration: 150, useNativeDriver: true }).start();
                      }
                      // animate this one slightly larger
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
          {favorites.map(renderPlaceCard)}
        </View>
      </ScrollView>
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
  chipsLoaderWrap: { marginTop: SPACING.sm, marginBottom: SPACING.md, alignItems: 'center' },
  sectionLoaderWrap: { marginTop: SPACING.sm, marginBottom: SPACING.md, alignItems: 'center' },
  listContainer: { flexDirection: 'column', gap: SPACING.md },
  card: { backgroundColor: COLORS.textWhite, borderRadius: 12, padding: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, borderWidth: 1, borderColor: COLORS.borderLight },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  placeName: { fontSize: 16, fontWeight: '800', color: COLORS.textDark, flex: 1 },
  placeAddress: { color: COLORS.textSecondary, marginLeft: 6, marginTop: 2 },
  rowSmall: { flexDirection: 'row', alignItems: 'center' },
  moodPill: { backgroundColor: 'rgba(0,163,255,0.08)', borderRadius: 12, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: 'rgba(0,163,255,0.12)', marginRight: SPACING.xs, marginTop: SPACING.xs },
  moodPillText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  placeRating: { color: COLORS.ratingAlt, marginLeft: 8, fontWeight: '700' },
  heartFloat: { width: 38, height: 38, borderRadius: 20, backgroundColor: COLORS.textWhite, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4, marginLeft: 12 },
  topHeader: { paddingTop: (Constants.statusBarHeight || 0) + SPACING.lg, paddingBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,99,99,0.12)', justifyContent: 'center', alignItems: 'center' },
  titleMain: { fontSize: 24, fontWeight: '900', color: COLORS.textDark },
  titleSub: { fontSize: 14, color: COLORS.primary, marginTop: 6 },
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
