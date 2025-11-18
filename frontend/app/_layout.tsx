import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import './global.css';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

/**
 * Navigation Logic Component
 * Xử lý redirect dựa trên auth state
 */
function NavigationHandler() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (
      // Nếu user đã đăng nhập nhưng đang ở trang auth
      !isLoading && isAuthenticated && inAuthGroup
    ) {
      console.log('🔄 [RootLayout] User authenticated, redirecting to tabs');
      router.replace('/(tabs)');
    } else if (
      // Nếu user chưa đăng nhập nhưng không ở trang auth
      !isLoading && !isAuthenticated && !inAuthGroup
    ) {
      console.log('🔄 [RootLayout] User not authenticated, redirecting to login');
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

/**
 * RootLayout: Entry point của toàn bộ app
 * 
 * Cấu trúc:
 * RootLayout
 * └── AuthProvider (Cung cấp auth context cho toàn app)
 *     └── Stack Navigator
 *         ├── index (Landing/Redirect screen)
 *         ├── (auth) Stack (Login, Register, OAuth)
 *         └── (tabs) Tabs (Home, Favorites, Itinerary, Notifications, Profile)
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <NavigationHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
