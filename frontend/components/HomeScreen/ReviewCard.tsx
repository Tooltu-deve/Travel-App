import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { COLORS, SPACING } from '../../constants';
import { translatePlaceType } from '../../constants/placeTypes';
import { useFavorites } from '@/contexts/FavoritesContext';
import { getPlacesAPI, API_BASE_URL } from '@/services/api';

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
          const normalized = remote
            .map((p: any, i: number) => {
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
              
              // Get photo name from photos array
              const photoName = p.photos && Array.isArray(p.photos) && p.photos.length > 0 
                ? p.photos[0].name 
                : null;
              
              // Get original type for sorting (before translation)
              const originalType = p.type || (Array.isArray(p.moods) && p.moods.length ? p.moods[0] : '');
              
              return ({
                id: p._id?.toString?.() || p.placeId || String(i),
                placeId: p._id?.toString() || p.placeId,
                name: p.name || p.title || 'Không rõ',
                address: addr,
                moods: deriveAndTranslateMoods(p),
                googlePlaceId: p.googlePlaceId || p.google_place_id || '',
                rating: ratingVal,
                photoName: photoName,
                hasPhoto: !!photoName,
                hasRating: ratingVal !== null && ratingVal > 0,
                type: originalType,
                translatedType: translatePlaceType(originalType),
              });
            })
            // Filter: only show places with both photo and rating
            .filter((place: any) => place.hasPhoto && place.hasRating)
            // Sort: alphabetically by translated type (Vietnamese), then by rating
            .sort((a: any, b: any) => {
              const typeCompare = (a.translatedType || '').localeCompare(b.translatedType || '', 'vi');
              if (typeCompare !== 0) return typeCompare;
              return (b.rating || 0) - (a.rating || 0);
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
          {/* Heart Button - Top Right Corner */}
          <TouchableOpacity
            style={[
              styles.likeButton,
              isLiked((place as any).googlePlaceId || place.placeId || place.id) && styles.likeButtonActive
            ]}
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
            <FontAwesome 
              name={isLiked((place as any).googlePlaceId || place.placeId || place.id) ? "heart" : "heart-o"} 
              size={20} 
              color={isLiked((place as any).googlePlaceId || place.placeId || place.id) ? '#E53E3E' : '#9CA3AF'} 
            />
          </TouchableOpacity>

          <View style={styles.placeContent}>
            {/* Image Section - Left Side */}
            {place.photoName ? (
              <Image
                source={{
                  uri: `${API_BASE_URL}/api/v1/places/photo?name=${encodeURIComponent(place.photoName)}&maxWidthPx=400`,
                }}
                style={styles.placeImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <FontAwesome name="image" size={32} color={COLORS.textSecondary} />
              </View>
            )}

            {/* Content Section - Right Side */}
            <View style={styles.placeInfo}>
              <View style={styles.placeHeader}>
                <Text style={styles.placeName} numberOfLines={2}>{place.name}</Text>
              </View>
              <View style={styles.placeRow}>
                <FontAwesome name="map-marker" size={14} color={COLORS.primary} />
                <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
              </View>

            <View style={styles.placeFooter}>
              <View style={styles.leftCol}>
                {renderStars(place.rating)}
              </View>
              <View style={styles.moodTags}>
                {place.moods.slice(0, 3).map((m: string, i: number) => (
                  <View key={i} style={styles.moodTag}>
                    <Text style={styles.moodTagText} numberOfLines={1}>{m}</Text>
                  </View>
                ))}
                {place.moods.length > 3 && <Text style={styles.moreMoodsText}>+{place.moods.length - 3}</Text>}
              </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: SPACING.lg,
    shadowColor: '#3083FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 131, 255, 0.08)',
    overflow: 'hidden',
  },
  placeContent: {
    flexDirection: 'row',
    padding: SPACING.lg,
  },
  placeImage: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: COLORS.bgLight,
    borderWidth: 2,
    borderColor: 'rgba(48, 131, 255, 0.1)',
  },
  placeholderImage: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: 'rgba(48, 131, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(48, 131, 255, 0.1)',
    borderStyle: 'dashed',
  },
  placeInfo: {
    flex: 1,
    marginLeft: SPACING.md + 2,
    justifyContent: 'space-between',
  },
  placeHeader: {
    marginBottom: SPACING.xs,
  },
  placeName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 22,
    letterSpacing: 0.3,
    paddingRight: SPACING.sm,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  placeAddress: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
    lineHeight: 18,
  },
  likeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#3083FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(48, 131, 255, 0.15)',
    zIndex: 10,
  },
  likeButtonActive: {
    backgroundColor: 'rgba(254, 242, 242, 1)',
    borderColor: 'rgba(229, 62, 62, 0.2)',
    shadowColor: '#E53E3E',
  },
  placeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(48, 131, 255, 0.06)',
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs - 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  ratingText: {
    color: '#F59E0B',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  moodTags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    maxWidth: '100%',
  },
  moodTag: {
    backgroundColor: 'rgba(48, 131, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(48, 131, 255, 0.2)',
    marginRight: SPACING.xs,
    marginBottom: 4,
    maxWidth: 120,
  },
  moodTagText: {
    fontSize: 11,
    color: '#3083FF',
    fontWeight: '700',
    letterSpacing: 0.2,
    numberOfLines: 1,
  },
  moreMoodsText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: SPACING.xs - 2,
    borderRadius: 8,
  },
});
