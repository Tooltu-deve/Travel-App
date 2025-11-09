import React from 'react';
import { Stack } from 'expo-router';

/**
 * Main App Stack Layout
 * Quản lý các màn hình chính của ứng dụng (Home, Favorites, Itinerary, Notifications, Profile)
 */
export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Không hiển thị header - quản lý bởi BottomTabNavigator
      }}
    >
      <Stack.Screen
        name="home"
        options={{
          title: 'Trang chủ',
        }}
      />
      <Stack.Screen
        name="favorites"
        options={{
          title: 'Yêu thích',
        }}
      />
      <Stack.Screen
        name="itinerary"
        options={{
          title: 'Lịch trình',
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: 'Thông báo',
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
        }}
      />
    </Stack>
  );
}
