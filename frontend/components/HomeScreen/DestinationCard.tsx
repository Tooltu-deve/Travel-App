import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import { Animated, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, SPACING } from '../../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH; // Full width - chiều rộng toàn màn hình

interface DestinationCardProps {
  destination: {
    id: string;
    name: string;
    location: string;
    region: string;
    size: string;
    distance: string;
    guests: number;
    duration: string;
    amenities: string[];
    price: string;
    reviews: string;
    rating: number;
    image: any;
  };
  onInteraction?: () => void;
}

export const DestinationCard: React.FC<DestinationCardProps> = ({ destination, onInteraction }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleFavoritePress = () => {
    // Tắt auto-scroll khi người dùng bấm nút tim
    if (onInteraction) {
      onInteraction();
    }

    // Animation bounce chỉ khi thêm tim (không phải bỏ tim)
    if (!isFavorite) {
      // Thêm tim: chạy animation bounce
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.3,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Bỏ tim: scale nhỏ nhanh
      Animated.spring(scaleAnim, {
        toValue: 0.85,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }).start(() => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }).start();
      });
    }

    setIsFavorite(!isFavorite);
  };

  return (
    <TouchableOpacity style={styles.destinationCard} activeOpacity={0.9}>
      <Image source={destination.image} style={styles.image} resizeMode="cover" />
      
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']}
        style={styles.fullOverlay}
      >
        <View style={{ flex: 0.3 }} />
        
        <View style={styles.bottomContent}>
          <View style={styles.textContainer}>
            <Text style={styles.regionLabel}>{destination.region}</Text>
            
            <View style={styles.nameAndLocationContainer}>
              <Text style={styles.destinationName}>{destination.name}</Text>
              <Text style={styles.destinationLocation}>{destination.location}</Text>
            </View>

            <View style={styles.reviewsRow}>
              <FontAwesome name="star" size={14} color={COLORS.ratingAlt} />
              <Text style={styles.rating}>{destination.rating}</Text>
              <Text style={styles.reviews}>({destination.reviews})</Text>
            </View>
          </View>

          <View style={styles.amenitiesWithFavoriteRow}>
            <View style={styles.amenitiesRow}>
              {destination.amenities.map((amenity, idx) => (
                <View key={idx} style={styles.amenityTag}>
                  <Text style={styles.amenityText}>{amenity}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity 
              style={[
                styles.favoriteButton,
                isFavorite && styles.favoriteButtonActive
              ]}
              onPress={handleFavoritePress}
              activeOpacity={0.8}
            >
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <FontAwesome 
                  name={isFavorite ? "heart" : "heart-o"} 
                  size={20} 
                  color={isFavorite ? COLORS.favoriteActive : COLORS.textWhite} 
                />
              </Animated.View>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>From</Text>
              <Text style={styles.price}>{destination.price}/night</Text>
            </View>
            
            <View style={styles.actionsColumn}>
              <TouchableOpacity style={styles.bookButton}>
                <Text style={styles.bookButtonText}>Book Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  destinationCard: {
    width: CARD_WIDTH,
    height: 300,
    backgroundColor: COLORS.bgCard,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 4,
    borderBottomColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 0,
    marginRight: 0, // Bỏ margin right để full width
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
  },

  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },

  fullOverlay: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },

  topContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  bottomContent: {
    gap: SPACING.xs,
  },

  headerWithFavoriteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },

  textContainer: {
    gap: SPACING.xs,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },

  nameAndLocationContainer: {
    gap: SPACING.xs / 2,
  },

  reviewsWithFavoriteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },

  amenitiesWithFavoriteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: -SPACING.sm,
  },

  imageTextContainer: {
    gap: SPACING.xs / 2,
    flex: 1,
  },

  regionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  destinationName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  reviewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
  },

  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  reviews: {
    fontSize: 11,
    color: COLORS.textLight,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  destinationLocation: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  favoriteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.favorite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.favorite,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  favoriteButtonActive: {
    backgroundColor: COLORS.favoriteBg,
    shadowColor: COLORS.favoriteActive,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },

  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    flex: 1,
  },

  amenityTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },

  amenityText: {
    fontSize: 11,
    color: COLORS.textWhite,
    fontWeight: '600',
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -SPACING.xs,
  },

  priceContainer: {
    gap: 2,
  },

  actionsColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },

  priceLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  price: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  bookButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 25,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },
});
