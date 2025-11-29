import { useAuth } from '@/contexts/AuthContext';
import { getProfileAPI, updateProfileAPI } from '@/services/api';
import { FontAwesome5, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const EditProfileScreen: React.FC = () => {
  const { userData } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dob, setDob] = useState(''); // Ngày sinh
  const [address, setAddress] = useState(''); // Nơi cư trú
  const [phone, setPhone] = useState(''); // Số điện thoại
  const [gender, setGender] = useState(''); // Giới tính
  const router = useRouter();

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) throw new Error('No token');
      const res = await getProfileAPI(token);
      if (res && res.email) setEmail(res.email);
      if (res && res.fullName) setFullName(res.fullName);
      if (res && res.avatar) setAvatar(res.avatar);
      if (res && res.dob) setDob(res.dob);
      if (res && res.address) setAddress(res.address);
      if (res && res.phone) setPhone(res.phone);
      if (res && res.gender) setGender(res.gender);
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể tải thông tin cá nhân');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) throw new Error('No token');
      const res = await updateProfileAPI(token, { fullName, avatar, dob, address, phone, gender });
      if (res && res.user) {
        setFullName(res.user.fullName || '');
        setAvatar(res.user.avatar || '');
        setDob(res.user.dob || '');
        setAddress(res.user.address || '');
        setPhone(res.user.phone || '');
        setGender(res.user.gender || '');
        Alert.alert('Thành công', 'Đã cập nhật thông tin cá nhân');
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể cập nhật thông tin');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2196F3" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* --- HEADER ĐÃ SỬA --- */}
      <View style={styles.headerContainer}>
        {/* Nút Back nằm tuyệt đối bên trái */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2196F3" />
        </TouchableOpacity>

        {/* Tiêu đề nằm giữa */}
        <Text style={styles.headerTitle}>Hồ sơ cá nhân</Text>
      </View>
      {/* --------------------- */}

      {/* Avatar section */}
      <View style={styles.avatarSection}>
        <Image
          source={avatar ? { uri: avatar } : require('../../assets/images/avatar-default.png')}
          style={styles.avatar}
        />
      </View>

      {/* Group 1: Liên hệ */}
      <Text style={styles.sectionHeader}>Liên hệ</Text>
      <View style={styles.fieldRow}>
        <MaterialIcons name="person" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={styles.inputRow}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Tên hiển thị"
        />
      </View>
      <View style={styles.fieldRow}>
        <MaterialIcons name="phone" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={styles.inputRow}
          value={phone}
          onChangeText={setPhone}
          placeholder="Số điện thoại"
          keyboardType="phone-pad"
        />
      </View>
      <View style={styles.fieldRow}>
        <MaterialIcons name="email" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={[styles.inputRow, { backgroundColor: '#F3F4F6', color: '#888' }]}
          value={email}
          editable={false}
        />
      </View>

      {/* Group 2: Thông tin cá nhân */}
      <Text style={styles.sectionHeader}>Thông tin cá nhân</Text>
      <View style={styles.fieldRow}>
        <MaterialIcons name="calendar-today" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={styles.inputRow}
          value={dob}
          onChangeText={setDob}
          placeholder="Ngày sinh (dd/mm/yyyy)"
        />
      </View>
      <View style={styles.fieldRow}>
        <FontAwesome5 name="venus-mars" size={18} color="#2196F3" style={styles.icon} />
        <View style={styles.genderRow}>
          <TouchableOpacity
            style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
            onPress={() => setGender('male')}
          >
            <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>Nam</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
            onPress={() => setGender('female')}
          >
            <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>Nữ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.genderBtn, gender === 'other' && styles.genderBtnActive]}
            onPress={() => setGender('other')}
          >
            <Text style={[styles.genderText, gender === 'other' && styles.genderTextActive]}>Khác</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.fieldRow}>
        <MaterialIcons name="location-on" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={styles.inputRow}
          value={address}
          onChangeText={setAddress}
          placeholder="Địa chỉ"
        />
      </View>

      {/* Save button at the end */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#F3F6FA',
    flexGrow: 1,
    // Đã xóa alignItems: 'center' để layout linh hoạt hơn cho header
  },
  // --- STYLES MỚI CHO HEADER ---
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
    position: 'relative',
    paddingVertical: 10,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    zIndex: 10,
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
    textAlign: 'center',
  },
  // -----------------------------
  avatarSection: {
    alignItems: 'center',
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#fff',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 6,
    right: 18,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    elevation: 2,
  },
  sectionHeader: {
    alignSelf: 'flex-start',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 8,
    color: '#2196F3',
    letterSpacing: 0.2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  icon: {
    marginRight: 10,
    marginLeft: 2,
    width: 26,
    textAlign: 'center',
  },
  inputRow: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  genderRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  genderBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 10,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  genderBtnActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  genderText: {
    color: '#1E293B',
    fontWeight: '500',
    fontSize: 15,
  },
  genderTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  saveBtn: {
    marginTop: 32,
    backgroundColor: '#2196F3',
    borderRadius: 24,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.2,
  },
});

export default EditProfileScreen;