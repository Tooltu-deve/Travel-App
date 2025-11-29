// Handler: Đổi mật khẩu
const handleChangePassword = async (oldPassword: string, newPassword: string) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) throw new Error('No token');
    // Đúng kiểu API: currentPassword
    const res = await changePasswordAPI(token, { currentPassword: oldPassword, newPassword });
    Alert.alert('Thành công', 'Đã đổi mật khẩu thành công');
  } catch (error) {
    Alert.alert('Lỗi', 'Không thể đổi mật khẩu');
  }
};
// ProfileScreen - Trang cá nhân
import { SPACING } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const AVATAR_SIZE = 72;
const APP_VERSION = 'v1.0.2 (Build 2024)';

const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt', icon: '🇻🇳' },
  { code: 'en', label: 'English', icon: '🇬🇧' },
];

import { changePasswordAPI, getProfileAPI, updateProfileAPI } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProfileScreen: React.FC = () => {
  const router = useRouter();
  const { userData, signOut } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const [fullName, setFullName] = useState(userData?.fullName || '');
  const [email, setEmail] = useState(userData?.email || '');
  const [avatar, setAvatar] = useState(userData?.avatar || '');
  const [isEditing, setIsEditing] = useState(false);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [showLangModal, setShowLangModal] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  // Mock member info
  const memberSince = 'Thành viên từ 2024';
  const memberLevel = 'Thành viên cơ bản';
  // Mock linked accounts
  const [linkedAccounts] = useState({
    facebook: false,
    google: true,
    line: false,
    apple: false,
  });

  // Load profile from API
  const fetchProfile = async () => {
    setLoadingProfile(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) throw new Error('No token');
      const res = await getProfileAPI(token);
      if (res && res.user) {
        setFullName(res.user.fullName || '');
        setEmail(res.user.email || '');
        setAvatar(res.user.avatar || '');
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể tải thông tin cá nhân');
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

// Handler: Lưu thông tin
const handleSave = async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) throw new Error('No token');
    const res = await updateProfileAPI(token, { fullName, avatar });
    if (res && res.user) {
      setFullName(res.user.fullName || '');
      setAvatar(res.user.avatar || '');
    }
    setIsEditing(false);
    Alert.alert('Thành công', 'Đã cập nhật thông tin cá nhân');
  } catch (error) {
    Alert.alert('Lỗi', 'Không thể cập nhật thông tin');
  }
};
  const handleCancel = () => {
    setFullName(userData?.fullName || '');
    setIsEditing(false);
  };
  // Handler: Đăng xuất
  const handleLogout = () => {
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
  };
  const handleLinkAccount = (provider: string) => {
    Alert.alert('Thông báo', `Tính năng liên kết ${provider} đang được phát triển`);
  };

  return (
    <ScrollView style={[styles.container, darkMode && {backgroundColor:'#181A20'}]} contentContainerStyle={styles.contentContainer}>
      {/* Header - compact, with avatar, quick edit, member info */}
      <View style={[styles.headerWrap, darkMode && {backgroundColor:'#181A20'}]}>
        <View style={styles.headerRow}>
          <View style={styles.avatarWrap}>
            <Image
              source={require('../../assets/images/avatar-default.png')}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editAvatarBtn} onPress={() => setIsEditing(true)}>
              <MaterialCommunityIcons name="pencil" size={18} color="#2196F3" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerInfo}>
            <View style={{flexDirection:'row',alignItems:'center'}}>
              <Text style={styles.headerName}>{fullName}</Text>
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <MaterialCommunityIcons name="pencil" size={18} color="#2196F3" style={{marginLeft:6}} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerEmail}>{email}</Text>
            <Text style={styles.headerMember}>{memberSince} · {memberLevel}</Text>
          </View>
        </View>
      </View>

      {/* Section: General Settings */}
      <View style={[styles.cardSection, darkMode && {backgroundColor:'#23262F', borderColor:'#363A45'}]}>
        <Text style={[styles.sectionTitle, darkMode && {color:'#fff'}]}>Cài đặt chung</Text>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="palette" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}, {flex:1}]}>Chế độ tối</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            thumbColor={darkMode ? '#2196F3' : '#fff'}
            trackColor={{false:'#B0BEC5', true:'#2196F3'}}
          />
        </View>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="translate" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Ngôn ngữ</Text>
          <View style={[styles.langBox, darkMode && {backgroundColor:'#23262F'}]}>
            <Text style={[styles.langText, darkMode && {color:'#2196F3'}]}>{language === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={darkMode ? '#fff' : '#9CA3AF'} />
          </View>
        </View>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="bell" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Thông báo</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </View>
      </View>

      {/* Section: Account */}
      <View style={[styles.cardSection, darkMode && {backgroundColor:'#23262F', borderColor:'#363A45'}]}>
        <Text style={[styles.sectionTitle, darkMode && {color:'#fff'}]}>Tài khoản</Text>
        <TouchableOpacity
          style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}
          onPress={() => router.push('/(account)/edit-profile')}
        >
          <MaterialCommunityIcons name="account-edit" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Chỉnh sửa thông tin</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}
          onPress={() => router.push('/(account)/change-password')}
        >
          <MaterialCommunityIcons name="shield-lock" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Mật khẩu & Bảo mật</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </TouchableOpacity>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="account-multiple" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Tài khoản đã liên kết</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </View>
      </View>

      {/* Section: Support & Others */}
      <View style={[styles.cardSection, darkMode && {backgroundColor:'#23262F', borderColor:'#363A45'}]}>
        <Text style={[styles.sectionTitle, darkMode && {color:'#fff'}]}>Hỗ trợ & Khác</Text>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="star-outline" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Đánh giá ứng dụng</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </View>
        <TouchableOpacity
          style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}
          onPress={() => router.push('/(account)/faq-profile')}
        >
          <MaterialCommunityIcons name="help-circle-outline" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>FAQ</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </TouchableOpacity>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="file-document-outline" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Điều khoản sử dụng</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </View>
        <View style={[styles.menuRow, darkMode && {borderBottomColor:'#363A45'}]}>
          <MaterialCommunityIcons name="shield-account-outline" size={22} color={darkMode ? '#fff' : '#2196F3'} style={styles.menuIcon} />
          <Text style={[styles.menuText, darkMode && {color:'#fff'}]}>Chính sách & Quyền riêng tư</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={darkMode ? '#fff' : '#9CA3AF'} style={styles.menuChevron} />
        </View>
      </View>

      {/* Section: Logout */}
      <View style={[styles.cardSection, darkMode && {backgroundColor:'#23262F', borderColor:'#363A45'}]}>
        <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={22} color="#EF4444" style={styles.menuIcon} />
          <Text style={[styles.menuText, { color: '#EF4444' }, darkMode && {color:'#EF4444'}]}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {/* App version at bottom */}
      <View style={styles.versionBox}>
        <Text style={[styles.versionText, darkMode && {color:'#6B7280'}]}>{APP_VERSION}</Text>
      </View>

      {/* Modal chọn ngôn ngữ (giả lập) */}
      {showLangModal && (
        <View style={styles.langModalOverlay}>
          <View style={[styles.langModalBox, darkMode && {backgroundColor:'#23262F'}]}>
            <Text style={[styles.langModalTitle, darkMode && {color:'#2196F3'}]}>Chọn ngôn ngữ</Text>
            <TouchableOpacity onPress={() => { setLanguage('vi'); setShowLangModal(false); }} style={styles.langModalOption}>
              <Text style={[styles.langModalOptionText, language==='vi' && {color:'#2196F3',fontWeight:'700'}, darkMode && {color:'#fff'}]}>Tiếng Việt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setLanguage('en'); setShowLangModal(false); }} style={styles.langModalOption}>
              <Text style={[styles.langModalOptionText, language==='en' && {color:'#2196F3',fontWeight:'700'}, darkMode && {color:'#fff'}]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLangModal(false)} style={styles.langModalCancel}>
              <Text style={[styles.langModalCancelText, darkMode && {color:'#6B7280'}]}>Đóng</Text>
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
    paddingTop: Platform.OS === 'ios' ? 44 : 28,
    paddingBottom: 18,
    paddingHorizontal: SPACING.lg,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 18,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE/2,
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#fff',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    elevation: 2,
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
  menuChevron: {
    marginLeft: 8,
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
  // Reusable BackButton for consistent navigation
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
    top: Platform.OS === 'ios' ? 44 : 24,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
});

export default ProfileScreen;
