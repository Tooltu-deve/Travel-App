import { useAuth } from '@/contexts/AuthContext';
import { getProfileAPI, updateProfileAPI } from '@/services/api';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      setPreferencedTags(preferencedTags.filter(t => t !== tag));
    } else {
      if (preferencedTags.length < 3) {
        setPreferencedTags([...preferencedTags, tag]);
      }
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2196F3" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top || 16 }]}> 
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2196F3" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ cá nhân</Text>
      </View>

      {/* Thông tin cơ bản */}
      <Text style={styles.sectionHeader}>Thông tin tài khoản</Text>
      <View style={styles.fieldRow}>
        <MaterialIcons name="person" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={[styles.inputRow, styles.inputDisabled]}
          value={fullName}
          editable={false}
        />
      </View>
      <View style={styles.fieldRow}>
        <MaterialIcons name="email" size={20} color="#2196F3" style={styles.icon} />
        <TextInput
          style={[styles.inputRow, styles.inputDisabled]}
          value={email}
          editable={false}
        />
      </View>

      {/* Emotional Tags Section */}
      <Text style={styles.sectionHeader}>Sở thích của bạn (Emotional Tags)</Text>
      <Text style={styles.helperText}>Chọn tối đa 3 tâm trạng/sở thích yêu thích của bạn</Text>
      
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
              ]}
              onPress={() => toggleTag(tag)}
              disabled={isDisabled}
            >
              <Text style={[
                styles.selectableTagText,
                isSelected && styles.selectableTagTextSelected,
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
      
      {preferencedTags.length > 0 && (
        <Text style={styles.selectedCountText}>
          Đã chọn {preferencedTags.length}/3 tâm trạng
        </Text>
      )}

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
  },
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
    color: '#1E293B',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#888',
  },
  helperText: {
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 2,
    color: '#6B7280',
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
