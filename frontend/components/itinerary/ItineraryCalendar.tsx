// ItineraryCalendar - Component hiển thị lịch cho lộ trình chính (MAIN route)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { TravelRoute, getRoutesAPI, getCustomItinerariesAPI } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Activity {
  name: string;
  location?: { lat: number; lng: number };
  estimated_arrival?: string;
  estimated_departure?: string;
  google_place_id?: string;
  travel_duration_minutes?: number;
}

interface DayPlan {
  day: number;
  activities: Activity[];
  day_start_time?: string;
}

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isInTrip: boolean;
  tripDayNumber?: number; // Day number in the trip (1, 2, 3...)
  activities?: Activity[];
}

interface ItineraryCalendarProps {
  onDayPress?: (date: Date, activities: Activity[], tripDayNumber: number) => void;
  onNoMainRoute?: () => void;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export const ItineraryCalendar: React.FC<ItineraryCalendarProps> = ({
  onDayPress,
  onNoMainRoute,
}) => {
  const [mainRoute, setMainRoute] = useState<TravelRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch main route function (memoized to prevent recreating on every render)
  const fetchMainRoute = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setError('Vui lòng đăng nhập để xem lịch');
        return;
      }

      // Try to get AI main route first
      let mainRouteData: TravelRoute | null = null;
      
      try {
        const aiMainResponse = await getRoutesAPI(token, 'MAIN');
        if (aiMainResponse.routes?.[0]) {
          mainRouteData = aiMainResponse.routes[0];
        }
      } catch (e) {
        console.log('No AI main route found');
      }

      // If no AI main route, try manual
      if (!mainRouteData) {
        try {
          const manualMainResponse = await getCustomItinerariesAPI(token, 'MAIN');
          if (Array.isArray(manualMainResponse) && manualMainResponse[0]) {
            mainRouteData = manualMainResponse[0];
          }
        } catch (e) {
          console.log('No manual main route found');
        }
      }

      setMainRoute(mainRouteData);
      
      if (!mainRouteData && onNoMainRoute) {
        onNoMainRoute();
      }
      
