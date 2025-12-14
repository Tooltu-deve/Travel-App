// CalendarScreen - Trang lịch hiển thị lịch trình chính của người dùng
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { ItineraryCalendar } from '../../components/itinerary/ItineraryCalendar';

const CalendarScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Handle when no main route exists
  const handleNoMainRoute = () => {
    // Could navigate to itinerary creation or show a prompt
    console.log('No main route found');
  };

  // Handle day press - could navigate to day details or show modal
  const handleDayPress = (date: Date, activities: any[], tripDayNumber: number) => {
    console.log('Day pressed:', {
      date: date.toISOString(),
      activitiesCount: activities.length,
      tripDayNumber,
    });
    // Could implement navigation to a detailed day view
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Lịch lộ trình</Text>
          <Text style={styles.headerSubtitle}>Xem lịch trình chính của bạn</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.itineraryButton}
          onPress={() => router.push('/(tabs)/itinerary')}
          activeOpacity={0.8}
        >
          <FontAwesome name="list" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Calendar Component */}
      <ItineraryCalendar
        onDayPress={handleDayPress}
        onNoMainRoute={handleNoMainRoute}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  itineraryButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default CalendarScreen;
