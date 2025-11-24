import React from 'react';
import { Stack } from 'expo-router';

/**
 * Detail Stack under (stacks) group
 */
export default function DetailStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="itinerary-detail" />
    </Stack>
  );
}
