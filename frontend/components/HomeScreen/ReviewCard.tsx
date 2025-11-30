import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../constants';
import { translatePlaceType } from '../../constants/placeTypes';
import { useFavorites } from '@/contexts/FavoritesContext';
import { getPlacesAPI } from '@/services/api';

// Render a list of mock favorite places using a card UI similar to Favorites
export const ReviewCard: React.FC = () => {
  const [allPlaces, setAllPlaces] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [visibleCount, setVisibleCount] = useState<number>(5);
  
  const { isLiked, toggleLike } = useFavorites();

  // helper: derive moods array from place object
  const deriveMoods = (p: any): string[] => {
    if (!p) return [];
    if (Array.isArray(p.moods) && p.moods.length) return p.moods;
    if (p.mood) return [p.mood];
    if (p.type) return [p.type];
    // emotionalTags could be Map or object
    const tags = p.emotionalTags instanceof Map ? Object.fromEntries(p.emotionalTags) : p.emotionalTags;
    if (tags && typeof tags === 'object') {
      const entries = Object.entries(tags) as [string, number][];
      entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
      return entries.slice(0, 3).map(e => e[0]);
    }
    return [];
  };

  // ensure derived moods are translated to Vietnamese labels where possible
  const deriveAndTranslateMoods = (p: any): string[] => {
    const m = deriveMoods(p) || [];
    return m.map((x) => translatePlaceType(x));
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const remote = await getPlacesAPI();
        if (!mounted) return;
        if (Array.isArray(remote) && remote.length) {
          // normalize shape minimally to match mock
          const normalized = remote.map((p: any, i: number) => {
            const addr = typeof p.address === 'string' && p.address
              ? p.address
              : (typeof p.location === 'string' ? p.location : '');
            // coerce rating to number if backend returns string
            let ratingVal: number | null = null;
            if (typeof p.rating === 'number') ratingVal = p.rating;
            else if (typeof p.rating === 'string' && p.rating.trim() !== '') {
              const parsed = parseFloat(p.rating);
              if (!Number.isNaN(parsed)) ratingVal = parsed;
            }
            return ({
              id: p._id?.toString?.() || p.placeId || String(i),
              placeId: p._id?.toString() || p.placeId,
              name: p.name || p.title || 'Không rõ',
              address: addr,
              moods: deriveAndTranslateMoods(p),
              googlePlaceId: p.googlePlaceId || p.google_place_id || '',
              rating: ratingVal,
            });
          });
          // keep full list but only display limited items
          setAllPlaces(normalized);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        // keep empty or fallback
        console.warn('getPlacesAPI failed', err);
      }
      // fallback: keep places empty
      setIsLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // ensure loading flag cleared when places result arrives or on error
  useEffect(() => {
    if (allPlaces.length > 0) setIsLoading(false);
  }, [allPlaces]);
 

  const renderStars = (rating: number | null) => {
    if (rating === null || rating === undefined) {
      return (
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>0.0</Text>
          <View style={styles.starsRow}>
            {[...Array(5)].map((_, i) => (
              <FontAwesome key={i} name="star-o" size={14} color={COLORS.textSecondary} />
            ))}
          </View>
        </View>
      );
    }
    const stars = [];
    const full = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const total = 5;
    // full stars
    for (let i = 0; i < full; i++) {
      stars.push(
        <FontAwesome
          key={`s-${i}`}
          name="star"
          size={14}
          color={COLORS.ratingAlt}
          style={{ marginRight: i === total - 1 ? 0 : 4 }}
        />,
      );
    }
    // half star
    if (hasHalf) {
      stars.push(
        <FontAwesome
          key="half"
          name="star-half-full"
          size={14}
          color={COLORS.ratingAlt}
          style={{ marginRight: (full === total - 1) ? 0 : 4 }}
        />,
      );
    }
    // empty stars to reach total
    const current = stars.length;
    for (let i = current; i < total; i++) {
      stars.push(
        <FontAwesome
          key={`e-${i}`}
          name="star-o"
          size={14}
          color={COLORS.textSecondary}
          style={{ marginRight: i === total - 1 ? 0 : 4 }}
        />,
      );
    }
    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        <View style={styles.starsRow}>{stars}</View>
      </View>
    );
  };

  const placesToShow = allPlaces.slice(0, visibleCount);

  return (
    <View>
      {isLoading && allPlaces.length === 0 && (
        <View style={{ padding: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgLightBlue, padding: SPACING.sm, borderRadius: 10 }}>
            <FontAwesome name="info-circle" size={14} color={COLORS.textSecondary} />
            <Text style={{ marginLeft: 8, color: COLORS.textSecondary }}>Đang tải...</Text>
          </View>
        </View>
      )}
      {placesToShow.map((place) => (
        <View key={place.id} style={styles.placeCard}>
          <View style={styles.placeContent}>
            <View style={styles.placeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.placeName} numberOfLines={2}>{place.name}</Text>
                <View style={styles.placeRow}>
                  <FontAwesome name="map-marker" size={14} color={COLORS.primary} />
                  <Text style={styles.placeAddress} numberOfLines={2}>{place.address}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.likeButton}
                activeOpacity={0.85}
                onPress={async () => {
                  try {
                    const id = (place as any).googlePlaceId || place.placeId || place.id;
                    await toggleLike(id);
                  } catch (e) {
                    console.error('Failed to toggle like', e);
                  }
                }}
              >
                <FontAwesome name="heart" size={22} color={isLiked((place as any).googlePlaceId || place.placeId || place.id) ? '#E53E3E' : COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.placeFooter}>
              <View style={styles.leftCol}>
                {renderStars(place.rating)}
              </View>
              <View style={styles.moodTags}>
                {place.moods.slice(0, 3).map((m: string, i: number) => (
                  <View key={i} style={styles.moodTag}>
                    <Text style={styles.moodTagText}>{m}</Text>
                  </View>
                ))}
                {place.moods.length > 3 && <Text style={styles.moreMoodsText}>+{place.moods.length - 3}</Text>}
              </View>
            </View>
          </View>
        </View>
      ))}

      {allPlaces.length > visibleCount && (
        <View style={{ padding: SPACING.md }}>
          <TouchableOpacity
            onPress={() => {
              // each click loads 5 more
              setVisibleCount((v) => Math.min(allPlaces.length, v + 5));
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.md,
              borderRadius: 12,
              backgroundColor: COLORS.bgLightBlue,
              borderWidth: 1,
              borderColor: COLORS.borderLight,
              marginTop: SPACING.sm,
              width: '100%'
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.primary }}>
              {'Tải thêm 5 địa điểm'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  placeCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  placeContent: {
    padding: SPACING.lg,
    // avoid using `gap` (not supported broadly); use explicit margins in children
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // small horizontal spacing handled by child margins
  },
  placeName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // use margins on child elements instead of gap
  },
  placeAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  likeButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    // spacing handled by margin on ratingText and stars
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    color: COLORS.ratingAlt,
    fontWeight: '600',
    marginLeft: 6,
  },
  moodTags: {
    flexDirection: 'row',
    alignItems: 'center',
    // use marginRight on each mood tag
  },
  moodTag: {
    backgroundColor: 'rgba(0,163,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(0,163,255,0.12)',
    marginRight: SPACING.xs,
  },
  moodTagText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  moreMoodsText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
