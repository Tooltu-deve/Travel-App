import { useTheme } from '@/contexts/ThemeContext';
import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, SPACING } from '../../constants';

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
  const { darkMode } = useTheme();
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
    <View style={[styles.categorySection, darkMode && {backgroundColor:'#1E1E1E', borderRadius:16}]}> 
      <Text style={[styles.categoryTitle, darkMode && {color:'#E0E0E0', textShadowColor:'transparent'}]}>Danh mục</Text>
      <View style={styles.categoryGrid}>
        {categories.slice(0, 4).map((category) => (
          <View key={category.id} style={styles.categoryItem}>
            <TouchableOpacity style={styles.categoryItemInner}>
              <View style={[styles.categoryIconContainer, darkMode && {backgroundColor:'#2C2C2C'}]}>
                <FontAwesome 
                  name={category.icon as any} 
                  size={24} 
                  color={darkMode ? '#4DD0E1' : COLORS.primary} 
                />
              </View>
              <Text style={[styles.categoryName, darkMode && {color:'#B0B0B0'}]}>{category.name}</Text>
            </TouchableOpacity>
          </View>
        ))}
        {!isExpanded && (
          <View style={styles.categoryItem}>
            <TouchableOpacity 
              style={styles.categoryItemInner}
              onPress={onToggleExpanded}
            >
              <View style={[styles.categoryIconContainer, darkMode && {backgroundColor:'#2C2C2C'}]}>
                <FontAwesome name="angle-down" size={24} color={darkMode ? '#4DD0E1' : COLORS.primary} />
              </View>
              <Text style={[styles.categoryName, darkMode && {color:'#B0B0B0'}]}>Xem thêm</Text>
            </TouchableOpacity>
          </View>
        )}
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
              <View style={[styles.categoryIconContainer, darkMode && {backgroundColor:'#2C2C2C'}]}>
                <FontAwesome 
                  name={category.icon as any} 
                  size={24} 
                  color={darkMode ? '#4DD0E1' : COLORS.primary} 
                />
              </View>
              <Text style={[styles.categoryName, darkMode && {color:'#B0B0B0'}]}>{category.name}</Text>
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
            <Text style={[styles.collapseButtonText, darkMode && {color:'#4DD0E1'}]}>Thu gọn</Text>
            <FontAwesome name="angle-up" size={16} color={darkMode ? '#4DD0E1' : COLORS.primary} />
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
    color: COLORS.textDark,
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
    backgroundColor: COLORS.bgLight,
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
