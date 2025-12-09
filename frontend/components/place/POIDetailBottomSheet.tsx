import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  Linking,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING } from '../../constants';
import { getPlaceByIdAPI } from '@/services/api';
import { useFavorites } from '@/contexts/FavoritesContext';

// API Base URL - should match with services/api.ts
const API_BASE_URL = 'http://localhost:3000';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_SHEET_HEIGHT = SCREEN_HEIGHT * 0.75; // 3/4 màn hình
const DRAG_THRESHOLD = 50; // Ngưỡng kéo để đóng

interface POIDetailBottomSheetProps {
  visible: boolean;
  placeId?: string | null;
  placeData?: any | null; // Optional: Pass enriched place data directly
  onClose: () => void;
}

export const POIDetailBottomSheet: React.FC<POIDetailBottomSheetProps> = ({
  visible,
  placeId,
  placeData,
  onClose,
}) => {
  const [place, setPlace] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const { isLiked, toggleLike } = useFavorites();
  
  const translateY = React.useRef(new Animated.Value(BOTTOM_SHEET_HEIGHT)).current;
  const panY = React.useRef(new Animated.Value(0)).current;

  // Pan responder để kéo đóng bottom sheet
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        const current = (panY as any)?._value ?? 0;
        panY.setOffset(current);
      },
      onPanResponderMove: (_, gestureState) => {
        // Chỉ cho phép kéo xuống
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset();
        if (gestureState.dy > DRAG_THRESHOLD || gestureState.vy > 0.5) {
          // Kéo đủ xa hoặc vận tốc đủ nhanh -> đóng
          closeBottomSheet();
        } else {
          // Giữ mở
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Load place details khi placeId hoặc placeData thay đổi
  useEffect(() => {
    if (visible) {
      if (placeData) {
        // Nếu có placeData trực tiếp, dùng luôn
        setPlace(placeData);
        setLoading(false);
      } else if (placeId) {
        // Nếu chỉ có placeId, fetch từ API
      loadPlaceDetails(placeId);
      }
      // Animate mở bottom sheet
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
    } else if (!visible) {
      // Reset khi đóng
      translateY.setValue(BOTTOM_SHEET_HEIGHT);
      panY.setValue(0);
      setPlace(null);
      setImageIndex(0);
    }
  }, [visible, placeId, placeData]);

  const loadPlaceDetails = async (id: string) => {
    setLoading(true);
    try {
      const data = await getPlaceByIdAPI(id);
      setPlace(data);
    } catch (error) {
      console.error('Error loading place details:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeBottomSheet = () => {
    Animated.spring(translateY, {
      toValue: BOTTOM_SHEET_HEIGHT,
      useNativeDriver: true,
      friction: 8,
    }).start(() => {
      onClose();
    });
  };

  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWebsitePress = (url: string) => {
    let websiteUrl = url;
    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
      websiteUrl = `https://${websiteUrl}`;
    }
    Linking.openURL(websiteUrl);
  };

  const handleImagePress = () => {
    if (place?.photos && place.photos.length > 1) {
      setImageIndex((prev) => (prev + 1) % place.photos.length);
    }
  };

  const renderStars = (rating: number | null | undefined) => {
    if (!rating || rating === 0) {
      return (
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>Chưa có đánh giá</Text>
        </View>
      );
    }

    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        <View style={styles.starsRow}>
          {[...Array(5)].map((_, i) => {
            if (i < fullStars) {
              return (
                <FontAwesome
                  key={i}
                  name="star"
                  size={16}
                  color={COLORS.ratingAlt}
                  style={{ marginRight: 4 }}
                />
              );
            } else if (i === fullStars && hasHalfStar) {
              return (
                <FontAwesome
                  key={i}
                  name="star-half-full"
                  size={16}
                  color={COLORS.ratingAlt}
                  style={{ marginRight: 4 }}
                />
              );
            } else {
              return (
                <FontAwesome
                  key={i}
                  name="star-o"
                  size={16}
                  color={COLORS.textSecondary}
                  style={{ marginRight: 4 }}
                />
              );
            }
          })}
        </View>
      </View>
    );
  };

  const getImageUrl = (photo: any, photoIndex: number = 0) => {
    if (!photo) {
      console.log('[POIDetailBottomSheet] No photo provided');
      return null;
    }
    
    console.log('[POIDetailBottomSheet] Processing photo:', JSON.stringify(photo, null, 2));
    
    // Nếu photo là string URL trực tiếp
    if (typeof photo === 'string') {
      console.log('[POIDetailBottomSheet] Photo is direct URL string');
      return photo;
    }
    
    // Ưu tiên 1: Kiểm tra uri trực tiếp trên photo object (nếu có URL trực tiếp)
    if (photo?.uri) {
      console.log('[POIDetailBottomSheet] Using uri from photo object:', photo.uri);
      return photo.uri;
    }
    
    // Ưu tiên 2: Sử dụng photo.name (photo reference) để lấy ảnh địa điểm từ Google Places Photo API v1
    // Đây là cách chính xác để lấy ảnh của địa điểm, không phải ảnh của photographer
    // Photo name format từ Google Places API: "places/{place_id}/photos/{photo_reference}"
    // Backend sẽ gọi: https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1600&key=API_KEY
    if (photo?.name) {
      // Photo name có thể chứa dấu /, nên dùng query parameter
      // Format: places/{place_id}/photos/{photo_reference}
      // Encode photo name để truyền qua query parameter
      const encodedPhotoName = encodeURIComponent(photo.name);
      // Backend endpoint: GET /api/v1/places/photo?name=...&maxWidthPx=1600
      const proxyUrl = `${API_BASE_URL}/api/v1/places/photo?name=${encodedPhotoName}&maxWidthPx=1600`;
      console.log('[POIDetailBottomSheet] Created proxy URL from photo name (place photo):', proxyUrl);
      return proxyUrl;
    }
    
    // KHÔNG sử dụng authorAttributions.photoUri hoặc authorAttributions.uri
    // Vì đây là ảnh của photographer/người chụp, không phải ảnh của địa điểm
    
    console.log('[POIDetailBottomSheet] No valid image URL found for photo');
    return null;
  };

  const currentImageUrl = place?.photos?.[imageIndex]
    ? getImageUrl(place.photos[imageIndex], imageIndex)
    : null;
  
  // Debug: Log photos data
  useEffect(() => {
    if (place?.photos) {
      console.log('[POIDetailBottomSheet] Total photos:', place.photos.length);
      console.log('[POIDetailBottomSheet] Photos data:', JSON.stringify(place.photos, null, 2));
      console.log('[POIDetailBottomSheet] Current image index:', imageIndex);
      console.log('[POIDetailBottomSheet] Current image URL:', currentImageUrl);
    }
  }, [place?.photos, imageIndex, currentImageUrl]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeBottomSheet}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={closeBottomSheet}
      >
        <BlurView intensity={20} tint="dark" style={styles.backdropBlur} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            transform: [
              {
                translateY: Animated.add(translateY, panY),
              },
            ],
          },
        ]}
      >
        {/* Drag Handle */}
        <View style={styles.dragHandleContainer} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tải thông tin...</Text>
          </View>
        ) : place ? (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Header với hình ảnh */}
            <View style={styles.imageContainer}>
              {currentImageUrl ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleImagePress}
                  disabled={!place.photos || place.photos.length <= 1}
                >
                  <Image
                    source={{ uri: currentImageUrl }}
                    style={styles.mainImage}
                    resizeMode="cover"
                  />
                  {place.photos && place.photos.length > 1 && (
                    <View style={styles.imageIndicator}>
                      <Text style={styles.imageIndicatorText}>
                        {imageIndex + 1} / {place.photos.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.placeholderImage}>
                  <MaterialCommunityIcons
                    name="image-off"
                    size={64}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.placeholderText}>Không có hình ảnh</Text>
                </View>
              )}

              {/* Close button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeBottomSheet}
              >
                <BlurView intensity={80} tint="light" style={styles.closeButtonBlur}>
                  <MaterialCommunityIcons name="close" size={24} color={COLORS.textMain} />
                </BlurView>
              </TouchableOpacity>

              {/* Favorite button */}
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={async () => {
                  try {
                    const id = place.googlePlaceId || place._id?.toString() || placeId;
                    if (id) {
                      await toggleLike(id);
                    }
                  } catch (e) {
                    console.error('Failed to toggle like', e);
                  }
                }}
              >
                <BlurView intensity={80} tint="light" style={styles.favoriteButtonBlur}>
                  <FontAwesome
                    name={isLiked(place.googlePlaceId || place._id?.toString() || placeId || '') ? 'heart' : 'heart-o'}
                    size={24}
                    color={isLiked(place.googlePlaceId || place._id?.toString() || placeId || '') ? COLORS.favoriteActive : COLORS.textMain}
                  />
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.infoContainer}>
              {/* Tên địa điểm */}
              <Text style={styles.placeName}>{place.name || 'Không rõ tên'}</Text>

              {/* Địa chỉ */}
              {place.address || place.formatted_address ? (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons
                    name="map-marker"
                    size={20}
                    color={COLORS.primary}
                  />
                  <Text style={styles.addressText}>
                    {place.formatted_address || place.address}
                  </Text>
                </View>
              ) : null}

              {/* Rating và số lượng reviews */}
              <View style={styles.ratingContainer}>
                {renderStars(place.rating)}
                {place.user_ratings_total ? (
                  <Text style={styles.reviewsCount}>
                    ({place.user_ratings_total} đánh giá)
                  </Text>
                ) : null}
              </View>

              {/* Mô tả */}
              {place.description || place.editorialSummary ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Mô tả</Text>
                  <Text style={styles.descriptionText}>
                    {place.editorialSummary || place.description}
                  </Text>
                </View>
              ) : null}

              {/* Reviews */}
              {place.reviews && place.reviews.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Đánh giá ({place.reviews.length})</Text>
                  {place.reviews.slice(0, 5).map((review: any, index: number) => (
                    <View key={index} style={styles.reviewCard}>
                      <View style={styles.reviewHeader}>
                        <View style={styles.reviewAuthor}>
                          <Text style={styles.reviewAuthorName}>
                            {review.authorName || review.authorAttributions?.[0]?.displayName || 'Người dùng ẩn danh'}
                          </Text>
                          {review.rating ? (
                            <View style={styles.reviewRating}>
                              {[...Array(5)].map((_, i) => (
                                <FontAwesome
                                  key={i}
                                  name={i < review.rating ? 'star' : 'star-o'}
                                  size={12}
                                  color={COLORS.ratingAlt}
                                  style={{ marginRight: 2 }}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                        {(review.relativePublishTimeDescription || review.publishTime) && (
                          <Text style={styles.reviewTime}>
                            {review.relativePublishTimeDescription || review.publishTime}
                          </Text>
                        )}
                      </View>
                      {review.text && (
                        <Text style={styles.reviewText} numberOfLines={5}>
                          {review.text}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Thông tin liên hệ */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Thông tin liên hệ</Text>

                {/* Số điện thoại */}
                {place.contactNumber || place.phone ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => handlePhonePress(place.contactNumber || place.phone)}
                  >
                    <MaterialCommunityIcons
                      name="phone"
                      size={20}
                      color={COLORS.primary}
                    />
                    <Text style={styles.contactText}>
                      {place.contactNumber || place.phone}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                ) : null}

                {/* Website */}
                {place.websiteUri || place.website ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => handleWebsitePress(place.websiteUri || place.website)}
                  >
                    <MaterialCommunityIcons
                      name="web"
                      size={20}
                      color={COLORS.primary}
                    />
                    <Text style={styles.contactText} numberOfLines={1}>
                      {place.websiteUri || place.website}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons
              name="alert-circle"
              size={64}
              color={COLORS.error}
            />
            <Text style={styles.errorText}>Không tìm thấy thông tin địa điểm</Text>
            <TouchableOpacity style={styles.retryButton} onPress={closeBottomSheet}>
              <Text style={styles.retryButtonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropBlur: {
    flex: 1,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_SHEET_HEIGHT,
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  imageContainer: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  imageIndicator: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  imageIndicatorText: {
    color: COLORS.textWhite,
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  closeButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  favoriteButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  placeName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: SPACING.md,
    lineHeight: 32,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  addressText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    lineHeight: 22,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.ratingAlt,
    marginRight: SPACING.sm,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewsCount: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: SPACING.md,
  },
  descriptionText: {
    fontSize: 15,
    color: COLORS.textMain,
    lineHeight: 24,
  },
  reviewCard: {
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  reviewAuthor: {
    flex: 1,
  },
  reviewAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  reviewText: {
    fontSize: 14,
    color: COLORS.textMain,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  contactText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textMain,
    marginLeft: SPACING.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
});

export default POIDetailBottomSheet;

