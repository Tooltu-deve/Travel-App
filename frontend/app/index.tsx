import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Index Screen: Landing page của app
 * 
 * Note: Redirect logic is handled by NavigationHandler trong _layout.tsx
 * This screen just shows a loading indicator while auth state is being checked
 */
export default function Index() {
  // Đang kiểm tra auth status
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
      <ActivityIndicator size="large" color="#00A3FF" />
    </View>
  );
}
