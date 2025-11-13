/**
 * Google Authentication Service
 * Xử lý OAuth flow với backend endpoints:
 * - /api/v1/auth/google - Khởi tạo OAuth
 * - /api/v1/auth/google/callback - Nhận callback từ Google
 */

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// ============================================
// CONFIGURATION
// ============================================
const API_BASE_URL = 'https://travel-app-r9qu.onrender.com';

// Khởi tạo WebBrowser để có thể dismiss khi xong
WebBrowser.maybeCompleteAuthSession();

// ============================================
// TYPES
// ============================================
export interface GoogleAuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

// ============================================
// GOOGLE OAUTH FLOW
// ============================================
/**
 * initiateGoogleOAuth: Khởi tạo Google OAuth flow
 * 
 * Flow:
 * 1. Frontend mở WebBrowser tới /api/v1/auth/google
 * 2. Backend redirect tới Google login
 * 3. User đăng nhập Google
 * 4. Google redirect về backend /api/v1/auth/google/callback
 * 5. Backend xử lý và redirect về app với token
 * 6. Frontend parse token từ callback URL
 * 
 * @returns GoogleAuthResult với token hoặc error
 */
export const initiateGoogleOAuth = async (): Promise<GoogleAuthResult> => {
  try {
    console.log('🔐 Initiating Google OAuth...');

    // Xác định callback URL dựa vào platform
    const redirectUri = Platform.OS === 'web'
      ? `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8084'}/auth/google-callback`
      : 'projectcode://auth/callback';

    console.log('🔗 Redirect URI:', redirectUri);

    // Backend OAuth URL với redirectUri parameter
    // Backend cần đọc redirectUri này và dùng nó sau khi xong
    const authUrl = `${API_BASE_URL}/api/v1/auth/google?redirectUri=${encodeURIComponent(redirectUri)}`;

    console.log('🔗 Auth URL:', authUrl);

    if (Platform.OS === 'web') {
      // Web: Redirect toàn bộ trang
      console.log('🌐 Redirecting to Google OAuth (web)...');
      if (typeof window !== 'undefined') {
        window.location.href = authUrl;
      }
      return { success: false }; // Won't reach here
    } else {
      // Native: Dùng WebBrowser với deep link
      console.log('📱 Opening Google OAuth in WebBrowser (native)...');
      
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUri,
        {
          showInRecents: true, // Android: show in recent apps
        }
      );

      console.log('📱 WebBrowser result:', result);

      if (result.type === 'success' && result.url) {
        // Parse token từ callback URL
        const token = extractTokenFromUrl(result.url);
        
        if (token) {
          console.log('✅ Token extracted from callback');
          return { success: true, token };
        } else {
          console.error('❌ No token in callback URL:', result.url);
          return { 
            success: false, 
            error: 'Không nhận được token từ server' 
          };
        }
      } else if (result.type === 'cancel') {
        console.log('❌ User cancelled OAuth');
        return { 
          success: false, 
          error: 'Người dùng đã hủy đăng nhập' 
        };
      } else {
        console.error('❌ OAuth failed:', result);
        return { 
          success: false, 
          error: 'Đăng nhập thất bại' 
        };
      }
    }
  } catch (error: any) {
    console.error('❌ Google OAuth error:', error);
    return { 
      success: false, 
      error: error.message || 'Đã xảy ra lỗi khi đăng nhập' 
    };
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * extractTokenFromUrl: Parse token từ callback URL
 * 
 * Backend có thể trả về token với các tên khác nhau:
 * - access_token
 * - token
 * - idToken
 * 
 * @param url - Callback URL từ backend
 * @returns Token string hoặc null
 */
export const extractTokenFromUrl = (url: string): string | null => {
  try {
    console.log('🔍 Extracting token from URL:', url);
    
    const urlObj = new URL(url);
    
    // Thử các tên parameter khác nhau
    const token = 
      urlObj.searchParams.get('access_token') ||
      urlObj.searchParams.get('token') ||
      urlObj.searchParams.get('idToken') ||
      urlObj.searchParams.get('id_token');
    
    if (token) {
      console.log('✅ Token found in URL');
      return token;
    }
    
    // Thử parse từ hash (một số OAuth flows dùng hash)
    if (urlObj.hash) {
      const hashParams = new URLSearchParams(urlObj.hash.substring(1));
      const hashToken = 
        hashParams.get('access_token') ||
        hashParams.get('token') ||
        hashParams.get('idToken') ||
        hashParams.get('id_token');
      
      if (hashToken) {
        console.log('✅ Token found in URL hash');
        return hashToken;
      }
    }
    
    console.error('❌ No token found in URL');
    return null;
  } catch (error) {
    console.error('❌ Error parsing URL:', error);
    return null;
  }
};

export default {
  initiateGoogleOAuth,
  extractTokenFromUrl,
};
