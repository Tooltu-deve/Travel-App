import { validateTokenAPI } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// ============================================
// TYPES
// ============================================
interface UserData {
  id: string;
  email: string;
  fullName: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userData: UserData | null;
  token: string | null;
  signIn: (token: string, userData: UserData) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

// ============================================
// CREATE CONTEXT
// ============================================
/**
 * AuthContext: Context để quản lý authentication state toàn app
 * Cho phép bất kỳ component nào cũng có thể:
 * - Đọc trạng thái đăng nhập (isAuthenticated)
 * - Đăng nhập (signIn)
 * - Đăng xuất (signOut)
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// AUTH PROVIDER
// ============================================
/**
 * AuthProvider: Component wrap toàn bộ app để cung cấp auth context
 * 
 * Cách hoạt động:
 * 1. Quản lý state: isAuthenticated, isLoading
 * 2. Cung cấp functions: signIn(), signOut()
 * 3. Tất cả child components có thể access thông qua useAuth() hook
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // ============================================
  // STATE
  // ============================================
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // ============================================
  // CHECK AUTH ON MOUNT
  // ============================================
  /**
   * useEffect: Check authentication khi app khởi động
   * 
   * Flow:
   * 1. Lấy token từ AsyncStorage
   * 2. Nếu có token → Validate với backend
   * 3. Nếu token hợp lệ → Set isAuthenticated = true + load userData
   * 4. Nếu token không hợp lệ → Clear storage
   */
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        console.log('🔍 Checking authentication status...');
        
        // Lấy token từ AsyncStorage
        const token = await AsyncStorage.getItem('userToken');
        
        if (token) {
          console.log('✅ Token found, validating...');
          
          // Validate token by calling a protected endpoint
          const { getMoodsAPI } = await import('@/services/api');
          try {
            await getMoodsAPI(token);
            // If successful, token is valid
              setToken(token);
            const userDataStr = await AsyncStorage.getItem('userData');
            if (userDataStr) {
              const userDataParsed = JSON.parse(userDataStr);
              setUserData(userDataParsed);
              setIsAuthenticated(true);
              console.log('✅ User authenticated and token valid');
            } else {
              await AsyncStorage.removeItem('userToken');
              console.log('❌ No userData, clearing token');
            }
          } catch (error: any) {
            // If validation fails for any reason, clear storage and don't authenticate
            console.log('❌ Token validation failed, clearing storage');
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('userData');
          }
        } else {
          console.log('ℹ️ No token found');
        }
      } catch (error) {
        console.error('❌ Check auth error:', error);
        // Nếu lỗi (network, etc.) → Clear storage
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('userData');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // ============================================
  // SIGN IN WITH GOOGLE
  // ============================================
  /**
   * signInWithGoogle: Đăng nhập qua Google
   * Được gọi từ LoginScreen/RegisterScreen sau khi lấy được Google ID Token
   * 
   * Flow:
   * 1. Gọi googleLoginAPI với idToken
   * 2. Backend validate token và tạo/cập nhật user
   * 3. Nhận token và userData từ backend
   * 4. Gọi signIn để lưu state
   */
  const signInWithGoogle = async (idToken: string) => {
    try {
      console.log('🔐 Signing in with Google...');
      
      // Import googleLoginAPI
      const { googleLoginAPI } = await import('@/services/api');
      
      // Gọi Google login API
      const response = await googleLoginAPI(idToken);

      if ((response.success || response.access_token) && response.user) {
        // Google login thành công
        console.log('✅ Google login successful:', response.user);
        
        // Lấy token từ response
        const token = response.access_token || response.token;

        // Gọi signIn để lưu token và userData
        await signIn(token as string, response.user);
      } else {
        throw new Error(response.message || 'Google login failed');
      }
    } catch (error) {
      console.error('❌ Google sign in error:', error);
      throw error;
    }
  };

  // ============================================
  // SIGN IN FUNCTION
  // ============================================
  /**
   * signIn: Đăng nhập user
   * Được gọi từ LoginScreen sau khi login API thành công
   * 
   * Flow:
   * 1. Lưu token vào AsyncStorage
   * 2. Lưu userData vào AsyncStorage
   * 3. Set state → Trigger re-render → RootNavigator chuyển sang Main
   */
  const signIn = async (token: string, userData: UserData) => {
    try {
      console.log('👤 Signing in user:', userData.email);
      
      // Lưu token và userData vào AsyncStorage
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      
      // Update state
      setUserData(userData);
      setToken(token);
      setIsAuthenticated(true);
      
      console.log('✅ User signed in successfully');
    } catch (error) {
      console.error('❌ Sign in error:', error);
      throw error;
    }
  };

  // ============================================
  // SIGN OUT FUNCTION
  // ============================================
  /**
   * signOut: Đăng xuất user
   * Được gọi từ ProfileScreen khi user click logout
   * 
   * Flow:
   * 1. Clear AsyncStorage
   * 2. Reset state → Trigger re-render → RootNavigator chuyển về Auth
   */
  const signOut = async () => {
    try {
      console.log('👋 Signing out user');
      
      // Clear AsyncStorage
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userData');
      
      // Reset state
      setUserData(null);
      setToken(null);
      setIsAuthenticated(false);
      
      console.log('✅ User signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      throw error;
    }
  };

  // ============================================
  // CONTEXT VALUE
  // ============================================
  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    userData,
    token,
    signIn,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================
// CUSTOM HOOK
// ============================================
/**
 * useAuth: Custom hook để sử dụng AuthContext
 * 
 * Cách sử dụng:
 * const { isAuthenticated, signIn, signOut } = useAuth();
 * 
 * Throw error nếu sử dụng ngoài AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
};
