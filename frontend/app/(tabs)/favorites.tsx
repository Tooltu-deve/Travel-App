import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { getMoodsAPI } from '../../services/api';
import { useFavorites } from '@/contexts/FavoritesContext';

// Small helper to render star icons for a rating (0-5) using gold color
const renderStars = (rating?: number | null) => {
  const stars = [];
  // support decimal ratings (4.5 -> 4 full + 1 half)
  if (rating == null || Number.isNaN(rating)) {
    // show 0 filled stars
    for (let i = 0; i < 5; i++) {
      stars.push(
        <FontAwesome key={`e-${i}`} name="star-o" size={14} color={COLORS.textSecondary} style={{ marginRight: 6 }} />,
      );
    }
    return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
  }
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
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
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
  const [moods, setMoods] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>('all');
  const { favorites: ctxFavorites, toggleLike, refreshFavorites } = useFavorites();
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
          setMoods(['all']);
          return;
        }
        const res = await getMoodsAPI(token);
        const list = Array.isArray(res?.moods) ? ['all', ...res.moods] : ['all'];
        setMoods(list);
      } catch (e: any) {
        setError(e?.message || 'Không thể tải danh sách thể loại');
        setMoods(['all']);
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, []);

  // derive displayed favorites from context + selectedMood
  useEffect(() => {
    setIsLoading(true);
    try {
      const list = Array.isArray(ctxFavorites) ? ctxFavorites : [];
      const mapped = list.map(normalizePlace);
      if (selectedMood === 'all') setFavorites(mapped);
      else setFavorites(mapped.filter((p) => p.moods && p.moods.includes(selectedMood)));
    } catch (e: any) {
      setError(e?.message || 'Không thể tải địa điểm yêu thích');
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, [ctxFavorites, selectedMood]);

  const handleLikePlace = async (placeId: string, googlePlaceId?: string) => {
    const id = googlePlaceId || placeId;
    setIsLiking(id);
    try {
      await toggleLike(id);
      // context will refresh; ensure we have fresh data
      refreshFavorites().catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Không thể cập nhật yêu thích');
    } finally {
      setIsLiking(null);
    }
  };

  const renderPlaceCard = (place: any) => (
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
            {place.rating !== null && place.rating !== undefined && (
              <Text style={styles.placeRating}>{(place.rating as number).toFixed(1)}</Text>
            )}
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
          disabled={isLiking === place.id}
        >
          <FontAwesome name="heart" size={18} color="#E53E3E" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientBlue1]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topHeader}>
          <View style={styles.headerRow}>
            <View style={styles.titleIcon}>
              <FontAwesome name="heart" size={18} color={COLORS.favorite} />
            </View>
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.titleMain}>Yêu thích của tôi</Text>
              <Text style={styles.titleSub}>Các địa điểm yêu thích theo tâm trạng</Text>
            </View>
          </View>
        </View>

        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
        {error && <Text style={styles.error}>{error}</Text>}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.sm, marginBottom: SPACING.md }} contentContainerStyle={{ paddingHorizontal: 4 }}>
          {moods.map(mood => (
            <TouchableOpacity
              key={mood}
              style={[styles.moodButton, selectedMood === mood && styles.moodButtonSelected]}
              onPress={() => setSelectedMood(mood)}
            >
              <Text style={[styles.moodText, selectedMood === mood && { color: '#fff' }]}>{mood === 'all' ? 'Tất cả' : mood}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Địa điểm yêu thích - Tất cả</Text>

        <View style={styles.listContainer}>
          {!isLoading && favorites.length === 0 && <Text>Không có địa điểm yêu thích.</Text>}
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
  listContainer: { gap: SPACING.md },
  card: { backgroundColor: COLORS.textWhite, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, borderWidth: 1, borderColor: COLORS.borderLight },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  placeName: { fontSize: 16, fontWeight: '800', color: COLORS.textDark, flex: 1 },
  placeAddress: { color: COLORS.textSecondary, marginLeft: 6, marginTop: 2 },
  rowSmall: { flexDirection: 'row', alignItems: 'center' },
  moodPill: { backgroundColor: 'rgba(0,163,255,0.08)', borderRadius: 12, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: 'rgba(0,163,255,0.12)', marginRight: SPACING.xs, marginTop: SPACING.xs },
  moodPillText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  placeRating: { color: COLORS.ratingAlt, marginLeft: 8, fontWeight: '700' },
  heartFloat: { width: 38, height: 38, borderRadius: 20, backgroundColor: COLORS.textWhite, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4, marginLeft: 12 },
  topHeader: { paddingTop: (Constants.statusBarHeight || 0) + SPACING.sm, paddingBottom: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,99,99,0.12)', justifyContent: 'center', alignItems: 'center' },
  titleMain: { fontSize: 20, fontWeight: '800', color: COLORS.textDark },
  titleSub: { fontSize: 13, color: COLORS.primary, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark, marginBottom: SPACING.sm, marginTop: SPACING.md },
});

export default FavoritesScreen;
