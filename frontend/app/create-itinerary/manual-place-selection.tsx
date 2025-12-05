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
} from 'react-native';
import { FontAwesome, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const BOTTOM_SHEET_MIN_HEIGHT = SCREEN_HEIGHT * 0.35;
const SWIPE_THRESHOLD = 80;
const DELETE_BUTTON_WIDTH = 80;

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
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -DELETE_BUTTON_WIDTH));
        } else if (isSwipeOpenRef.current) {
          translateX.setValue(Math.min(gestureState.dx - DELETE_BUTTON_WIDTH, 0));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD / 2) {
          Animated.spring(translateX, {
            toValue: -DELETE_BUTTON_WIDTH,
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
      {/* Delete button behind */}
      <View style={styles.deleteButtonContainer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        >
          <Ionicons name="trash" size={24} color={COLORS.textWhite} />
          <Text style={styles.deleteButtonText}>Xóa</Text>
        </TouchableOpacity>
      </View>

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
  const [selectedDay, setSelectedDay] = useState(1);
  const [dayPlaces, setDayPlaces] = useState<DayPlaces>({});
  const [dayStartLocations, setDayStartLocations] = useState<{ [day: number]: { name: string; lat: number; lng: number } }>({});
  const [hasAskedStartLocation, setHasAskedStartLocation] = useState(false);
  
  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  
  // Drag state
  const [draggingPlaceId, setDraggingPlaceId] = useState<string | null>(null);

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
    // TODO: Navigate to place search/selection screen
    Alert.alert(
      'Thêm địa điểm',
      `Thêm địa điểm cho Ngày ${selectedDay}`,
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Thêm mẫu', 
          onPress: () => {
            const newPlace: Place = {
              id: `place_${Date.now()}`,
              name: `Địa điểm ${(dayPlaces[selectedDay]?.length || 0) + 1}`,
              address: `Địa chỉ mẫu tại ${tripInfo?.destination}`,
              type: 'attraction',
              lat: tripInfo?.currentLocationLat ? tripInfo.currentLocationLat + (Math.random() - 0.5) * 0.05 : undefined,
              lng: tripInfo?.currentLocationLng ? tripInfo.currentLocationLng + (Math.random() - 0.5) * 0.05 : undefined,
            };
            
            const isFirstPlaceEver = Object.values(dayPlaces).every(places => places.length === 0);
            
            setDayPlaces(prev => ({
              ...prev,
              [selectedDay]: [...(prev[selectedDay] || []), newPlace],
            }));
            
            // Ask about start location after first place is added
            if (isFirstPlaceEver && selectedDay === 1) {
              setTimeout(() => askAboutStartLocationForOtherDays(newPlace), 500);
            }
          }
        },
      ]
    );
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
              [selectedDay]: prev[selectedDay].filter(p => p.id !== placeId),
            }));
          },
        },
      ]
    );
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

  const handleConfirm = () => {
    // Check if at least one place is added
    const totalPlaces = Object.values(dayPlaces).reduce((sum, places) => sum + places.length, 0);
    if (totalPlaces === 0) {
      Alert.alert('Chưa có địa điểm', 'Vui lòng thêm ít nhất một địa điểm vào lộ trình');
      return;
    }
    
    // TODO: Navigate to next screen or save itinerary
    Alert.alert('Thành công', 'Lộ trình đã được tạo!');
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
                    [selectedDay]: prev[selectedDay].filter(p => p.id !== place.id),
                  }));
                }}
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
                          [selectedDay]: prev[selectedDay].filter(p => !selectedPlaceIds.has(p.id)),
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
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmButtonGradient}
              >
                <Text style={styles.confirmButtonText}>XÁC NHẬN LỘ TRÌNH</Text>
                <MaterialIcons name="check-circle" size={20} color={COLORS.textWhite} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
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
    overflow: 'hidden',
    borderRadius: 16,
    marginBottom: SPACING.sm,
  },
  draggingContainer: {
    zIndex: 999,
    opacity: 0.9,
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    gap: 4,
  },
  deleteButtonText: {
    fontSize: 12,
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
  },
  placeCardDragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    backgroundColor: COLORS.bgMain,
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
});

export default ManualPlaceSelectionScreen;
