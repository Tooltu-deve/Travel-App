import { Stack } from 'expo-router';

export default function StacksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="create/new-itinerary" options={{ headerShown: false }} />
      <Stack.Screen name="create/ai-prompt" options={{ headerShown: false }} />
      <Stack.Screen name="detail/itinerary-detail" options={{ headerShown: false }} />
    </Stack>
  );
}