import { useAuth } from '@/contexts/AuthContext';
import { getProfileAPI, updateProfileAPI } from '@/services/api';
import { FontAwesome5, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

// Danh sách mood labels có sẵn
const AVAILABLE_MOOD_TAGS = [
  'Yên tĩnh & Thư giãn',
  'Náo nhiệt & Xã hội',
  'Lãng mạn & Riêng tư',
  'Ven biển & Nghỉ dưỡng',
  'Lễ hội & Sôi động',
  'Điểm thu hút khách du lịch',
  'Mạo hiểm & Thú vị',
  'Gia đình & Thoải mái',
  'Hiện đại & Sáng tạo',
  'Lịch sử & Truyền thống',
  'Tâm linh & Tôn giáo',
  'Địa phương & Đích thực',
  'Cảnh quan thiên nhiên',
];

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

  const toggleTag = (tag: string) => {
    if (preferencedTags.includes(tag)) {
      // Bỏ chọn tag
      setPreferencedTags(preferencedTags.filter(t => t !== tag));
    } else {
      // Chỉ cho phép chọn tối đa 3 tags
      if (preferencedTags.length < 3) {
        setPreferencedTags([...preferencedTags, tag]);
      }
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
        Chọn tối đa 3 tâm trạng/sở thích yêu thích của bạn
      </Text>
      
      {/* Hiển thị tags để chọn */}
      <View style={styles.availableTagsContainer}>
        {AVAILABLE_MOOD_TAGS.map((tag, index) => {
          const isSelected = preferencedTags.includes(tag);
          const isDisabled = !isSelected && preferencedTags.length >= 3;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.selectableTagChip,
                isSelected && styles.selectableTagChipSelected,
                isDisabled && styles.selectableTagChipDisabled,
                { 
                  backgroundColor: isSelected 
                    ? (darkMode ? '#3b82f6' : '#2196F3')
                    : (darkMode ? '#27272a' : '#F3F4F6'),
                  borderColor: isSelected
                    ? (darkMode ? '#3b82f6' : '#2196F3')
                    : (darkMode ? '#3f3f46' : '#E5E7EB'),
                  opacity: isDisabled ? 0.4 : 1
                }
              ]}
              onPress={() => toggleTag(tag)}
              disabled={isDisabled}
            >
              <Text style={[
                styles.selectableTagText,
                isSelected && styles.selectableTagTextSelected,
                { color: isSelected ? '#fff' : (darkMode ? '#f1f5f9' : '#1E293B') }
              ]}>
                {tag}
              </Text>
              {isSelected && (
                <MaterialIcons name="check-circle" size={18} color="#fff" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      
      {/* Hiển thị số lượng tags đã chọn */}
      {preferencedTags.length > 0 && (
        <Text style={[styles.selectedCountText, { color: darkMode ? '#60a5fa' : '#2196F3' }]}>
          Đã chọn {preferencedTags.length}/3 tâm trạng
        </Text>
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
  availableTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  selectableTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  selectableTagChipSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  selectableTagChipDisabled: {
    opacity: 0.4,
  },
  selectableTagText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  selectableTagTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  selectedCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 8,
    textAlign: 'center',
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