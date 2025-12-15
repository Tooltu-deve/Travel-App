import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import './global.css';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { VoiceTranslatorProvider } from '@/contexts/VoiceTranslatorContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfileAPI } from '@/services/api';

/**
 * Navigation Logic Component
 * Xử lý redirect dựa trên auth state
 */
function NavigationHandler() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [checkingMood, setCheckingMood] = useState(false);

  useEffect(() => {
    if (isLoading || checkingMood) return;

    const inAuthGroup = segments[0] === '(auth)';

    const handleNavigation = async () => {
      if (
        // Nếu user đã đăng nhập nhưng đang ở trang login/register
        !isLoading && isAuthenticated && inAuthGroup && (segments[1] === 'login' || segments[1] === 'register')
      ) {
        setCheckingMood(true);
        try {
          // Kiểm tra xem user đã chọn mood hoặc skip chưa
          const hasCompletedMood = await AsyncStorage.getItem('hasCompletedMoodSelection');

          if (hasCompletedMood === 'true') {
            // Đã chọn mood hoặc skip trước đó → vào thẳng trang chủ
            console.log('🔄 [RootLayout] User already completed mood selection, redirecting to home');
            router.replace('/(tabs)');
          } else {
            // Kiểm tra từ API xem user đã có preferenced_tags chưa
            const token = await AsyncStorage.getItem('userToken');
            if (token) {
              try {
                const profile = await getProfileAPI(token);
                if (profile && profile.preferenced_tags && profile.preferenced_tags.length > 0) {
                  // User đã có mood từ trước → lưu flag và vào trang chủ
                  await AsyncStorage.setItem('hasCompletedMoodSelection', 'true');
                  console.log('🔄 [RootLayout] User has moods from API, redirecting to home');
                  router.replace('/(tabs)');
                } else {
                  // Chưa có mood → hiển thị trang chọn mood
                  console.log('🔄 [RootLayout] User needs to select mood');
                  router.replace('/(auth)/mood');
                }
              } catch (apiError) {
                // Lỗi API → vẫn cho vào trang mood
                console.log('🔄 [RootLayout] API error, showing mood selection');
                router.replace('/(auth)/mood');
              }
            } else {
              router.replace('/(auth)/mood');
            }
          }
        } catch (error) {
          console.log('🔄 [RootLayout] Error checking mood, redirecting to mood selection');
          router.replace('/(auth)/mood');
        } finally {
          setCheckingMood(false);
        }
      } else if (
        // Nếu user chưa đăng nhập nhưng không ở trang auth
        !isLoading && !isAuthenticated && !inAuthGroup
      ) {
        console.log('🔄 [RootLayout] User not authenticated, redirecting to login');
        router.replace('/(auth)/login');
      }
    };

    handleNavigation();
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
      <FavoritesProvider>
        <VoiceTranslatorProvider>
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
        </VoiceTranslatorProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
