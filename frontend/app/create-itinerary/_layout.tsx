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
        name="manual-form"
        options={{
          title: 'Tạo lộ trình thủ công',
        }}
      />
      <Stack.Screen
        name="manual-preview"
        options={{
          title: 'Xem trước lộ trình thủ công',
          presentation: 'card',
          animation: 'slide_from_bottom',
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

