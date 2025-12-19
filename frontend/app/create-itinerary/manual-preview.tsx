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
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';
import { SPACING, BORDER_RADIUS } from '@/constants/spacing';
import { calculateRoutesAPI, autocompletePlacesAPI, updateCustomItineraryStatusAPI, getLikedPlacesAPI } from '../../services/api';
import WeatherWarningModal, { WeatherSeverity } from '../../components/WeatherWarningModal';
import { useFavorites } from '@/contexts/FavoritesContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MIN_HEIGHT = 250;
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const ROUTE_COLORS = { main: '#4DB8FF', transit: '#F44336' };

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
  openingHours?: {
    weekdayDescriptions?: string[];
  };
  rating?: number;
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
  const { favorites: favoritesPlaces } = useFavorites();
  
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
  
  // Title input modal state
  const [showTitleInputModal, setShowTitleInputModal] = useState(false);
  const [itineraryTitle, setItineraryTitle] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enrichedPlaces, setEnrichedPlaces] = useState<Array<PlaceItem & { encoded_polyline?: string; start_encoded_polyline?: string; steps?: any[] }>>([]);
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  // Add place modal
  const [isAddPlaceModalVisible, setIsAddPlaceModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [isUsingFavorites, setIsUsingFavorites] = useState(false);
  
  // Replace POI modal
  const [isReplacePOIModalVisible, setIsReplacePOIModalVisible] = useState(false);
  const [replacingPlace, setReplacingPlace] = useState<PlaceItem | null>(null);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState('');
  const [replaceSearchResults, setReplaceSearchResults] = useState<any[]>([]);
  const [isReplaceSearching, setIsReplaceSearching] = useState(false);
  const [replaceSessionToken, setReplaceSessionToken] = useState<string>('');
  
  // Multi-select delete mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(new Set());
  
  // Opening hours expansion state
  const [expandedOpeningHours, setExpandedOpeningHours] = useState<Set<string>>(new Set());
  
  // Bottom sheet animation
  const bottomSheetHeight = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);

  // Debounce timer ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaceSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Preview saved itinerary
  const [savedRouteData, setSavedRouteData] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

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

  // Show favorites when modal opens
  useEffect(() => {
    if (isAddPlaceModalVisible && favoritesPlaces.length > 0) {
      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
        description: fav.name + (fav.address ? `, ${fav.address}` : ''),
        place_id: fav.googlePlaceId || fav.placeId || fav.id,
        structured_formatting: {
          main_text: fav.name,
          secondary_text: fav.address || fav.formatted_address || '',
        },
        isFavorite: true,
        rating: fav.rating,
        location: fav.location,
      }));
      setSearchResults(transformedFavorites);
    }
  }, [isAddPlaceModalVisible, favoritesPlaces]);

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
    
    // Priority 1: Center on start location if available
    if (startLocationCoords) {
      // Include all places in the view
      if (currentDayPlaces.length > 0) {
        const allLats = [startLocationCoords.lat, ...currentDayPlaces.map(p => p.location.lat)];
        const allLngs = [startLocationCoords.lng, ...currentDayPlaces.map(p => p.location.lng)];
        
        const minLat = Math.min(...allLats);
        const maxLat = Math.max(...allLats);
        const minLng = Math.min(...allLngs);
        const maxLng = Math.max(...allLngs);
        
        const latDelta = (maxLat - minLat) * 1.5 || 0.05;
        const lngDelta = (maxLng - minLng) * 1.5 || 0.05;
        
        return {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max(latDelta, 0.05),
          longitudeDelta: Math.max(lngDelta, 0.05),
        };
      }
      
      // Just start location
      return {
        latitude: startLocationCoords.lat,
        longitude: startLocationCoords.lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
    
    // Priority 2: Center on current day places
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

  // Decode polyline - copied from AI
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

  // Fetch directions and update enriched places with polylines - copied logic from AI
  const fetchDirections = async (places: PlaceItem[]) => {
    if (places.length === 0) {
      setEnrichedPlaces([]);
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      // Prepare payload for calculateRoutesAPI
      const travelMode = travelModes[selectedDay] || 'driving';
      const payload = {
        destination: destination,
        days: [
          {
            dayNumber: selectedDay,
            travelMode: travelMode,
            startLocation: currentLocationText || destination,
            places: places.map(place => ({
              placeId: place.placeId,
              name: place.name,
              address: place.address,
            })),
          },
        ],
        optimize: false, // Don't optimize order, keep manual order
      };

      console.log('🚀 [Manual] Calling calculateRoutesAPI with payload:', JSON.stringify(payload, null, 2));
      
      const response = await calculateRoutesAPI(payload, token);
      
      console.log('📍 [Manual] calculateRoutesAPI response:', JSON.stringify(response, null, 2));
      
      if (response && response.days && response.days[0]) {
        const dayData = response.days[0];

        // If backend returned startLocationCoordinates, use it to set the start marker
        if (dayData.startLocationCoordinates && dayData.startLocationCoordinates.lat != null && dayData.startLocationCoordinates.lng != null) {
          console.log('   ✅ [Manual] Setting startLocationCoords from API response:', dayData.startLocationCoordinates);
          setStartLocationCoords({
            lat: dayData.startLocationCoordinates.lat,
            lng: dayData.startLocationCoordinates.lng,
          });
        }

        // Enrich places with encoded_polyline and start_encoded_polyline from response
        const enriched = places.map((place, index) => {
          const routeData = dayData.places?.[index] || {};
          console.log(`   - Place ${index} (${place.name}):`, {
            hasEncodedPolyline: !!routeData.encoded_polyline,
            hasStartPolyline: !!routeData.start_encoded_polyline,
            hasSteps: !!routeData.steps,
          });
          return {
            ...place,
            encoded_polyline: routeData.encoded_polyline || undefined,
            start_encoded_polyline: index === 0 ? routeData.start_encoded_polyline : undefined,
            steps: routeData.steps || undefined,
          };
        });
        
        console.log('✅ [Manual] Setting enrichedPlaces with polylines');
        setEnrichedPlaces(enriched);
      } else {
        console.log('⚠️ [Manual] No valid response, using places without polylines');
        // No response, just use places without polylines
        setEnrichedPlaces(places as any);
      }
    } catch (error) {
      console.error('Fetch directions error:', error);
      // Fallback to places without polylines
      setEnrichedPlaces(places as any);
    }
  };

  // Calculate route segments from enriched places (copied from AI)
  const routeSegments = (() => {
    console.log('\n🗺️ [Frontend Manual] Building route segments for map...');
    console.log('   - Start location:', startLocationCoords);
    console.log('   - Enriched places count:', enrichedPlaces.length);
    
    const segments: { points: { latitude: number; longitude: number }[]; mode: string }[] = [];

    // Segment from start location to first POI
    if (startLocationCoords && enrichedPlaces.length > 0) {
      console.log('   - Checking first place for start_encoded_polyline...');
      console.log('     First place:', enrichedPlaces[0]?.name);
      console.log('     Has start_encoded_polyline:', !!enrichedPlaces[0]?.start_encoded_polyline);
      
      if (enrichedPlaces[0]?.start_encoded_polyline) {
        const decoded = decodePolyline(enrichedPlaces[0].start_encoded_polyline);
        console.log('     ✅ Decoded start polyline, points:', decoded.length);
        segments.push({
          points: decoded,
          mode: 'DRIVE', // Default to DRIVE for start segment
        });
      } else {
        console.log('     ⚠️ No start_encoded_polyline found for first place');
      }
    }

    enrichedPlaces.forEach((place, idx) => {
      console.log(`   - Processing POI ${idx} (${place.name})...`);
      console.log(`     Has encoded_polyline: ${!!place.encoded_polyline}`);
      console.log(`     Has steps: ${!!place.steps}`);
      
      if (place.steps && place.steps.length > 0) {
        place.steps.forEach((step, stepIdx) => {
          const decoded = decodePolyline(step.encoded_polyline);
          if (decoded.length > 1) {
            console.log(`       Step ${stepIdx}: ${decoded.length} points`);
            segments.push({
              points: decoded,
              mode: step.travel_mode,
            });
          }
        });
      } else if (place.encoded_polyline) {
        const decoded = decodePolyline(place.encoded_polyline);
        if (decoded.length > 1) {
          console.log(`     ✅ Decoded polyline: ${decoded.length} points`);
          segments.push({
            points: decoded,
            mode: 'DRIVE', // Default
          });
        } else {
          console.log(`     ⚠️ No valid polyline (${decoded.length} points)`);
        }
      }
    });

    console.log(`   📊 Total segments created: ${segments.length}`);
    return segments.filter((segment) => segment.points.length > 1);
  })();

  // Update routes when places change
  useEffect(() => {
    const currentDayPlaces = itinerary[selectedDay - 1]?.places || [];
    console.log('🔄 [Manual] Places changed, updating routes...');
    console.log('   - Current day places:', currentDayPlaces.length);
    console.log('   - Start location coords:', startLocationCoords);
    console.log('   - Current location text:', currentLocationText);
    
    // Fetch directions nếu có places và start location
    if (currentDayPlaces.length > 0 && (startLocationCoords || currentLocationText)) {
      console.log('   ✅ Calling fetchDirections...');
      fetchDirections(currentDayPlaces);
    } else {
      console.log('   ⚠️ Not calling fetchDirections (missing places or start location)');
      setEnrichedPlaces([]);
    }
  }, [itinerary, selectedDay, startLocationCoords, travelModes]);

  // Fit map to show all places and routes when they change
  useEffect(() => {
    if (mapRef.current) {
      const currentDayPlaces = itinerary[selectedDay - 1]?.places || [];
      
      if (currentDayPlaces.length > 0 && startLocationCoords) {
        // Include start location and all places
        const coordinates = [
          { latitude: startLocationCoords.lat, longitude: startLocationCoords.lng },
          ...currentDayPlaces.map(p => ({ latitude: p.location.lat, longitude: p.location.lng }))
        ];
        
        // Fit to coordinates with padding
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
            animated: true,
          });
        }, 500);
      } else if (currentDayPlaces.length > 0) {
        // Just places, no start location
        const coordinates = currentDayPlaces.map(p => ({ 
          latitude: p.location.lat, 
          longitude: p.location.lng 
        }));
        
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
            animated: true,
          });
        }, 500);
      }
    }
  }, [itinerary, selectedDay, startLocationCoords, enrichedPlaces]);

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
        // Mark favorites and sort them to top
        const resultsWithFavorites = data.map(item => {
          // Normalize place_id for comparison (remove 'places/' prefix if exists)
          const normalizedPlaceId = (item.place_id || item.placeId || '').replace(/^places\//, '');
          
          // Check if this place is in favorites
          const isFavorite = favoritesPlaces.some(fav => {
            const favPlaceId = (fav.google_place_id || fav.place_id || '').replace(/^places\//, '');
            return favPlaceId === normalizedPlaceId;
          });
          
          return {
            ...item,
            isFavorite,
          };
        });
        
        // 🔍 Filter favorites that match search query
        const searchLower = query.toLowerCase().trim();
        const matchedFavorites = favoritesPlaces
          .filter((fav: any) => {
            const name = fav.structured_formatting?.main_text?.toLowerCase() || fav.description?.toLowerCase() || '';
            const address = fav.structured_formatting?.secondary_text?.toLowerCase() || '';
            return name.includes(searchLower) || address.includes(searchLower);
          })
          .map((fav: any) => {
            const favPlaceId = (fav.google_place_id || fav.place_id || '').replace(/^places\//, '');
            
            // Check if already in API results
            const alreadyInResults = resultsWithFavorites.some((item: any) => {
              const itemPlaceId = (item.place_id || item.placeId || '').replace(/^places\//, '');
              return itemPlaceId === favPlaceId;
            });
            
            // Only add if not already in results
            if (!alreadyInResults) {
              return {
                ...fav,
                isFavorite: true,
              };
            }
            return null;
          })
          .filter(Boolean); // Remove nulls
        
        // Combine: matched favorites first, then API results (already sorted with favorites marked)
        const combined = [...matchedFavorites, ...resultsWithFavorites];
        
        // Sort: favorites first, then others
        const sortedResults = combined.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return 0;
        });
        
        console.log(`🔍 Search "${query}": ${matchedFavorites.length} matched favorites + ${data.length} API results`);
        setSearchResults(sortedResults);
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

    // Transform favorites to match format
    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
      description: fav.name + (fav.address ? `, ${fav.address}` : ''),
      place_id: fav.googlePlaceId || fav.placeId || fav.id,
      structured_formatting: {
        main_text: fav.name,
        secondary_text: fav.address || fav.formatted_address || '',
      },
      isFavorite: true,
      rating: fav.rating,
      location: fav.location,
    }));

    // If search is empty, show all favorites
    if (!text.trim()) {
      setSearchResults(transformedFavorites);
      setSessionToken(generateSessionToken());
      return;
    }

    // If favorites mode is on, filter favorites only
    if (isUsingFavorites) {
      const filteredFavorites = transformedFavorites.filter((fav: any) =>
        fav.structured_formatting?.main_text?.toLowerCase().includes(text.toLowerCase()) ||
        fav.structured_formatting?.secondary_text?.toLowerCase().includes(text.toLowerCase())
      );
      setSearchResults(filteredFavorites);
      return;
    }

    // Normal autocomplete mode - search from API

    // Set new timer for debounced search
    searchTimerRef.current = setTimeout(() => {
      searchPlaces(text);
    }, AUTOCOMPLETE_DELAY);
  };

  // Toggle favorites mode for autocomplete
  const toggleFavoritesMode = () => {
    // Transform favorites to match autocomplete format
    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
      description: fav.name + (fav.address ? `, ${fav.address}` : ''),
      place_id: fav.googlePlaceId || fav.placeId || fav.id,
      structured_formatting: {
        main_text: fav.name,
        secondary_text: fav.address || fav.formatted_address || '',
      },
      isFavorite: true,
      rating: fav.rating,
      location: fav.location,
    }));

    if (isUsingFavorites) {
      // Tắt favorites mode, vẫn hiện favorites
      setIsUsingFavorites(false);
      setSearchQuery('');
      setSearchResults(transformedFavorites);
    } else {
      // Bật favorites mode, hiện favorites
      setIsUsingFavorites(true);
      setSearchQuery('');
      setSearchResults(transformedFavorites);
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
      
      // Fetch detailed place info including opening hours
      // Skip enrichment for now - will be done later when viewing itinerary details
      let openingHours = undefined;
      let rating = undefined;
      // Note: Commented out auto-enrich to avoid unnecessary API calls
      // Opening hours will be fetched on-demand when user views itinerary
      // try {
      //   if (placeId) {
      //     const token = await AsyncStorage.getItem('userToken');
      //     if (token) {
      //       const enriched = await enrichPlaceAPI(token, placeId, false);
      //       if (enriched?.data) {
      //         openingHours = enriched.data.openingHours;
      //         rating = enriched.data.rating;
      //       }
      //     }
      //   }
      // } catch (err) {
      //   console.warn('Failed to fetch place details:', err);
      // }

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
        openingHours,
        rating,
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

  // Handle drag end to reorder places
  const handleDragEnd = (data: PlaceItem[]) => {
    setItinerary(prev => {
      const updated = [...prev];
      updated[selectedDay - 1] = {
        ...updated[selectedDay - 1],
        places: data,
      };
      return updated;
    });
  };

  // Toggle opening hours expansion
  const toggleOpeningHours = (placeKey: string) => {
    setExpandedOpeningHours(prev => {
      const next = new Set(prev);
      if (next.has(placeKey)) {
        next.delete(placeKey);
      } else {
        next.add(placeKey);
      }
      return next;
    });
  };

  // Handle replace POI
  const handleReplacePlace = (place: PlaceItem) => {
    setReplacingPlace(place);
    setIsReplacePOIModalVisible(true);
    setReplaceSearchQuery('');
    setReplaceSearchResults([]);
    setReplaceSessionToken(generateSessionToken());
  };

  // Handle replace search
  const handleReplaceSearchChange = (text: string) => {
    setReplaceSearchQuery(text);

    // Transform favorites to match format
    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
      description: fav.name + (fav.address ? `, ${fav.address}` : ''),
      place_id: fav.googlePlaceId || fav.placeId || fav.id,
      structured_formatting: {
        main_text: fav.name,
        secondary_text: fav.address || fav.formatted_address || '',
      },
      isFavorite: true,
      rating: fav.rating,
      location: fav.location,
    }));

    // If search is empty, show all favorites
    if (!text.trim()) {
      setReplaceSearchResults(transformedFavorites);
      setReplaceSessionToken(generateSessionToken());
      return;
    }

    // Normal autocomplete mode - search from API
    if (replaceSearchTimerRef.current) {
      clearTimeout(replaceSearchTimerRef.current);
    }

    replaceSearchTimerRef.current = setTimeout(() => {
      searchPlacesForReplace(text);
    }, AUTOCOMPLETE_DELAY);
  };

  // Search places for replace
  const searchPlacesForReplace = async (query: string) => {
    if (!query.trim()) {
      setReplaceSearchResults([]);
      return;
    }

    setIsReplaceSearching(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setIsReplaceSearching(false);
        return;
      }

      const response = await autocompletePlacesAPI(query, replaceSessionToken, destination, token);
      const predictions = Array.isArray(response) ? response : (response.predictions || []);
      setReplaceSearchResults(predictions);
    } catch (error) {
      console.error('Replace autocomplete error:', error);
      setReplaceSearchResults([]);
    } finally {
      setIsReplaceSearching(false);
    }
  };

  // Handle select new place for replacement
  const handleSelectNewPlace = async (prediction: any) => {
    if (!replacingPlace) return;

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
    
    try {
      setIsLoading(true);
      
      let mainText: string;
      let secondaryText: string;
      let placeIdValue: string;

      if (prediction.isFavorite) {
        mainText = prediction.structured_formatting?.main_text || prediction.name || '';
        secondaryText = prediction.structured_formatting?.secondary_text || prediction.address || '';
        placeIdValue = prediction.place_id || prediction.googlePlaceId || '';
      } else {
        mainText = prediction.structured_formatting?.main_text || prediction.description || '';
        secondaryText = prediction.structured_formatting?.secondary_text || '';
        placeIdValue = prediction.place_id || '';
      }

      if (!placeIdValue) {
        Alert.alert('Lỗi', 'Không thể lấy thông tin địa điểm.');
        return;
      }

      // Get place details
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeIdValue}&fields=name,formatted_address,geometry&key=${apiKey}`;
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();

      if (detailsData.status !== 'OK' || !detailsData.result) {
        Alert.alert('Lỗi', 'Không thể lấy thông tin chi tiết địa điểm.');
        return;
      }

      const { result } = detailsData;
      const newPlace: PlaceItem = {
        id: `${Date.now()}-${Math.random()}`,
        name: result.name || mainText,
        address: result.formatted_address || secondaryText,
        placeId: placeIdValue,
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      };

      // Replace the place in itinerary
      setItinerary(prev => {
        const updated = [...prev];
        const dayIndex = selectedDay - 1;
        const placeIndex = updated[dayIndex].places.findIndex(p => p.id === replacingPlace.id);
        
        if (placeIndex !== -1) {
          updated[dayIndex] = {
            ...updated[dayIndex],
            places: [
              ...updated[dayIndex].places.slice(0, placeIndex),
              newPlace,
              ...updated[dayIndex].places.slice(placeIndex + 1),
            ],
          };
        }
        
        return updated;
      });

      // Close modal
      setIsReplacePOIModalVisible(false);
      setReplacingPlace(null);
      setReplaceSearchQuery('');
      setReplaceSearchResults([]);
      
      Alert.alert('Thành công', 'Đã thay đổi địa điểm.');
    } catch (error) {
      console.error('Replace place error:', error);
      Alert.alert('Lỗi', 'Không thể thay đổi địa điểm. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
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

  // Save itinerary - Navigate to manual-route.tsx for final preview with opening hours
  const handleSaveItinerary = () => {
    // Check if there are any places
    const totalPlaces = itinerary.reduce((sum, day) => sum + day.places.length, 0);
    if (totalPlaces === 0) {
      Alert.alert('Thông báo', 'Vui lòng thêm ít nhất một địa điểm vào lộ trình.');
      return;
    }

    // Show title input modal
    const suggestedTitle = destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';
    setItineraryTitle(suggestedTitle);
    setShowTitleInputModal(true);
  };
  
  const handleConfirmSave = async () => {
    if (!itineraryTitle.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập tên lộ trình.');
      return;
    }
    
    setIsSaving(true);
    setShowTitleInputModal(false);
    
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để lưu lộ trình.');
        router.replace('/(auth)/login');
        return;
      }

      // Build payload for calculateRoutesAPI
      const payload = {
        destination: destination,
        days: itinerary.map((day) => {
          // Use the single start location from the manual form for ALL days
          const dayStartLocation = (currentLocationText && currentLocationText.trim()) ? currentLocationText : (destination || '');
          return {
            dayNumber: day.day,
            travelMode: travelModes[day.day] || 'driving',
            startLocation: dayStartLocation,
            places: day.places.map((place) => ({
              placeId: place.placeId,
              name: place.name,
              address: place.address,
            })),
          };
        }),
      };

      console.log('🚀 Saving itinerary with payload:', payload);
      
      // Call backend API to calculate routes and save
      const result = await calculateRoutesAPI(payload, token);
      
      console.log('✅ Route saved:', result);

      // Check if route_id exists in response
      if (result && result.route_id) {
        // Update status to CONFIRMED with title
        await updateCustomItineraryStatusAPI(
          result.route_id,
          'CONFIRMED',
          itineraryTitle.trim(),
          token
        );

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
      } else {
        Alert.alert('Lỗi', 'Không thể lưu lộ trình. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.error('❌ Save itinerary error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // LEGACY: Function moved to manual-route.tsx
  // Handle confirm title and update status
  /*
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

  // LEGACY: Functions moved to manual-route.tsx
  // Xử lý khi người dùng chọn "Tiếp tục" trong modal warning
  /*
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
  */

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
          console.log('🗺️ [Manual Render] routeSegments count:', routeSegments.length);
        }}
      >
        {/* Route Polylines - copied from AI */}
        {routeSegments.map((segment, idx) => {
          console.log(`   - Segment ${idx}: ${segment.points.length} points, mode: ${segment.mode}`);
          return (
            <Polyline
              key={`polyline-${selectedDay}-${idx}`}
              coordinates={segment.points}
              strokeColor={
                segment.mode === 'TRANSIT' ? '#F44336' : ROUTE_COLORS.main
              }
              strokeWidth={segment.mode === 'TRANSIT' ? 6 : 4}
              lineDashPattern={segment.mode === 'WALK' ? [20, 10] : undefined}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}

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
        <GestureHandlerRootView style={{ flex: 1 }}>
          {currentPlaces.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="map-o" size={48} color={COLORS.disabled} />
              <Text style={styles.emptyStateText}>Chưa có địa điểm nào</Text>
              <Text style={styles.emptyStateSubtext}>
                Nhấn nút bên dưới để thêm địa điểm
              </Text>
            </View>
          ) : (
            <DraggableFlatList
              data={currentPlaces}
              onDragEnd={({ data }) => handleDragEnd(data)}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              nestedScrollEnabled={true}
              containerStyle={styles.placesContainer}
              contentContainerStyle={styles.placesContent}
              renderItem={({ item: place, drag, isActive, getIndex }: RenderItemParams<PlaceItem>) => {
                const index = getIndex() ?? 0;
                return (
                  <ScaleDecorator>
                    <PlaceCard
                      place={place}
                      index={index}
                      isMultiSelectMode={isMultiSelectMode}
                      isSelected={selectedPlaces.has(place.id)}
                      onDelete={() => handleDeletePlace(place.id)}
                      onReplace={() => handleReplacePlace(place)}
                      onLongPress={isMultiSelectMode ? () => handleLongPressPlace(place.id) : drag}
                      onToggleSelect={() => togglePlaceSelection(place.id)}
                      isActive={isActive}
                      selectedDay={selectedDay}
                      expandedOpeningHours={expandedOpeningHours}
                      toggleOpeningHours={toggleOpeningHours}
                    />
                  </ScaleDecorator>
                );
              }}
            />
          )}
        </GestureHandlerRootView>

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

            {/* Search Input with Favorites Toggle */}
            <View style={styles.searchContainerWrapper}>
              {/* Favorites Toggle Button - Outside search box */}
              <TouchableOpacity
                style={[
                  styles.favoritesToggleButton,
                  isUsingFavorites && styles.favoritesToggleButtonActive
                ]}
                onPress={toggleFavoritesMode}
                activeOpacity={0.7}
              >
                <FontAwesome 
                  name={isUsingFavorites ? "heart" : "heart-o"} 
                  size={20} 
                  color={isUsingFavorites ? COLORS.textWhite : COLORS.primary} 
                />
              </TouchableOpacity>
              
              {/* Search Input Box */}
              <View style={styles.searchInputContainer}>
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
                      // Show favorites when clearing search
                      const transformedFavorites = favoritesPlaces.map((fav: any) => ({
                        description: fav.name + (fav.address ? `, ${fav.address}` : ''),
                        place_id: fav.googlePlaceId || fav.placeId || fav.id,
                        structured_formatting: {
                          main_text: fav.name,
                          secondary_text: fav.address || fav.formatted_address || '',
                        },
                        isFavorite: true,
                        rating: fav.rating,
                        location: fav.location,
                      }));
                      setSearchResults(transformedFavorites);
                      setSessionToken(generateSessionToken());
                    }}
                  >
                    <FontAwesome name="times-circle" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
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

      {/* Replace POI Modal */}
      <Modal
        visible={isReplacePOIModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsReplacePOIModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + SPACING.lg }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thay đổi địa điểm</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setIsReplacePOIModalVisible(false);
                  setReplacingPlace(null);
                  setReplaceSearchQuery('');
                  setReplaceSearchResults([]);
                }}
              >
                <FontAwesome name="times" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Current Place Info */}
            {replacingPlace && (
              <View style={styles.currentPlaceInfo}>
                <Text style={styles.currentPlaceLabel}>Địa điểm hiện tại:</Text>
                <Text style={styles.currentPlaceName}>{replacingPlace.name}</Text>
              </View>
            )}

            {/* Search Input */}
            <View style={styles.searchInputContainer}>
              <FontAwesome name="search" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm kiếm địa điểm thay thế..."
                placeholderTextColor={COLORS.textSecondary}
                value={replaceSearchQuery}
                onChangeText={handleReplaceSearchChange}
                autoFocus
              />
              {replaceSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setReplaceSearchQuery('');
                    const transformedFavorites = favoritesPlaces.map((fav: any) => ({
                      description: fav.name + (fav.address ? `, ${fav.address}` : ''),
                      place_id: fav.googlePlaceId || fav.placeId || fav.id,
                      structured_formatting: {
                        main_text: fav.name,
                        secondary_text: fav.address || fav.formatted_address || '',
                      },
                      isFavorite: true,
                      rating: fav.rating,
                      location: fav.location,
                    }));
                    setReplaceSearchResults(transformedFavorites);
                    setReplaceSessionToken(generateSessionToken());
                  }}
                >
                  <FontAwesome name="times-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
              {isReplaceSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            {/* Search Results */}
            {isReplaceSearching ? (
              <View style={styles.searchLoadingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.searchLoadingText}>Đang tìm kiếm...</Text>
              </View>
            ) : replaceSearchResults.length > 0 ? (
              <FlatList
                data={replaceSearchResults}
                keyExtractor={(item) => item.place_id}
                keyboardShouldPersistTaps="handled"
                style={styles.searchResultsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchResultItem}
                    onPress={() => handleSelectNewPlace(item)}
                    activeOpacity={0.7}
                  >
                    {item.isFavorite ? (
                      <FontAwesome name="heart" size={20} color="#E91E63" />
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
            ) : replaceSearchQuery.length > 0 ? (
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
                <Text style={styles.loadingText}>Đang thay đổi địa điểm...</Text>
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

      {/* Title Input Modal */}
      <Modal
        visible={showTitleInputModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTitleInputModal(false)}
      >
        <TouchableOpacity
          style={styles.titleModalOverlay}
          activeOpacity={1}
          onPress={() => setShowTitleInputModal(false)}
        >
          <View style={styles.titleModalContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.titleModalHeader}>
              <Text style={styles.titleModalTitle}>Đặt tên lộ trình</Text>
              <TouchableOpacity
                style={styles.titleModalCloseButton}
                onPress={() => setShowTitleInputModal(false)}
              >
                <FontAwesome name="times" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.titleInputContainer}>
              <Text style={styles.titleInputLabel}>Tên lộ trình</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Nhập tên lộ trình"
                value={itineraryTitle}
                onChangeText={setItineraryTitle}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[
                styles.titleModalConfirmButton,
                isSaving && styles.titleModalConfirmButtonDisabled
              ]}
              onPress={handleConfirmSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={COLORS.textWhite} />
              ) : (
                <Text style={styles.titleModalConfirmText}>Lưu lộ trình</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Place Card Component with swipe actions
interface PlaceCardProps {
  place: PlaceItem;
  index: number;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  isActive?: boolean;
  onDelete: () => void;
  onReplace: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  selectedDay: number;
  expandedOpeningHours: Set<string>;
  toggleOpeningHours: (key: string) => void;
}

const PlaceCard: React.FC<PlaceCardProps> = (props: PlaceCardProps) => {
  const {
    place,
    index,
    isMultiSelectMode,
    isSelected,
    isActive,
    onDelete,
    onReplace,
    onLongPress,
    onToggleSelect,
    selectedDay,
    expandedOpeningHours,
    toggleOpeningHours,
  } = props;

  // Render left swipe action (Delete)
  const renderLeftActions = () => (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity
        style={[styles.swipeActionButton, styles.swipeDeleteButton]}
        onPress={onDelete}
        activeOpacity={0.7}
      >
        <FontAwesome name="trash-o" size={24} color={COLORS.textWhite} />
        <Text style={styles.swipeActionText}>Xóa</Text>
      </TouchableOpacity>
    </View>
  );

  // Render right swipe action (Replace)
  const renderRightActions = () => (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity
        style={[styles.swipeActionButton, styles.swipeEditButton]}
        onPress={onReplace}
        activeOpacity={0.7}
      >
        <FontAwesome name="exchange" size={24} color={COLORS.textWhite} />
        <Text style={styles.swipeActionText}>Thay</Text>
      </TouchableOpacity>
    </View>
  );

  const handlePress = () => {
    if (isMultiSelectMode) {
      onToggleSelect();
    }
  };

  return (
    <View style={styles.placeCardContainer}>
      <Swipeable
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        enabled={!isMultiSelectMode}
      >
        <View style={[
          styles.placeCard, 
          isSelected && styles.placeCardSelected,
          isActive && styles.placeCardDragging
        ]}>
          <TouchableOpacity
            style={styles.placeCardTouchable}
            onPress={handlePress}
            onLongPress={onLongPress}
            delayLongPress={500}
            activeOpacity={0.7}
            disabled={isActive}
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
              
              {/* Opening Hours - Expandable */}
              {(() => {
                const openingHours = place.openingHours;
                const placeKey = `${selectedDay}-${index}`;
                const isExpanded = expandedOpeningHours.has(placeKey);
                
                if (openingHours?.weekdayDescriptions) {
                  const today = new Date().getDay();
                  const dayIndex = today === 0 ? 6 : today - 1;
                  const todayHours = openingHours.weekdayDescriptions[dayIndex];
                  
                  if (isExpanded) {
                    // Show all days
                    return (
                      <View style={styles.expandedOpeningHoursContainer}>
                        {openingHours.weekdayDescriptions.map((dayHours: string, idx: number) => (
                          <Text key={idx} style={styles.expandedOpeningHoursText}>
                            {dayHours}
                          </Text>
                        ))}
                        <TouchableOpacity onPress={() => toggleOpeningHours(placeKey)}>
                          <Text style={styles.expandedOpeningHoursToggle}>Thu gọn ↑</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  } else if (todayHours) {
                    // Show today only
                    const hoursText = todayHours.split(': ')[1] || todayHours;
                    return (
                      <TouchableOpacity 
                        style={styles.openingHoursRow} 
                        onPress={() => toggleOpeningHours(placeKey)}
                      >
                        <FontAwesome name="clock-o" size={11} color={COLORS.textSecondary} />
                        <Text style={styles.openingHoursText} numberOfLines={1}>
                          {hoursText}
                        </Text>
                        <Text style={styles.expandMoreIndicator}> ↓</Text>
                      </TouchableOpacity>
                    );
                  }
                }
                return null;
              })()}
              
              {/* Rating */}
              {place.rating && (
                <View style={styles.ratingRow}>
                  <FontAwesome name="star" size={11} color="#F59E0B" />
                  <Text style={styles.ratingText}>{place.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>

            {/* Drag hint icon */}
            {!isMultiSelectMode && (
              <MaterialIcons name="drag-indicator" size={24} color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
      </Swipeable>
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
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  // Swipe Actions Styles
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  swipeActionButton: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs / 2,
  },
  swipeEditButton: {
    backgroundColor: COLORS.primary,
  },
  swipeDeleteButton: {
    backgroundColor: '#E91E63',
  },
  swipeActionText: {
    color: COLORS.textWhite,
    fontSize: 11,
    fontWeight: '600',
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
  placeCardDragging: {
    opacity: 0.7,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
  openingHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  openingHoursText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  expandMoreIndicator: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  expandedOpeningHoursContainer: {
    marginTop: 6,
    padding: 8,
    backgroundColor: COLORS.bgMain,
    borderRadius: 6,
    gap: 4,
  },
  expandedOpeningHoursText: {
    fontSize: 11,
    color: COLORS.textDark,
  },
  expandedOpeningHoursToggle: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
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
    maxHeight: SCREEN_HEIGHT * 0.9,
    width: '100%',
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
  currentPlaceInfo: {
    backgroundColor: COLORS.primary + '10',
    padding: SPACING.md,
    borderRadius: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  currentPlaceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs / 2,
  },
  currentPlaceName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  searchContainerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: SPACING.md,
    borderRadius: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  // Title Input Modal Styles (handled by titleModalOverlay)

  titleModalContainer: {
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    padding: SPACING.xl,
  },
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.textWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritesToggleButtonActive: {
    backgroundColor: '#E91E63',
    borderColor: '#E91E63',
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
