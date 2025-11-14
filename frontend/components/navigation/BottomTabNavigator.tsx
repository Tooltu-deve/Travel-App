/**
 * ⚠️ FILE NÀY CHỈ ĐỂ THAM KHẢO (REFERENCE ONLY)
 * 
 * App hiện tại đang sử dụng Expo Router (file-based routing)
 * File này giữ lại để tham khảo thiết kế UI/UX của Bottom Tab Navigator
 * 
 * Code thực tế đang chạy: frontend/app/(tabs)/_layout.tsx
 */

import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, StyleSheet, Text, Platform, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { COLORS } from '@/constants';

// ⚠️ Placeholder components - File này chỉ để tham khảo
// Code thực tế ở app/(tabs)/*.tsx
const HomeScreen = () => null;
const FavoritesScreen = () => null;
const ItineraryScreen = () => null;
const NotificationScreen = () => null;
const ProfileScreen = () => null;

const Tab = createBottomTabNavigator();

// Custom Tab Icon Component with Animation
const TabIcon: React.FC<{
  focused: boolean;
  color: string;
  iconName: string;
  iconLibrary?: 'FontAwesome' | 'MaterialCommunityIcons';
  size?: number;
}> = ({ focused, color, iconName, iconLibrary = 'FontAwesome', size = 22 }) => {
  const IconComponent = iconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : FontAwesome;
  
  // Animation value
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    // Animation đơn giản: scale lên rồi về
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: focused ? 1.3 : 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: focused ? 1 : 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);
  
  return (
    <View style={styles.iconContainer}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {focused ? (
          <LinearGradient
            colors={['#3083ff', '#60a5ff']}
            style={styles.activeIconBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <IconComponent name={iconName as any} size={size} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={styles.inactiveIconContainer}>
            <IconComponent name={iconName as any} size={size} color={color} />
          </View>
        )}
      </Animated.View>
    </View>
  );
};

export const BottomTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  return (
    <>
      {/* Shadow gradient overlay above tab bar - positioned ABOVE the border */}
      <LinearGradient
        colors={['rgba(48, 131, 255, 0)', 'rgba(48, 131, 255, 0.15)', 'rgba(48, 131, 255, 0.25)']}
        style={[styles.shadowGradient, { bottom: 70 + insets.bottom + 2 }]}
        pointerEvents="none"
      />
      
      {/* Blue border line with shadow on top of tab bar */}
      <View style={[styles.topBorderLine, { bottom: 70 + insets.bottom }]} pointerEvents="none" /> 
      
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#3083ff',
          tabBarInactiveTintColor: '#8E9AAF',
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom + 8,
            paddingTop: 8,
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 4,
          },
          tabBarIconStyle: {
            marginTop: 0,
          },
          tabBarHideOnKeyboard: true,
          lazy: true,
        }}
        initialRouteName="home"
      >
      {/* Itinerary Tab */}
      <Tab.Screen
        name="itinerary"
        component={ItineraryScreen}
        options={{
          tabBarLabel: 'Lộ trình',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon 
              focused={focused} 
              color={color} 
              iconName="map-outline" 
              iconLibrary="MaterialCommunityIcons"
              size={24}
            />
          ),
        }}
      />

      {/* Favorites Tab */}
      <Tab.Screen
        name="favorites"
        component={FavoritesScreen}
        options={{
          tabBarLabel: 'Yêu thích',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon 
              focused={focused} 
              color={color} 
              iconName="heart" 
              size={22}
            />
          ),
        }}
      />

      {/* Home Tab */}
      <Tab.Screen
        name="home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Trang chủ',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon 
              focused={focused} 
              color={color} 
              iconName="home" 
              size={24}
            />
          ),
        }}
      />

      {/* Notifications Tab */}
      <Tab.Screen
        name="notifications"
        component={NotificationScreen}
        options={{
          tabBarLabel: 'Thông báo',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon 
              focused={focused} 
              color={color} 
              iconName="bell" 
              size={22}
            />
          ),
        }}
      />

      {/* Profile Tab */}
      <Tab.Screen
        name="profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Tài khoản',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon 
              focused={focused} 
              color={color} 
              iconName="user-circle" 
              size={22}
            />
          ),
        }}
      />
    </Tab.Navigator>
    <View style={[styles.safeAreaBottom, { height: insets.bottom, backgroundColor: '#FFFFFF' }]} />
    </>
  );
};

const styles = StyleSheet.create({
  topBorderLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#3083ff',
    zIndex: 1001,
    shadowColor: '#3083ff',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  shadowGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    zIndex: 1000,
  },
  safeAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconBackground: {
    width: 56,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3083ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  inactiveIconContainer: {
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
