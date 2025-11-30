import { AuthProvider, useAuth } from '@/contexts/AuthContext';
<<<<<<< HEAD
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import './global.css';
=======
import { FavoritesProvider } from '@/contexts/FavoritesContext';
>>>>>>> ee0233d159f213c096118a101f4b9e09aec97945

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
      // Nếu user đã đăng nhập nhưng đang ở trang login/register
      !isLoading && isAuthenticated && inAuthGroup && (segments[1] === 'login' || segments[1] === 'register')
    ) {
      console.log('🔄 [RootLayout] User authenticated, redirecting to mood selection');
      router.replace('/(auth)/mood');
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
<<<<<<< HEAD
    <ThemeProvider>
      <AuthProvider>
=======
    <AuthProvider>
      <FavoritesProvider>
>>>>>>> ee0233d159f213c096118a101f4b9e09aec97945
        <NavigationHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen 
            name="create-itinerary" 
            options={{ 
              headerShown: false,
              presentation: 'card',
              animation: 'slide_from_bottom'
            }} 
          />
        </Stack>
<<<<<<< HEAD
      </AuthProvider>
    </ThemeProvider>
=======
      </FavoritesProvider>
    </AuthProvider>
>>>>>>> ee0233d159f213c096118a101f4b9e09aec97945
  );
}
