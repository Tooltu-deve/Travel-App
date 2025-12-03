import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { changePasswordAPI } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';

const ChangePasswordScreen: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusField, setFocusField] = useState('');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { darkMode } = useTheme();

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới không khớp');
      return;
    }
    if (oldPassword === newPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới phải khác mật khẩu cũ');
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        router.replace('/(auth)/login');
        return;
      }
      await changePasswordAPI(token, { currentPassword: oldPassword, newPassword });
      // Đăng xuất sau khi đổi mật khẩu thành công
      await AsyncStorage.removeItem('userToken');
      Alert.alert('Thành công', 'Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      const errorMsg = error?.message || 'Không thể đổi mật khẩu';
      Alert.alert('Lỗi', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const dynamicStyles = {
    container: {
      backgroundColor: darkMode ? '#18181b' : '#F3F6FA',
    },
    title: {
      color: darkMode ? '#60a5fa' : '#2196F3',
    },
    label: {
      color: darkMode ? '#f1f5f9' : '#1E293B',
    },
    inputWrapper: {
      backgroundColor: darkMode ? '#27272a' : '#F5F5F5',
      borderColor: darkMode ? '#334155' : 'transparent',
    },
    input: {
      color: darkMode ? '#f1f5f9' : '#222',
    },
    saveBtn: {
      backgroundColor: darkMode ? '#60a5fa' : '#2196F3',
    },
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, dynamicStyles.container]}>
      {/* Header */}
      <View style={[styles.headerRow, { paddingTop: insets.top || 16 }]}> 
        <TouchableOpacity onPress={() => router.back()} style={{padding:4,marginRight:6}}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={darkMode ? '#60a5fa' : '#2196F3'} />
        </TouchableOpacity>
        <Text style={[styles.title, dynamicStyles.title]}>Đổi mật khẩu</Text>
      </View>
      <View style={{ height: 32 }} />

      <Text style={[styles.label, dynamicStyles.label]}>Mật khẩu hiện tại</Text>
      <View style={{ height: 8 }} />
      <View style={[
        styles.inputWrapper,
        dynamicStyles.inputWrapper,
      ]}>
        <TextInput
          style={[
            styles.input,
            dynamicStyles.input,
            focusField === 'old' && styles.inputFocused,
          ]}
          value={oldPassword}
          onChangeText={setOldPassword}
          placeholder="Nhập mật khẩu hiện tại"
          secureTextEntry={!showOld}
          placeholderTextColor={darkMode ? '#6B7280' : '#A0A4AA'}
          onFocus={() => setFocusField('old')}
          onBlur={() => setFocusField('')}
        />
        <TouchableOpacity onPress={() => setShowOld(v => !v)} style={styles.eyeIcon}>
          <MaterialCommunityIcons name={showOld ? 'eye-off' : 'eye'} size={22} color="#888" />
        </TouchableOpacity>
      </View>
      <View style={{ height: 24 }} />

      <Text style={[styles.label, dynamicStyles.label]}>Mật khẩu mới</Text>
      <View style={{ height: 8 }} />
      <View style={[
        styles.inputWrapper,
        dynamicStyles.inputWrapper,
      ]}>
        <TextInput
          style={[
            styles.input,
            dynamicStyles.input,
            focusField === 'new' && styles.inputFocused,
          ]}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Nhập mật khẩu mới"
          secureTextEntry={!showNew}
          placeholderTextColor={darkMode ? '#6B7280' : '#A0A4AA'}
          onFocus={() => setFocusField('new')}
          onBlur={() => setFocusField('')}
        />
        <TouchableOpacity onPress={() => setShowNew(v => !v)} style={styles.eyeIcon}>
          <MaterialCommunityIcons name={showNew ? 'eye-off' : 'eye'} size={22} color="#888" />
        </TouchableOpacity>
      </View>
      <View style={{ height: 24 }} />

      <Text style={[styles.label, dynamicStyles.label]}>Xác nhận mật khẩu mới</Text>
      <View style={{ height: 8 }} />
      <View style={[
        styles.inputWrapper,
        dynamicStyles.inputWrapper,
        confirmPassword.length > 0 && newPassword !== confirmPassword && styles.inputError,
        confirmPassword.length > 0 && newPassword === confirmPassword && styles.inputSuccess,
      ]}>
        <TextInput
          style={[
            styles.input,
            dynamicStyles.input,
            focusField === 'confirm' && styles.inputFocused,
          ]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Nhập lại mật khẩu mới"
          secureTextEntry={!showConfirm}
          placeholderTextColor={darkMode ? '#6B7280' : '#A0A4AA'}
          onFocus={() => setFocusField('confirm')}
          onBlur={() => setFocusField('')}
        />
        <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeIcon}>
          <MaterialCommunityIcons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#888" />
        </TouchableOpacity>
        {confirmPassword.length > 0 && newPassword === confirmPassword && (
          <MaterialCommunityIcons name="check-circle" size={22} color="#22C55E" style={{marginLeft: 2}} />
        )}
      </View>
      <View style={{ height: 40 }} />
      <TouchableOpacity style={[styles.saveBtn, dynamicStyles.saveBtn]} onPress={handleChangePassword} disabled={loading}>
        <Text style={styles.saveBtnText}>{loading ? 'Đang đổi...' : 'Đổi mật khẩu'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#F3F6FA',
    flexGrow: 1,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 0,
    marginBottom: 0,
    minHeight: 44,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 0,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 4,
    color: '#1E293B',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingRight: 6,
    minHeight: 50,
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    flex: 1,
    color: '#222',
    minHeight: 50,
  },
  inputFocused: {
    // Khi focus, border sẽ xanh đậm
    backgroundColor: '#F0F2F5',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  inputSuccess: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  eyeIcon: {
    padding: 4,
  },
  saveBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
});

export default ChangePasswordScreen;
