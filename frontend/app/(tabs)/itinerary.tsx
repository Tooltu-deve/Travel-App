// ItineraryScreen - Trang lịch trình du lịch
import { getRoutesAPI, TravelRoute, updateRouteStatusAPI } from '@/services/api';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ItineraryScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mainRoute, setMainRoute] = useState<TravelRoute | null>(null);
  const [confirmedRoutes, setConfirmedRoutes] = useState<TravelRoute[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  
  useEffect(() => {
    let isMounted = true;

    const fetchAllRoutes = async () => {
      try {
        setIsLoadingRoutes(true);
        setRoutesError(null);

        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setRoutesError('Bạn cần đăng nhập để xem lộ trình.');
          return;
        }

        // Fetch MAIN route
        const mainResponse = await getRoutesAPI(token, 'MAIN');
        if (isMounted) {
          setMainRoute(mainResponse.routes?.[0] || null);
        }

        // Fetch CONFIRMED routes
        const confirmedResponse = await getRoutesAPI(token, 'CONFIRMED');
        if (isMounted) {
          setConfirmedRoutes(confirmedResponse.routes || []);
        }
      } catch (error: any) {
        console.error('❌ Fetch routes error:', error);
        if (isMounted) {
          setRoutesError(error.message || 'Không thể tải lộ trình.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingRoutes(false);
        }
      }
    };

    fetchAllRoutes();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleActivateRoute = async (routeId: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập.');
        return;
      }

      // Show confirmation alert before activating
      Alert.alert(
        'Xác nhận kích hoạt',
        'Bạn có chắc muốn đặt lộ trình này làm lộ trình chính?',
        [
          {
            text: 'Hủy',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Xác nhận',
            onPress: async () => {
              setIsActivating(routeId);
              try {
                // Update to MAIN status
                const response = await updateRouteStatusAPI(token, routeId, {
                  status: 'MAIN',
                });

                if (response.route) {
                  // Move from confirmed to main
                  setMainRoute(response.route);
                  setConfirmedRoutes(prev => prev.filter(r => r.route_id !== routeId));
                }
              } catch (error: any) {
                console.error('❌ Activate route error:', error);
                Alert.alert('Lỗi', error.message || 'Không thể kích hoạt lộ trình.');
              } finally {
                setIsActivating(null);
              }
            },
            style: 'default',
          },
        ]
      );
    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Lỗi', 'Đã xảy ra lỗi.');
    }
  };

  const handleViewRoute = (routeId: string) => {
    router.push({
      pathname: '/itinerary-details',
      params: { routeId },
    });
  };

  const handleCreateItinerary = () => {
    router.push('/create-itinerary');
  };

  const formatDate = (dateValue: string | Date) => {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) {
      return '--/--/----';
    }
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return COLORS.primary;
      case 'upcoming':
        return COLORS.accent;
      case 'completed':
        return COLORS.success;
      case 'confirmed':
        return COLORS.primary;
      default:
        return COLORS.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Đang diễn ra';
      case 'upcoming':
        return 'Sắp tới';
      case 'completed':
        return 'Đã hoàn thành';
      case 'confirmed':
        return 'Đã lưu';
      default:
        return '';
    }
  };

  const getRouteTitle = (route: TravelRoute, index: number) => {
    const fallbackTitle =
      route.route_data_json?.summary?.title ||
      route.route_data_json?.metadata?.title ||
      route.route_data_json?.destination;

    return (
      route.title?.trim() ||
      (typeof fallbackTitle === 'string' && fallbackTitle.trim()) ||
      `Lộ trình ${route.route_id?.slice(-6) || index + 1}`
    );
  };

  const getRouteDestination = (route: TravelRoute) => {
    return (
      route.destination ||
      route.route_data_json?.destination ||
      route.route_data_json?.city ||
      route.route_data_json?.metadata?.destination ||
      'Không xác định'
    );
  };

  const getRouteDuration = (route: TravelRoute) => {
    return (
      route.duration_days ||
      route.route_data_json?.duration_days ||
      route.route_data_json?.summary?.total_days ||
      (Array.isArray(route.route_data_json?.optimized_route)
        ? route.route_data_json.optimized_route.length
        : undefined) ||
      0
    );
  };

  const getRouteStartDate = (route: TravelRoute) => {
    const start =
      route.start_datetime ||
      route.route_data_json?.start_datetime ||
      route.route_data_json?.startDate ||
      route.route_data_json?.summary?.startDate;
    return start ? new Date(start) : null;
  };

  const getRouteEndDate = (route: TravelRoute) => {
    const startDate = getRouteStartDate(route);
    const duration = getRouteDuration(route);
    if (!startDate || !duration) return null;

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration - 1);
    return endDate;
  };

  const getRoutePlaces = (route: TravelRoute) => {
    const optimized = route.route_data_json?.optimized_route;
    if (Array.isArray(optimized)) {
      return optimized.reduce(
        (sum, day) => sum + (day?.activities?.length || 0),
        0,
      );
    }

    const activities = route.route_data_json?.activities;
    if (Array.isArray(activities)) {
      return activities.length;
    }

    return route.route_data_json?.places?.length || 0;
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <ScrollView 
        style={{flex:1}}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
      >
        {/* Header */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}> 
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Lịch trình của bạn</Text>
            <Text style={styles.headerSubtitle}>Quản lý các hành trình du lịch</Text>
          </View>
        </View>

        {/* Create Button */}
        <View style={styles.createButtonContainer}> 
          <TouchableOpacity 
            style={styles.createButton}
            onPress={handleCreateItinerary}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.gradientSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              <FontAwesome name="plus-circle" size={20} color={COLORS.textWhite} />
              <Text style={styles.createButtonText}>Tạo lộ trình mới</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Current Itinerary Section */}
        <Text style={[styles.sectionTitle, {marginLeft: SPACING.lg}]}>Lộ trình hiện tại</Text>
        <View style={{marginHorizontal: SPACING.lg}}>
          {isLoadingRoutes ? (
            <View style={styles.dataStateContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.dataStateText}>Đang tải...</Text>
            </View>
          ) : mainRoute ? (
            <View style={styles.currentItineraryCard}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.gradientSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.currentCardGradient}
              >
                <View style={styles.currentCardHeader}>
                  <View style={styles.currentCardTitleContainer}>
                    <Text style={styles.currentCardTitle}>{getRouteTitle(mainRoute, 0)}</Text>
                    <View style={styles.statusBadge}> 
                      <Text style={[styles.statusText, { color: COLORS.success }]}>
                        Đang hoạt động
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.currentCardContent}>
                  <View style={styles.currentCardRow}>
                    <FontAwesome name="map-marker" size={16} color={COLORS.textWhite} />
                    <Text style={styles.currentCardText}>{getRouteDestination(mainRoute)}</Text>
                  </View>
                  <View style={styles.currentCardRow}>
                    <FontAwesome name="calendar" size={16} color={COLORS.textWhite} />
                    <Text style={styles.currentCardText}>
                      {(() => {
                        const start = getRouteStartDate(mainRoute);
                        const end = getRouteEndDate(mainRoute);
                        if (!start && !end) return 'Chưa xác định';
                        if (start && !end) return formatDate(start);
                        if (start && end) {
                          return `${formatDate(start)} - ${formatDate(end)}`;
                        }
                        return 'Chưa xác định';
                      })()}
                    </Text>
                  </View>
                  <View style={styles.currentCardInfoRow}>
                    <View style={styles.currentCardInfoItem}>
                      <FontAwesome name="clock-o" size={14} color={COLORS.textWhite} />
                      <Text style={styles.currentCardInfoText}>{getRouteDuration(mainRoute)} ngày</Text>
                    </View>
                    <View style={styles.currentCardInfoItem}>
                      <FontAwesome name="map-pin" size={14} color={COLORS.textWhite} />
                      <Text style={styles.currentCardInfoText}>{getRoutePlaces(mainRoute)} địa điểm</Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : (
            <View style={styles.emptyMainContainer}>
              <FontAwesome name="map-o" size={48} color={COLORS.textSecondary} />
              <Text style={styles.emptyMainText}>Chưa có lộ trình chính</Text>
              <Text style={styles.emptyMainSubtext}>
                Chọn một lộ trình bên dưới để kích hoạt làm lộ trình chính
              </Text>
            </View>
          )}
        </View>

        {/* Other Itineraries Section */}
        <>
          <Text style={[styles.sectionTitle, {marginLeft: SPACING.lg}]}>
            Lộ trình đã lưu
          </Text>
          <View style={{marginHorizontal: SPACING.lg}}>
            {isLoadingRoutes && (
              <View style={styles.dataStateContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.dataStateText}>Đang tải lộ trình...</Text>
              </View>
            )}

            {!isLoadingRoutes && routesError && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="exclamation-circle" size={18} color={COLORS.error} />
                <Text style={[styles.dataStateText, styles.errorText]}>
                  {routesError}
                </Text>
              </View>
            )}

            {!isLoadingRoutes && !routesError && confirmedRoutes.length === 0 && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="info-circle" size={18} color={COLORS.textSecondary} />
                <Text style={styles.dataStateText}>
                  Chưa có lộ trình nào được lưu.
                </Text>
              </View>
            )}

            {!isLoadingRoutes && !routesError && confirmedRoutes.length > 0 && (
              confirmedRoutes.map((route, index) => (
                <TouchableOpacity
                  key={route.route_id}
                  style={styles.itineraryCard}
                  activeOpacity={0.9}
                  onPress={() => handleViewRoute(route.route_id)}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleContainer}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {getRouteTitle(route, index)}
                          </Text>
                        </View>
                        <View style={styles.cardHeaderRight}>
                          <View
                            style={[
                              styles.statusBadgeSmall,
                              { backgroundColor: getStatusColor('confirmed') + '20' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTextSmall,
                                { color: getStatusColor('confirmed') },
                              ]}
                            >
                              {getStatusText('confirmed')}
                            </Text>
                          </View>
                        </View>
                      </View>
                      </View>

                      <View style={styles.cardBody}>
                      <View style={styles.cardRow}>
                        <FontAwesome name="map-marker" size={14} color={COLORS.primary} />
                        <Text style={styles.cardText}>{getRouteDestination(route)}</Text>
                      </View>

                      <View style={styles.cardRow}>
                        <FontAwesome name="calendar" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.cardTextSecondary}>
                          {(() => {
                            const start = getRouteStartDate(route);
                            const end = getRouteEndDate(route);
                            if (!start && !end) return 'Chưa xác định';
                            if (start && !end) return formatDate(start);
                            if (start && end) {
                              return `${formatDate(start)} - ${formatDate(end)}`;
                            }
                            return 'Chưa xác định';
                          })()}
                        </Text>
                      </View>

                      <View style={styles.cardFooterWithButton}>
                        <View style={styles.cardFooter}>
                          <View style={styles.cardInfoItem}>
                            <FontAwesome name="clock-o" size={12} color={COLORS.textSecondary} />
                            <Text style={styles.cardInfoText}>
                              {getRouteDuration(route) || '?'} ngày
                            </Text>
                          </View>
                          <View style={styles.cardInfoItem}>
                            <FontAwesome name="map-pin" size={12} color={COLORS.textSecondary} />
                            <Text style={styles.cardInfoText}>
                              {getRoutePlaces(route)} địa điểm
                            </Text>
                          </View>
                        </View>

                        {/* Activate Button - Play Icon */}
                        <TouchableOpacity
                          style={[
                            styles.activatePlayButton,
                            isActivating === route.route_id && styles.activatePlayButtonLoading,
                          ]}
                          onPress={() => handleActivateRoute(route.route_id)}
                          disabled={isActivating === route.route_id}
                          activeOpacity={0.7}
                        >
                          <LinearGradient
                            colors={
                              isActivating === route.route_id
                                ? [COLORS.disabled, COLORS.disabled]
                                : [COLORS.primary, '#4DB8FF']
                            }
                            style={styles.activatePlayButtonGradient}
                          >
                            {isActivating === route.route_id ? (
                              <ActivityIndicator size="small" color={COLORS.textWhite} />
                            ) : (
                              <FontAwesome name="play" size={12} color={COLORS.textWhite} />
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </>

        {/* Empty State */}
        {!isLoadingRoutes && !mainRoute && confirmedRoutes.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <FontAwesome name="map-o" size={64} color={COLORS.textSecondary} />
            <Text style={styles.emptyStateText}>Chưa có lộ trình nào</Text>
            <Text style={styles.emptyStateSubtext}>
              Tạo lộ trình đầu tiên của bạn để bắt đầu hành trình
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTextContainer: {
    gap: SPACING.xs / 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primary,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  createButtonContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  createButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  currentItineraryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  currentCardGradient: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  currentCardHeader: {
    gap: SPACING.sm,
  },
  currentCardTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  currentCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textWhite,
    flex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  currentCardContent: {
    gap: SPACING.sm,
  },
  currentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  currentCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  currentCardInfoRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
  },
  currentCardInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  currentCardInfoText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textWhite,
    opacity: 0.9,
  },
  statusBadge: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  itineraryCard: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  cardContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardHeader: {
    gap: SPACING.sm,
  },
  cardTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    flex: 1,
  },
  statusBadgeSmall: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 10,
  },
  statusTextSmall: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    gap: SPACING.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cardText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    flex: 1,
  },
  cardTextSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    flex: 1,
  },
  cardFooterWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  cardInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardInfoText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  dataStateContainer: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgMain,
  },
  dataStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  errorText: {
    color: COLORS.error,
    fontWeight: '600',
  },
  emptyMainContainer: {
    backgroundColor: COLORS.bgMain,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  emptyMainText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginTop: SPACING.sm,
  },
  emptyMainSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  activateButton: {
    marginTop: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  activateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  activateButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textWhite,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 163, 255, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  activatePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  activatePlayButtonLoading: {
    opacity: 0.8,
  },
  activatePlayButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default ItineraryScreen;
