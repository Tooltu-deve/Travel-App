import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../constants';

// Custom Tab Icon Component with Animation
const TabIcon: React.FC<{
  focused: boolean;
  color: string;
  iconName: string;
  iconLibrary?: 'FontAwesome' | 'MaterialCommunityIcons';
  size?: number;
}> = ({ focused, color, iconName, iconLibrary = 'FontAwesome', size = 22 }) => {
  const IconComponent = iconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : FontAwesome;
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
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
            colors={[COLORS.primary, COLORS.gradientSecondary]}
            style={styles.activeIconBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <IconComponent name={iconName as any} size={size} color={COLORS.textWhite} />
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

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* Shadow gradient overlay above tab bar */}
      <LinearGradient
        colors={[COLORS.primaryTransparent, COLORS.primaryLight, COLORS.primaryMedium]}
        style={[styles.shadowGradient, { bottom: 70 + insets.bottom + 2 }]}
        pointerEvents="none"
      />

      {/* Border line on top of tab bar */}
      <View style={[styles.topBorderLine, { bottom: 70 + insets.bottom }]} pointerEvents="none" />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.iconInactive,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: COLORS.bgMain,
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
            color: COLORS.textMain,
          },
          tabBarIconStyle: {
            marginTop: 0,
          },
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="itinerary"
          options={{
            title: 'Lộ trình',
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
        
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Lịch',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon 
                focused={focused} 
                color={color} 
                iconName="calendar" 
                iconLibrary="MaterialCommunityIcons"
                size={24}
              />
            ),
          }}
        />
        
        <Tabs.Screen
          name="favorites"
          options={{
            title: 'Yêu thích',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused} color={color} iconName="heart" size={22} />
            ),
          }}
        />
        
        <Tabs.Screen
          name="index"
          options={{
            title: 'Trang chủ',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused} color={color} iconName="home" size={24} />
            ),
          }}
        />
        
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Thông báo',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused} color={color} iconName="bell" size={22} />
            ),
          }}
        />
        
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Tài khoản',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused} color={color} iconName="user-circle" size={22} />
            ),
          }}
        />
      </Tabs>
      
      <View style={[styles.safeAreaBottom, { height: insets.bottom }]} />
    </>
  );
}

const styles = StyleSheet.create({
  topBorderLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    zIndex: 1001,
    shadowColor: COLORS.primary,
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
    backgroundColor: COLORS.bgMain,
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
    shadowColor: COLORS.primary,
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
