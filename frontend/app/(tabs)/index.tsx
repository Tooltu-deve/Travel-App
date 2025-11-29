// HomeScreen - Trang chủ với các điểm đến nổi bật, danh mục và đánh giá
import { useTheme } from '@/contexts/ThemeContext';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategorySection } from '../../components/HomeScreen/CategorySection';
import { ChatButton } from '../../components/HomeScreen/ChatButton';
import { DestinationCard } from '../../components/HomeScreen/DestinationCard';
import { ReviewCard } from '../../components/HomeScreen/ReviewCard';
import { SearchBar } from '../../components/HomeScreen/SearchBar';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { featuredDestinations, reviews } from '../mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH; // Full width - chiều rộng toàn màn hình
const SNAP_INTERVAL = CARD_WIDTH; // Snap theo full width
const INITIAL_REVIEWS_COUNT = 2;

const HomeScreen: React.FC = () => {
  const { darkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showChatButton, setShowChatButton] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isCarouselScrolling, setIsCarouselScrolling] = useState(false);
  const [welcomeOpacity] = useState(new Animated.Value(1));
  const scrollViewRef = useRef<ScrollView>(null);
  const carouselRef = useRef<ScrollView>(null);
  const autoScrollTimeout = useRef<number | null>(null);
  const hideTimeout = useRef<number | null>(null);
  const lastScrollY = useRef(0);

  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, INITIAL_REVIEWS_COUNT);

  useEffect(() => {
    Animated.timing(welcomeOpacity, {
      toValue: isSearchExpanded ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSearchExpanded]);

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
    setIsCarouselScrolling(true);
    if (autoScrollTimeout.current) {
      clearTimeout(autoScrollTimeout.current);
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SNAP_INTERVAL);
    setCurrentIndex(index);
    setIsCarouselScrolling(false);
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
    const index = Math.round(contentOffsetX / SNAP_INTERVAL);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <LinearGradient
      colors={darkMode ? ['#121212', '#121212'] : [COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={darkMode ? [0, 1] : [0, 0.3, 0.6, 1]}
      style={homeStyles.gradientContainer}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={{flex:1, backgroundColor: darkMode ? '#121212' : '#fff'}}
        showsVerticalScrollIndicator={false}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        scrollEnabled={!isCarouselScrolling}
      >
        <View style={[homeStyles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
          <Animated.View 
            style={[
              homeStyles.headerTextContainer,
              { opacity: welcomeOpacity }
            ]}
            pointerEvents={isSearchExpanded ? 'none' : 'auto'}
          >
            <Text style={[homeStyles.welcomeText, {color: darkMode ? '#E0E0E0' : '#1F2937'}]}>Welcome !</Text>
            <Text style={[homeStyles.subtitleText, darkMode && {color:'#E0E0E0'}]}>Trần Minh Thanh</Text>
          </Animated.View>
          <View style={[homeStyles.headerButtonsContainer, { top: insets.top + SPACING.md }]}>
            <SearchBar onExpandChange={setIsSearchExpanded} />
            <TouchableOpacity style={homeStyles.headerButton}>
              <FontAwesome name="cog" size={22} color={darkMode ? '#4DD0E1' : COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[homeStyles.featuredSection, darkMode && {backgroundColor:'#1E1E1E'}]}>
          <Text style={[homeStyles.featuredTitle, darkMode && {color:'#E0E0E0'}]}>Điểm đến nổi bật</Text>
        </View>

        <View style={[homeStyles.carouselWrapper, darkMode && {backgroundColor:'#1E1E1E'}]}>
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
        </View>

        {/* Divider before categories */}
        <LinearGradient
          colors={darkMode ? ['#23262F', '#23262F', '#23262F'] : [COLORS.primaryTransparent, COLORS.primaryStrong, COLORS.primaryTransparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={homeStyles.sectionDivider}
        />

        <CategorySection
          isExpanded={isCategoryExpanded}
          onToggleExpanded={() => setIsCategoryExpanded(!isCategoryExpanded)}
        />

        {/* Divider before reviews */}
        <LinearGradient
          colors={darkMode ? ['#23262F', '#23262F', '#23262F'] : [COLORS.primaryTransparent, COLORS.primaryStrong, COLORS.primaryTransparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={homeStyles.sectionDivider}
        />

        <View style={homeStyles.reviewsSection}>
          <Text style={[homeStyles.reviewsTitle, darkMode && {color:'#E0E0E0', textShadowColor:'transparent'}]}>Đánh giá</Text>
          {displayedReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
          
          {/* Nút Xem thêm / Thu gọn */}
          {reviews.length > INITIAL_REVIEWS_COUNT && (
            <TouchableOpacity 
              style={homeStyles.showMoreButton}
              onPress={() => setShowAllReviews(!showAllReviews)}
            >
              <Text style={homeStyles.showMoreText}>
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
  headerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.bgLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textDark,
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
    color: COLORS.textDark,
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
    marginTop: SPACING.lg, // Thêm khoảng cách để card không che tiêu đề
    position: 'relative',
  },
  carouselContent: { 
    paddingHorizontal: 0, // Bỏ padding để card full width
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
});

export default HomeScreen;
