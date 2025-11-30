import Constants from 'expo-constants';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

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
  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <Text style={styles.header}>Favorites Screen</Text>
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
