import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Index Screen: Landing page của app
 * 
 * Flow:
 * 1. Check auth status từ AuthContext
 * 2. Nếu đang loading → Hiện loading indicator
 * 3. Nếu đã authenticated → Redirect sang /(tabs) (Trang chủ)
 * 4. Nếu chưa authenticated → Redirect sang /(auth)/login
 */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Redirect khi auth state thay đổi
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    
    if (isAuthenticated && !inAuthGroup) {
      // User đã đăng nhập và không ở trong auth group → Redirect to tabs
      console.log('✅ User authenticated, redirecting to tabs');
      router.replace('/(tabs)');
    } else if (!isAuthenticated && inAuthGroup) {
      // User chưa đăng nhập và đang ở trong auth group → OK, không cần redirect
      console.log('ℹ️ User not authenticated, staying in auth');
    } else if (!isAuthenticated && !inAuthGroup) {
      // User chưa đăng nhập và không ở auth group → Redirect to login
      console.log('❌ User not authenticated, redirecting to login');
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Đang kiểm tra auth status
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
      <ActivityIndicator size="large" color="#00A3FF" />
    </View>
  );
}
