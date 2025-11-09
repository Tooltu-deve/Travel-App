import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '@/app/(auth)/login/LoginScreen';
import RegisterScreen from '@/app/(auth)/register/RegisterScreen';

// ============================================
// ĐỊNH NGHĨA TYPES CHO NAVIGATION
// ============================================
/**
 * AuthStackParamList: Định nghĩa các màn hình trong Auth Stack và params của chúng
 * - Login: Không cần params
 * - Register: Không cần params
 */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

// ============================================
// TẠO STACK NAVIGATOR
// ============================================
/**
 * createStackNavigator(): Tạo một Stack Navigator
 * Stack Navigator hoạt động như một stack (ngăn xếp):
 * - Push: Thêm màn hình mới lên trên
 * - Pop: Quay lại màn hình trước đó
 * - Replace: Thay thế màn hình hiện tại
 */
const Stack = createStackNavigator<AuthStackParamList>();

// ============================================
// AUTH NAVIGATOR COMPONENT
// ============================================
/**
 * AuthNavigator: Quản lý luồng Authentication (Đăng nhập/Đăng ký)
 * 
 * Cấu trúc:
 * AuthNavigator
 * ├── LoginScreen (màn hình đầu tiên)
 * └── RegisterScreen (có thể navigate từ Login)
 * 
 * Flow hoạt động:
 * 1. User mở app → Thấy LoginScreen
 * 2. User click "Đăng ký ngay" → Navigate to RegisterScreen
 * 3. User click "Đăng nhập" trong Register → Navigate back to LoginScreen
 * 4. User đăng nhập thành công → Navigate to MainApp (xử lý ở RootNavigator)
 */
export const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      // ============================================
      // SCREEN OPTIONS: Cấu hình chung cho tất cả screens
      // ============================================
      screenOptions={{
        headerShown: false,           // Ẩn header mặc định (vì đã có custom header trong screen)
        cardStyle: { backgroundColor: 'transparent' }, // Background trong suốt
        gestureEnabled: true,         // Cho phép vuốt để quay lại
        gestureDirection: 'horizontal', // Vuốt từ trái sang phải để back
      }}
    >
      {/* 
        ============================================
        LOGIN SCREEN - Màn hình đăng nhập
        ============================================
        - initialRouteName: LoginScreen là màn hình đầu tiên
        - name="Login": Tên để navigate (navigation.navigate('Login'))
        - component={LoginScreen}: Component sẽ render
      */}
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{
          title: 'Đăng nhập',        // Title (không hiện vì headerShown=false)
        }}
      />

      {/* 
        ============================================
        REGISTER SCREEN - Màn hình đăng ký
        ============================================
        - Có thể navigate từ LoginScreen
        - User có thể vuốt hoặc click back để quay lại Login
      */}
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen}
        options={{
          title: 'Đăng ký',
          // Animation khi chuyển screen: slide từ phải sang trái
          cardStyleInterpolator: ({ current, layouts }) => {
            return {
              cardStyle: {
                transform: [
                  {
                    translateX: current.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [layouts.screen.width, 0], // Từ phải (width) về 0
                    }),
                  },
                ],
              },
            };
          },
        }}
      />
    </Stack.Navigator>
  );
};

// ============================================
// EXPORT DEFAULT
// ============================================
export default AuthNavigator;
