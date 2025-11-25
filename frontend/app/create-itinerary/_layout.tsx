import React from 'react';
import { Stack } from 'expo-router';

/**
 * CreateItineraryLayout: Stack layout cho các màn hình tạo lộ trình
 */
export default function CreateItineraryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'card',
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Chọn phương thức',
        }}
      />
      <Stack.Screen
        name="smart-agent"
        options={{
          title: 'Tạo với SmartAgent',
        }}
      />
      <Stack.Screen
        name="route-preview"
        options={{
          title: 'Xem trước lộ trình',
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

