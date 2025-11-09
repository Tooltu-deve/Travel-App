import { COLORS, SPACING } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { extractTokenFromUrl } from '@/services/googleAuth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * Google OAuth Callback Page
 * 
 * Cách hoạt động:
 * 1. Backend redirect về đây sau khi user login Google
 * 2. URL chứa token: /auth/google-callback?access_token=... hoặc ?token=...
 * 3. Page này extract token từ URL
 * 4. Gọi signInWithGoogle
 * 5. Redirect tới Home nếu thành công
 */
const GoogleCallbackPage: React.FC = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('🔍 Processing Google callback...');
        console.log('📋 Params:', params);

        // Lấy token từ URL parameters
        // Backend có thể trả về: access_token, token, idToken, id_token
        const token = 
          (params.access_token as string) ||
          (params.token as string) ||
          (params.idToken as string) ||
          (params.id_token as string);

        // Nếu không có trong params, thử parse từ full URL
        if (!token && typeof window !== 'undefined') {
          const urlToken = extractTokenFromUrl(window.location.href);
          if (urlToken) {
            console.log('✅ Got token from URL');
            await signInWithGoogle(urlToken);
            console.log('✅ Google login successful');
            return;
          }
        }

        if (!token) {
          console.error('❌ No token in URL');
          // Redirect về login sau 2 giây
          setTimeout(() => {
            router.replace('/(auth)/login');
          }, 2000);
          return;
        }

        console.log('✅ Got token from URL params');

        // Gọi signInWithGoogle
        await signInWithGoogle(token);

        console.log('✅ Google login successful');
        
        // Redirect tới home (RootNavigator sẽ tự động chuyển)
        // Không cần làm gì, AuthContext sẽ handle
      } catch (error: any) {
        console.error('❌ Google callback error:', error);
        
        // Redirect về login sau 3 giây
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 3000);
      }
    };

    handleCallback();
  }, [params, signInWithGoogle, router]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.text}>Đang xử lý đăng nhập...</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: SPACING.md,
  },
});

export default GoogleCallbackPage;
