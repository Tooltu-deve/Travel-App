import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, geocodeAddressAPI, enrichPlaceAPI } from '../../services/api';
import { POIDetailBottomSheet } from '../place/POIDetailBottomSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ItineraryItem {
  day: number;
  time: string;
  activity: string;
  place: {
    name: string;
    address?: string;
    googlePlaceId?: string;
    location?: { lat: number; lng: number };
    rating?: number;
  };
  duration_minutes?: number;
  notes?: string;
  encoded_polyline?: string; // Đường đi từ địa điểm này đến địa điểm tiếp theo
  travel_duration_minutes?: number; // Thời gian di chuyển (phút)
}

interface ItineraryDetailScreenProps {
  itinerary: ItineraryItem[];
  itineraryId: string;
  startLocation?: string | { lat: number; lng: number };
  itineraryStatus?: 'DRAFT' | 'CONFIRMED' | null;
  setItineraryStatus?: (status: 'DRAFT' | 'CONFIRMED') => void;
  onClose: () => void;
  onConfirmSuccess?: () => void;
  onSendMessage?: (message: string) => void;
}

export const ItineraryDetailScreen: React.FC<ItineraryDetailScreenProps> = ({
  itinerary,
  itineraryId,
  startLocation,
  itineraryStatus: parentItineraryStatus,
  setItineraryStatus: setParentItineraryStatus,
  onClose,
  onConfirmSuccess,
  onSendMessage,
}) => {
  const { token, signOut } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const mapRef = useRef<MapView>(null);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [geocodedStartLocation, setGeocodedStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocodingStart, setIsGeocodingStart] = useState(false);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [selectedPlaceData, setSelectedPlaceData] = useState<any>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  // State for polyline cache
  const [polylineCache, setPolylineCache] = useState<Record<string, string>>({});
  const [isFetchingPolylines, setIsFetchingPolylines] = useState(false);

  // Sử dụng state từ parent nếu có, nếu không thì sử dụng local state
  const itineraryStatus = parentItineraryStatus ?? null;
  const setItineraryStatus = setParentItineraryStatus || (() => { });

  // Debug: Log when component mounts or props change
  React.useEffect(() => {
    console.debug('[ItineraryDetailScreen] Mounted/Updated:', {
      hasItinerary: !!itinerary,
      itineraryId,
      itineraryLength: itinerary?.length,
      hasToken: !!token,
      itineraryStatus,
    });

    // Nếu không có itineraryStatus từ parent, fetch từ API
    if (!parentItineraryStatus) {
      const fetchItineraryStatus = async () => {
        if (!itineraryId || !token) return;
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/ai/itineraries/${itineraryId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            console.debug('[ItineraryDetailScreen] Fetched status:', data?.status);
            if (setParentItineraryStatus) {
              setParentItineraryStatus(data?.status || 'DRAFT');
            }
          }
        } catch (error) {
          console.error('[ItineraryDetailScreen] Error fetching status:', error);
        }
      };

      fetchItineraryStatus();
    }
  }, [itinerary, itineraryId, token, API_BASE_URL, parentItineraryStatus, setParentItineraryStatus]);

  // Geocode start location nếu là string
  React.useEffect(() => {
    if (!startLocation || !token) return;
    
    // Nếu đã là tọa độ object thì không cần geocode
    if (typeof startLocation === 'object' && startLocation.lat && startLocation.lng) {
      setGeocodedStartLocation(startLocation);
      return;
    }

    // Nếu là string thì geocode
    if (typeof startLocation === 'string' && startLocation.trim()) {
      setIsGeocodingStart(true);
      geocodeAddressAPI(token, startLocation)
        .then((result) => {
          setGeocodedStartLocation({ lat: result.lat, lng: result.lng });
          console.debug('[Geocode Start Location] Success:', result);
        })
        .catch((error) => {
          console.error('[Geocode Start Location] Error:', error);
        })
        .finally(() => {
          setIsGeocodingStart(false);
        });
    }
  }, [startLocation, token]);

  const confirmItinerary = async () => {
    console.debug('[Confirm Itinerary] Button pressed. itineraryId:', itineraryId, ', status:', itineraryStatus);

    if (itineraryStatus === 'CONFIRMED') {
      Alert.alert('Thông báo', 'Lộ trình này đã được xác nhận rồi!');
      return;
    }

    if (!itineraryId) {
      Alert.alert('Lỗi', 'Không có lộ trình để xác nhận');
      return;
    }

    Alert.alert(
      'Xác nhận lộ trình',
      'Sau khi xác nhận, lộ trình không thể chỉnh sửa thêm. Bạn có chắc chắn?',
      [
        { text: 'Hủy', onPress: () => { }, style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setIsConfirming(true);
            try {
              console.debug('[Confirm Itinerary] Starting with ID:', itineraryId);

              // Add timeout using AbortController
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds

              const response = await fetch(`${API_BASE_URL}/api/v1/ai/itineraries/${itineraryId}/confirm`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              if (response.status === 401) {
                signOut();
                return;
              }

              if (response.ok) {
                const data = await response.json();
                console.debug('[Confirm Itinerary] Success:', data);
                setItineraryStatus('CONFIRMED');
                Alert.alert(
                  'Thành công',
                  'Lộ trình đã được xác nhận!',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        onConfirmSuccess?.();
                        onClose();
                      },
                    },
                  ]
                );
              } else {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData?.message || `Lỗi: ${response.status}`;
                console.error('[Confirm Itinerary] Error:', errMsg);
                Alert.alert('Lỗi', String(errMsg));
              }
            } catch (error: any) {
              console.error('[Confirm Itinerary] Exception:', error);
              Alert.alert('Lỗi', 'Không thể xác nhận lộ trình. Vui lòng thử lại.');
            } finally {
              setIsConfirming(false);
            }
          },
          style: 'default',
        },
      ]
    );
  };

  // Handle activity press - enrich and show detail
  const handleActivityPress = async (activity: ItineraryItem) => {
    const googlePlaceId = activity.place?.googlePlaceId;
    
    if (!googlePlaceId) {
      Alert.alert('Thông báo', 'Địa điểm này chưa có Google Place ID.');
      return;
    }

    setIsEnriching(true);
    try {
      const userToken = token || await AsyncStorage.getItem('userToken');
      if (!userToken) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để xem chi tiết địa điểm.');
        return;
      }

      // Enrich place data
      const response = await enrichPlaceAPI(userToken, googlePlaceId, true);
      const enrichedData = response?.data || response;

      // Map to bottom sheet format
      const mappedPlaceData = {
        _id: enrichedData.googlePlaceId,
        googlePlaceId: enrichedData.googlePlaceId,
        name: enrichedData.name,
        address: enrichedData.address,
        formatted_address: enrichedData.address,
        description: enrichedData.description || enrichedData.editorialSummary,
        editorialSummary: enrichedData.editorialSummary,
        rating: enrichedData.rating,
        user_ratings_total: enrichedData.reviews?.length || 0,
        contactNumber: enrichedData.contactNumber,
        phone: enrichedData.contactNumber,
        websiteUri: enrichedData.websiteUri,
        website: enrichedData.websiteUri,
        photos: enrichedData.photos || [],
        reviews: enrichedData.reviews?.map((review: any) => {
          let authorName = 'Người dùng ẩn danh';
          if (review.authorAttributions) {
            if (Array.isArray(review.authorAttributions) && review.authorAttributions.length > 0) {
              const firstAttr = review.authorAttributions[0];
              authorName = firstAttr?.displayName || firstAttr?.name || 'Người dùng ẩn danh';
            } else if (typeof review.authorAttributions === 'object') {
              authorName = review.authorAttributions.displayName || review.authorAttributions.name || 'Người dùng ẩn danh';
            }
          }

          return {
            authorName,
            rating: review.rating,
            text: review.text,
            relativePublishTimeDescription: review.relativePublishTimeDescription,
            publishTime: review.relativePublishTimeDescription,
            authorAttributions: review.authorAttributions,
          };
        }) || [],
        type: enrichedData.type,
        types: enrichedData.types,
        location: enrichedData.location,
        openingHours: enrichedData.openingHours,
        emotionalTags: enrichedData.emotionalTags,
        budgetRange: enrichedData.budgetRange,
      };

      setSelectedPlaceData(mappedPlaceData);
      setIsBottomSheetVisible(true);
    } catch (error: any) {
      console.error('[Activity Detail] Error enriching POI:', error);
      Alert.alert(
        'Lỗi',
        error.message || 'Không thể tải thông tin chi tiết địa điểm. Vui lòng thử lại.'
      );
    } finally {
      setIsEnriching(false);
    }
  };

  // Decode polyline helper
  const decodePolyline = (encoded?: string) => {
    if (!encoded) return [];
    const points: { latitude: number; longitude: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  // Convert to map coordinate
  const toMapCoordinate = (point?: { lat: number; lng: number }) => {
    if (!point) return null;
    return { latitude: point.lat, longitude: point.lng };
  };

  // Calculate map region
  const calculateMapRegion = (items: ItineraryItem[]) => {
    const coords: { latitude: number; longitude: number }[] = [];

    // Thêm start location vào coords
    if (geocodedStartLocation) {
      coords.push({
        latitude: geocodedStartLocation.lat,
        longitude: geocodedStartLocation.lng,
      });
    }

    items.forEach((item) => {
      if (item.place?.location) {
        const coord = toMapCoordinate(item.place.location);
        if (coord) coords.push(coord);
      }
    });

    if (coords.length === 0) return null;

    const latitudes = coords.map((c) => c.latitude);
    const longitudes = coords.map((c) => c.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = (maxLat - minLat) * 1.5 || 0.01;
    const lngDelta = (maxLng - minLng) * 1.5 || 0.01;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  // Group items by day
  const itemsByDay = itinerary.reduce((acc, item) => {
    if (!acc[item.day]) {
      acc[item.day] = [];
    }
    acc[item.day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>);

  const sortedDays = Object.keys(itemsByDay)
    .map(Number)
    .sort((a, b) => a - b);

  // Current day items for map
  const currentDayItems = itemsByDay[selectedDay] || [];

  // Update map region when day changes in map view
  useEffect(() => {
    if (viewMode === 'map' && currentDayItems.length > 0) {
      const region = calculateMapRegion(currentDayItems);
      if (region) {
        setMapRegion(region);
        setTimeout(() => {
          mapRef.current?.animateToRegion(region, 500);
        }, 100);
      }

      // Fetch polylines if not in cache
      fetchMissingPolylines(currentDayItems);
    }
  }, [selectedDay, viewMode, geocodedStartLocation]);

  // Fetch polylines from Google Directions API if missing
  const fetchMissingPolylines = async (items: ItineraryItem[]) => {
    const GOOGLE_DIRECTIONS_KEY = 'AIzaSyAb4tPeMWhN_QwLTNETq9Rob9tYzy_5SJI';
    
    for (let i = 0; i < items.length - 1; i++) {
      const currentItem = items[i];
      const nextItem = items[i + 1];
      
      const cacheKey = `${currentItem.place?.location?.lat},${currentItem.place?.location?.lng}-${nextItem.place?.location?.lat},${nextItem.place?.location?.lng}`;
      
      // Skip if already in cache or already has polyline
      if (polylineCache[cacheKey] || (currentItem as any).encoded_polyline) {
        continue;
      }

      const currentLoc = currentItem.place?.location;
      const nextLoc = nextItem.place?.location;

      if (!currentLoc || !nextLoc) continue;

      try {
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLoc.lat},${currentLoc.lng}&destination=${nextLoc.lat},${nextLoc.lng}&mode=driving&key=${GOOGLE_DIRECTIONS_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const polyline = data.routes[0].overview_polyline?.points;
          if (polyline) {
            setPolylineCache(prev => ({
              ...prev,
              [cacheKey]: polyline
            }));
            console.log(`[Polyline Fetched] ${currentItem.place.name} -> ${nextItem.place.name}`);
          }
        }
      } catch (error) {
        console.error(`[Polyline Error] Failed to fetch route:`, error);
      }
    }
  };

  // Fit to markers
  const handleFitToMarkers = () => {
    const coords: { latitude: number; longitude: number }[] = [];

    // Thêm start location vào coords
    if (geocodedStartLocation) {
      coords.push({
        latitude: geocodedStartLocation.lat,
        longitude: geocodedStartLocation.lng,
      });
    }

    currentDayItems.forEach((item) => {
      if (item.place?.location) {
        const coord = toMapCoordinate(item.place.location);
        if (coord) coords.push(coord);
      }
    });

    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
        animated: true,
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
    <LinearGradient
      colors={['#e6f6ff', 'rgba(178, 221, 247, 1)']}
      locations={[0, 1]}
      style={styles.gradientBackground}
    >
        {/* Header */}
        <BlurView intensity={90} tint="light" style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={28} color={COLORS.textMain} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chi tiết lộ trình</Text>
            
            {/* View Mode Toggle */}
            <View style={styles.viewModeToggle}>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
                onPress={() => setViewMode('list')}
              >
                <MaterialCommunityIcons 
                  name="format-list-bulleted" 
                  size={20} 
                  color={viewMode === 'list' ? COLORS.textWhite : COLORS.textSecondary} 
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === 'map' && styles.viewModeButtonActive]}
                onPress={() => setViewMode('map')}
              >
                <MaterialCommunityIcons 
                  name="map-outline" 
                  size={20} 
                  color={viewMode === 'map' ? COLORS.textWhite : COLORS.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>

        {/* Content - Conditional rendering based on viewMode */}
        {viewMode === 'list' ? (
          /* List View */
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {sortedDays.map((day) => (
            <View key={`day-${day}`} style={styles.daySection}>
              {/* Day Header */}
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dayHeaderGradient}
              >
                <MaterialCommunityIcons name="calendar-today" size={20} color={COLORS.textWhite} />
                <Text style={styles.dayHeaderText}>Ngày {day}</Text>
              </LinearGradient>

              {/* Items for this day */}
              <View style={styles.dayItems}>
                {itemsByDay[day].map((item, idx) => (
                  <View key={`item-${day}-${idx}`} style={styles.itemWrapper}>
                    {/* Timeline dot */}
                    <View style={styles.timelineContainer}>
                      <View style={styles.timelineDot} />
                      {idx < itemsByDay[day].length - 1 && <View style={styles.timelineLine} />}
                    </View>

                    {/* Item card */}
                    <View style={styles.itemCard}>
                      {/* Time and Activity */}
                      <View style={styles.itemHeader}>
                        <View style={styles.timeActivity}>
                          <Text style={styles.timeText}>⏰ {item.time}</Text>
                          <Text style={styles.activityText}>{item.activity}</Text>
                        </View>
                        {item.duration_minutes && (
                          <View style={styles.durationBadge}>
                            <Text style={styles.durationText}>{item.duration_minutes} phút</Text>
                          </View>
                        )}
                      </View>

                      {/* Place details */}
                      <View style={styles.placeSection}>
                        <View style={styles.placeName}>
                          <MaterialCommunityIcons name="map-marker" size={18} color={COLORS.primary} />
                          <Text style={styles.placeNameText} numberOfLines={2}>
                            {item.place.name}
                          </Text>
                        </View>

                        {item.place.address && (
                          <View style={styles.placeAddress}>
                            <MaterialCommunityIcons
                              name="home-map-marker"
                              size={16}
                              color={COLORS.textSecondary}
                            />
                            <Text style={styles.placeAddressText} numberOfLines={2}>
                              {item.place.address}
                            </Text>
                          </View>
                        )}

                        {item.place.rating && (
                          <View style={styles.ratingContainer}>
                            <MaterialCommunityIcons name="star" size={14} color="#FFB800" />
                            <Text style={styles.ratingText}>{item.place.rating.toFixed(1)}</Text>
                          </View>
                        )}
                      </View>

                      {/* Notes */}
                      {item.notes && (
                        <View style={styles.notesSection}>
                          <MaterialCommunityIcons name="note-text" size={16} color={COLORS.primary} />
                          <Text style={styles.notesText}>{item.notes}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Summary */}
          <View style={styles.summarySection}>
            <LinearGradient
              colors={[COLORS.primary + '15', COLORS.gradientSecondary + '15']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="calendar-range" size={20} color={COLORS.primary} />
                <Text style={styles.summaryText}>
                  {sortedDays.length} ngày / {itinerary.length} hoạt động
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.primary} />
                <Text style={styles.summaryText}>
                  Tổng thời gian:{' '}
                  {itinerary.reduce((sum, item) => sum + (item.duration_minutes || 0), 0)} phút
                </Text>
              </View>
            </LinearGradient>
          </View>
        </ScrollView>
        ) : (
          /* Map View - All in One Container */
          <LinearGradient
            colors={['#e6f6ff', '#ccecff']}
            locations={[0, 1]}
            style={styles.mapViewContainer}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.mapViewContent}
            >
              {/* Map Container */}
              <View style={styles.mapContainer}>
                {mapRegion && (
                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={styles.map}
                    initialRegion={mapRegion}
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    showsCompass={true}
                    toolbarEnabled={false}
                  >
                {/* Start Location Marker */}
                {geocodedStartLocation && (
                  <Marker
                    coordinate={{
                      latitude: geocodedStartLocation.lat,
                      longitude: geocodedStartLocation.lng,
                    }}
                    title="Điểm xuất phát"
                  >
                    <View style={styles.startMarker}>
                      <MaterialCommunityIcons name="map-marker-check" size={16} color={COLORS.textWhite} />
                    </View>
                  </Marker>
                )}

                {/* Markers for activities */}
                {currentDayItems.map((item, index) => {
                  const coord = item.place?.location ? toMapCoordinate(item.place.location) : null;
                  if (!coord) return null;

                  return (
                    <Marker
                      key={`marker-${index}`}
                      coordinate={coord}
                      title={item.place.name}
                      description={item.activity}
                    >
                      <View style={styles.marker}>
                        <Text style={styles.markerText}>{index + 1}</Text>
                      </View>
                    </Marker>
                  );
                })}

                {/* Route polylines with decoded paths */}
                {currentDayItems.map((item, index) => {
                  if (index === currentDayItems.length - 1) return null;

                  const nextItem = currentDayItems[index + 1];
                  const currentLoc = item.place?.location;
                  const nextLoc = nextItem.place?.location;

                  if (!currentLoc || !nextLoc) return null;

                  // Try to get polyline from backend first, then cache
                  const cacheKey = `${currentLoc.lat},${currentLoc.lng}-${nextLoc.lat},${nextLoc.lng}`;
                  const encodedPolyline = (item as any).encoded_polyline || polylineCache[cacheKey];
                  
                  // Debug: Log encoded_polyline status
                  if (index === 0) {
                    console.log(`[Map] Day ${selectedDay} - Total items: ${currentDayItems.length}`);
                    currentDayItems.forEach((it, idx) => {
                      const cKey = idx < currentDayItems.length - 1 
                        ? `${it.place?.location?.lat},${it.place?.location?.lng}-${currentDayItems[idx + 1]?.place?.location?.lat},${currentDayItems[idx + 1]?.place?.location?.lng}`
                        : null;
                      const hasCached = cKey ? !!polylineCache[cKey] : false;
                      console.log(`[Map] Item ${idx + 1}: ${it.place?.name}, has backend polyline: ${!!(it as any).encoded_polyline}, cached: ${hasCached}`);
                    });
                  }
                  
                  if (!encodedPolyline) return null;

                  const routeCoords = decodePolyline(encodedPolyline);
                  if (routeCoords.length < 2) return null;

                  return (
                    <React.Fragment key={`route-${index}`}>
                      {/* Main route line */}
                      <Polyline
                        coordinates={routeCoords}
                        strokeColor={COLORS.primary}
                        strokeWidth={4}
                        lineJoin="round"
                        lineCap="round"
                      />
                      {/* Glow effect */}
                      <Polyline
                        coordinates={routeCoords}
                        strokeColor={COLORS.primary + '40'}
                        strokeWidth={8}
                        lineJoin="round"
                        lineCap="round"
                      />
                    </React.Fragment>
                  );
                })}
              </MapView>
            )}

            {/* Map Controls */}
            <View style={styles.mapControls}>
              <TouchableOpacity style={styles.mapControlButton} onPress={handleFitToMarkers}>
                <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Day Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {sortedDays.map((day) => (
              <TouchableOpacity
                key={`tab-${day}`}
                style={[styles.tab, selectedDay === day && styles.tabActive]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.tabText, selectedDay === day && styles.tabTextActive]}>
                  Ngày {day}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Activities List for Selected Day */}
          <View style={styles.activitiesSection}>
              {currentDayItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="calendar-blank" size={48} color={COLORS.textSecondary} />
                  <Text style={styles.emptyStateText}>Không có hoạt động</Text>
                </View>
              ) : (
                currentDayItems.map((item, index) => (
                  <React.Fragment key={`activity-${index}`}>
                    <TouchableOpacity 
                      style={styles.activityCard}
                      onPress={() => handleActivityPress(item)}
                      disabled={isEnriching}
                      activeOpacity={0.7}
                    >
                      <View style={styles.cardContent}>
                        {/* Number Badge */}
                        <View style={styles.numberBadge}>
                          <LinearGradient
                            colors={[COLORS.primary, COLORS.gradientSecondary]}
                            style={styles.numberBadgeGradient}
                          >
                            <Text style={styles.numberBadgeText}>{index + 1}</Text>
                          </LinearGradient>
                        </View>

                        {/* Card Info */}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>{item.place.name}</Text>
                          <View style={styles.cardRow}>
                            <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.primary} />
                            <Text style={styles.cardTime}>⏰ {item.time}</Text>
                            {item.duration_minutes && (
                              <Text style={styles.cardTime}> • {item.duration_minutes} phút</Text>
                            )}
                          </View>
                          {item.place.rating && (
                            <View style={styles.cardRow}>
                              <MaterialCommunityIcons name="star" size={14} color="#FFB800" />
                              <Text style={styles.cardRating}>{item.place.rating.toFixed(1)}</Text>
                            </View>
                          )}
                        </View>

                        {/* Arrow */}
                        <View style={styles.cardArrow}>
                          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Travel Time Indicator */}
                    {index < currentDayItems.length - 1 && (
                      <View style={styles.travelTimeIndicator}>
                        <View style={styles.travelDashedLine} />
                        <View style={styles.travelTimebadge}>
                          <MaterialCommunityIcons name="car" size={12} color={COLORS.primary} />
                          <Text style={styles.travelTimeBadgeText}>Di chuyển</Text>
                        </View>
                        <View style={styles.travelDashedLine} />
                      </View>
                    )}
                  </React.Fragment>
                ))
              )}
            </View>
          </ScrollView>
        </LinearGradient>
        )}

        {/* Confirm Button */}
        <BlurView intensity={80} tint="light" style={styles.bottomContainer}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (isConfirming || itineraryStatus === 'CONFIRMED') && styles.confirmButtonDisabled,
            ]}
            onPress={confirmItinerary}
            disabled={isConfirming || itineraryStatus === 'CONFIRMED'}
          >
            <LinearGradient
              colors={
                isConfirming || itineraryStatus === 'CONFIRMED'
                  ? [COLORS.disabled, COLORS.disabled]
                  : [COLORS.primary, COLORS.gradientSecondary]
              }
              style={styles.confirmButtonGradient}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color={COLORS.textWhite} />
              ) : itineraryStatus === 'CONFIRMED' ? (
                <>
                  <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.textWhite} />
                  <Text style={styles.confirmButtonText}>Đã xác nhận</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.textWhite} />
                  <Text style={styles.confirmButtonText}>Xác nhận lộ trình</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </BlurView>

        {/* POI Detail Bottom Sheet */}
        <POIDetailBottomSheet
          visible={isBottomSheetVisible}
          placeData={selectedPlaceData}
          onClose={() => {
            setIsBottomSheetVisible(false);
            setSelectedPlaceData(null);
          }}
        />
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  gradientBackground: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    letterSpacing: 0.3,
    flex: 1,
    textAlign: 'center',
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgLight,
    borderRadius: 8,
    padding: 2,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewModeButtonActive: {
    backgroundColor: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
  },
  daySection: {
    marginBottom: 24,
  },
  dayHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  dayHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.3,
  },
  dayItems: {
    gap: 12,
  },
  itemWrapper: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineContainer: {
    width: 40,
    alignItems: 'center',
    paddingTop: 8,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.bgMain,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.primary + '40',
    marginTop: 4,
  },
  itemCard: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  timeActivity: {
    flex: 1,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
  },
  activityText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    lineHeight: 20,
  },
  durationBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  placeSection: {
    gap: 8,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight + '50',
  },
  placeName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeNameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
    lineHeight: 18,
  },
  placeAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  placeAddressText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFB800',
  },
  notesSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight + '50',
  },
  notesText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  summarySection: {
    marginTop: 16,
    marginBottom: 24,
  },
  summaryCard: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMain,
    lineHeight: 18,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    zIndex: 20,
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.3,
  },
  confirmButtonDisabled: {
    shadowOpacity: 0.1,
    elevation: 1,
  },
  // Map View Styles - New Design
  mapViewContainer: {
    flex: 1,
  },
  mapViewContent: {
    paddingBottom: 120, // Space for confirm button
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.35,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: SPACING.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bgMain,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  startMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bgMain,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: 'bold',
  },
  tabsContainer: {
    backgroundColor: 'transparent',
    paddingVertical: SPACING.md,
    paddingHorizontal: 0,
  },
  tabsScrollContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  tab: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.lg,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  tabTextActive: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  activitiesSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  emptyState: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyStateText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  travelTimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  travelDashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  travelTimebadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs / 2,
    backgroundColor: COLORS.primary + '15',
    borderRadius: SPACING.lg,
    marginHorizontal: SPACING.sm,
  },
  travelTimeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  activityCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.primary + '10',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  numberBadgeGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadgeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textWhite,
  },
  cardInfo: {
    flex: 1,
    gap: SPACING.xs / 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: 0.2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardTime: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  cardRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFB800',
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ItineraryDetailScreen;
