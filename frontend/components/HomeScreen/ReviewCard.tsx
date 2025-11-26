import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../constants';
import { mockFavoritePlaces } from '../../app/mockData';
import likedStore, { addLikedPlace, removeLikedPlace, getLikedPlaces, subscribeLikedPlaces, LikedPlace } from '../../app/utils/likedPlacesStore';
import { likePlaceAPI } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Render a list of mock favorite places using a card UI similar to Favorites
export const ReviewCard: React.FC = () => {
  const places = mockFavoritePlaces;
  const [likedIds, setLikedIds] = useState<string[]>([]);

  useEffect(() => {
    // Ensure store loaded and subscribe for updates
    likedStore.initLikedPlaces().catch(() => {});
    const unsub = subscribeLikedPlaces((places) => setLikedIds(places.map(p => p.id)));
    // initialize current
    setLikedIds(getLikedPlaces().map(p => p.id));
    return () => unsub();
  }, []);

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    const stars = [];
    const full = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    for (let i = 0; i < full; i++) {
      stars.push(<FontAwesome key={`s-${i}`} name="star" size={14} color={COLORS.accent} />);
    }
    if (hasHalf) {
      stars.push(<FontAwesome key="half" name="star-half-o" size={14} color={COLORS.accent} />);
    }
    const empty = 5 - Math.ceil(rating);
    for (let i = 0; i < empty; i++) {
      stars.push(<FontAwesome key={`e-${i}`} name="star-o" size={14} color={COLORS.textSecondary} />);
    }
    return <View style={styles.ratingRow}>{stars}</View>;
  };

  return (
    <View>
      {places.map((place) => (
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
                  const isLiked = likedIds.includes(place.id);

                  // optimistic update
                  if (isLiked) {
                    await removeLikedPlace(place.id);
                    try {
                      const token = await AsyncStorage.getItem('userToken');
                      const gid = (place as any).googlePlaceId || place.id;
                      if (token) await likePlaceAPI(token, gid);
                    } catch (e) {
                      // revert
                      const p: LikedPlace = { id: place.id, name: place.name, address: place.address, moods: place.moods, rating: place.rating, googlePlaceId: (place as any).googlePlaceId };
                      await addLikedPlace(p);
                      console.error('Failed to unlike on backend, reverted locally', e);
                    }
                  } else {
                    const p: LikedPlace = { id: place.id, name: place.name, address: place.address, moods: place.moods, rating: place.rating, googlePlaceId: (place as any).googlePlaceId };
                    await addLikedPlace(p);
                    try {
                      const token = await AsyncStorage.getItem('userToken');
                      const gid = (place as any).googlePlaceId || place.id;
                      if (token) await likePlaceAPI(token, gid);
                    } catch (e) {
                      // revert
                      await removeLikedPlace(place.id);
                      console.error('Failed to like on backend, reverted locally', e);
                    }
                  }
                }}
              >
                <FontAwesome name="heart" size={22} color={likedIds.includes(place.id) ? '#E53E3E' : COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.placeFooter}>
              <View style={styles.leftCol}>
                {renderStars(place.rating)}
                {place.rating != null && <Text style={styles.ratingText}>{place.rating.toFixed(1)}</Text>}
              </View>
              <View style={styles.moodTags}>
                {place.moods.slice(0, 3).map((m, i) => (
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
    gap: SPACING.md,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
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
    gap: SPACING.sm,
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
    gap: SPACING.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: COLORS.accent,
    fontWeight: '600',
    marginLeft: 6,
  },
  moodTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  moodTag: {
    backgroundColor: 'rgba(0,163,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(0,163,255,0.12)',
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
