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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING } from '../../constants';
import { getPlaceByIdAPI, chatWithAIAPI, API_BASE_URL } from '@/services/api';
import { useFavorites } from '@/contexts/FavoritesContext';

// API Base URL - imported from services/api.ts
// const API_BASE_URL = 'http://localhost:3000';

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
  const [translatedDescription, setTranslatedDescription] = useState<string>('');
  const [translatedReviews, setTranslatedReviews] = useState<{ [key: number]: string }>({});
  const [isDescriptionTranslated, setIsDescriptionTranslated] = useState(false);
  const [isReviewsTranslated, setIsReviewsTranslated] = useState<{ [key: number]: boolean }>({});
  const [isTranslatingDescription, setIsTranslatingDescription] = useState(false);
  const [translatingReviewIndex, setTranslatingReviewIndex] = useState<number | null>(null);
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
    console.log('[POIDetailBottomSheet] useEffect triggered:', { visible, placeId: !!placeId, placeData: !!placeData });
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
      setTranslatedDescription('');
      setTranslatedReviews({});
      setIsDescriptionTranslated(false);
      setIsReviewsTranslated({});
      setIsTranslatingDescription(false);
      setTranslatingReviewIndex(null);
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

  // Language detection: Check if text is predominantly Vietnamese
  const isVietnamese = (text: string): boolean => {
    if (!text || text.trim().length === 0) return true; // Empty text is considered Vietnamese

    // Split text into words
    const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return true;

    // Common Vietnamese words (expanded list)
    const vietnameseWords = new Set([
      'và', 'hoặc', 'là', 'của', 'tại', 'được', 'cho', 'này', 'có', 'không',
      'trong', 'với', 'từ', 'đến', 'làm', 'đang', 'đã', 'sẽ', 'như', 'theo',
      'về', 'để', 'khi', 'nếu', 'thì', 'cũng', 'mà', 'còn', 'lại', 'chỉ',
      'vẫn', 'các', 'những', 'điều', 'đó', 'ấy', 'kia', 'ta', 'tôi', 'bạn',
      'ông', 'bà', 'anh', 'chị', 'em', 'cháu', 'cô', 'thím', 'dì', 'chú',
      'thầy', 'bác', 'chú', 'thím', 'ông', 'bà', 'cậu', 'mợ', 'dượng', 'mẹ',
      'cha', 'con', 'người', 'nhà', 'đi', 'đến', 'từ', 'ở', 'ra', 'vào', 'lên',
      'xuống', 'trước', 'sau', 'bên', 'trong', 'ngoài', 'trên', 'dưới', 'giữa',
      'gần', 'xa', 'nhỏ', 'lớn', 'tốt', 'xấu', 'đẹp', 'xinh', 'giỏi', 'kém',
      'nhanh', 'chậm', 'mới', 'cũ', 'sạch', 'bẩn', 'đầy', 'trống', 'mua', 'bán',
      'ăn', 'uống', 'ngủ', 'thức', 'đọc', 'viết', 'học', 'dạy', 'làm', 'nghỉ',
      'chơi', 'nghe', 'nhìn', 'thấy', 'biết', 'hiểu', 'nói', 'kể', 'hỏi', 'trả lời'
    ]);

    // Check for Vietnamese diacritical marks
    const vietnameseChars = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệđìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;

    let vietnameseWordCount = 0;
    let englishWordCount = 0;
    let hasVietnameseChars = false;

    for (const word of words) {
      // Check if word contains Vietnamese characters
      if (vietnameseChars.test(word)) {
        hasVietnameseChars = true;
        vietnameseWordCount++;
      }
      // Check if it's a common Vietnamese word
      else if (vietnameseWords.has(word)) {
        vietnameseWordCount++;
      }
      // Check if it's likely an English word (contains only English letters)
      else if (/^[a-z]+$/i.test(word) && word.length > 1) {
        englishWordCount++;
      }
    }

    // If text has Vietnamese characters, it's likely Vietnamese
    if (hasVietnameseChars) {
      const totalMeaningfulWords = vietnameseWordCount + englishWordCount;
      // If more than 30% of meaningful words are English, show translate button
      const englishRatio = totalMeaningfulWords > 0 ? englishWordCount / totalMeaningfulWords : 0;
      const isPredominantlyVietnamese = englishRatio < 0.3;

// Only log for mixed language cases to avoid spam
      if (englishRatio > 0.1) {
        console.log('[Language Detection] Mixed language detected:', {
          text: text.substring(0, 50) + '...',
          englishRatio: englishRatio.toFixed(2),
          isPredominantlyVietnamese
        });
      }

      return isPredominantlyVietnamese;
    }

    // If no Vietnamese characters but has Vietnamese words, likely Vietnamese
    if (vietnameseWordCount > 0) {
      // Only log if mixed with English words
      if (englishWordCount > 0) {
        console.log('[Language Detection] Vietnamese words with English:', {
          text: text.substring(0, 50) + '...',
          vietnameseWords: vietnameseWordCount,
          englishWords: englishWordCount,
          isVietnamese: true
        });
      }
      return true;
    }

    // If mostly English words or no identifiable language, assume needs translation
    // Only log for debugging if needed
    if (englishWordCount > 2) {
      console.log('[Language Detection] English text detected:', {
        text: text.substring(0, 50) + '...',
        englishWords: englishWordCount,
        isVietnamese: false
      });
    }

    return false;
  };

  // Translate text using MyMemory Translation API (free, no API key needed)
  const translateText = async (text: string): Promise<string> => {
    try {
      console.log('[Translation] Starting translation...');
      console.log('[Translation] Original text:', text.substring(0, 100) + '...');
      
      // Split long text into chunks if needed (API has 500 char limit per request)
      const maxChunkLength = 500;
      if (text.length <= maxChunkLength) {
        return await translateChunk(text);
      }
      
      // Split by sentences for better translation
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let translatedText = '';
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkLength && currentChunk) {
          // Translate current chunk
          const translated = await translateChunk(currentChunk);
          translatedText += translated + ' ';
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }
      
      // Translate remaining chunk
      if (currentChunk) {
        const translated = await translateChunk(currentChunk);
        translatedText += translated;
      }
      
      return translatedText.trim() || text;
    } catch (error) {
      console.error('[Translation] Error:', error);
      return text;
    }
  };

  // Helper function to translate a single chunk
  const translateChunk = async (text: string): Promise<string> => {
    try {
      // MyMemory Translation API - Free, no API key needed
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|vi`;
      
      console.log('[Translation] Calling MyMemory API...');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error('[Translation] API error:', response.status);
        return text;
      }
      
      const data = await response.json();
      console.log('[Translation] API response:', data);
      
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const translated = data.responseData.translatedText;
        console.log('[Translation] Translated chunk:', translated.substring(0, 100) + '...');
        return translated;
      }
      
      console.error('[Translation] Invalid response format');
      return text;
    } catch (error) {
      console.error('[Translation] Chunk translation error:', error);
      return text;
    }
  };

  const handleTranslateDescription = async () => {
    if (!place?.description && !place?.editorialSummary) return;

    const originalText = place.editorialSummary || place.description;

    if (isDescriptionTranslated) {
      // Switch back to original
      setIsDescriptionTranslated(false);
    } else {
      // Translate to Vietnamese
      if (!translatedDescription) {
        setIsTranslatingDescription(true);
        const translated = await translateText(originalText);
        setTranslatedDescription(translated);
        setIsTranslatingDescription(false);
      }
      setIsDescriptionTranslated(true);
    }
  };

  const handleTranslateReview = async (reviewIndex: number, reviewText: string) => {
    if (isReviewsTranslated[reviewIndex]) {
      // Switch back to original
      setIsReviewsTranslated(prev => ({ ...prev, [reviewIndex]: false }));
    } else {
      // Translate to Vietnamese
      if (!translatedReviews[reviewIndex]) {
        setTranslatingReviewIndex(reviewIndex);
        const translated = await translateText(reviewText);
        setTranslatedReviews(prev => ({ ...prev, [reviewIndex]: translated }));
        setTranslatingReviewIndex(null);
      }
      setIsReviewsTranslated(prev => ({ ...prev, [reviewIndex]: true }));
    }
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
  
  // Debug: Log photos data (only when photos change)
  useEffect(() => {
    if (place?.photos) {
      console.log('[POIDetailBottomSheet] Total photos:', place.photos.length);
      // Remove heavy logging that causes performance issues
      // console.log('[POIDetailBottomSheet] Photos data:', JSON.stringify(place.photos, null, 2));
      console.log('[POIDetailBottomSheet] Current image index:', imageIndex);
    }
  }, [place?.photos]); // Remove imageIndex and currentImageUrl to prevent re-runs

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
                    // CRITICAL: Always use googlePlaceId for like/unlike (not MongoDB _id)
                    const googleId = place.googlePlaceId || place.google_place_id;
                    if (googleId) {
                      await toggleLike(googleId);
                    } else {
                      console.error('No googlePlaceId found for place:', place);
                    }
                  } catch (e) {
                    console.error('Failed to toggle like', e);
                  }
                }}
              >
                <BlurView intensity={80} tint="light" style={styles.favoriteButtonBlur}>
                  <FontAwesome
                    name={isLiked(place.googlePlaceId || place.google_place_id || '') ? 'heart' : 'heart-o'}
                    size={24}
                    color={isLiked(place.googlePlaceId || place.google_place_id || '') ? COLORS.favoriteActive : COLORS.textMain}
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

              {/* Rating và số lượng reviews + Contact Icons */}
              <View style={styles.ratingAndContactContainer}>
                <View style={styles.ratingContainer}>
                  {renderStars(place.rating)}
                  {place.user_ratings_total ? (
                    <Text style={styles.reviewsCount}>
                      ({place.user_ratings_total} đánh giá)
                    </Text>
                  ) : null}
                </View>

                {/* Thông tin liên hệ - Icons nhỏ */}
                <View style={styles.contactIconsContainer}>
                  {place.contactNumber || place.phone ? (
                    <TouchableOpacity
                      style={styles.contactIconButton}
                      onPress={() => handlePhonePress(place.contactNumber || place.phone)}
                    >
                      <MaterialCommunityIcons
                        name="phone"
                        size={18}
                        color={COLORS.primary}
                      />
                    </TouchableOpacity>
                  ) : null}
                  {place.websiteUri || place.website ? (
                    <TouchableOpacity
                      style={styles.contactIconButton}
                      onPress={() => handleWebsitePress(place.websiteUri || place.website)}
                    >
                      <MaterialCommunityIcons
                        name="web"
                        size={18}
                        color={COLORS.primary}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Mô tả */}
              {place.description || place.editorialSummary ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Mô tả</Text>
                    {(() => {
                      const originalText = place.editorialSummary || place.description;
                      const isViet = isVietnamese(originalText);
                      if (!isViet) {
                        return (
                          <TouchableOpacity
                            style={styles.translateButton}
                            onPress={handleTranslateDescription}
                            disabled={isTranslatingDescription}
                          >
                            {isTranslatingDescription ? (
                              <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                              <>
                                <MaterialCommunityIcons
                                  name="translate"
                                  size={16}
                                  color={COLORS.primary}
                                />
                                <Text style={styles.translateButtonText}>
                                  {isDescriptionTranslated ? 'Gốc' : 'Dịch'}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        );
                      }
                      return null;
                    })()}
                  </View>
                  <Text style={styles.descriptionText}>
                    {isDescriptionTranslated && translatedDescription
                      ? translatedDescription
                      : (place.editorialSummary || place.description)
                    }
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
                        <View style={styles.reviewHeaderRight}>
                          {(review.relativePublishTimeDescription || review.publishTime) && (
                            <Text style={styles.reviewTime}>
                              {review.relativePublishTimeDescription || review.publishTime}
                            </Text>
                          )}
                          {review.text && !isVietnamese(review.text) && (
                            <TouchableOpacity
                              style={styles.translateButtonSmall}
                              onPress={() => handleTranslateReview(index, review.text)}
                              disabled={translatingReviewIndex === index}
                            >
                              {translatingReviewIndex === index ? (
                                <ActivityIndicator size="small" color={COLORS.primary} />
                              ) : (
                                <>
                                  <MaterialCommunityIcons
                                    name="translate"
                                    size={16}
                                    color={COLORS.primary}
                                  />
                                  <Text style={styles.translateButtonText}>
                                    {isReviewsTranslated[index] ? 'Gốc' : 'Dịch'}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {review.text && (
                        <Text style={styles.reviewText} numberOfLines={5}>
                          {isReviewsTranslated[index] && translatedReviews[index]
                            ? translatedReviews[index]
                            : review.text
                          }
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}


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
  ratingAndContactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  contactIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  contactIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgLightBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 16,
  },
  translateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
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
  reviewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  translateButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 16,
  },
  reviewText: {
    fontSize: 14,
    color: COLORS.textMain,
    lineHeight: 20,
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