      // Set current month to the start of the trip if available
      if (mainRouteData) {
        const startDate = getRouteStartDate(mainRouteData);
        if (startDate) {
          setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
        }
      }
    } catch (err: any) {
      console.error('Error fetching main route:', err);
      setError(err.message || 'Không thể tải lộ trình chính');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onNoMainRoute]);

  // Auto-refetch when tab/screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('📅 Calendar tab focused - fetching main route...');
      fetchMainRoute(false);
    }, [fetchMainRoute])
  );

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    fetchMainRoute(true);
  }, [fetchMainRoute]);

  // Helper functions to extract route data
  const getRouteStartDate = (route: TravelRoute): Date | null => {
    const start =
      route.start_datetime ||
      route.route_data_json?.start_datetime ||
      route.route_data_json?.startDate ||
      route.route_data_json?.summary?.startDate ||
      (route as any)?.start_date ||
      route.route_data_json?.start_date;
    return start ? new Date(start) : null;
  };

  const getRouteDuration = (route: TravelRoute): number => {
    const daysFromCustom = Array.isArray(route.route_data_json?.days)
      ? route.route_data_json.days.length
      : undefined;

    return (
      route.duration_days ||
      route.route_data_json?.duration_days ||
      route.route_data_json?.summary?.total_days ||
      (Array.isArray(route.route_data_json?.optimized_route)
        ? route.route_data_json.optimized_route.length
        : undefined) ||
      daysFromCustom ||
      0
    );
  };

  const getRouteEndDate = (route: TravelRoute): Date | null => {
    const explicitEnd =
      (route as any)?.end_date || route.route_data_json?.end_date;
    if (explicitEnd) {
      const dt = new Date(explicitEnd);
      if (!isNaN(dt.getTime())) return dt;
    }

    const startDate = getRouteStartDate(route);
    const duration = getRouteDuration(route);
    if (!startDate || !duration) return null;

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    return endDate;
  };

  // Get optimized route data
  const optimizedRoute: DayPlan[] = useMemo(() => {
    if (!mainRoute) return [];
    
    const routeData = mainRoute.route_data_json || {};
    
    return (
      routeData.optimized_route ||
      (Array.isArray(routeData.days)
        ? routeData.days.map((d: any, idx: number) => ({
            day: d.day ?? d.dayNumber ?? idx + 1,
            activities: (d.places || []).map((p: any) => ({
              name: p.name,
              location: p.location,
              google_place_id: p.google_place_id || p.placeId,
              estimated_arrival: p.estimated_arrival,
              estimated_departure: p.estimated_departure,
              travel_duration_minutes: p.travel_duration_minutes,
            })),
          }))
        : [])
    );
  }, [mainRoute]);

  // Get trip dates range
  const tripStartDate = mainRoute ? getRouteStartDate(mainRoute) : null;
  const tripEndDate = mainRoute ? getRouteEndDate(mainRoute) : null;

  // Check if a date is within the trip
  const isDateInTrip = (date: Date): boolean => {
    if (!tripStartDate || !tripEndDate) return false;
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOnly = new Date(tripStartDate.getFullYear(), tripStartDate.getMonth(), tripStartDate.getDate());
    const endOnly = new Date(tripEndDate.getFullYear(), tripEndDate.getMonth(), tripEndDate.getDate());
    
    return dateOnly >= startOnly && dateOnly <= endOnly;
  };

  // Get trip day number for a date
  const getTripDayNumber = (date: Date): number => {
    if (!tripStartDate) return 0;
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOnly = new Date(tripStartDate.getFullYear(), tripStartDate.getMonth(), tripStartDate.getDate());
    
    const diffTime = dateOnly.getTime() - startOnly.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays + 1;
  };

  // Get activities for a specific trip day
  const getActivitiesForDay = (tripDayNumber: number): Activity[] => {
    const dayPlan = optimizedRoute.find(d => d.day === tripDayNumber);
    return dayPlan?.activities || [];
  };

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();
    
    const days: CalendarDay[] = [];
    
    // Add empty slots for days before the first day of month
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevDate = new Date(year, month, -startingDayOfWeek + i + 1);
      days.push({
        date: prevDate,
        dayNumber: prevDate.getDate(),
        isInTrip: false,
      });
    }
    
    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isInTrip = isDateInTrip(date);
      const tripDayNumber = isInTrip ? getTripDayNumber(date) : undefined;
      
      days.push({
        date,
        dayNumber: day,
        isInTrip,
        tripDayNumber,
        activities: tripDayNumber ? getActivitiesForDay(tripDayNumber) : undefined,
      });
    }
    
    // Add days to fill the last week
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const nextDate = new Date(year, month + 1, i);
        days.push({
          date: nextDate,
          dayNumber: nextDate.getDate(),
          isInTrip: false,
        });
      }
    }
    
    return days;
  }, [currentMonth, tripStartDate, tripEndDate, optimizedRoute]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Handle day press
  const handleDayPress = (calendarDay: CalendarDay) => {
    if (!calendarDay.isInTrip || !calendarDay.tripDayNumber) return;
    
    setSelectedDate(calendarDay.date);
    
    if (onDayPress) {
      onDayPress(
        calendarDay.date,
        calendarDay.activities || [],
        calendarDay.tripDayNumber
      );
    }
  };

  // Check if two dates are the same day
  const isSameDay = (date1: Date, date2: Date | null): boolean => {
    if (!date2) return false;
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return isSameDay(date, today);
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date): boolean => {
    return (
      date.getMonth() === currentMonth.getMonth() &&
      date.getFullYear() === currentMonth.getFullYear()
    );
  };

  // Format time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải lịch trình...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <FontAwesome name="exclamation-circle" size={48} color={COLORS.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // No main route state
  if (!mainRoute) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="calendar-blank" size={64} color={COLORS.textSecondary} />
        <Text style={styles.noRouteTitle}>Chưa có lộ trình chính</Text>
        <Text style={styles.noRouteSubtitle}>
          Hãy tạo và kích hoạt một lộ trình để xem lịch của bạn
        </Text>
      </View>
    );
  }

  // Selected day activities
  const selectedTripDayNumber = selectedDate ? getTripDayNumber(selectedDate) : null;
  const selectedActivities = selectedTripDayNumber ? getActivitiesForDay(selectedTripDayNumber) : [];

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Route Info Card */}
      <View style={styles.routeInfoCard}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.gradientSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.routeInfoGradient}
        >
          <View style={styles.routeInfoContent}>
            <Text style={styles.routeInfoTitle} numberOfLines={1}>
              {mainRoute.title || mainRoute.route_data_json?.summary?.title || 'Lộ trình của bạn'}
            </Text>
            <View style={styles.routeInfoDetails}>
              <View style={styles.routeInfoItem}>
                <FontAwesome name="map-marker" size={14} color={COLORS.textWhite} />
                <Text style={styles.routeInfoText}>
                  {mainRoute.destination || mainRoute.route_data_json?.destination || 'Điểm đến'}
                </Text>
              </View>
              <View style={styles.routeInfoItem}>
                <FontAwesome name="calendar" size={14} color={COLORS.textWhite} />
                <Text style={styles.routeInfoText}>
                  {tripStartDate 
                    ? `${tripStartDate.getDate()}/${tripStartDate.getMonth() + 1}` 
                    : '--'} 
                  {' - '}
                  {tripEndDate 
                    ? `${tripEndDate.getDate()}/${tripEndDate.getMonth() + 1}` 
                    : '--'}
                </Text>
              </View>
              <View style={styles.routeInfoItem}>
                <FontAwesome name="clock-o" size={14} color={COLORS.textWhite} />
                <Text style={styles.routeInfoText}>
                  {getRouteDuration(mainRoute)} ngày
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Calendar Header */}
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <FontAwesome name="chevron-left" size={18} color={COLORS.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={goToToday} style={styles.monthYearContainer}>
          <Text style={styles.monthYearText}>
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <FontAwesome name="chevron-right" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Weekday Labels */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((day, index) => (
          <View key={index} style={styles.weekdayCell}>
            <Text style={[
              styles.weekdayText,
              index === 0 && styles.sundayText
            ]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((calendarDay, index) => {
          const isSelected = isSameDay(calendarDay.date, selectedDate);
          const isTodayDate = isToday(calendarDay.date);
          const isInCurrentMonth = isCurrentMonth(calendarDay.date);
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                !isInCurrentMonth && styles.dayCellOutsideMonth,
                calendarDay.isInTrip && styles.dayCellInTrip,
                isSelected && styles.dayCellSelected,
                isTodayDate && styles.dayCellToday,
              ]}
              onPress={() => handleDayPress(calendarDay)}
              disabled={!calendarDay.isInTrip}
              activeOpacity={calendarDay.isInTrip ? 0.7 : 1}
            >
              <Text style={[
                styles.dayText,
                !isInCurrentMonth && styles.dayTextOutsideMonth,
                calendarDay.isInTrip && styles.dayTextInTrip,
                isSelected && styles.dayTextSelected,
                isTodayDate && styles.dayTextToday,
              ]}>
                {calendarDay.dayNumber}
              </Text>
              
              {/* Trip day indicator */}
              {calendarDay.isInTrip && calendarDay.tripDayNumber && (
                <View style={[
                  styles.tripDayBadge,
                  isSelected && styles.tripDayBadgeSelected,
                ]}>
                  <Text style={[
                    styles.tripDayBadgeText,
                    isSelected && styles.tripDayBadgeTextSelected,
                  ]}>
                    N{calendarDay.tripDayNumber}
                  </Text>
                </View>
              )}
              
              {/* Activity count indicator */}
              {calendarDay.activities && calendarDay.activities.length > 0 && (
                <View style={styles.activityDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>Ngày trong lộ trình</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
          <Text style={styles.legendText}>Có hoạt động</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendCircle, { borderColor: COLORS.success }]} />
          <Text style={styles.legendText}>Hôm nay</Text>
        </View>
      </View>

      {/* Selected Day Activities */}
      {selectedDate && selectedTripDayNumber && (
        <View style={styles.activitiesSection}>
          <View style={styles.activitiesSectionHeader}>
            <Text style={styles.activitiesSectionTitle}>
              Ngày {selectedTripDayNumber} - {selectedDate.toLocaleDateString('vi-VN', {
                weekday: 'long',
                day: 'numeric',
                month: 'numeric',
              })}
            </Text>
            <Text style={styles.activitiesCount}>
              {selectedActivities.length} hoạt động
            </Text>
          </View>

          {selectedActivities.length > 0 ? (
            selectedActivities.map((activity, index) => (
              <View key={index} style={styles.activityCard}>
                <View style={styles.activityNumberBadge}>
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.gradientSecondary]}
                    style={styles.activityNumberGradient}
                  >
                    <Text style={styles.activityNumberText}>{index + 1}</Text>
                  </LinearGradient>
                </View>
                
                <View style={styles.activityContent}>
                  <Text style={styles.activityName} numberOfLines={2}>
                    {activity.name}
                  </Text>
                  
                  <View style={styles.activityTimeRow}>
                    <FontAwesome name="clock-o" size={12} color={COLORS.textSecondary} />
                    <Text style={styles.activityTimeText}>
                      {formatTime(activity.estimated_arrival)} - {formatTime(activity.estimated_departure)}
                    </Text>
                  </View>
                  
                  {activity.travel_duration_minutes && (
                    <View style={styles.activityTravelRow}>
                      <MaterialCommunityIcons name="car" size={12} color={COLORS.primary} />
                      <Text style={styles.activityTravelText}>
                        Di chuyển: {activity.travel_duration_minutes} phút
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noActivitiesContainer}>
              <MaterialCommunityIcons name="calendar-blank" size={32} color={COLORS.textSecondary} />
              <Text style={styles.noActivitiesText}>Chưa có hoạt động cho ngày này</Text>
            </View>
          )}
        </View>
      )}

      {/* Spacer for bottom */}
      <View style={{ height: SPACING.xxxl }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
  },
  noRouteTitle: {
    marginTop: SPACING.lg,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  noRouteSubtitle: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  
  // Route Info Card
  routeInfoCard: {
    marginTop: SPACING.md,
    borderRadius: SPACING.lg,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  routeInfoGradient: {
    padding: SPACING.lg,
  },
  routeInfoContent: {
    gap: SPACING.sm,
  },
  routeInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  routeInfoDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  routeInfoText: {
    fontSize: 13,
    color: COLORS.textWhite,
    opacity: 0.9,
  },
  
  // Calendar Header
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYearContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  
  // Weekday Labels
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  sundayText: {
    color: COLORS.error,
  },
  
  // Calendar Grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (SCREEN_WIDTH - SPACING.lg * 2) / 7,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCellOutsideMonth: {
    opacity: 0.3,
  },
  dayCellInTrip: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: SPACING.sm,
  },
  dayCellSelected: {
    backgroundColor: COLORS.primary,
    borderRadius: SPACING.sm,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: COLORS.success,
    borderRadius: SPACING.sm,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  dayTextOutsideMonth: {
    color: COLORS.textSecondary,
  },
  dayTextInTrip: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  dayTextToday: {
    color: COLORS.success,
    fontWeight: '700',
  },
  tripDayBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.primary + '30',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tripDayBadgeSelected: {
    backgroundColor: COLORS.textWhite + '30',
  },
  tripDayBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tripDayBadgeTextSelected: {
    color: COLORS.textWhite,
  },
  activityDot: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  
  // Activities Section
  activitiesSection: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.bgMain,
    borderRadius: SPACING.lg,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activitiesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  activitiesSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  activitiesCount: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  
  // Activity Card
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  activityNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  activityNumberGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  activityContent: {
    flex: 1,
    gap: SPACING.xs,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  activityTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  activityTimeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  activityTravelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  activityTravelText: {
    fontSize: 12,
    color: COLORS.primary,
  },
  
  // No Activities
  noActivitiesContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  noActivitiesText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default ItineraryCalendar;
