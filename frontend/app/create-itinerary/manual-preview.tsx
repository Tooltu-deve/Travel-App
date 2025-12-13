// ManualPreviewScreen - Trang preview lộ trình thủ công với bản đồ và bottom sheet
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  Animated,
  PanResponder,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';
import { SPACING, BORDER_RADIUS } from '@/constants/spacing';
import { calculateRoutesAPI, autocompletePlacesAPI, updateCustomItineraryStatusAPI, getLikedPlacesAPI, getPlaceByIdAPI } from '../../services/api';
import WeatherWarningModal, { WeatherSeverity } from '../../components/WeatherWarningModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MIN_HEIGHT = 250;
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;

// Debounce delay cho autocomplete (ms)
const AUTOCOMPLETE_DELAY = 500;

interface ManualPreviewParams {
  startDate: string;
  endDate: string;
  destination: string;
  durationDays: string;
  currentLocationText: string;
}

interface PlaceItem {
  id: string;
  name: string;
  address: string;
  placeId: string;
  location: { lat: number; lng: number };
}

interface DayItinerary {
  day: number;
  date: Date;
  places: PlaceItem[];
}

export default function ManualPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as ManualPreviewParams;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  
  // Parse params - use useMemo to prevent recreating Date objects on every render
  const startDate = useMemo(() => new Date(params.startDate), [params.startDate]);
  const endDate = useMemo(() => new Date(params.endDate), [params.endDate]);
  const destination = params.destination;
  const durationDays = useMemo(() => parseInt(params.durationDays || '1'), [params.durationDays]);
  const currentLocationText = params.currentLocationText || '';

  // State
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [itinerary, setItinerary] = useState<DayItinerary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Store travelMode for each day: { dayNumber: travelMode }
  const [travelModes, setTravelModes] = useState<Record<number, 'driving' | 'bicycling' | 'walking' | 'transit'>>({});
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routePolylines, setRoutePolylines] = useState<Array<{ latitude: number; longitude: number }[]>>([]);
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  // Add place modal
  const [isAddPlaceModalVisible, setIsAddPlaceModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [favoritesPlaces, setFavoritesPlaces] = useState<any[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [isUsingFavorites, setIsUsingFavorites] = useState(false);
  
  // Multi-select delete mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(new Set());
  
  // Swipe delete
  const [swipedPlaceId, setSwipedPlaceId] = useState<string | null>(null);
  
  // Bottom sheet animation
  const bottomSheetHeight = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);

  // Debounce timer ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Preview saved itinerary
  const [savedRouteData, setSavedRouteData] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // Input title modal
  const [showTitleInputModal, setShowTitleInputModal] = useState(false);
  const [routeIdToConfirm, setRouteIdToConfirm] = useState<string | null>(null);
  const [itineraryTitle, setItineraryTitle] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Weather warning state
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [weatherSeverity, setWeatherSeverity] = useState<WeatherSeverity>('normal');
  const [weatherAlert, setWeatherAlert] = useState<string>('');
  const [pendingRouteData, setPendingRouteData] = useState<any>(null);

  // Generate unique session token (not in useCallback to avoid dependency issues)
  const generateSessionToken = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Initialize session token once on mount
  useEffect(() => {
    setSessionToken(generateSessionToken());
  }, []); // Empty dependency array - run only once

  // Initialize itinerary with empty days and default travelMode for each day
  useEffect(() => {
    const days: DayItinerary[] = [];
    const modes: Record<number, 'driving' | 'bicycling' | 'walking' | 'transit'> = {};
    for (let i = 0; i < durationDays; i++) {
      const dayNumber = i + 1;
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + i);
      days.push({
        day: dayNumber,
        date: dayDate,
        places: [],
      });
      // Set default travelMode for each day (default: driving)
      modes[dayNumber] = 'driving';
    }
    setItinerary(days);
    setTravelModes(modes);
  }, [durationDays, startDate]);

  // Format date
  const formatDate = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  };

  const formatFullDate = (date: Date): string => {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${dayName}, ${day}/${month}`;
  };

  // Geocode destination and start location on mount
  useEffect(() => {
    const geocodeLocations = async () => {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
      if (!apiKey) return;

      try {
        // Geocode destination
        const destUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination + ', Vietnam')}&key=${apiKey}`;
        const destResponse = await fetch(destUrl);
        const destData = await destResponse.json();

        if (destData.status === 'OK' && destData.results && destData.results.length > 0) {
          const location = destData.results[0].geometry.location;
          setDestinationCoords({ lat: location.lat, lng: location.lng });
        }

        // Geocode start location
        if (currentLocationText) {
          const startUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(currentLocationText + ', Vietnam')}&key=${apiKey}`;
          const startResponse = await fetch(startUrl);
          const startData = await startResponse.json();

          if (startData.status === 'OK' && startData.results && startData.results.length > 0) {
            const location = startData.results[0].geometry.location;
            setStartLocationCoords({ lat: location.lat, lng: location.lng });
          }
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      }
    };

    geocodeLocations();
  }, [destination, currentLocationText]);

  // Get map region based on current places
  const getMapRegion = () => {
    const currentDayPlaces = itinerary[selectedDay - 1]?.places || [];
    
    if (currentDayPlaces.length === 0 && destinationCoords) {
      return {
        latitude: destinationCoords.lat,
        longitude: destinationCoords.lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }

    if (currentDayPlaces.length === 0) {
      // Default to Vietnam center
      return {
        latitude: 16.0471,
        longitude: 108.2062,
        latitudeDelta: 10,
        longitudeDelta: 10,
      };
    }

    const lats = currentDayPlaces.map(p => p.location.lat);
    const lngs = currentDayPlaces.map(p => p.location.lng);
    
    // Include destination coords if available
    if (destinationCoords) {
      lats.push(destinationCoords.lat);
      lngs.push(destinationCoords.lng);
    }

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.05),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.05),
    };
  };

  // Decode polyline helper
  const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
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

  // Fetch directions and update polylines
  const fetchDirections = async (places: PlaceItem[]) => {
    if (places.length === 0) {
      setRoutePolylines([]);
      return;
    }

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) return;

    try {
      const polylines: { latitude: number; longitude: number }[][] = [];
      
      // Get all waypoints including start location
      const waypoints: { lat: number; lng: number }[] = [];
      
      // Add start location as first point
      if (startLocationCoords) {
        waypoints.push(startLocationCoords);
      }
      
      // Add all places
      places.forEach(place => {
        if (place.location.lat !== 0 || place.location.lng !== 0) {
          waypoints.push(place.location);
        }
      });

      // Fetch directions between consecutive waypoints
      for (let i = 0; i < waypoints.length - 1; i++) {
        const origin = waypoints[i];
        const destination = waypoints[i + 1];
        
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.routes && data.routes[0]) {
          const encodedPolyline = data.routes[0].overview_polyline.points;
          const decodedPoints = decodePolyline(encodedPolyline);
          polylines.push(decodedPoints);
        }
      }

      setRoutePolylines(polylines);
    } catch (error) {
      console.error('Fetch directions error:', error);
    }
  };

  // Update routes when places change
  useEffect(() => {
    const currentDayPlaces = itinerary[selectedDay - 1]?.places || [];
    // Chỉ fetch directions nếu thực sự có places hoặc startLocationCoords thay đổi
    if (currentDayPlaces.length > 0 || startLocationCoords) {
      fetchDirections(currentDayPlaces);
    } else {
      setRoutePolylines([]);
    }
  }, [itinerary, selectedDay, startLocationCoords]);

  // Backend Autocomplete search
  const searchPlaces = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      // Reset session token when query is cleared
      setSessionToken(generateSessionToken());
      return;
    }

    try {
      setIsSearching(true);
      
      // Get token from AsyncStorage
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');
      
      // Use backend autocomplete API with token
      const data = await autocompletePlacesAPI(query, sessionToken, undefined, token || undefined);

      // Backend returns array directly, not wrapped in predictions
      if (data && Array.isArray(data)) {
        setSearchResults(data);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search places error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    
    // Clear existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // If favorites mode is on
    if (isUsingFavorites) {
      if (!text.trim()) {
        // Show all favorites when input is empty
        setSearchResults(favoritesPlaces);
        return;
      } else {
        // Filter favorites based on search text
        const filteredFavorites = favoritesPlaces.filter(fav =>
          fav.description.toLowerCase().includes(text.toLowerCase()) ||
          fav.structured_formatting?.main_text?.toLowerCase().includes(text.toLowerCase()) ||
          fav.structured_formatting?.secondary_text?.toLowerCase().includes(text.toLowerCase())
        );
        setSearchResults(filteredFavorites);
        return;
      }
    }

    // Normal autocomplete mode
    if (!text.trim()) {
      setSearchResults([]);
      setSessionToken(generateSessionToken());
      return;
    }

    // Set new timer for debounced search
    searchTimerRef.current = setTimeout(() => {
      searchPlaces(text);
    }, AUTOCOMPLETE_DELAY);
  };

  // Toggle favorites mode for autocomplete
  const toggleFavoritesMode = async () => {
    if (isUsingFavorites) {
      // Turn off favorites mode
      setIsUsingFavorites(false);
      setSearchResults([]);
      setSearchQuery('');
    } else {
      // Turn on favorites mode
      if (favoritesPlaces.length === 0) {
        // Load favorites if not loaded yet
        try {
          setIsLoadingFavorites(true);
          const token = await AsyncStorage.getItem('userToken');
          if (!token) {
            Alert.alert('Lỗi', 'Bạn cần đăng nhập để tải địa điểm yêu thích.');
            return;
          }

          const favorites = await getLikedPlacesAPI(token);
          if (favorites && Array.isArray(favorites)) {
            // Transform favorites to match autocomplete format
            // Enrich with full place details
            const enrichedFavorites = await Promise.all(
              favorites.map(async (fav, index) => {
                try {
                  const placeDetails = await getPlaceByIdAPI(fav.place_id);
                  return {
                    description: placeDetails.name + (placeDetails.address ? `, ${placeDetails.address}` : ''),
                    place_id: `fav-${fav.place_id}-${index}`,
                    structured_formatting: {
                      main_text: placeDetails.name,
                      secondary_text: placeDetails.address || '',
                    },
                    // Add marker to identify as favorite
                    isFavorite: true,
                    rating: placeDetails.rating,
                    // Store location for map display
                    location: placeDetails.location,
                    // Store original data for later use
                    originalData: fav,
                  };
                } catch (error) {
                  console.warn('Failed to enrich favorite place:', fav.place_id, error);
                  // Fallback to basic info
                  return {
                    description: `Địa điểm ${fav.place_id}`,
                    place_id: `fav-${fav.place_id}-${index}`,
                    structured_formatting: {
                      main_text: `Địa điểm ${fav.place_id}`,
                      secondary_text: '',
                    },
                    isFavorite: true,
                    rating: null,
                    originalData: fav,
                  };
                }
              })
            );
            
            setFavoritesPlaces(enrichedFavorites);
            setSearchResults(enrichedFavorites);
            setIsUsingFavorites(true);
            // Reset search query to trigger display of all favorites
            setSearchQuery('');
          }
        } catch (error) {
          console.error('Load favorites error:', error);
          Alert.alert('Lỗi', 'Không thể tải địa điểm yêu thích.');
          return;
        } finally {
          setIsLoadingFavorites(false);
        }
      } else {
        // Use already loaded favorites
        setIsUsingFavorites(true);
        setSearchResults(favoritesPlaces);
        // Reset search query to trigger display of all favorites
        setSearchQuery('');
      }
    }
  };

  // Get place details and add to itinerary
  const handleSelectPlace = async (prediction: any) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
    
    try {
      setIsLoading(true);
      
      let mainText: string;
      let fullAddress: string;
      let placeId: string;
      let latitude = 0;
      let longitude = 0;
      
      if (prediction.isFavorite) {
        // Handle favorite place - data already enriched
        mainText = prediction.structured_formatting?.main_text || prediction.description.split(',')[0].trim();
        fullAddress = prediction.structured_formatting?.secondary_text || prediction.description;
        placeId = prediction.place_id;
        
        // Use coordinates from enriched data if available, otherwise geocode
        if (prediction.location?.coordinates) {
          longitude = prediction.location.coordinates[0];
          latitude = prediction.location.coordinates[1];
        } else if (apiKey && fullAddress) {
          try {
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
            const response = await fetch(geocodeUrl);
            const data = await response.json();
            
            if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
              latitude = data.results[0].geometry.location.lat;
              longitude = data.results[0].geometry.location.lng;
            }
          } catch (geoError) {
            console.warn('Geocoding for favorite place failed:', geoError);
          }
        }
      } else {
        // Handle autocomplete prediction
        mainText = prediction.structured_formatting?.main_text || prediction.description;
        fullAddress = prediction.description;
        placeId = prediction.place_id;
        
        // Try to get coordinates for map display
        if (apiKey && prediction.place_id) {
          try {
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${prediction.place_id}&key=${apiKey}`;
            const response = await fetch(geocodeUrl);
            const data = await response.json();
            
            if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
              latitude = data.results[0].geometry.location.lat;
              longitude = data.results[0].geometry.location.lng;
            }
          } catch (geoError) {
            console.warn('Geocoding for display failed, will use 0,0 for map:', geoError);
          }
        }
      }
      
      // Add place to itinerary
      const newPlace: PlaceItem = {
        id: `${placeId}-${Date.now()}`,
        name: mainText,
        address: fullAddress,
        placeId: placeId,
        location: {
          lat: latitude,
          lng: longitude,
        },
      };

      // Add to current day
      setItinerary(prev => {
        const updated = [...prev];
        updated[selectedDay - 1] = {
          ...updated[selectedDay - 1],
          places: [...updated[selectedDay - 1].places, newPlace],
        };
        return updated;
      });

      // Reset search and generate new session token for next search
      setSearchQuery('');
      setSearchResults([]);
      setSessionToken(generateSessionToken());
      setIsAddPlaceModalVisible(false);
      
      // Animate map to show new place if coordinates are available
      if (latitude !== 0 && longitude !== 0 && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 500);
      }
    } catch (error) {
      console.error('Add place error:', error);
      Alert.alert('Lỗi', 'Không thể thêm địa điểm. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete single place
  const handleDeletePlace = (placeId: string) => {
    Alert.alert(
      'Xóa địa điểm',
      'Bạn có chắc chắn muốn xóa địa điểm này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            setItinerary(prev => {
              const updated = [...prev];
              updated[selectedDay - 1] = {
                ...updated[selectedDay - 1],
                places: updated[selectedDay - 1].places.filter(p => p.id !== placeId),
              };
              return updated;
            });
            setSwipedPlaceId(null);
          },
        },
      ]
    );
  };

  // Toggle place selection for multi-delete
  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        newSet.delete(placeId);
      } else {
        newSet.add(placeId);
      }
      return newSet;
    });
  };

  // Delete selected places
  const handleDeleteSelectedPlaces = () => {
    if (selectedPlaces.size === 0) return;

    Alert.alert(
      'Xóa các địa điểm đã chọn',
      `Bạn có chắc chắn muốn xóa ${selectedPlaces.size} địa điểm?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            setItinerary(prev => {
              const updated = [...prev];
              updated[selectedDay - 1] = {
                ...updated[selectedDay - 1],
                places: updated[selectedDay - 1].places.filter(p => !selectedPlaces.has(p.id)),
              };
              return updated;
            });
            setSelectedPlaces(new Set());
            setIsMultiSelectMode(false);
          },
        },
      ]
    );
  };

  // Exit multi-select mode
  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedPlaces(new Set());
  };

  // Handle long press on place
  const handleLongPressPlace = (placeId: string) => {
    setIsMultiSelectMode(true);
    setSelectedPlaces(new Set([placeId]));
  };

  // Toggle bottom sheet expansion
  const toggleBottomSheet = () => {
    const toValue = isBottomSheetExpanded ? BOTTOM_SHEET_MIN_HEIGHT : BOTTOM_SHEET_MAX_HEIGHT;
    Animated.spring(bottomSheetHeight, {
      toValue,
      useNativeDriver: false,
      friction: 8,
    }).start();
    setIsBottomSheetExpanded(!isBottomSheetExpanded);
  };

  // Save itinerary via backend API
  const handleSaveItinerary = async () => {
    // Check if there are any places
    const totalPlaces = itinerary.reduce((sum, day) => sum + day.places.length, 0);
    if (totalPlaces === 0) {
      Alert.alert('Thông báo', 'Vui lòng thêm ít nhất một địa điểm vào lộ trình.');
      return;
    }

    setIsSaving(true);
    try {
      // Import AsyncStorage dynamically to avoid import issues
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để lưu lộ trình.');
        router.replace('/(auth)/login');
        return;
      }

      // Prepare payload for backend API
      const payload = {
        destination: destination,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        optimize: false,
        startLocationText: currentLocationText,
        days: itinerary.map((day) => {
          // Calculate start location for each day:
          // Day 1: Use current location text
          // Other days: Use last place of previous day, or fallback to current location
          let dayStartLocation = currentLocationText;
          if (day.day > 1) {
            const previousDay = itinerary[day.day - 2];
            if (previousDay && previousDay.places.length > 0) {
              const lastPlace = previousDay.places[previousDay.places.length - 1];
              dayStartLocation = lastPlace.address || currentLocationText;
            }
          }

          return {
          dayNumber: day.day,
            travelMode: travelModes[day.day] || 'driving', // Get travelMode for this specific day
            startLocation: dayStartLocation,
          places: day.places.map((place) => ({
            placeId: place.placeId,
            name: place.name,
            address: place.address,
        })),
          };
        }),
      };

      // Call backend API to calculate routes and save
      const result = await calculateRoutesAPI(payload, token);

      // Kiểm tra cảnh báo thời tiết từ backend custom-itinerary
      const alerts = result?.alerts;
      if (Array.isArray(alerts) && alerts.length > 0) {
        const firstAlert = alerts[0];
        setWeatherSeverity(firstAlert.severity === 'danger' ? 'danger' : firstAlert.severity === 'warning' ? 'warning' : 'normal');
        setWeatherAlert(firstAlert.message || firstAlert.title || 'Có cảnh báo thời tiết');
        setPendingRouteData(result);
        setWeatherModalVisible(true);
        setIsSaving(false);
        return;
      }

      // Check if route_id exists in response
      if (result && result.route_id) {
        // Save route_id and show input title modal
        setRouteIdToConfirm(result.route_id);
        setItineraryTitle(result.title || `Lộ trình ${destination}`);
        setShowTitleInputModal(true);
      } else {
        // Fallback: show error
        Alert.alert('Lỗi', 'Không thể lưu lộ trình. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.error('Save itinerary error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle confirm title and update status
  const handleConfirmTitle = async () => {
    if (!routeIdToConfirm || !itineraryTitle.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập tên lộ trình.');
      return;
    }

    setIsConfirming(true);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để lưu lộ trình.');
        router.replace('/(auth)/login');
        return;
      }

      // Call update status API to set status to CONFIRMED and update title
      await updateCustomItineraryStatusAPI(
        routeIdToConfirm,
        'CONFIRMED',
        itineraryTitle.trim(),
        token
      );

      // Close modal and navigate
      setShowTitleInputModal(false);
      setRouteIdToConfirm(null);
      setItineraryTitle('');

        Alert.alert(
          'Thành công',
          'Lộ trình đã được lưu thành công!',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/itinerary'),
            },
          ]
        );
    } catch (error: any) {
      console.error('Confirm title error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình. Vui lòng thử lại.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Xử lý khi người dùng chọn "Tiếp tục" trong modal warning
  const handleWeatherContinue = async () => {
    setWeatherModalVisible(false);
    // Sử dụng route data đã được lưu trước đó
    if (pendingRouteData && pendingRouteData.route_id) {
      setRouteIdToConfirm(pendingRouteData.route_id);
      setItineraryTitle(pendingRouteData.title || `Lộ trình ${destination}`);
      setShowTitleInputModal(true);
      setPendingRouteData(null);
    }
  };

  // Xử lý khi người dùng nhấn Quay lại
  const handleWeatherGoBack = () => {
    setWeatherModalVisible(false);
    setPendingRouteData(null);
  };

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // Get current day data - use useMemo to prevent creating new array reference on every render
  const currentDayData = useMemo(() => itinerary[selectedDay - 1], [itinerary, selectedDay]);
  const currentPlaces = useMemo(() => currentDayData?.places || [], [currentDayData]);

  return (
    <View style={styles.container}>
      {/* Map Background */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={getMapRegion()}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onMapReady={() => {
          // Map is ready
        }}
      >
        {/* Route Polylines */}
        {routePolylines.map((polyline, index) => (
          <Polyline
            key={`polyline-${index}`}
            coordinates={polyline}
            strokeColor={COLORS.primary}
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Start Location marker */}
        {startLocationCoords && (
          <Marker
            coordinate={{
              latitude: startLocationCoords.lat,
              longitude: startLocationCoords.lng,
            }}
            title="Điểm xuất phát"
            description={currentLocationText}
            identifier="start"
          >
            <View style={styles.startMarker}>
              <FontAwesome name="circle" size={16} color={COLORS.success} />
            </View>
          </Marker>
        )}

        {/* Destination marker (if coords available) */}
        {destinationCoords && (
          <Marker
            coordinate={{
              latitude: destinationCoords.lat,
              longitude: destinationCoords.lng,
            }}
            title={destination}
            identifier="destination"
          >
            <View style={styles.destinationMarker}>
              <FontAwesome name="map-marker" size={24} color={COLORS.accent} />
            </View>
          </Marker>
        )}

        {/* Place markers */}
        {currentPlaces.map((place, index) => (
          <Marker
            key={place.id}
            identifier={place.id}
            coordinate={{
              latitude: place.location.lat,
              longitude: place.location.lng,
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

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <FontAwesome name="arrow-left" size={20} color={COLORS.textDark} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{destination}</Text>
          <Text style={styles.headerSubtitle}>
            {formatDate(startDate)} - {formatDate(endDate)} • {durationDays} ngày
          </Text>
        </View>
      </View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { height: bottomSheetHeight, paddingBottom: insets.bottom },
        ]}
      >
        {/* Drag Handle */}
        <TouchableOpacity
          style={styles.dragHandleContainer}
          onPress={toggleBottomSheet}
          activeOpacity={0.7}
        >
          <View style={styles.dragHandle} />
        </TouchableOpacity>

        {/* Day Tabs */}
        <View style={styles.dayTabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayTabsContent}
          >
            {itinerary.map((day) => (
              <TouchableOpacity
                key={day.day}
                style={[
                  styles.dayTab,
                  selectedDay === day.day && styles.dayTabActive,
                ]}
                onPress={() => setSelectedDay(day.day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayTabText,
                    selectedDay === day.day && styles.dayTabTextActive,
                  ]}
                >
                  Ngày {day.day}
                </Text>
                <Text
                  style={[
                    styles.dayTabDate,
                    selectedDay === day.day && styles.dayTabDateActive,
                  ]}
                >
                  {formatFullDate(day.date)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Travel Mode Tabs - Shows travelMode for selected day */}
        <View style={styles.travelModeContainer}>
          <Text style={styles.travelModeLabel}>
            Phương tiện di chuyển - Ngày {selectedDay}
          </Text>
          <View style={styles.travelModeTabs}>
            <TouchableOpacity
              style={[
                styles.travelModeTab,
                travelModes[selectedDay] === 'driving' && styles.travelModeTabActive,
              ]}
              onPress={() => {
                setTravelModes(prev => ({
                  ...prev,
                  [selectedDay]: 'driving',
                }));
              }}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="car"
                size={18}
                color={travelModes[selectedDay] === 'driving' ? COLORS.textWhite : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.travelModeTabText,
                  travelModes[selectedDay] === 'driving' && styles.travelModeTabTextActive,
                ]}
              >
                Ô tô
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.travelModeTab,
                travelModes[selectedDay] === 'bicycling' && styles.travelModeTabActive,
              ]}
              onPress={() => {
                setTravelModes(prev => ({
                  ...prev,
                  [selectedDay]: 'bicycling',
                }));
              }}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="bicycle"
                size={18}
                color={travelModes[selectedDay] === 'bicycling' ? COLORS.textWhite : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.travelModeTabText,
                  travelModes[selectedDay] === 'bicycling' && styles.travelModeTabTextActive,
                ]}
              >
                Xe đạp
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.travelModeTab,
                travelModes[selectedDay] === 'walking' && styles.travelModeTabActive,
              ]}
              onPress={() => {
                setTravelModes(prev => ({
                  ...prev,
                  [selectedDay]: 'walking',
                }));
              }}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="user"
                size={18}
                color={travelModes[selectedDay] === 'walking' ? COLORS.textWhite : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.travelModeTabText,
                  travelModes[selectedDay] === 'walking' && styles.travelModeTabTextActive,
                ]}
              >
                Đi bộ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.travelModeTab,
                travelModes[selectedDay] === 'transit' && styles.travelModeTabActive,
              ]}
              onPress={() => {
                setTravelModes(prev => ({
                  ...prev,
                  [selectedDay]: 'transit',
                }));
              }}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="bus"
                size={18}
                color={travelModes[selectedDay] === 'transit' ? COLORS.textWhite : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.travelModeTabText,
                  travelModes[selectedDay] === 'transit' && styles.travelModeTabTextActive,
                ]}
              >
                Công cộng
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Multi-select toolbar */}
        {isMultiSelectMode && (
          <View style={styles.multiSelectToolbar}>
            <TouchableOpacity
              style={styles.multiSelectCancelButton}
              onPress={exitMultiSelectMode}
            >
              <Text style={styles.multiSelectCancelText}>Hủy</Text>
            </TouchableOpacity>
            <Text style={styles.multiSelectCountText}>
              Đã chọn {selectedPlaces.size} địa điểm
            </Text>
            <TouchableOpacity
              style={[
                styles.multiSelectDeleteButton,
                selectedPlaces.size === 0 && styles.multiSelectDeleteButtonDisabled,
              ]}
              onPress={handleDeleteSelectedPlaces}
              disabled={selectedPlaces.size === 0}
            >
              <FontAwesome name="trash" size={18} color={COLORS.textWhite} />
            </TouchableOpacity>
          </View>
        )}

        {/* Places List */}
        <ScrollView
          style={styles.placesContainer}
          contentContainerStyle={styles.placesContent}
          showsVerticalScrollIndicator={false}
        >
          {currentPlaces.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="map-o" size={48} color={COLORS.disabled} />
              <Text style={styles.emptyStateText}>Chưa có địa điểm nào</Text>
              <Text style={styles.emptyStateSubtext}>
                Nhấn nút bên dưới để thêm địa điểm
              </Text>
            </View>
          ) : (
            currentPlaces.map((place, index) => (
              <PlaceCard
                key={place.id}
                place={place}
                index={index}
                isMultiSelectMode={isMultiSelectMode}
                isSelected={selectedPlaces.has(place.id)}
                isSwiped={swipedPlaceId === place.id}
                onSwipe={() => setSwipedPlaceId(place.id)}
                onCancelSwipe={() => setSwipedPlaceId(null)}
                onDelete={() => handleDeletePlace(place.id)}
                onLongPress={() => handleLongPressPlace(place.id)}
                onToggleSelect={() => togglePlaceSelection(place.id)}
              />
            ))
          )}
        </ScrollView>

        {/* Add Place Button */}
        {!isMultiSelectMode && (
          <TouchableOpacity
            style={styles.addPlaceButton}
            onPress={() => setIsAddPlaceModalVisible(true)}
            activeOpacity={0.7}
          >
            <FontAwesome name="plus" size={18} color={COLORS.textWhite} />
            <Text style={styles.addPlaceButtonText}>Thêm địa điểm</Text>
          </TouchableOpacity>
        )}

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={[styles.footerButton, styles.cancelButton]}
            onPress={() => router.back()}
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>Quay lại</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerButton, styles.saveButton]}
            onPress={handleSaveItinerary}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.textWhite} />
            ) : (
              <>
                <FontAwesome name="save" size={16} color={COLORS.textWhite} />
                <Text style={styles.saveButtonText}>Lưu lộ trình</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Add Place Modal */}
      <Modal
        visible={isAddPlaceModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddPlaceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + SPACING.lg }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm địa điểm</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setIsAddPlaceModalVisible(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsUsingFavorites(false);
                }}
              >
                <FontAwesome name="times" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchInputContainer}>
              {/* Favorites Toggle Button */}
              <TouchableOpacity
                style={[
                  styles.favoritesToggleButton,
                  isUsingFavorites && styles.favoritesToggleButtonActive
                ]}
                onPress={toggleFavoritesMode}
                disabled={isLoadingFavorites}
                activeOpacity={0.7}
              >
                {isLoadingFavorites ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <FontAwesome 
                    name={isUsingFavorites ? "heart" : "heart-o"} 
                    size={18} 
                    color={isUsingFavorites ? COLORS.textWhite : COLORS.primary} 
                  />
                )}
              </TouchableOpacity>
              
              <FontAwesome name="search" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm kiếm địa điểm..."
                placeholderTextColor={COLORS.textSecondary}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSessionToken(generateSessionToken());
                  }}
                >
                  <FontAwesome name="times-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Status hint */}
            {isUsingFavorites && (
              <View style={styles.searchHintContainer}>
                <FontAwesome name="info-circle" size={14} color={COLORS.primary} />
                <Text style={styles.searchHintText}>
                  Đang tìm kiếm trong {favoritesPlaces.length} địa điểm yêu thích
                </Text>
              </View>
            )}

            {/* Search Results */}
            {isSearching ? (
              <View style={styles.searchLoadingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.searchLoadingText}>Đang tìm kiếm...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.place_id}
                keyboardShouldPersistTaps="handled"
                style={styles.searchResultsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchResultItem}
                    onPress={() => handleSelectPlace(item)}
                    activeOpacity={0.7}
                  >
                    {item.isFavorite ? (
                      <FontAwesome name="heart" size={20} color="#E53E3E" />
                    ) : (
                      <FontAwesome name="map-marker" size={20} color={COLORS.primary} />
                    )}
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName} numberOfLines={1}>
                        {item.structured_formatting?.main_text || item.description}
                      </Text>
                      <Text style={styles.searchResultAddress} numberOfLines={1}>
                        {item.structured_formatting?.secondary_text || ''}
                      </Text>
                      {item.rating && (
                        <View style={styles.ratingContainer}>
                          <FontAwesome name="star" size={12} color="#F59E0B" />
                          <Text style={styles.ratingText}>{item.rating}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            ) : searchQuery.length > 0 ? (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>Không tìm thấy địa điểm</Text>
              </View>
            ) : (
              <View style={styles.searchHintContainer}>
                <FontAwesome name="lightbulb-o" size={24} color={COLORS.accent} />
                <Text style={styles.searchHintText}>
                  Nhập tên địa điểm, nhà hàng, khách sạn, điểm du lịch...
                </Text>
              </View>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Đang thêm địa điểm...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Success Preview Modal */}
      <Modal
        visible={showPreviewModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setShowPreviewModal(false);
          router.replace('/(tabs)/itinerary');
        }}
      >
        <View style={styles.previewModalContainer}>
          {/* Header */}
          <View style={[styles.previewHeader, { paddingTop: insets.top + SPACING.md }]}>
            <View style={styles.successIcon}>
              <FontAwesome name="check-circle" size={48} color={COLORS.success} />
            </View>
            <Text style={styles.previewTitle}>Lộ trình đã được lưu!</Text>
            <Text style={styles.previewSubtitle}>
              {savedRouteData?.title || `Lộ trình ${destination}`}
            </Text>
            <Text style={styles.previewDuration}>
              {destination} • {durationDays} ngày
            </Text>
          </View>

          {/* Summary */}
          <ScrollView style={styles.previewContent} showsVerticalScrollIndicator={false}>
            {savedRouteData?.days?.map((day: any, index: number) => (
              <View key={index} style={styles.previewDayCard}>
                <Text style={styles.previewDayTitle}>Ngày {day.dayNumber}</Text>
                <Text style={styles.previewDaySubtitle}>
                  {day.places?.length || 0} địa điểm
                </Text>
                {day.places?.map((place: any, placeIndex: number) => (
                  <View key={placeIndex} style={styles.previewPlaceItem}>
                    <View style={styles.previewPlaceNumber}>
                      <Text style={styles.previewPlaceNumberText}>{placeIndex + 1}</Text>
                    </View>
                    <View style={styles.previewPlaceInfo}>
                      <Text style={styles.previewPlaceName}>{place.name}</Text>
                      <Text style={styles.previewPlaceAddress} numberOfLines={1}>
                        {place.address}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + SPACING.md }]}>
            <TouchableOpacity
              style={styles.previewButton}
              onPress={() => {
                setShowPreviewModal(false);
                router.replace('/(tabs)/itinerary');
              }}
            >
              <Text style={styles.previewButtonText}>Xem danh sách lộ trình</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Input Title Modal */}
      <Modal
        visible={showTitleInputModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isConfirming) {
            setShowTitleInputModal(false);
            setRouteIdToConfirm(null);
            setItineraryTitle('');
          }
        }}
      >
        <View style={styles.titleModalOverlay}>
          <View style={[styles.titleModalContent, { paddingBottom: insets.bottom + SPACING.lg }]}>
            {/* Modal Header */}
            <View style={styles.titleModalHeader}>
              <Text style={styles.titleModalTitle}>Đặt tên lộ trình</Text>
              {!isConfirming && (
                <TouchableOpacity
                  style={styles.titleModalCloseButton}
                  onPress={() => {
                    setShowTitleInputModal(false);
                    setRouteIdToConfirm(null);
                    setItineraryTitle('');
                  }}
                >
                  <FontAwesome name="times" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Input Field */}
            <View style={styles.titleInputContainer}>
              <Text style={styles.titleInputLabel}>Tên lộ trình</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Nhập tên lộ trình..."
                placeholderTextColor={COLORS.textSecondary}
                value={itineraryTitle}
                onChangeText={setItineraryTitle}
                autoFocus
                editable={!isConfirming}
                maxLength={100}
              />
              <Text style={styles.titleInputHint}>
                {itineraryTitle.length}/100 ký tự
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.titleModalActions}>
              {!isConfirming && (
                <TouchableOpacity
                  style={[styles.titleModalButton, styles.titleModalCancelButton]}
                  onPress={() => {
                    setShowTitleInputModal(false);
                    setRouteIdToConfirm(null);
                    setItineraryTitle('');
                  }}
                >
                  <Text style={styles.titleModalCancelText}>Hủy</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.titleModalButton,
                  styles.titleModalConfirmButton,
                  (!itineraryTitle.trim() || isConfirming) && styles.titleModalConfirmButtonDisabled,
                ]}
                onPress={handleConfirmTitle}
                disabled={!itineraryTitle.trim() || isConfirming}
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color={COLORS.textWhite} />
                ) : (
                  <>
                    <FontAwesome name="check" size={16} color={COLORS.textWhite} />
                    <Text style={styles.titleModalConfirmText}>Xác nhận</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Weather Warning Modal */}
      <WeatherWarningModal
        visible={weatherModalVisible}
        severity={weatherSeverity}
        alertMessage={weatherAlert}
        onContinue={handleWeatherContinue}
        onGoBack={handleWeatherGoBack}
      />
    </View>
  );
}

// Place Card Component with swipe to delete
interface PlaceCardProps {
  place: PlaceItem;
  index: number;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  isSwiped: boolean;
  onSwipe: () => void;
  onCancelSwipe: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
}

const PlaceCard: React.FC<PlaceCardProps> = (props: PlaceCardProps) => {
  const {
    place,
    index,
    isMultiSelectMode,
    isSelected,
    isSwiped,
    onSwipe,
    onCancelSwipe,
    onDelete,
    onLongPress,
    onToggleSelect,
  } = props;
  const translateX = useRef(new Animated.Value(0)).current;
  const DELETE_THRESHOLD = -80;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, DELETE_THRESHOLD - 20));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < DELETE_THRESHOLD / 2) {
          // Snap to delete position
          Animated.spring(translateX, {
            toValue: DELETE_THRESHOLD,
            useNativeDriver: true,
          }).start();
          onSwipe();
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          onCancelSwipe();
        }
      },
    })
  ).current;

  // Reset position when not swiped
  useEffect(() => {
    if (!isSwiped) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  }, [isSwiped, translateX]);

  const handlePress = () => {
    if (isMultiSelectMode) {
      onToggleSelect();
    } else if (isSwiped) {
      onCancelSwipe();
    }
  };

  return (
    <View style={styles.placeCardContainer}>
      {/* Delete background */}
      <View style={styles.deleteBackground}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          activeOpacity={0.7}
        >
          <FontAwesome name="trash" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
      </View>

      {/* Card content */}
      <Animated.View
        style={[
          styles.placeCard,
          { transform: [{ translateX }] },
          isSelected && styles.placeCardSelected,
        ]}
        {...(isMultiSelectMode ? {} : panResponder.panHandlers)}
      >
        <TouchableOpacity
          style={styles.placeCardTouchable}
          onPress={handlePress}
          onLongPress={onLongPress}
          delayLongPress={500}
          activeOpacity={0.7}
        >
          {/* Selection checkbox */}
          {isMultiSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && (
                <FontAwesome name="check" size={12} color={COLORS.textWhite} />
              )}
            </View>
          )}

          {/* Place number */}
          <View style={styles.placeNumber}>
            <Text style={styles.placeNumberText}>{index + 1}</Text>
          </View>

          {/* Place info */}
          <View style={styles.placeInfo}>
            <Text style={styles.placeName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.placeAddress} numberOfLines={1}>
              {place.address}
            </Text>
          </View>

          {/* Drag hint icon */}
          {!isMultiSelectMode && (
            <MaterialIcons name="drag-indicator" size={24} color={COLORS.textSecondary} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
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
  headerInfo: {
    flex: 1,
    marginLeft: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  startMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.success,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  destinationMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bgMain,
  },
  placeMarkerText: {
    color: COLORS.textWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: SPACING.xl,
    borderTopRightRadius: SPACING.xl,
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
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  dayTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dayTabsContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  dayTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    borderRadius: SPACING.md,
    backgroundColor: COLORS.bgCard,
    minWidth: 100,
    alignItems: 'center',
  },
  dayTabActive: {
    backgroundColor: COLORS.primary,
  },
  dayTabText: {
    fontSize: 14,
    fontWeight: '600',
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
    color: 'rgba(255,255,255,0.8)',
  },
  travelModeContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  travelModeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  travelModeTabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  travelModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: SPACING.md,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  travelModeTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  travelModeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  travelModeTabTextActive: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  multiSelectToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bgLightBlue,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  multiSelectCancelButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  multiSelectCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  multiSelectCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  multiSelectDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  multiSelectDeleteButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  placesContainer: {
    flex: 1,
  },
  placesContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  placeCardContainer: {
    marginBottom: SPACING.sm,
    position: 'relative',
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 80,
    backgroundColor: COLORS.error,
    borderRadius: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  placeCardSelected: {
    backgroundColor: COLORS.bgLightBlue,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  placeCardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  placeNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  placeNumberText: {
    color: COLORS.textWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  placeAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addPlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: SPACING.md,
  },
  addPlaceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  footerActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
  },
  cancelButton: {
    backgroundColor: COLORS.bgCard,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  saveButton: {
    backgroundColor: COLORS.success,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgMain,
    borderTopLeftRadius: SPACING.xl,
    borderTopRightRadius: SPACING.xl,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingTop: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalCloseButton: {
    padding: SPACING.xs,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.md,
    borderRadius: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: COLORS.textMain,
  },
  searchLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  searchLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  searchResultsList: {
    maxHeight: SCREEN_HEIGHT * 0.5,
    marginTop: SPACING.md,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  searchResultAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  noResultsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: SPACING.xl,
    borderTopRightRadius: SPACING.xl,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  // Preview Modal Styles
  previewModalContainer: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  previewHeader: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.bgCard,
    borderBottomLeftRadius: SPACING.xl,
    borderBottomRightRadius: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  successIcon: {
    marginBottom: SPACING.md,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  previewSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.xs / 2,
  },
  previewDuration: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '500',
  },
  previewContent: {
    flex: 1,
    padding: SPACING.lg,
  },
  previewDayCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  previewDayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: SPACING.xs / 2,
  },
  previewDaySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  previewPlaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgSecondary,
  },
  previewPlaceNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  previewPlaceNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textWhite,
  },
  previewPlaceInfo: {
    flex: 1,
  },
  previewPlaceName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  previewPlaceAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  previewActions: {
    padding: SPACING.lg,
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: SPACING.xl,
    borderTopRightRadius: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  previewButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textWhite,
  },
  // Title Input Modal Styles
  titleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  titleModalContent: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  favoritesToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgLightBlue,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  favoritesToggleButtonActive: {
    backgroundColor: COLORS.primary,
  },
  loadFavoritesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginTop: SPACING.sm,
  },
  loadFavoritesButtonActive: {
    backgroundColor: COLORS.primary,
  },
  loadFavoritesText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loadFavoritesTextActive: {
    color: COLORS.textWhite,
  },
  titleModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  titleModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  titleModalCloseButton: {
    padding: SPACING.xs,
  },
  titleInputContainer: {
    marginBottom: SPACING.lg,
  },
  titleInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.sm,
  },
  titleInput: {
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleInputHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'right',
  },
  titleModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  titleModalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
  },
  titleModalCancelButton: {
    backgroundColor: COLORS.bgCard,
  },
  titleModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  titleModalConfirmButton: {
    backgroundColor: COLORS.success,
  },
  titleModalConfirmButtonDisabled: {
    backgroundColor: COLORS.disabled,
    opacity: 0.6,
  },
  titleModalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  searchHintText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  searchHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
});

// Add WeatherWarningModal at the end of the component before closing tag
// Insert before the closing </View> tag in the return statement
