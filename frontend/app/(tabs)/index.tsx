// HomeScreen - Trang chủ với các điểm đến nổi bật, danh mục và đánh giá
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatButton } from '../../components/HomeScreen/ChatButton';
import { DestinationCard } from '../../components/HomeScreen/DestinationCard';
import { ReviewCard } from '../../components/HomeScreen/ReviewCard';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { useAuth } from '../../contexts/AuthContext';
import { getPlacesAPI, API_BASE_URL } from '../../services/api';
import { translatePlaceType } from '../../constants/placeTypes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH;
const SNAP_INTERVAL = CARD_WIDTH;
const INITIAL_REVIEWS_COUNT = 2;

const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { userData } = useAuth();
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [featuredDestinations, setFeaturedDestinations] = useState<any[]>([]);
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const carouselRef = useRef<ScrollView>(null);
  const autoScrollTimeout = useRef<number | null>(null);
  const lastScrollY = useRef(0);

  // Fetch top 5 destinations with highest rating
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoadingDestinations(true);
      try {
        const allPlaces = await getPlacesAPI();
        if (!mounted) return;
        
        if (Array.isArray(allPlaces) && allPlaces.length) {
          // Filter places with photos and rating, then get top 5
          const topPlaces = allPlaces
            .filter((p: any) => {
              const hasPhoto = p.photos && Array.isArray(p.photos) && p.photos.length > 0;
              const hasRating = typeof p.rating === 'number' && p.rating > 0;
              return hasPhoto && hasRating;
            })
            .sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 5)
            .map((p: any, index: number) => {
              // Map to DestinationCard format
              const photoName = p.photos[0]?.name || '';
              const imageUri = photoName 
                ? `${API_BASE_URL}/api/v1/places/photo?name=${encodeURIComponent(photoName)}&maxWidthPx=800`
                : '';
              
              // Extract location/region from address
              const addressParts = (p.address || '').split(',').map((s: string) => s.trim());
              const location = addressParts[addressParts.length - 2] || addressParts[0] || 'Vietnam';
              const region = addressParts[addressParts.length - 1] || 'VIETNAM';
              
              // Get type label
              const typeLabel = translatePlaceType(p.type || 'other');
              
              // Only show type as amenity
              const amenities: string[] = [typeLabel];
              
              return {
                id: p._id?.toString() || p.googlePlaceId || String(index),
                name: p.name || 'Địa điểm',
                location: location,
                region: region.toUpperCase(),
                size: typeLabel, // Use type as size
                distance: p.address ? addressParts[0] : '',
                guests: p.reviews?.length || 0,
                duration: p.budgetRange || 'Miễn phí',
                amenities: amenities,
                price: '', // Removed price display
                reviews: `${p.reviews?.length || 0} đánh giá`,
                rating: p.rating || 0,
                image: { uri: imageUri },
                googlePlaceId: p.googlePlaceId,
              };
            });
          
          setFeaturedDestinations(topPlaces);
        }
      } catch (error) {
        console.error('Error fetching featured destinations:', error);
      } finally {
        setIsLoadingDestinations(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isAutoScrollEnabled) return;
    autoScrollTimeout.current = setTimeout(() => {
      const nextIndex = (currentIndex + 1) % featuredDestinations.length;
      carouselRef.current?.scrollTo({
        x: nextIndex * SNAP_INTERVAL,
        animated: true,
      });
    }, 3000);
    return () => {
      if (autoScrollTimeout.current) {
        clearTimeout(autoScrollTimeout.current);
      }
    };
  }, [currentIndex, isAutoScrollEnabled]);

  const handleUserTouch = () => {
    setIsAutoScrollEnabled(false);
    if (autoScrollTimeout.current) {
      clearTimeout(autoScrollTimeout.current);
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SNAP_INTERVAL);
    setCurrentIndex(index);
    setTimeout(() => {
      setIsAutoScrollEnabled(true);
    }, 5000);
  };

  const handleMainScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    lastScrollY.current = currentScrollY;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SNAP_INTERVAL);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <LinearGradient
      colors={['#e6f6ff', '#ccecff']}
      locations={[0, 1]}
      style={homeStyles.gradientContainer}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={{flex:1}}
        showsVerticalScrollIndicator={false}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
      >
        <View style={[homeStyles.headerContainer, { paddingTop: insets.top }]}>
          <View style={homeStyles.headerTextContainer}>
            <Text style={homeStyles.welcomeText}>Welcome !</Text>
            <Text style={homeStyles.subtitleText}>{userData?.fullName || 'User'}</Text>
          </View>
          <View style={homeStyles.logoWrapper}>
            <LinearGradient
              colors={['rgba(48, 131, 255, 0.2)', 'rgba(48, 131, 255, 0.1)', 'rgba(48, 131, 255, 0.02)', 'rgba(48, 131, 255, 0)']}
              style={homeStyles.glowContainer}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0, y: 0 }}
            />
            <Image
              source={require('@/assets/images/logo.png')}
              style={homeStyles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Divider after header */}
        <LinearGradient
          colors={[COLORS.primaryTransparent, COLORS.primaryStrong, COLORS.primaryTransparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={homeStyles.sectionDivider}
        />

        <View style={homeStyles.featuredSection}>
          <Text style={homeStyles.featuredTitle}>Điểm đến nổi bật</Text>
        </View>

        <View style={homeStyles.carouselWrapper}>
          {isLoadingDestinations ? (
            <View style={homeStyles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={homeStyles.loadingText}>Đang tải điểm đến...</Text>
            </View>
          ) : featuredDestinations.length > 0 ? (
            <>
              <ScrollView
                ref={carouselRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                pagingEnabled={false}
                scrollEventThrottle={16}
                decelerationRate="fast"
                snapToInterval={SNAP_INTERVAL}
                snapToAlignment="start"
                directionalLockEnabled={true}
                alwaysBounceVertical={false}
                bounces={false}
                onScroll={handleScroll}
                onScrollBeginDrag={handleUserTouch}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                contentContainerStyle={homeStyles.carouselContent}
              >
                {featuredDestinations.map((destination) => (
                  <DestinationCard 
                    key={destination.id} 
                    destination={destination}
                    onInteraction={handleUserTouch}
                  />
                ))}
              </ScrollView>

              <View style={homeStyles.cardDotsContainer} pointerEvents="none">
                {featuredDestinations.map((_, j) => (
                  <View
                    key={j}
                    style={[
                      homeStyles.dot,
                      currentIndex === j ? homeStyles.dotActive : homeStyles.dotInactive,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={homeStyles.emptyContainer}>
              <FontAwesome name="map-marker" size={48} color={COLORS.textSecondary} />
              <Text style={homeStyles.emptyText}>Chưa có điểm đến nào</Text>
            </View>
          )}
        </View>

        {/* Divider before reviews */}
        <LinearGradient
          colors={[COLORS.primaryTransparent, COLORS.primaryStrong, COLORS.primaryTransparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={homeStyles.sectionDivider}
        />

        <View style={homeStyles.reviewsSection}>
          <Text style={homeStyles.reviewsTitle}>Có thể bạn sẽ thích</Text>
          <ReviewCard />
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <ChatButton visible={showChatButton} />
    </LinearGradient>
  );
};

const homeStyles = StyleSheet.create({
  gradientContainer: { flex: 1 },
  container: { flex: 1 },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    position: 'relative',
  },
  headerTextContainer: { 
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  headerButtonsContainer: {
    position: 'absolute',
    right: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    zIndex: 1000,
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    width: 100,
  },
  glowContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    zIndex: 0,
  },
  logo: {
    width: 100,
    height: 100,
    zIndex: 1,
  },
  headerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: SPACING.xs / 2,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitleText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primary,
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 163, 255, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sectionDivider: {
    height: 1.5,
    marginHorizontal: SPACING.xl,
    marginVertical: SPACING.sm,
    borderRadius: 1,
  },
  featuredSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: -SPACING.sm,
  },
  featuredTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#222',
    paddingHorizontal: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  carouselWrapper: {
    height: 'auto',
    paddingVertical: 0,
    paddingTop: SPACING.md,
    marginHorizontal: 0,
    marginTop: SPACING.lg,
    position: 'relative',
  },
  carouselContent: { 
    paddingHorizontal: 0,
  },
  cardDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  dotInactive: {
    backgroundColor: COLORS.primary,
    opacity: 0.4,
  },
  reviewsSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  reviewsTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  showMoreText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: SPACING.sm,
  },
});

export default HomeScreen;
