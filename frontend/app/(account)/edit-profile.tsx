import { useAuth } from '@/contexts/AuthContext';
import { getProfileAPI, updateProfileAPI } from '@/services/api';
import { FontAwesome5, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

const EditProfileScreen: React.FC = () => {
  const { userData } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [preferencedTags, setPreferencedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { darkMode } = useTheme();

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) throw new Error('No token');
      const res = await getProfileAPI(token);
      if (res) {
        setEmail(res.email || '');
        setFullName(res.full_name || '');
        setPreferencedTags(res.preferenced_tags || []);
      }
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
      console.log('📤 Sending preferencedTags:', preferencedTags);
      const res = await updateProfileAPI(token, preferencedTags);
      console.log('📥 Response from API:', res);
      if (res) {
        setEmail(res.email || '');
        setFullName(res.full_name || '');
        setPreferencedTags(res.preferenced_tags || []);
        Alert.alert('Thành công', 'Đã cập nhật sở thích của bạn');
      }
    } catch (error) {
      console.error('❌ Update error:', error);
      Alert.alert('Lỗi', 'Không thể cập nhật thông tin');
    } finally {
      setSaving(false);
    }
  };

  const dynamicStyles = {
    container: {
      backgroundColor: darkMode ? '#18181b' : '#F3F6FA',
    },
    headerTitle: {
      color: darkMode ? '#60a5fa' : '#2196F3',
    },
    sectionHeader: {
      color: darkMode ? '#60a5fa' : '#2196F3',
    },
    inputRow: {
      backgroundColor: darkMode ? '#27272a' : '#fff',
      borderColor: darkMode ? '#334155' : '#E5E7EB',
      color: darkMode ? '#f1f5f9' : '#1E293B',
    },
    inputDisabled: {
      backgroundColor: darkMode ? '#23262f' : '#F3F4F6',
      color: darkMode ? '#6B7280' : '#888',
    },
    genderBtn: {
      backgroundColor: darkMode ? '#27272a' : '#F3F4F6',
      borderColor: darkMode ? '#334155' : '#E5E7EB',
    },
    genderText: {
      color: darkMode ? '#f1f5f9' : '#1E293B',
    },
    saveBtn: {
      backgroundColor: darkMode ? '#60a5fa' : '#2196F3',
    },
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={darkMode ? '#60a5fa' : '#2196F3'} />;

  return (
    <ScrollView contentContainerStyle={[styles.container, dynamicStyles.container]}>
      {/* --- HEADER ĐÃ SỬA --- */}
      <View style={[styles.headerContainer, { paddingTop: insets.top || 16 }]}> 
        {/* Nút Back nằm tuyệt đối bên trái */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color={darkMode ? '#60a5fa' : '#2196F3'} />
        </TouchableOpacity>

        {/* Tiêu đề nằm giữa */}
        <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>Hồ sơ cá nhân</Text>
      </View>
      {/* --------------------- */}

      {/* Thông tin cơ bản */}
      <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>Thông tin tài khoản</Text>
      <View style={styles.fieldRow}>
        <MaterialIcons name="person" size={20} color={darkMode ? '#60a5fa' : '#2196F3'} style={styles.icon} />
        <TextInput
          style={[styles.inputRow, dynamicStyles.inputDisabled]}
          value={fullName}
          editable={false}
        />
      </View>
      <View style={styles.fieldRow}>
        <MaterialIcons name="email" size={20} color={darkMode ? '#60a5fa' : '#2196F3'} style={styles.icon} />
        <TextInput
          style={[styles.inputRow, dynamicStyles.inputDisabled]}
          value={email}
          editable={false}
        />
      </View>

      {/* Emotional Tags Section */}
      <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>Sở thích của bạn (Emotional Tags)</Text>
      <Text style={[styles.helperText, { color: darkMode ? '#9CA3AF' : '#6B7280' }]}>
        Nhập các tag cảm xúc/sở thích của bạn, cách nhau bởi dấu phẩy
      </Text>
      <View style={styles.fieldRow}>
        <MaterialCommunityIcons name="tag-multiple" size={20} color={darkMode ? '#60a5fa' : '#2196F3'} style={styles.icon} />
        <TextInput
          style={[styles.inputRow, dynamicStyles.inputRow, styles.tagsInput]}
          value={preferencedTags.join(', ')}
          onChangeText={(text) => {
            const tags = text.split(',').map(t => t.trim()).filter(t => t.length > 0);
            setPreferencedTags(tags);
          }}
          placeholder="VD: bình yên, sôi động, lãng mạn, thư giãn"
          placeholderTextColor={darkMode ? '#6B7280' : '#9CA3AF'}
          multiline
        />
      </View>
      
      {/* Hiển thị tags dạng chips */}
      {preferencedTags.length > 0 && (
        <View style={styles.tagsContainer}>
          {preferencedTags.map((tag, index) => (
            <View key={index} style={[styles.tagChip, { backgroundColor: darkMode ? '#3b82f6' : '#2196F3' }]}>
              <Text style={styles.tagChipText}>{tag}</Text>
              <TouchableOpacity
                onPress={() => {
                  setPreferencedTags(preferencedTags.filter((_, i) => i !== index));
                }}
              >
                <MaterialIcons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Save button at the end */}
      <TouchableOpacity style={[styles.saveBtn, dynamicStyles.saveBtn]} onPress={handleSave} disabled={saving}>
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
  helperText: {
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 2,
  },
  tagsInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  tagChipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
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