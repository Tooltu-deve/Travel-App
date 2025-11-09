import React from "react";
import "./global.css";
import { RootNavigator } from "@/components/navigation/RootNavigator";
import { AuthProvider } from "@/contexts/AuthContext";

/**
 * RootLayout: Entry point của toàn bộ app
 * 
 * Cấu trúc:
 * RootLayout
 * └── AuthProvider (Cung cấp auth context cho toàn app)
 *     └── RootNavigator
 *         ├── Auth Stack (khi chưa đăng nhập)
 *         │   ├── LoginScreen
 *         │   └── RegisterScreen
 *         └── Main Stack (khi đã đăng nhập)
 *             └── BottomTabNavigator
 *                 ├── HomeScreen
 *                 ├── FavoritesScreen
 *                 ├── ItineraryScreen
 *                 ├── NotificationScreen
 *                 └── ProfileScreen
 * 
 * Flow hoạt động:
 * 1. App khởi động → RootLayout render
 * 2. AuthProvider kiểm tra auth status (token trong AsyncStorage)
 * 3. RootNavigator nhận isAuthenticated từ context
 * 4. Nếu chưa đăng nhập → Hiện LoginScreen
 * 5. User đăng nhập → signIn() → RootNavigator re-render → Hiện Main
 * 6. User đăng xuất → signOut() → RootNavigator re-render → Hiện Login
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
