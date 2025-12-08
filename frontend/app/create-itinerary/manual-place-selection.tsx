// ManualPlaceSelectionScreen - Màn hình chọn địa điểm cho lộ trình thủ công
import React, { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  TextInput,
  Modal,
} from 'react-native';
import { FontAwesome, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { calculateRoutesAPI, checkWeatherAPI, autocompleteAPI, AutocompletePrediction } from '../../services/api';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const BOTTOM_SHEET_MIN_HEIGHT = SCREEN_HEIGHT * 0.35;
const SWIPE_THRESHOLD = 80;
const DELETE_BUTTON_WIDTH = 80;
const AUTOCOMPLETE_DEBOUNCE_MS = 300; // Debounce delay for autocomplete

interface TripInfo {
  startDate: string;
  endDate: string;
  durationDays: number;
  currentLocation: string;
  currentLocationLat: number;
  currentLocationLng: number;
  destination: string;
}

interface Place {
  id: string;
  name: string;
  address: string;
  type: string;
  lat?: number;
  lng?: number;
}

interface DayPlaces {
  [day: number]: Place[];
}

// Swipeable Place Card Component
interface SwipeablePlaceCardProps {
  place: Place;
  index: number;
  totalPlaces: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: () => void;
  onEdit: (place: Place) => void;
  onLongPress: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

const SwipeablePlaceCard: React.FC<SwipeablePlaceCardProps> = ({
  place,
  index,
  totalPlaces,
  onReorder,
  onDelete,
  onEdit,
  onLongPress,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onDragStart = () => {},
  onDragEnd = () => {},
  isDragging,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const currentIndex = useRef(index);

  // Refs to store latest values for PanResponder callbacks
  const isSelectionModeRef = useRef(isSelectionMode);
  const isDragModeRef = useRef(isDragMode);
  const isSwipeOpenRef = useRef(isSwipeOpen);
  const totalPlacesRef = useRef(totalPlaces);
  const onReorderRef = useRef(onReorder);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);

  // Update refs when props/state change
  useEffect(() => {
    currentIndex.current = index;
  }, [index]);

  useEffect(() => {
    isSelectionModeRef.current = isSelectionMode;
  }, [isSelectionMode]);

  useEffect(() => {
    isDragModeRef.current = isDragMode;
  }, [isDragMode]);

  useEffect(() => {
    isSwipeOpenRef.current = isSwipeOpen;
  }, [isSwipeOpen]);

  useEffect(() => {
    totalPlacesRef.current = totalPlaces;
  }, [totalPlaces]);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);

  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 5,
    }).start();
    setIsSwipeOpen(false);
  };

  const swipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isSelectionModeRef.current && !isDragModeRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return !isSelectionModeRef.current && !isDragModeRef.current && Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderMove: (_, gestureState) => {
        const swipeWidth = DELETE_BUTTON_WIDTH * 2;
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -swipeWidth));
        } else if (isSwipeOpenRef.current) {
          translateX.setValue(Math.min(gestureState.dx - swipeWidth, 0));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeWidth = DELETE_BUTTON_WIDTH * 2;
        if (gestureState.dx < -SWIPE_THRESHOLD / 2) {
          Animated.spring(translateX, {
            toValue: -swipeWidth,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
          setIsSwipeOpen(true);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
          setIsSwipeOpen(false);
        }
      },
    })
  ).current;

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Đóng swipe nếu đang mở trước khi bắt đầu drag
        if (isSwipeOpenRef.current) {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
          setIsSwipeOpen(false);
        }
        setIsDragMode(true);
        onDragStartRef.current();
      },
      onPanResponderMove: (_, gestureState) => {
        translateY.setValue(gestureState.dy);
        
        // Calculate new position based on drag distance
        const cardHeight = 70; // Approximate card height
        const moveThreshold = cardHeight / 2;
        const dragDistance = gestureState.dy;
        
        if (Math.abs(dragDistance) > moveThreshold) {
          const direction = dragDistance > 0 ? 1 : -1;
          const newIndex = currentIndex.current + direction;
          
          if (newIndex >= 0 && newIndex < totalPlacesRef.current && newIndex !== currentIndex.current) {
            onReorderRef.current(currentIndex.current, newIndex);
            currentIndex.current = newIndex;
            // Reset translateY to account for the swap
            translateY.setValue(dragDistance - (direction * cardHeight));
          }
        }
      },
      onPanResponderRelease: () => {
        setIsDragMode(false);
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 5,
        }).start();
        onDragEndRef.current();
      },
      onPanResponderTerminate: () => {
        setIsDragMode(false);
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 5,
        }).start();
        onDragEndRef.current();
      },
    })
  ).current;

  return (
    <View style={[styles.swipeableContainer, isDragging && styles.draggingContainer]}>
      {/* Delete and Edit buttons behind - chỉ hiện khi KHÔNG đang drag */}
      {!isDragMode && (
        <View style={styles.deleteButtonContainer}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              closeSwipe();
              onEdit(place);
            }}
          >
            <Ionicons name="pencil" size={20} color={COLORS.textWhite} />
            <Text style={styles.editButtonText}>Sửa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              closeSwipe();
              onDelete();
            }}
          >
            <Ionicons name="trash" size={20} color={COLORS.textWhite} />
            <Text style={styles.deleteButtonText}>Xóa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main card */}
      <Animated.View
        style={[
          styles.placeCard,
          { 
            transform: [
              { translateX },
              { translateY: isDragMode ? translateY : 0 }
            ] 
          },
          isDragMode && styles.placeCardDragging,
        ]}
        {...(isSelectionMode ? {} : swipePanResponder.panHandlers)}
      >
        <TouchableOpacity
          style={styles.placeCardContent}
          onLongPress={onLongPress}
          onPress={() => {
            if (isSelectionMode) {
              onToggleSelect();
            } else if (isSwipeOpen) {
              closeSwipe();
            }
          }}
          delayLongPress={500}
          activeOpacity={0.7}
        >

            {isSelectionMode ? (
              <TouchableOpacity
                style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                onPress={onToggleSelect}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={COLORS.textWhite} />
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.placeIndex}>
                <Text style={styles.placeIndexText}>{index + 1}</Text>
              </View>
            )}

          <View style={styles.placeInfo}>
            <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
            <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
          </View>

          {!isSelectionMode && (
            <View 
              style={styles.placeCardDragHandle}
              {...dragPanResponder.panHandlers}
            >
              <Ionicons name="menu" size={24} color={COLORS.textSecondary} />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const ManualPlaceSelectionScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();

  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [dayPlaces, setDayPlaces] = useState<DayPlaces>({});
  const [dayStartLocations, setDayStartLocations] = useState<{ [day: number]: { name: string; lat: number; lng: number } }>({});
  const [hasAskedStartLocation, setHasAskedStartLocation] = useState(false);
  const [travelMode, setTravelMode] = useState<'driving' | 'walking' | 'bicycling' | 'transit'>('driving');
  
  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  
  // Drag state
  const [draggingPlaceId, setDraggingPlaceId] = useState<string | null>(null);
  
  // Edit state
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [editPlaceName, setEditPlaceName] = useState('');
  const [editPlaceAddress, setEditPlaceAddress] = useState('');

  // Add Place Modal state (Search like Google Maps)
  const [isAddPlaceModalVisible, setIsAddPlaceModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AutocompletePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bottom sheet animation
  const bottomSheetHeight = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;
  const lastGestureDy = useRef(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // @ts-ignore
        bottomSheetHeight.setOffset(bottomSheetHeight._value);
        bottomSheetHeight.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = -gestureState.dy;
        if (newHeight >= 0) {
          bottomSheetHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        bottomSheetHeight.flattenOffset();
        // @ts-ignore
        const currentHeight = bottomSheetHeight._value;
        
        if (gestureState.dy > 50) {
          // Swipe down - collapse
          Animated.spring(bottomSheetHeight, {
            toValue: BOTTOM_SHEET_MIN_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          setIsExpanded(false);
        } else if (gestureState.dy < -50) {
          // Swipe up - expand
          Animated.spring(bottomSheetHeight, {
            toValue: BOTTOM_SHEET_MAX_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          setIsExpanded(true);
        } else {
          // Return to nearest position
          const toValue = currentHeight > (BOTTOM_SHEET_MAX_HEIGHT + BOTTOM_SHEET_MIN_HEIGHT) / 2
            ? BOTTOM_SHEET_MAX_HEIGHT
            : BOTTOM_SHEET_MIN_HEIGHT;
          Animated.spring(bottomSheetHeight, {
            toValue,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          setIsExpanded(toValue === BOTTOM_SHEET_MAX_HEIGHT);
        }
      },
    })
  ).current;

  useEffect(() => {
    // Parse params from previous screen - only run once
    if (params && !tripInfo) {
      const durationDays = parseInt(params.durationDays as string) || 1;
      setTripInfo({
        startDate: params.startDate as string,
        endDate: params.endDate as string,
        durationDays,
        currentLocation: params.currentLocation as string,
        currentLocationLat: parseFloat(params.currentLocationLat as string) || 0,
        currentLocationLng: parseFloat(params.currentLocationLng as string) || 0,
        destination: params.destination as string,
      });
      
      // Initialize empty places for each day
      const initialDayPlaces: DayPlaces = {};
      for (let i = 1; i <= durationDays; i++) {
        initialDayPlaces[i] = [];
      }
      setDayPlaces(initialDayPlaces);
      
      // Initialize start locations for each day (default to current location)
      const initialStartLocations: { [day: number]: { name: string; lat: number; lng: number } } = {};
      const currentLat = parseFloat(params.currentLocationLat as string) || 0;
      const currentLng = parseFloat(params.currentLocationLng as string) || 0;
      const currentLocationName = params.currentLocation as string;
      for (let i = 1; i <= durationDays; i++) {
        initialStartLocations[i] = { name: currentLocationName, lat: currentLat, lng: currentLng };
      }
      setDayStartLocations(initialStartLocations);
      
      setIsLoading(false);
    }
  }, []); // Empty dependency array - run only once on mount

  const handleGoBack = () => {
    router.back();
  };

  // Ask user about start location for subsequent days after first place is added
  const askAboutStartLocationForOtherDays = (firstPlace: Place) => {
    if (hasAskedStartLocation || !tripInfo || tripInfo.durationDays <= 1) return;
    
    setHasAskedStartLocation(true);
    
    Alert.alert(
      'Điểm xuất phát các ngày sau',
      'Bạn có muốn cài đặt điểm xuất phát khác cho các ngày sau không?',
      [
        {
          text: 'Không, dùng điểm xuất phát ban đầu',
          style: 'cancel',
          onPress: () => {
            // Keep the original start location for all days (already set by default)
          },
        },
        {
          text: 'Dùng địa điểm vừa thêm',
          onPress: () => {
            // Use the first added place as start location for subsequent days
            if (firstPlace.lat && firstPlace.lng) {
              const updatedStartLocations = { ...dayStartLocations };
              for (let i = 2; i <= tripInfo.durationDays; i++) {
                updatedStartLocations[i] = {
                  name: firstPlace.name,
                  lat: firstPlace.lat,
                  lng: firstPlace.lng,
                };
              }
              setDayStartLocations(updatedStartLocations);
              Alert.alert('Đã cập nhật', `Điểm xuất phát từ Ngày 2 trở đi sẽ là: ${firstPlace.name}`);
            }
          },
        },
        {
          text: 'Nhập địa điểm mới',
          onPress: () => {
            // Show prompt to enter new location (simplified - in production use a proper input modal)
            Alert.prompt(
              'Nhập địa điểm xuất phát mới',
              'Nhập tên địa điểm cho các ngày sau:',
              [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Xác nhận',
                  onPress: (newLocationName: string | undefined) => {
                    if (newLocationName && newLocationName.trim()) {
                      // For simplicity, use the same coordinates as the first place
                      // In production, you would geocode the new location
                      const updatedStartLocations = { ...dayStartLocations };
                      for (let i = 2; i <= tripInfo.durationDays; i++) {
                        updatedStartLocations[i] = {
                          name: newLocationName.trim(),
                          lat: firstPlace.lat || tripInfo.currentLocationLat,
                          lng: firstPlace.lng || tripInfo.currentLocationLng,
                        };
                      }
                      setDayStartLocations(updatedStartLocations);
                      Alert.alert('Đã cập nhật', `Điểm xuất phát từ Ngày 2 trở đi sẽ là: ${newLocationName.trim()}`);
                    }
                  },
                },
              ],
              'plain-text',
              ''
            );
          },
        },
      ]
    );
  };

  const handleAddPlace = () => {
    // Open search modal like Google Maps
    setSearchQuery('');
    setSearchResults([]);
    setIsAddPlaceModalVisible(true);
    // Refresh session token when opening modal
    setSessionToken(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  };

  // Autocomplete search with debounce
  const handleSearchQueryChange = async (query: string) => {
    setSearchQuery(query);
    
    // Clear previous debounce timeout
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // If query is empty, clear results and refresh session token
    if (!query.trim()) {
      setSearchResults([]);
      setSessionToken(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      return;
    }

    // Debounce API call
    searchDebounceRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const results = await autocompleteAPI(token, query, sessionToken);
        setSearchResults(results);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  };

  // Handle selecting a place from autocomplete results
  const handleSelectPlace = (prediction: AutocompletePrediction) => {
    const newPlace: Place = {
      id: `place_${Date.now()}`,
      name: prediction.structured_formatting?.main_text || prediction.description,
      address: prediction.description,
      type: 'attraction',
      // lat/lng will be geocoded by backend
    };
    
    const isFirstPlaceEver = Object.values(dayPlaces).every(places => places.length === 0);
    
    setDayPlaces(prev => ({
      ...prev,
      [selectedDay]: [...(prev[selectedDay] || []), newPlace],
    }));
    
    // Close modal and reset
    setIsAddPlaceModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    // Refresh session token after selection
    setSessionToken(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    
    // Ask about start location after first place is added
    if (isFirstPlaceEver && selectedDay === 1) {
      setTimeout(() => askAboutStartLocationForOtherDays(newPlace), 500);
    }
  };

  const handleRemovePlace = (placeId: string) => {
    Alert.alert(
      'Xóa địa điểm',
      'Bạn có chắc muốn xóa địa điểm này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            setDayPlaces(prev => ({
              ...prev,
              [selectedDay]: (prev[selectedDay] || []).filter(p => p.id !== placeId),
            }));
          },
        },
      ]
    );
  };

  const handleEditPlace = (place: Place) => {
    setEditingPlace(place);
    setEditPlaceName(place.name);
    setEditPlaceAddress(place.address);
  };

  const handleSaveEdit = () => {
    if (!editingPlace) return;
    
    if (!editPlaceName.trim()) {
      Alert.alert('Lỗi', 'Tên địa điểm không được để trống');
      return;
    }

    setDayPlaces(prev => ({
      ...prev,
      [selectedDay]: (prev[selectedDay] || []).map(p => 
        p.id === editingPlace.id
          ? { ...p, name: editPlaceName.trim(), address: editPlaceAddress.trim() }
          : p
      ),
    }));

    setEditingPlace(null);
    setEditPlaceName('');
    setEditPlaceAddress('');
  };

  const handleReorderPlace = (fromIndex: number, toIndex: number) => {
    const places = [...(dayPlaces[selectedDay] || [])];
    const [movedItem] = places.splice(fromIndex, 1);
    places.splice(toIndex, 0, movedItem);
    
    setDayPlaces(prev => ({
      ...prev,
      [selectedDay]: places,
    }));
  };

  const handleConfirm = async () => {
    // Check if at least one place is added
    const totalPlacesCount = Object.values(dayPlaces).reduce((sum, places) => sum + places.length, 0);
    if (totalPlacesCount === 0) {
      Alert.alert('Chưa có địa điểm', 'Vui lòng thêm ít nhất một địa điểm vào lộ trình');
      return;
    }

    // Ask user about route optimization
    Alert.alert(
      '🗺️ Tối ưu lộ trình',
      'Bạn có muốn hệ thống tự động sắp xếp thứ tự địa điểm để tối ưu quãng đường di chuyển không?',
      [
        {
          text: 'Không, giữ nguyên',
          style: 'cancel',
          onPress: () => proceedWithConfirm(false),
        },
        {
          text: 'Có, tối ưu',
          onPress: () => proceedWithConfirm(true),
        },
      ]
    );
  };

  const proceedWithConfirm = async (optimize: boolean) => {
    try {
      setIsSubmitting(true);

      // Get token from AsyncStorage
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để tạo lộ trình');
        router.replace('/(auth)/login');
        return;
      }

      // Check weather first (optional - can be skipped if API fails)
      if (tripInfo) {
        try {
          const weatherResult = await checkWeatherAPI(token, {
            departureDate: tripInfo.startDate,
            returnDate: tripInfo.endDate,
            destination: tripInfo.destination,
          });

          if (weatherResult.severity === 'danger') {
            Alert.alert(
              '⚠️ Cảnh báo thời tiết',
              `${weatherResult.alert}\n\nBạn có muốn tiếp tục tạo lộ trình không?`,
              [
                { text: 'Hủy', style: 'cancel', onPress: () => setIsSubmitting(false) },
                { text: 'Tiếp tục', onPress: () => processItinerary(token, optimize) },
              ]
            );
            return;
          } else if (weatherResult.severity === 'warning') {
            Alert.alert(
              '⚠️ Lưu ý thời tiết',
              'Thời tiết có thể không thuận lợi. Bạn có muốn tiếp tục?',
              [
                { text: 'Hủy', style: 'cancel', onPress: () => setIsSubmitting(false) },
                { text: 'Tiếp tục', onPress: () => processItinerary(token, optimize) },
              ]
            );
            return;
          }
        } catch (weatherError) {
          console.log('Weather check failed, continuing without weather data:', weatherError);
        }
      }

      // Process itinerary
      await processItinerary(token, optimize);
    } catch (error: any) {
      console.error('❌ Error creating itinerary:', error);
      Alert.alert('Lỗi', error.message || 'Đã xảy ra lỗi khi tạo lộ trình. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const processItinerary = async (token: string, optimize: boolean = false) => {
    try {
      // Prepare days data for API
      const daysData = Object.entries(dayPlaces)
        .filter(([_, places]) => places.length > 0)
        .map(([dayNum, places]) => {
          const dayNumber = parseInt(dayNum);
          const startLocation = dayStartLocations[dayNumber];
          
          // Map places to API format (without start location as place)
          const allPlaces = places.map((p: Place) => ({
            placeId: p.id,
            name: p.name,
            address: p.address || p.name,
          }));

          return {
            dayNumber,
            startLocation: startLocation?.name || tripInfo?.currentLocation || '',
            places: allPlaces,
          };
        });

      // Call calculate routes API
      const routeResult = await calculateRoutesAPI(token, {
        travelMode,
        optimize,
        days: daysData,
      });

      console.log('✅ Routes calculated:', routeResult);

      // Navigate to route preview screen with the result
      router.push({
        pathname: '/create-itinerary/route-preview',
        params: {
          routeData: JSON.stringify(routeResult),
          destination: tripInfo?.destination || '',
          durationDays: tripInfo?.durationDays.toString() || '1',
          startDate: tripInfo?.startDate || '',
          endDate: tripInfo?.endDate || '',
          travelMode,
          isManualRoute: 'true',
        },
      });
    } catch (error: any) {
      console.error('❌ Error processing itinerary:', error);
      Alert.alert('Lỗi', error.message || 'Không thể tính toán đường đi. Vui lòng thử lại.');
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string, dayOffset: number = 0) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + dayOffset);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  };

  // Animate map to fit all markers
  const fitMapToMarkers = () => {
    if (!mapRef.current || !tripInfo) return;
    
    const allPlaces = Object.values(dayPlaces).flat();
    const coordinates = [
      { latitude: tripInfo.currentLocationLat, longitude: tripInfo.currentLocationLng },
      ...allPlaces.filter(p => p.lat && p.lng).map(p => ({ latitude: p.lat!, longitude: p.lng! })),
    ];
    
    if (coordinates.length > 1) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: BOTTOM_SHEET_MIN_HEIGHT + 50, left: 50 },
        animated: true,
      });
    }
  };

  // Get initial region based on destination coordinates
  const getInitialRegion = () => {
    return {
      latitude: tripInfo?.currentLocationLat || 10.8231,
      longitude: tripInfo?.currentLocationLng || 106.6297,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  };

  if (isLoading || !tripInfo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải thông tin...</Text>
      </View>
    );
  }

  const currentDayPlaces = dayPlaces[selectedDay] || [];
  const allPlacesWithCoords = Object.values(dayPlaces).flat().filter(p => p.lat && p.lng);
  const currentDayStartLocation = dayStartLocations[selectedDay];

  return (
    <View style={styles.container}>
      {/* Map Background using react-native-maps */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={getInitialRegion()}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Current Day Start Location Marker */}
          {currentDayStartLocation && (
            <Marker
              coordinate={{
                latitude: currentDayStartLocation.lat,
                longitude: currentDayStartLocation.lng,
              }}
              title={`Điểm xuất phát Ngày ${selectedDay}`}
              description={currentDayStartLocation.name}
              pinColor={COLORS.primary}
            >
              <View style={styles.startMarker}>
                <MaterialIcons name="my-location" size={20} color={COLORS.textWhite} />
              </View>
            </Marker>
          )}

          {/* Place Markers */}
          {allPlacesWithCoords.map((place, index) => (
            <Marker
              key={place.id}
              coordinate={{
                latitude: place.lat!,
                longitude: place.lng!,
              }}
              title={place.name}
              description={place.address}
            >
              <View style={styles.placeMarker}>
                <Text style={styles.placeMarkerText}>{index + 1}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
        
        {/* Floating Header */}
        <View style={[styles.floatingHeader, { paddingTop: insets.top + SPACING.sm }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack} activeOpacity={0.7}>
            <FontAwesome name="arrow-left" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* My Location Button */}
        <TouchableOpacity 
          style={[styles.myLocationButton, { top: insets.top + 70 }]}
          onPress={() => {
            mapRef.current?.animateToRegion({
              latitude: tripInfo.currentLocationLat,
              longitude: tripInfo.currentLocationLng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }, 500);
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="my-location" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        {/* Fit All Markers Button */}
        {allPlacesWithCoords.length > 0 && (
          <TouchableOpacity 
            style={[styles.fitMarkersButton, { top: insets.top + 120 }]}
            onPress={fitMapToMarkers}
            activeOpacity={0.7}
          >
            <MaterialIcons name="zoom-out-map" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Sheet */}
      <Animated.View 
        style={[
          styles.bottomSheet,
          { 
            height: bottomSheetHeight,
            paddingBottom: insets.bottom,
          }
        ]}
      >
        {/* Drag Handle */}
        <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>

        {/* Day Tabs */}
        <View style={styles.dayTabsContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayTabsContent}
          >
            {Array.from({ length: tripInfo.durationDays }, (_, i) => i + 1).map(day => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayTab,
                  selectedDay === day && styles.dayTabActive,
                ]}
                onPress={() => setSelectedDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayTabText,
                  selectedDay === day && styles.dayTabTextActive,
                ]}>
                  Ngày {day}
                </Text>
                <Text style={[
                  styles.dayTabDate,
                  selectedDay === day && styles.dayTabDateActive,
                ]}>
                  {formatDate(tripInfo.startDate, day - 1)}
                </Text>
                {(dayPlaces[day]?.length || 0) > 0 && (
                  <View style={styles.dayTabBadge}>
                    <Text style={styles.dayTabBadgeText}>{dayPlaces[day].length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Travel Mode Selector */}
        <View style={styles.travelModeContainer}>
          <Text style={styles.travelModeLabel}>Phương tiện di chuyển:</Text>
          <View style={styles.travelModeOptions}>
            {[
              { value: 'driving', icon: 'car', label: 'Xe' },
              { value: 'walking', icon: 'walk', label: 'Đi bộ' },
              { value: 'bicycling', icon: 'bicycle', label: 'Xe đạp' },
              { value: 'transit', icon: 'bus', label: 'Công cộng' },
            ].map((mode) => (
              <TouchableOpacity
                key={mode.value}
                style={[
                  styles.travelModeOption,
                  travelMode === mode.value && styles.travelModeOptionActive,
                ]}
                onPress={() => setTravelMode(mode.value as typeof travelMode)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={mode.icon as any}
                  size={18}
                  color={travelMode === mode.value ? COLORS.textWhite : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.travelModeText,
                    travelMode === mode.value && styles.travelModeTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Start Location Info for Current Day */}
        {currentDayStartLocation && (
          <View style={styles.startLocationInfo}>
            <MaterialIcons name="location-on" size={18} color={COLORS.primary} />
            <Text style={styles.startLocationText} numberOfLines={1}>
              Xuất phát: {currentDayStartLocation.name}
            </Text>
            {selectedDay > 1 && (
              <TouchableOpacity
                style={styles.changeStartLocationBtn}
                onPress={() => {
                  Alert.alert(
                    'Đổi điểm xuất phát',
                    `Chọn điểm xuất phát mới cho Ngày ${selectedDay}`,
                    [
                      { text: 'Hủy', style: 'cancel' },
                      {
                        text: 'Dùng điểm xuất phát gốc',
                        onPress: () => {
                          if (tripInfo) {
                            setDayStartLocations(prev => ({
                              ...prev,
                              [selectedDay]: {
                                name: tripInfo.currentLocation,
                                lat: tripInfo.currentLocationLat,
                                lng: tripInfo.currentLocationLng,
                              },
                            }));
                          }
                        },
                      },
                      {
                        text: 'Dùng điểm đến cuối Ngày ' + (selectedDay - 1),
                        onPress: () => {
                          const prevDayPlaces = dayPlaces[selectedDay - 1];
                          if (prevDayPlaces && prevDayPlaces.length > 0) {
                            const lastPlace = prevDayPlaces[prevDayPlaces.length - 1];
                            if (lastPlace.lat && lastPlace.lng) {
                              setDayStartLocations(prev => ({
                                ...prev,
                                [selectedDay]: {
                                  name: lastPlace.name,
                                  lat: lastPlace.lat!,
                                  lng: lastPlace.lng!,
                                },
                              }));
                            }
                          } else {
                            Alert.alert('Không thể', 'Ngày trước chưa có địa điểm nào');
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="pencil" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Selection Mode Header */}
        {isSelectionMode && (
          <View style={styles.selectionModeHeader}>
            <TouchableOpacity
              style={styles.cancelSelectionBtn}
              onPress={() => {
                setIsSelectionMode(false);
                setSelectedPlaceIds(new Set());
              }}
            >
              <Text style={styles.cancelSelectionText}>Hủy</Text>
            </TouchableOpacity>
            <Text style={styles.selectionCountText}>
              Đã chọn {selectedPlaceIds.size} địa điểm
            </Text>
            <TouchableOpacity
              style={styles.selectAllBtn}
              onPress={() => {
                if (selectedPlaceIds.size === currentDayPlaces.length) {
                  setSelectedPlaceIds(new Set());
                } else {
                  setSelectedPlaceIds(new Set(currentDayPlaces.map(p => p.id)));
                }
              }}
            >
              <Text style={styles.selectAllText}>
                {selectedPlaceIds.size === currentDayPlaces.length ? 'Bỏ chọn' : 'Chọn tất cả'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Places List */}
        <ScrollView 
          style={styles.placesListContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.placesListContent}
          scrollEnabled={!draggingPlaceId}
        >
          {currentDayPlaces.length === 0 && !isSelectionMode ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="place" size={48} color={COLORS.borderLight} />
              <Text style={styles.emptyStateText}>Chưa có địa điểm nào</Text>
              <Text style={styles.emptyStateSubtext}>Nhấn nút bên dưới để thêm địa điểm</Text>
            </View>
          ) : (
            currentDayPlaces.map((place, index) => (
              <SwipeablePlaceCard
                key={place.id}
                place={place}
                index={index}
                totalPlaces={currentDayPlaces.length}
                onReorder={handleReorderPlace}
                onDelete={() => {
                  setDayPlaces(prev => ({
                    ...prev,
                    [selectedDay]: (prev[selectedDay] || []).filter(p => p.id !== place.id),
                  }));
                }}
                onEdit={handleEditPlace}
                onLongPress={() => {
                  if (!isSelectionMode) {
                    setIsSelectionMode(true);
                    setSelectedPlaceIds(new Set([place.id]));
                  }
                }}
                isSelectionMode={isSelectionMode}
                isSelected={selectedPlaceIds.has(place.id)}
                onToggleSelect={() => {
                  setSelectedPlaceIds(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(place.id)) {
                      newSet.delete(place.id);
                    } else {
                      newSet.add(place.id);
                    }
                    return newSet;
                  });
                }}
                onDragStart={() => setDraggingPlaceId(place.id)}
                onDragEnd={() => setDraggingPlaceId(null)}
                isDragging={draggingPlaceId === place.id}
              />
            ))
          )}

          {/* Add Place Button (at bottom like a place card) */}
          {!isSelectionMode && (
            <TouchableOpacity 
              style={styles.addPlaceCard}
              onPress={handleAddPlace}
              activeOpacity={0.7}
            >
              <View style={styles.addPlaceIcon}>
                <Ionicons name="add" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.addPlaceText}>Thêm địa điểm</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Confirm/Delete Button */}
        <View style={styles.confirmContainer}>
          {isSelectionMode && selectedPlaceIds.size > 0 ? (
            <TouchableOpacity
              style={styles.deleteSelectedButton}
              onPress={() => {
                Alert.alert(
                  'Xóa địa điểm đã chọn',
                  `Bạn có chắc muốn xóa ${selectedPlaceIds.size} địa điểm?`,
                  [
                    { text: 'Hủy', style: 'cancel' },
                    {
                      text: 'Xóa',
                      style: 'destructive',
                      onPress: () => {
                        setDayPlaces(prev => ({
                          ...prev,
                          [selectedDay]: (prev[selectedDay] || []).filter(p => !selectedPlaceIds.has(p.id)),
                        }));
                        setIsSelectionMode(false);
                        setSelectedPlaceIds(new Set());
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="trash" size={20} color={COLORS.textWhite} />
              <Text style={styles.deleteSelectedText}>
                Xóa {selectedPlaceIds.size} địa điểm
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.8}
              disabled={isSubmitting}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmButtonGradient}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={COLORS.textWhite} />
                    <Text style={styles.confirmButtonText}>ĐANG XỬ LÝ...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.confirmButtonText}>XÁC NHẬN LỘ TRÌNH</Text>
                    <MaterialIcons name="check-circle" size={20} color={COLORS.textWhite} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Edit Place Modal */}
      <Modal
        visible={editingPlace !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setEditingPlace(null)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Chỉnh sửa địa điểm</Text>
              <TouchableOpacity onPress={() => setEditingPlace(null)}>
                <Ionicons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.editModalBody}>
              <Text style={styles.editLabel}>Tên địa điểm *</Text>
              <TextInput
                style={styles.editInput}
                value={editPlaceName}
                onChangeText={setEditPlaceName}
                placeholder="Nhập tên địa điểm..."
                placeholderTextColor={COLORS.textSecondary}
              />

              <Text style={styles.editLabel}>Địa chỉ</Text>
              <TextInput
                style={styles.editInput}
                value={editPlaceAddress}
                onChangeText={setEditPlaceAddress}
                placeholder="Nhập địa chỉ..."
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            <View style={styles.editModalFooter}>
              <TouchableOpacity
                style={styles.editCancelButton}
                onPress={() => setEditingPlace(null)}
              >
                <Text style={styles.editCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={handleSaveEdit}
              >
                <Text style={styles.editSaveText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Place Search Modal */}
      <Modal
        visible={isAddPlaceModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddPlaceModalVisible(false)}
      >
        <View style={styles.searchModalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.searchModalHeader}>
              <Text style={styles.searchModalTitle}>Thêm địa điểm</Text>
              <TouchableOpacity onPress={() => setIsAddPlaceModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={handleSearchQueryChange}
                placeholder="Tìm kiếm địa điểm..."
                placeholderTextColor={COLORS.textSecondary}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {isSearching && (
              <View style={styles.searchLoadingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.searchLoadingText}>Đang tìm kiếm...</Text>
              </View>
            )}

            {!isSearching && searchResults.length > 0 && (
              <ScrollView style={styles.searchResultsContainer} keyboardShouldPersistTaps="handled">
                {searchResults.map((prediction, index) => (
                  <TouchableOpacity
                    key={prediction.place_id}
                    style={[
                      styles.searchResultItem,
                      index === searchResults.length - 1 && styles.searchResultItemLast
                    ]}
                    onPress={() => handleSelectPlace(prediction)}
                  >
                    <Ionicons name="location-outline" size={20} color={COLORS.primary} style={styles.searchResultIcon} />
                    <View style={styles.searchResultTextContainer}>
                      <Text style={styles.searchResultMainText} numberOfLines={1}>
                        {prediction.structured_formatting?.main_text || prediction.description}
                      </Text>
                      <Text style={styles.searchResultSecondaryText} numberOfLines={1}>
                        {prediction.structured_formatting?.secondary_text || ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {!isSearching && searchQuery.length > 0 && searchResults.length === 0 && (
              <View style={styles.noResultsContainer}>
                <Ionicons name="search-outline" size={48} color={COLORS.textSecondary} />
                <Text style={styles.noResultsText}>Không tìm thấy kết quả</Text>
              </View>
            )}

            {!isSearching && searchQuery.length === 0 && (
              <View style={styles.searchHintContainer}>
                <Ionicons name="location-sharp" size={48} color={COLORS.primary} />
                <Text style={styles.searchHintText}>Nhập tên địa điểm để tìm kiếm</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgMain,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  
  // Map styles
  mapContainer: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  startMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.textWhite,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.textWhite,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  placeMarkerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  myLocationButton: {
    position: 'absolute',
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  fitMarkersButton: {
    position: 'absolute',
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  
  // Floating Header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  tripBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  tripBadgeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  
  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
  },
  
  // Day Tabs
  dayTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dayTabsContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dayTab: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    minWidth: 90,
    position: 'relative',
  },
  dayTabActive: {
    backgroundColor: COLORS.primary,
  },
  dayTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  dayTabTextActive: {
    color: COLORS.textWhite,
  },
  dayTabDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dayTabDateActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  dayTabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.error,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayTabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textWhite,
  },

  // Travel Mode Selector
  travelModeContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  travelModeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  travelModeOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  travelModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.borderLight,
  },
  travelModeOptionActive: {
    backgroundColor: COLORS.primary,
  },
  travelModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  travelModeTextActive: {
    color: COLORS.textWhite,
  },

  // Start Location Info
  startLocationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: `${COLORS.primary}10`,
    gap: SPACING.xs,
  },
  startLocationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  changeStartLocationBtn: {
    padding: SPACING.xs,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}20`,
  },

  // Selection Mode Header
  selectionModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: `${COLORS.primary}10`,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cancelSelectionBtn: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  cancelSelectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  selectionCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  selectAllBtn: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  // Places List
  placesListContainer: {
    flex: 1,
  },
  placesListContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  // Swipeable Place Card
  swipeableContainer: {
    position: 'relative',
    borderRadius: 16,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.bgMain,
  },
  draggingContainer: {
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH * 2,
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
  },
  editButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  editButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textWhite,
  },

  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  placeCardDragging: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    backgroundColor: COLORS.bgMain,
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  placeCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  placeIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  placeIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  placeInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  placeAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  placeCardDragHandle: {
    padding: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Add Place Card
  addPlaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  addPlaceIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPlaceText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Delete Selected Button
  deleteSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.error,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  deleteSelectedText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  
  // Confirm Button
  confirmContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },

  // Edit Modal Styles
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  editModalContent: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  editModalBody: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  editInput: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: COLORS.textMain,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  editModalFooter: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  editSaveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  editSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
  },

  // Search Modal Styles
  searchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: 60,
  },
  searchModalContent: {
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  searchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  searchModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.textMain,
  },
  searchLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  searchLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  searchResultsContainer: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  searchResultItemLast: {
    borderBottomWidth: 0,
  },
  searchResultIcon: {
    marginRight: SPACING.md,
  },
  searchResultTextContainer: {
    flex: 1,
  },
  searchResultMainText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  searchResultSecondaryText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  noResultsText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  searchHintContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  searchHintText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});

export default ManualPlaceSelectionScreen;
