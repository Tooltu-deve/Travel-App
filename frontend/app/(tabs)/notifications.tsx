// NotificationScreen - Trang thông báo
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import {
  Notification,
  NotificationType,
  getNotificationsAPI,
  getUnreadCountAPI,
  markNotificationAsReadAPI,
  markAllNotificationsAsReadAPI,
  deleteNotificationAPI,
  deleteAllNotificationsAPI,
} from '../../services/api';

const NotificationScreen: React.FC = () => {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Fetch notifications - without filter dependencies
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    
    try {
      const data = await getNotificationsAPI(token);
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      Alert.alert('Lỗi', 'Không thể tải thông báo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    
    try {
      const { count } = await getUnreadCountAPI(token);
      setUnreadCount(count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [token]);

  // Apply filters
  const applyFilters = useCallback((
    data: Notification[],
    type: NotificationType | 'all',
    unreadOnly: boolean
  ) => {
    let filtered = [...data];
    
    if (type !== 'all') {
      filtered = filtered.filter((n) => n.type === type);
    }
    
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.is_read);
    }
    
    setFilteredNotifications(filtered);
  }, []);

  // Mark as read
  const handleMarkAsRead = async (notificationId: string) => {
    if (!token) return;
    
    try {
      await markNotificationAsReadAPI(token, notificationId);
      
      // Update local state
      const updatedNotifications = notifications.map((n) =>
        n._id === notificationId ? { ...n, is_read: true } : n
      );
      setNotifications(updatedNotifications);
      
      // Apply filters immediately
      let filtered = [...updatedNotifications];
      if (filterType !== 'all') {
        filtered = filtered.filter((n) => n.type === filterType);
      }
      if (showUnreadOnly) {
        filtered = filtered.filter((n) => !n.is_read);
      }
      setFilteredNotifications(filtered);
      
      fetchUnreadCount();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (!token) return;
    
    try {
      await markAllNotificationsAsReadAPI(token);
      
      const updatedNotifications = notifications.map((n) => ({ ...n, is_read: true }));
      setNotifications(updatedNotifications);
      
      // Apply filters immediately
      let filtered = [...updatedNotifications];
      if (filterType !== 'all') {
        filtered = filtered.filter((n) => n.type === filterType);
      }
      if (showUnreadOnly) {
        filtered = filtered.filter((n) => !n.is_read);
      }
      setFilteredNotifications(filtered);
      
      setUnreadCount(0);
      Alert.alert('Thành công', 'Đã đánh dấu tất cả thông báo là đã đọc');
    } catch (error) {
      console.error('Error marking all as read:', error);
      Alert.alert('Lỗi', 'Không thể đánh dấu tất cả thông báo');
    }
  };

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    if (!token) return;
    
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn xóa thông báo này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotificationAPI(token, notificationId);
              
              const updatedNotifications = notifications.filter((n) => n._id !== notificationId);
              setNotifications(updatedNotifications);
              
              // Apply filters immediately
              let filtered = [...updatedNotifications];
              if (filterType !== 'all') {
                filtered = filtered.filter((n) => n.type === filterType);
              }
              if (showUnreadOnly) {
                filtered = filtered.filter((n) => !n.is_read);
              }
              setFilteredNotifications(filtered);
              
              fetchUnreadCount();
            } catch (error) {
              console.error('Error deleting notification:', error);
              Alert.alert('Lỗi', 'Không thể xóa thông báo');
            }
          },
        },
      ]
    );
  };

  // Delete all
  const handleDeleteAll = () => {
    if (!token) return;
    
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn xóa TẤT CẢ thông báo?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllNotificationsAPI(token);
              
              setNotifications([]);
              setFilteredNotifications([]);
              setUnreadCount(0);
              Alert.alert('Thành công', 'Đã xóa tất cả thông báo');
            } catch (error) {
              console.error('Error deleting all notifications:', error);
              Alert.alert('Lỗi', 'Không thể xóa thông báo');
            }
          },
        },
      ]
    );
  };

  // Effects
  // Refresh when screen is focused
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNotifications();
      fetchUnreadCount();
    }, [fetchNotifications, fetchUnreadCount])
  );

  // Auto-apply filters whenever notifications, filterType, or showUnreadOnly changes
  useEffect(() => {
    let filtered = [...notifications];
    
    if (filterType !== 'all') {
      filtered = filtered.filter((n) => n.type === filterType);
    }
    
    if (showUnreadOnly) {
      filtered = filtered.filter((n) => !n.is_read);
    }
    
    setFilteredNotifications(filtered);
  }, [notifications, filterType, showUnreadOnly]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
    fetchUnreadCount();
  };

  // Get icon for notification type
  const getNotificationIcon = (notification: Notification): keyof typeof Ionicons.glyphMap => {
    const { type, title, message } = notification;
    const contentLower = `${title} ${message || ''}`.toLowerCase();
    
    switch (type) {
      case 'favorite':
        // Check if it's an unlike action (remove favorite)
        if (contentLower.includes('bỏ') || contentLower.includes('xóa') || contentLower.includes('unlike') || contentLower.includes('remove')) {
          return 'heart-dislike';
        }
        return 'heart';
      case 'itinerary':
        return 'map';
      case 'account':
        return 'person';
      case 'system':
        return 'information-circle';
      default:
        return 'notifications';
    }
  };

  // Get color for notification type
  const getNotificationColor = (type: NotificationType): string => {
    switch (type) {
      case 'favorite':
        return '#FF6B6B';
      case 'itinerary':
        return '#4ECDC4';
      case 'account':
        return '#FFD93D';
      case 'system':
        return '#95E1D3';
      default:
        return COLORS.primary;
    }
  };

  // Format time
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Render notification item
  const renderNotification = ({ item }: { item: Notification }) => (
    <View style={[styles.notificationCard, !item.is_read && styles.unreadCard]}>
      <View style={styles.notificationContent}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: getNotificationColor(item.type) },
          ]}
        >
          <Ionicons
            name={getNotificationIcon(item)}
            size={24}
            color="#FFFFFF"
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.message && (
            <Text style={styles.message} numberOfLines={3}>
              {item.message}
            </Text>
          )}
          <Text style={styles.time}>{formatTime(item.created_at)}</Text>
        </View>

        <View style={styles.actionsContainer}>
          {!item.is_read && (
            <TouchableOpacity
              onPress={() => handleMarkAsRead(item._id)}
              style={styles.actionButton}
            >
              <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => handleDelete(item._id)}
            style={styles.actionButton}
          >
            <Ionicons name="trash" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {!item.is_read && <View style={styles.unreadDot} />}
    </View>
  );

  // Render filter button
  const renderFilterButton = (
    type: NotificationType | 'all',
    label: string,
    icon: keyof typeof Ionicons.glyphMap
  ) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        filterType === type && styles.filterButtonActive,
      ]}
      onPress={() => setFilterType(type)}
    >
      <Ionicons
        name={icon}
        size={18}
        color={filterType === type ? '#FFFFFF' : COLORS.textSecondary}
      />
      <Text
        style={[
          styles.filterButtonText,
          filterType === type && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Render empty state
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={80} color={COLORS.textSecondary} />
      <Text style={styles.emptyText}>Không có thông báo nào</Text>
      <Text style={styles.emptySubText}>
        {showUnreadOnly
          ? 'Bạn đã đọc hết thông báo'
          : 'Các thông báo sẽ xuất hiện ở đây'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <LinearGradient
        colors={[
          COLORS.gradientStart,
          COLORS.gradientBlue1,
          COLORS.gradientBlue2,
          COLORS.gradientBlue3,
        ]}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.container}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[
        COLORS.gradientStart,
        COLORS.gradientBlue1,
        COLORS.gradientBlue2,
        COLORS.gradientBlue3,
      ]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Thông báo</Text>
          <Text style={styles.headerSubtitle}>Quản lý các thông báo của bạn</Text>
        </View>

        {/* Actions */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowUnreadOnly(!showUnreadOnly)}
          >
            <Ionicons
              name={showUnreadOnly ? 'eye-off' : 'eye'}
              size={20}
              color={COLORS.textMain}
            />
            <Text style={styles.headerButtonText}>
              {showUnreadOnly ? 'Tất cả' : 'Chưa đọc'}
            </Text>
          </TouchableOpacity>

          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleMarkAllAsRead}
            >
              <Ionicons name="checkmark-done" size={20} color={COLORS.textMain} />
              <Text style={styles.headerButtonText}>Đọc tất cả</Text>
            </TouchableOpacity>
          )}

          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleDeleteAll}
            >
              <Ionicons name="trash" size={20} color="#FF6B6B" />
              <Text style={[styles.headerButtonText, { color: '#FF6B6B' }]}>
                Xóa tất cả
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
          {renderFilterButton('all', 'Tất cả', 'list')}
          {renderFilterButton('favorite', 'Yêu thích', 'heart')}
          {renderFilterButton('itinerary', 'Lộ trình', 'map')}
          {renderFilterButton('account', 'Tài khoản', 'person')}
          {renderFilterButton('system', 'Hệ thống', 'information-circle')}
        </View>
      </View>

      {/* Notifications List */}
      <FlatList
        data={filteredNotifications}
        extraData={filteredNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
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
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primary,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textMain,
    textShadowColor: 'rgba(0, 0, 0, 0.12)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  badge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.xs,
    marginBottom: 15,
    alignItems: 'center',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 5,
  },
  headerButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterButtonText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 20,
    paddingTop: 10,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  time: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  actionsContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textMain,
    marginTop: 20,
  },
  emptySubText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
});

export default NotificationScreen;
