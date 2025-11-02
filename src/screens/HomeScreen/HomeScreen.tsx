import { COLORS, SPACING } from '@/constants';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySection, ChatButton, DestinationCard, ReviewCard, SearchBar } from './components';
import { featuredDestinations, reviews } from './mockData';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width;

const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [showChatButton, setShowChatButton] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isCarouselScrolling, setIsCarouselScrolling] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const carouselRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);
  const hideTimeout = useRef<any>(null);
  const autoScrollTimeout = useRef<any>(null);
  const welcomeOpacity = useRef(new Animated.Value(1)).current;

  const INITIAL_REVIEWS_COUNT = 3;
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, INITIAL_REVIEWS_COUNT);

  useEffect(() => {
    Animated.timing(welcomeOpacity, {
      toValue: isSearchExpanded ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isSearchExpanded]);

  // Auto-scroll effect
  useEffect(() => {
    if (!isAutoScrollEnabled) return;

    autoScrollTimeout.current = setTimeout(() => {
      const nextIndex = (currentIndex + 1) % featuredDestinations.length;
      carouselRef.current?.scrollTo({
        x: nextIndex * CARD_WIDTH,
        animated: true,
      });
      // Không cần setCurrentIndex ở đây vì handleScroll sẽ xử lý
    }, 3000); // Auto-scroll mỗi 3 giây

    return () => {
      if (autoScrollTimeout.current) {
        clearTimeout(autoScrollTimeout.current);
      }
    };
  }, [currentIndex, isAutoScrollEnabled]);

  const handleUserTouch = () => {
    // Dừng auto-scroll khi người dùng chạm vào
    setIsAutoScrollEnabled(false);
    setIsCarouselScrolling(true);
    if (autoScrollTimeout.current) {
      clearTimeout(autoScrollTimeout.current);
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / CARD_WIDTH);
    setCurrentIndex(index);
    setIsCarouselScrolling(false);
    
    // Bật lại auto-scroll sau 5 giây người dùng không tương tác
    setTimeout(() => {
      setIsAutoScrollEnabled(true);
    }, 5000);
  };

  const handleMainScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDirection = currentScrollY > lastScrollY.current ? 'down' : 'up';
    
    if (scrollDirection === 'up') {
      setShowChatButton(false);
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
    } else if (scrollDirection === 'down' && currentScrollY > 100) {
      setShowChatButton(true);
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
      hideTimeout.current = setTimeout(() => {
        setShowChatButton(false);
      }, 3000);
    }
    
    lastScrollY.current = currentScrollY;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / CARD_WIDTH);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#e8f9ff', '#d1f2ff', '#a9e3fcff']}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        scrollEnabled={!isCarouselScrolling}
      >
        <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
          <Animated.View 
            style={[
              styles.headerTextContainer,
              { opacity: welcomeOpacity }
            ]}
            pointerEvents={isSearchExpanded ? 'none' : 'auto'}
          >
            <Text style={styles.welcomeText}>Welcome !</Text>
            <Text style={styles.subtitleText}>Trần Minh Thanh</Text>
          </Animated.View>
          <View style={[styles.headerButtonsContainer, { top: insets.top + SPACING.md }]}>
            <SearchBar onExpandChange={setIsSearchExpanded} />
            <TouchableOpacity style={styles.headerButton}>
              <FontAwesome name="cog" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.featuredSection}>
          <Text style={styles.featuredTitle}>Điểm đến nổi bật</Text>
        </View>

        <View style={styles.carouselWrapper}>
          <ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            pagingEnabled={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={CARD_WIDTH}
            snapToAlignment="center"
            directionalLockEnabled={true}
            alwaysBounceVertical={false}
            bounces={false}
            onScroll={handleScroll}
            onScrollBeginDrag={handleUserTouch}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            contentContainerStyle={styles.carouselContent}
          >
            {featuredDestinations.map((destination) => (
              <DestinationCard 
                key={destination.id} 
                destination={destination}
                onInteraction={handleUserTouch}
              />
            ))}
          </ScrollView>

          <View style={styles.cardDotsContainer} pointerEvents="none">
            {featuredDestinations.map((_, j) => (
              <View
                key={j}
                style={[
                  styles.dot,
                  currentIndex === j ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Divider before categories */}
        <LinearGradient
          colors={['rgba(0, 163, 255, 0)', 'rgba(0, 163, 255, 0.3)', 'rgba(0, 163, 255, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sectionDivider}
        />

        <CategorySection
          isExpanded={isCategoryExpanded}
          onToggleExpanded={() => setIsCategoryExpanded(!isCategoryExpanded)}
        />

        {/* Divider before reviews */}
        <LinearGradient
          colors={['rgba(0, 163, 255, 0)', 'rgba(0, 163, 255, 0.3)', 'rgba(0, 163, 255, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sectionDivider}
        />

        <View style={styles.reviewsSection}>
          <Text style={styles.reviewsTitle}>Đánh giá</Text>
          {displayedReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
          
          {/* Nút Xem thêm / Thu gọn */}
          {reviews.length > INITIAL_REVIEWS_COUNT && (
            <TouchableOpacity 
              style={styles.showMoreButton}
              onPress={() => setShowAllReviews(!showAllReviews)}
            >
              <Text style={styles.showMoreText}>
                {showAllReviews ? 'Thu gọn' : `Xem thêm ${reviews.length - INITIAL_REVIEWS_COUNT} đánh giá`}
              </Text>
              <FontAwesome 
                name={showAllReviews ? 'angle-up' : 'angle-down'} 
                size={18} 
                color={COLORS.primary} 
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <ChatButton visible={showChatButton} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
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
  headerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f4ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
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
    marginVertical: SPACING.lg,
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
    color: '#1a1a1a',
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
    marginTop: 0,
    position: 'relative',
  },
  carouselContent: { paddingHorizontal: 0 },
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
    color: '#1a1a1a',
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
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1e9ff',
  },
  showMoreText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default HomeScreen;
