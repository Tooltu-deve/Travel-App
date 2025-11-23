import React from 'react';
import { Stack } from 'expo-router';

/**
* Auth Stack Layout
* Quản lý các màn hình liên quan đến authentication (Login, Register)
*/
export default function AuthLayout() {
return (
<Stack
screenOptions={{
headerShown: false, // Không hiển thị header
}}
>
<Stack.Screen
name="login"
options={{
title: 'Đăng nhập',
}}
/>
<Stack.Screen
name="register"
options={{
title: 'Đăng ký',
}}
/>
      <Stack.Screen
        name="mood"
        options={{
          title: 'Chọn tâm trạng',
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: 'Đăng ký',
        }}
      />
      <Stack.Screen
        name="mood"
        options={{
          title: 'Chọn tâm trạng',
        }}
      />
    </Stack>
  );
}
