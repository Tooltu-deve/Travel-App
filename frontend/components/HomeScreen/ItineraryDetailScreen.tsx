import React, { useState } from 'react';
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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';

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
}

interface ItineraryDetailScreenProps {
  itinerary: ItineraryItem[];
  itineraryId: string;
  onClose: () => void;
  onConfirmSuccess?: () => void;
  onSendMessage?: (message: string) => void;
}

export const ItineraryDetailScreen: React.FC<ItineraryDetailScreenProps> = ({
  itinerary,
  itineraryId,
  onClose,
  onConfirmSuccess,
  onSendMessage,
}) => {
  const { token, signOut } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [itineraryStatus, setItineraryStatus] = useState<'DRAFT' | 'CONFIRMED' | null>(null);
  const API_BASE_URL = 'http://192.168.2.92:3000/api/v1';

  // Debug: Log when component mounts or props change
  React.useEffect(() => {
    console.debug('[ItineraryDetailScreen] Mounted/Updated:', {
      hasItinerary: !!itinerary,
      itineraryId,
      itineraryLength: itinerary?.length,
      hasToken: !!token,
    });

    // Fetch itinerary status from API
    const fetchItineraryStatus = async () => {
      if (!itineraryId || !token) return;
      try {
        const response = await fetch(`${API_BASE_URL}/ai/itineraries/${itineraryId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          console.debug('[ItineraryDetailScreen] Fetched status:', data?.status);
          setItineraryStatus(data?.status || 'DRAFT');
        }
      } catch (error) {
        console.error('[ItineraryDetailScreen] Error fetching status:', error);
      }
    };

    fetchItineraryStatus();
  }, [itinerary, itineraryId, token, API_BASE_URL]);

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
        { text: 'Hủy', onPress: () => {}, style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setIsConfirming(true);
            try {
              console.debug('[Confirm Itinerary] Sending confirm message to chatbot');
              // Gửi tin nhắn "xác nhận lộ trình" tới chatbot
              if (onSendMessage) {
                onSendMessage('xác nhận lộ trình');
                console.debug('[Confirm Itinerary] Message sent, closing detail screen');
                // Đóng detail screen và để chatbot xử lý
                setTimeout(() => {
                  onClose();
                }, 500);
              } else {
                Alert.alert('Lỗi', 'Không thể gửi message. Vui lòng thử lại.');
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

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary + '10', COLORS.bgMain]}
        style={styles.gradientBackground}
      >
        {/* Header */}
        <BlurView intensity={90} tint="light" style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={28} color={COLORS.textMain} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chi tiết lộ trình</Text>
            <View style={{ width: 44 }} />
          </View>
        </BlurView>

        {/* Itinerary Items */}
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
});

export default ItineraryDetailScreen;
