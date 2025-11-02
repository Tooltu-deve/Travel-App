import { COLORS, SPACING } from '@/constants';
import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CategorySectionProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

const categories = [
  { id: '1', name: 'Khách sạn', icon: 'hotel' },
  { id: '2', name: 'Nhà hàng', icon: 'cutlery' },
  { id: '3', name: 'Thuê xe', icon: 'car' },
  { id: '4', name: 'Voucher', icon: 'ticket' },
  { id: '5', name: 'Tour', icon: 'map-marker' },
  { id: '6', name: 'Vé máy bay', icon: 'plane' },
  { id: '7', name: 'Spa', icon: 'leaf' },
  { id: '8', name: 'Sự kiện', icon: 'calendar' },
  { id: '9', name: 'Đặc sản', icon: 'gift' },
];

export const CategorySection: React.FC<CategorySectionProps> = ({
  isExpanded,
  onToggleExpanded,
}) => {
  const [expandAnimation] = useState(new Animated.Value(0));
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      // Khi mở rộng: render trước, sau đó animate
      setShouldRender(true);
      expandAnimation.setValue(0);
      Animated.timing(expandAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Khi thu gọn: animate trước, sau đó unmount
      Animated.timing(expandAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
    }
  }, [isExpanded, expandAnimation]);

  const expandedOpacity = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const expandedScale = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <View style={styles.categorySection}>
      <Text style={styles.categoryTitle}>Danh mục</Text>

      <View style={styles.categoryGrid}>
        {/* Hiển thị 4 danh mục đầu tiên */}
        {categories.slice(0, 4).map((category) => (
          <View key={category.id} style={styles.categoryItem}>
            <TouchableOpacity style={styles.categoryItemInner}>
              <View style={styles.categoryIconContainer}>
                <FontAwesome 
                  name={category.icon as any} 
                  size={24} 
                  color={COLORS.primary} 
                />
              </View>
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Nút Xem thêm (chỉ hiện khi chưa mở rộng) */}
        {!isExpanded && (
          <View style={styles.categoryItem}>
            <TouchableOpacity 
              style={styles.categoryItemInner}
              onPress={onToggleExpanded}
            >
              <View style={styles.categoryIconContainer}>
                <FontAwesome name="angle-down" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.categoryName}>Xem thêm</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hiển thị các danh mục còn lại khi mở rộng */}
        {shouldRender && categories.slice(4).map((category, index) => (
          <Animated.View 
            key={category.id} 
            style={[
              styles.categoryItem,
              {
                opacity: expandedOpacity,
                transform: [{ scale: expandedScale }],
              }
            ]}
          >
            <TouchableOpacity style={styles.categoryItemInner}>
              <View style={styles.categoryIconContainer}>
                <FontAwesome 
                  name={category.icon as any} 
                  size={24} 
                  color={COLORS.primary} 
                />
              </View>
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      {shouldRender && (
        <Animated.View style={{ opacity: expandedOpacity }}>
          <TouchableOpacity 
            style={styles.collapseButton} 
            onPress={onToggleExpanded}
          >
            <Text style={styles.collapseButtonText}>Thu gọn</Text>
            <FontAwesome name="angle-up" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  categorySection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },

  categoryTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 163, 255, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  categoryItem: {
    width: '20%',
    marginBottom: SPACING.md,
  },

  categoryItemInner: {
    alignItems: 'center',
    gap: SPACING.xs,
  },

  categoryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0f4ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  categoryName: {
    fontSize: 11,
    color: COLORS.textMain,
    textAlign: 'center',
    fontWeight: '500',
  },

  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  collapseButtonText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
