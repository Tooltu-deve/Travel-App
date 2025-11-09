import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AuthNavigator from './AuthNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import { useAuth } from '@/contexts/AuthContext';

// ============================================
// ĐỊNH NGHĨA TYPES CHO NAVIGATION
// ============================================
/**
 * RootStackParamList: Định nghĩa các màn hình trong Root Stack
 * - Auth: AuthNavigator (Login/Register flow)
 * - Main: BottomTabNavigator (Home/Favorites/...)
 */
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

// ============================================
// TẠO STACK NAVIGATOR
// ============================================
const Stack = createStackNavigator<RootStackParamList>();

// ============================================
// ROOT NAVIGATOR COMPONENT
// ============================================
/**
 * RootNavigator: Navigator cao nhất, quyết định hiển thị Auth hay Main App
 * 
 * Cấu trúc:
 * RootNavigator
 * ├── Auth Stack (khi chưa đăng nhập)
 * │   ├── LoginScreen
 * │   └── RegisterScreen
 * └── Main Stack (khi đã đăng nhập)
 *     └── BottomTabNavigator
 *         ├── Home
 *         ├── Favorites
 *         ├── Itinerary
 *         ├── Notifications
 *         └── Profile
 * 
 * Flow hoạt động:
 * 1. App khởi động → Check isAuthenticated
 * 2. Nếu isAuthenticated = false → Hiện Auth Stack (Login/Register)
 * 3. User đăng nhập thành công → Set isAuthenticated = true
 * 4. RootNavigator re-render → Hiện Main Stack (BottomTabs)
 * 5. User đăng xuất → Set isAuthenticated = false → Quay về Auth Stack
 */
export const RootNavigator: React.FC = () => {
  // ============================================
  // AUTH CONTEXT
  // ============================================
  /**
   * useAuth: Lấy authentication state từ AuthContext
   * - isAuthenticated: true/false
   * - isLoading: đang check auth hay không
   * - signIn(): Đăng nhập (được gọi từ LoginScreen)
   * - signOut(): Đăng xuất (được gọi từ ProfileScreen)
   */
  const { isAuthenticated, isLoading } = useAuth();

  // ============================================
  // LOADING STATE
  // ============================================
  /**
   * Hiển thị màn hình loading khi đang check auth
   * TODO: Replace với SplashScreen component đẹp hơn
   */
  if (isLoading) {
    return null; // Hoặc <SplashScreen />
  }

  // ============================================
  // STACK NAVIGATOR (NO NavigationContainer)
  // ============================================
  /**
   * QUAN TRỌNG: Expo Router đã tự động tạo NavigationContainer
   * → Không cần wrap thêm NavigationContainer ở đây
   * → Chỉ cần return Stack.Navigator
   */
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,         // Ẩn header
        gestureEnabled: false,      // Tắt gesture (không cho vuốt giữa Auth/Main)
      }}
    >
      {/* 
        ============================================
        CONDITIONAL RENDERING: Auth vs Main
        ============================================
        Hiển thị màn hình khác nhau dựa trên isAuthenticated:
        - false: Hiện Auth Stack (Login/Register)
        - true: Hiện Main Stack (BottomTabs)
      */}
      {!isAuthenticated ? (
        // ============================================
        // AUTH STACK - Chưa đăng nhập
        // ============================================
        <Stack.Screen 
          name="Auth" 
          component={AuthNavigator}
          options={{
            // Animation khi chuyển từ Auth → Main (sau khi login)
            animationTypeForReplace: 'push', // Push animation thay vì replace
          }}
        />
      ) : (
        // ============================================
        // MAIN STACK - Đã đăng nhập
        // ============================================
        <Stack.Screen 
          name="Main" 
          component={BottomTabNavigator}
          options={{
            // Animation khi chuyển từ Main → Auth (sau khi logout)
            animationTypeForReplace: 'pop', // Pop animation
          }}
        />
      )}
    </Stack.Navigator>
  );
};

// ============================================
// EXPORT DEFAULT
// ============================================
export default RootNavigator;

// ============================================
// CÁCH SỬ DỤNG TRONG APP
// ============================================
/**
 * 1. Trong LoginScreen.tsx, sau khi đăng nhập thành công:
 * 
 * const handleLogin = async () => {
 *   try {
 *     const response = await loginAPI(email, password);
 *     
 *     if (response.success) {
 *       // Lưu token
 *       await AsyncStorage.setItem('userToken', response.token);
 *       
 *       // Trigger re-render RootNavigator
 *       // Cách 1: Sử dụng Context API
 *       authContext.signIn(response.token);
 *       
 *       // Cách 2: Navigate trực tiếp (đơn giản hơn cho bây giờ)
 *       navigation.navigate('Main');
 *     }
 *   } catch (error) {
 *     alert('Login failed!');
 *   }
 * };
 * 
 * 2. Trong ProfileScreen.tsx, khi đăng xuất:
 * 
 * const handleLogout = async () => {
 *   await AsyncStorage.removeItem('userToken');
 *   navigation.navigate('Auth');
 * };
 */
