// ProfileScreen - Trang cá nhân
import { SPACING } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileAPI } from '@/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AVATAR_SIZE = 72;
const APP_VERSION = 'v1.0.2 (Build 2024)';

const ProfileScreen: React.FC = () => {
  const router = useRouter();
  const { userData, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState(userData?.fullName || '');
  const [email, setEmail] = useState(userData?.email || '');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [showLangModal, setShowLangModal] = useState(false);

  // Load profile from API
  const fetchProfile = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const res = await getProfileAPI(token);
      if (res) {
        setFullName(res.full_name || '');
        setEmail(res.email || '');
      }
    } catch (e) {
      console.log('Không thể tải profile từ API');
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handler: Đăng xuất
  const handleLogout = useCallback(() => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch {}
          },
        },
      ]
    );
  }, [signOut]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top || 16 }]}>
        <View style={styles.headerRow}>
          <View style={styles.avatarWrap}>
            <Image
              source={require('../../assets/images/avatar-default.png')}
              style={styles.avatar}
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{fullName || email}</Text>
            <Text style={styles.headerEmail}>{email}</Text>
            <Text style={styles.headerMember}>Thành viên từ 2024 · Thành viên cơ bản</Text>
          </View>
        </View>
      </View>

      {/* Section: Cài đặt chung */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Cài đặt chung</Text>
        <TouchableOpacity style={styles.menuRow} onPress={() => setShowLangModal(true)}>
          <MaterialCommunityIcons name="translate" size={22} color="#2196F3" style={styles.menuIcon} />
          <Text style={styles.menuText}>Ngôn ngữ</Text>
          <View style={styles.langBox}>
            <Text style={styles.langText}>{language === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#9CA3AF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Section: Tài khoản */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Tài khoản</Text>
        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(account)/edit-profile')}>
          <MaterialCommunityIcons name="account-edit" size={22} color="#2196F3" style={styles.menuIcon} />
          <Text style={styles.menuText}>Chỉnh sửa thông tin</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#9CA3AF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(account)/change-password')}>
          <MaterialCommunityIcons name="shield-lock" size={22} color="#2196F3" style={styles.menuIcon} />
          <Text style={styles.menuText}>Mật khẩu & Bảo mật</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Section: Hỗ trợ */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Hỗ trợ</Text>
        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(account)/faq-profile')}>
          <MaterialCommunityIcons name="help-circle-outline" size={22} color="#2196F3" style={styles.menuIcon} />
          <Text style={styles.menuText}>FAQ</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Section: Đăng xuất */}
      <View style={styles.cardSection}>
        <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={22} color="#EF4444" style={styles.menuIcon} />
          <Text style={[styles.menuText, { color: '#EF4444' }]}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {/* App version */}
      <View style={styles.versionBox}>
        <Text style={styles.versionText}>{APP_VERSION}</Text>
      </View>

      {/* Modal chọn ngôn ngữ */}
      {showLangModal && (
        <View style={styles.langModalOverlay}>
          <View style={styles.langModalBox}>
            <Text style={styles.langModalTitle}>Chọn ngôn ngữ</Text>
            <TouchableOpacity onPress={() => { setLanguage('vi'); setShowLangModal(false); }} style={styles.langModalOption}>
              <Text style={[styles.langModalOptionText, language === 'vi' && { color: '#2196F3', fontWeight: '700' }]}>Tiếng Việt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setLanguage('en'); setShowLangModal(false); }} style={styles.langModalOption}>
              <Text style={[styles.langModalOptionText, language === 'en' && { color: '#2196F3', fontWeight: '700' }]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLangModal(false)} style={styles.langModalCancel}>
              <Text style={styles.langModalCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA', // light grayish blue
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  // Header
  headerWrap: {
    backgroundColor: '#2196F3',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 18,
    paddingHorizontal: SPACING.lg,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    marginRight: 18,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  headerEmail: {
    fontSize: 14,
    color: '#E3F2FD',
    marginBottom: 2,
  },
  headerMember: {
    fontSize: 13,
    color: '#BBDEFB',
  },
  // Card Section
  cardSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: SPACING.lg,
    marginTop: 14,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#fff', // default, will override in dark mode
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 8,
    marginBottom: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6', // default, will override in dark mode
  },
  menuIcon: {
    marginRight: 14,
  },
  menuText: {
    fontSize: 15,
    color: '#1F2937',
    flex: 1,
  },
  langBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F6FA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 8,
  },
  langText: {
    fontSize: 14,
    color: '#2196F3',
    marginRight: 2,
  },
  // Modal chọn ngôn ngữ
  langModalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  langModalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 280,
    alignItems: 'center',
  },
  langModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 18,
    color: '#2196F3',
  },
  langModalOption: {
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  langModalOptionText: {
    fontSize: 15,
    color: '#1F2937',
  },
  langModalCancel: {
    marginTop: 10,
    paddingVertical: 8,
    width: '100%',
    alignItems: 'center',
  },
  langModalCancelText: {
    fontSize: 15,
    color: '#6B7280',
  },
  versionBox: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  versionText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
});

export default ProfileScreen;
