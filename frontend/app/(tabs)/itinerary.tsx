// ItineraryScreen - Trang lịch trình du lịch
import { getRoutesAPI, TravelRoute, updateRouteStatusAPI, getCustomItinerariesAPI, updateCustomItineraryStatusAPI } from '@/services/api';
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
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { ItineraryViewScreen } from '@/components/itinerary/ItineraryViewScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabType = 'ai' | 'manual';

const ItineraryScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const [mainRoute, setMainRoute] = useState<TravelRoute | null>(null);
  const [confirmedRoutes, setConfirmedRoutes] = useState<TravelRoute[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [isLoadingConfirmedRoutes, setIsLoadingConfirmedRoutes] = useState(false);
  const [isLoadingMainRoute, setIsLoadingMainRoute] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [viewerRouteId, setViewerRouteId] = useState<string | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerRouteData, setViewerRouteData] = useState<TravelRoute | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingRouteName, setEditingRouteName] = useState('');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;

      const fetchConfirmedRoutes = async () => {
        try {
          setIsLoadingConfirmedRoutes(true);
          setRoutesError(null);

          const token = await AsyncStorage.getItem('userToken');
          if (!token) {
            setRoutesError('Bạn cần đăng nhập để xem lộ trình.');
            return;
          }

          // Fetch confirmed routes based on active tab
          if (activeTab === 'ai') {
            // Fetch AI routes (itinerary endpoint)
            const confirmedResponse = await getRoutesAPI(token, 'CONFIRMED');
            if (isMounted) {
              setConfirmedRoutes(confirmedResponse.routes || []);
            }
          } else {
            // Fetch Manual routes (custom-itinerary endpoint)
            const confirmedResponse = await getCustomItinerariesAPI(token, 'CONFIRMED');
            if (isMounted) {
              setConfirmedRoutes(Array.isArray(confirmedResponse) ? confirmedResponse : []);
            }
          }
        } catch (error: any) {
          console.error('❌ Fetch routes error:', error);
          if (isMounted) {
            setRoutesError(error.message || 'Không thể tải lộ trình.');
          }
        } finally {
          if (isMounted) {
            setIsLoadingConfirmedRoutes(false);
          }
        }
      };

      fetchConfirmedRoutes();

      return () => {
        isMounted = false;
      };
    }, [activeTab]) // Also depend on activeTab to refetch when tab changes
  );

  // Separate useEffect for main route (runs only once on mount)
  useEffect(() => {
    let isMounted = true;

    const fetchMainRoute = async () => {
      try {
        setIsLoadingMainRoute(true);
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        // Fetch MAIN route from both AI and Manual sources (MAIN route is unique)
        let mainRouteData = null;
        try {
          // Try AI routes first
          const aiMainResponse = await getRoutesAPI(token, 'MAIN');
          if (aiMainResponse.routes?.[0]) {
            mainRouteData = aiMainResponse.routes[0];
          }
        } catch (error) {
          console.log('No AI main route found, trying manual...');
        }

        // If no AI main route, try manual
        if (!mainRouteData) {
          try {
            const manualMainResponse = await getCustomItinerariesAPI(token, 'MAIN');
            if (manualMainResponse?.[0]) {
              mainRouteData = manualMainResponse[0];
            }
          } catch (error) {
            console.log('No manual main route found either');
          }
        }

        if (isMounted) {
          setMainRoute(mainRouteData);
        }
      } catch (error: any) {
        console.error('❌ Fetch main route error:', error);
      } finally {
        if (isMounted) {
          setIsLoadingMainRoute(false);
        }
      }
    };

    fetchMainRoute();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - runs only once on mount

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
                // Update to MAIN status based on active tab
                if (activeTab === 'ai') {
                  // Use itinerary endpoint for AI routes
                  await updateRouteStatusAPI(token, routeId, {
                    status: 'MAIN',
                  });
                } else {
                  // Use custom-itinerary endpoint for manual routes
                  await updateCustomItineraryStatusAPI(routeId, 'MAIN', undefined, token);
                }

                // Refresh both main and confirmed routes after activation
                let newMainRoute = null;
                try {
                  const aiMainResponse = await getRoutesAPI(token, 'MAIN');
                  if (aiMainResponse.routes?.[0]) {
                    newMainRoute = aiMainResponse.routes[0];
                  }
                } catch (error) {
                  console.log('No AI main route found');
                }

                if (!newMainRoute) {
                  try {
                    const manualMainResponse = await getCustomItinerariesAPI(token, 'MAIN');
                    if (manualMainResponse?.[0]) {
                      newMainRoute = manualMainResponse[0];
                    }
                  } catch (error) {
                    console.log('No manual main route found');
                  }
                }

                setMainRoute(newMainRoute);

                // Refresh confirmed routes for current tab
                if (activeTab === 'ai') {
                  const confirmedResponse = await getRoutesAPI(token, 'CONFIRMED');
                  setConfirmedRoutes(confirmedResponse.routes || []);
                } else {
                  const confirmedResponse = await getCustomItinerariesAPI(token, 'CONFIRMED');
                  setConfirmedRoutes(Array.isArray(confirmedResponse) ? confirmedResponse : []);
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

  const handleDeleteRoute = async (routeId: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập.');
        return;
      }

      try {
        // Update status to DRAFT based on active tab
        if (activeTab === 'ai') {
          // Use itinerary endpoint for AI routes
          await updateRouteStatusAPI(token, routeId, {
            status: 'DRAFT',
          });
        } else {
          // Use custom-itinerary endpoint for manual routes
          await updateCustomItineraryStatusAPI(routeId, 'DRAFT', undefined, token);
        }

        // Remove from confirmed routes list
        setConfirmedRoutes(prev => prev.filter(r => r.route_id !== routeId));
      } catch (error: any) {
        console.error('❌ Delete route error:', error);
        Alert.alert('Lỗi', error.message || 'Không thể xóa lộ trình.');
      }
    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Lỗi', 'Đã xảy ra lỗi.');
    }
  };

  const handleViewRoute = (route: TravelRoute) => {
    setViewerRouteId(route.route_id);
    setViewerRouteData(route);
    setIsViewerVisible(true);
  };

  const handleCompleteRoute = async (routeId: string) => {
    try {
      // Show confirmation alert
      Alert.alert(
        'Hoàn thành lộ trình',
        'Bạn có chắc đã hoàn thành lộ trình này?',
        [
          {
            text: 'Hủy',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Xác nhận',
            onPress: async () => {
              try {
                // Just remove the main route - no API call needed
                setMainRoute(null);

                // Show beautiful congratulation message
                Alert.alert(
                  '🎉 Chúc mừng bạn! 🎉',
                  'Bạn đã hoàn thành một hành trình tuyệt vời! Cảm ơn bạn đã tin tưởng ứng dụng của chúng tôi. Hãy lên kế hoạch cho chuyến du lịch tiếp theo của bạn!',
                  [
                    {
                      text: 'Tạo lộ trình mới',
                      onPress: () => handleCreateItinerary(),
                      style: 'default',
                    },
                    {
                      text: 'Để sau',
                      onPress: () => {},
                      style: 'cancel',
                    },
                  ]
                );
              } catch (error: any) {
                console.error('❌ Complete route error:', error);
                Alert.alert('Lỗi', error.message || 'Không thể hoàn thành lộ trình.');
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

  const handleCreateItinerary = () => {
    router.push('/create-itinerary');
  };

  const handleEditRouteName = (route: TravelRoute, index: number) => {
    setEditingRouteId(route.route_id);
    setEditingRouteName(getRouteTitle(route, index));
    setIsEditModalVisible(true);
  };

  const handleSaveRouteName = async () => {
    if (!editingRouteId || !editingRouteName.trim()) {
      Alert.alert('Lỗi', 'Tên lộ trình không được để trống.');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập.');
        return;
      }

      // Update the route title
      if (activeTab === 'ai') {
        await updateRouteStatusAPI(token, editingRouteId, {
          status: mainRoute?.route_id === editingRouteId ? 'MAIN' : 'CONFIRMED',
          title: editingRouteName.trim(),
        });
      } else {
        await updateCustomItineraryStatusAPI(
          editingRouteId,
          mainRoute?.route_id === editingRouteId ? 'MAIN' : 'CONFIRMED',
          editingRouteName.trim(),
          token
        );
      }

      // Update local state
      if (mainRoute?.route_id === editingRouteId) {
        setMainRoute({ ...mainRoute, title: editingRouteName.trim() });
      } else {
        setConfirmedRoutes(prev =>
          prev.map(r =>
            r.route_id === editingRouteId
              ? { ...r, title: editingRouteName.trim() }
              : r
          )
        );
      }

      setIsEditModalVisible(false);
      setEditingRouteId(null);
      setEditingRouteName('');
    } catch (error: any) {
      console.error('❌ Edit route name error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể cập nhật tên lộ trình.');
    }
  };

  const renderRightActions = (routeId: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteRoute(routeId)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={[COLORS.error, '#FF6B6B']}
          style={styles.deleteActionGradient}
        >
          <FontAwesome name="trash" size={20} color={COLORS.textWhite} />
        </LinearGradient>
      </TouchableOpacity>
    );
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

    const baseTitle =
      route.title?.trim() ||
      (typeof fallbackTitle === 'string' && fallbackTitle.trim()) ||
      `Lộ trình ${route.route_id?.slice(-6) || index + 1}`;

    // Get helper function to extract title from a route
    const extractTitle = (r: TravelRoute, fallbackIndex: number) => {
      return (
        r.title?.trim() ||
        (typeof (r.route_data_json?.summary?.title || r.route_data_json?.metadata?.title || r.route_data_json?.destination) === 'string'
          ? (r.route_data_json?.summary?.title || r.route_data_json?.metadata?.title || r.route_data_json?.destination).trim()
          : `Lộ trình ${r.route_id?.slice(-6) || fallbackIndex}`)
      );
    };

    // Combine mainRoute and confirmedRoutes for duplicate checking
    const allRoutes: TravelRoute[] = [];
    if (mainRoute) {
      allRoutes.push(mainRoute);
    }
    allRoutes.push(...confirmedRoutes);

    // Find all routes with the same base title
    const sameNameRoutes = allRoutes.filter(r => {
      const otherTitle = extractTitle(r, allRoutes.indexOf(r) + 1);
      return otherTitle === baseTitle;
    });

    // If only one route with this name, no suffix needed
    if (sameNameRoutes.length === 1) {
      return baseTitle;
    }

    // Find position of current route in the same-name group (1-indexed)
    const positionInGroup = sameNameRoutes.findIndex(r => r.route_id === route.route_id) + 1;

    // Only add suffix if it's the 2nd or later occurrence
    if (positionInGroup > 1) {
      return `${baseTitle} (${positionInGroup})`;
    }

    return baseTitle;
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
    // Prefer custom itinerary days length if present
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

  const getRouteStartDate = (route: TravelRoute) => {
    const start =
      route.start_datetime ||
      route.route_data_json?.start_datetime ||
      route.route_data_json?.startDate ||
      route.route_data_json?.summary?.startDate ||
      (route as any)?.start_date ||
      route.route_data_json?.start_date;
    return start ? new Date(start) : null;
  };

  const getRouteEndDate = (route: TravelRoute) => {
    // If end_date provided, use it directly
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

  const getRoutePlaces = (route: TravelRoute) => {
    const optimized = route.route_data_json?.optimized_route;
    if (Array.isArray(optimized)) {
      return optimized.reduce(
        (sum, day) => sum + (day?.activities?.length || 0),
        0,
      );
    }

    // custom itinerary: sum of days.places
    const days = route.route_data_json?.days;
    if (Array.isArray(days)) {
      return days.reduce(
        (sum, day) => sum + ((day?.places && Array.isArray(day.places)) ? day.places.length : 0),
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          {isLoadingMainRoute ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tải lộ trình chính...</Text>
            </View>
          ) : mainRoute ? (
            <TouchableOpacity 
              style={styles.currentItineraryCard}
              onPress={() => handleViewRoute(mainRoute)}
              activeOpacity={0.9}
            >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.gradientSecondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.currentCardGradient}
                >
                  <View style={styles.currentCardHeader}>
                    <View style={styles.currentCardTitleContainer}>
                      <View style={styles.titleEditContainer}>
                        <Text style={styles.currentCardTitle}>{getRouteTitle(mainRoute, 0)}</Text>
                        <TouchableOpacity
                          onPress={() => handleEditRouteName(mainRoute, 0)}
                          style={styles.editIconButton}
                        >
                          <FontAwesome name="pencil" size={18} color={COLORS.textWhite} />
                        </TouchableOpacity>
                      </View>
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
                  {/* Complete Button */}
                  <TouchableOpacity
                    style={styles.completeButton}
                    onPress={() => handleCompleteRoute(mainRoute.route_id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.completeButtonContent}>
                      <FontAwesome name="check" size={18} color={COLORS.primary} />
                      <Text style={styles.completeButtonText}>Hoàn thành</Text>
                    </View>
                  </TouchableOpacity>
                </LinearGradient>
            </TouchableOpacity>
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

        {/* Tab Selector for AI / Manual */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ai' && styles.tabActive]}
            onPress={() => setActiveTab('ai')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="magic"
              size={16}
              color={activeTab === 'ai' ? COLORS.textWhite : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'ai' && styles.tabTextActive]}>
              AI
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
            onPress={() => setActiveTab('manual')}
            activeOpacity={0.7}
          >
            <FontAwesome
              name="edit"
              size={16}
              color={activeTab === 'manual' ? COLORS.textWhite : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>
              Thủ công
            </Text>
          </TouchableOpacity>
        </View>

        {/* Other Itineraries Section */}
        <>
          <Text style={[styles.sectionTitle, {marginLeft: SPACING.lg, marginTop: SPACING.xl}]}>
            Lộ trình đã lưu
          </Text>
          <View style={{marginHorizontal: SPACING.lg}}>
            {isLoadingConfirmedRoutes && (
              <View style={styles.dataStateContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.dataStateText}>Đang tải lộ trình...</Text>
              </View>
            )}

            {!isLoadingConfirmedRoutes && routesError && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="exclamation-circle" size={18} color={COLORS.error} />
                <Text style={[styles.dataStateText, styles.errorText]}>
                  {routesError}
                </Text>
              </View>
            )}

            {!isLoadingConfirmedRoutes && !routesError && confirmedRoutes.length === 0 && (
              <View style={styles.dataStateContainer}>
                <FontAwesome name="info-circle" size={18} color={COLORS.textSecondary} />
                <Text style={styles.dataStateText}>
                  Chưa có lộ trình nào được lưu.
                </Text>
              </View>
            )}

            {!isLoadingConfirmedRoutes && !routesError && confirmedRoutes.length > 0 && (
              confirmedRoutes.map((route, index) => (
                <Swipeable
                  key={route.route_id}
                  renderRightActions={() => renderRightActions(route.route_id)}
                  rightThreshold={40}
                >
                  <TouchableOpacity
                    style={styles.itineraryCard}
                    activeOpacity={0.9}
                    onPress={() => handleViewRoute(route)}
                  >
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleContainer}>
                        <View style={[styles.cardTitleWrapper, { flex: 1 }]}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {getRouteTitle(route, index)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleEditRouteName(route, index)}
                          style={styles.cardEditIconButton}
                        >
                          <FontAwesome name="pencil" size={16} color={COLORS.primary} />
                        </TouchableOpacity>
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
                </Swipeable>
              ))
            )}
          </View>
        </>

        {/* Empty State */}
        {!isLoadingMainRoute && !mainRoute && confirmedRoutes.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <FontAwesome name="map-o" size={64} color={COLORS.textSecondary} />
            <Text style={styles.emptyStateText}>Chưa có lộ trình nào</Text>
            <Text style={styles.emptyStateSubtext}>
              Tạo lộ trình đầu tiên của bạn để bắt đầu hành trình
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Route viewer modal (reuse ItineraryViewScreen) */}
      {viewerRouteId && (
        <ItineraryViewScreen
          visible={isViewerVisible}
          routeId={viewerRouteId}
          isManual={activeTab === 'manual'}
          customRouteData={
            activeTab === 'manual'
              ? {
                  route_id: viewerRouteId,
                  title: viewerRouteData?.title,
                  destination: viewerRouteData?.destination,
                  status: viewerRouteData?.status as any,
                  start_date: (viewerRouteData as any)?.start_date,
                  end_date: (viewerRouteData as any)?.end_date,
                  start_location: (viewerRouteData as any)?.start_location,
                  route_data_json: viewerRouteData?.route_data_json,
                }
              : undefined
          }
          onClose={() => {
            setIsViewerVisible(false);
            setViewerRouteId(null);
            setViewerRouteData(null);
          }}
        />
      )}

      {/* Edit Route Name Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chỉnh sửa tên lộ trình</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nhập tên lộ trình mới"
              placeholderTextColor={COLORS.textSecondary}
              value={editingRouteName}
              onChangeText={setEditingRouteName}
              maxLength={50}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveRouteName}
              >
                <Text style={styles.saveButtonText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
    </GestureHandlerRootView>
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
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    marginVertical: SPACING.md,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: SPACING.sm,
    marginRight: SPACING.md,
  },
  deleteActionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    width: '100%',
  },
  completeButton: {
    marginTop: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.textWhite,
  },
  completeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  titleEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
    flex: 1,
  },
  editIconButton: {
    padding: SPACING.xs / 2,
    marginLeft: SPACING.xs / 2,
  },
  cardTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs / 2,
  },
  cardEditIconButton: {
    padding: SPACING.xs / 2,
    marginLeft: SPACING.xs / 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.textWhite,
    borderRadius: 16,
    padding: SPACING.lg,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.textDark,
    marginBottom: SPACING.lg,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
});

export default ItineraryScreen;
