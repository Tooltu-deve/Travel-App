import { COLORS, SPACING } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { registerAPI } from '@/services/api';
import { initiateGoogleOAuth } from '@/services/googleAuth';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RegisterScreen: React.FC = () => {
  // ============================================
  // HOOKS
  // ============================================
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithGoogle } = useAuth(); // ⬅️ Lấy signInWithGoogle từ AuthContext

  // ============================================
  // STATE
  // ============================================
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [fullNameError, setFullNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ============================================
  // HANDLE REGISTER
  // ============================================
  /**
   * handleRegister: Xử lý đăng ký tài khoản với Backend API
   * 
   * Flow:
   * 1. Validate input (fullName, email, password match, terms)
   * 2. Gọi registerAPI
   * 3. Nếu thành công → Navigate về Login screen
   */
  const handleRegister = async () => {
    // Reset errors
    setFullNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

    // Validate: Kiểm tra các trường bắt buộc
    let hasError = false;

    if (!fullName) {
      setFullNameError('Họ tên không được để trống');
      hasError = true;
    }

    if (!email) {
      setEmailError('Email không được để trống');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Mật khẩu không được để trống');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Vui lòng xác nhận mật khẩu');
      hasError = true;
    }

    // Validate: Kiểm tra email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Email không hợp lệ');
      hasError = true;
    }

    // Validate: Kiểm tra độ dài password
    if (password && password.length < 6) {
      setPasswordError('Mật khẩu phải có ít nhất 6 ký tự');
      hasError = true;
    }

    // Validate: Kiểm tra password match
    if (password && confirmPassword && password !== confirmPassword) {
      setConfirmPasswordError('Mật khẩu không khớp');
      hasError = true;
    }

    // Validate: Kiểm tra đồng ý điều khoản
    if (!agreeToTerms) {
      Alert.alert('Lỗi', 'Vui lòng đồng ý với điều khoản dịch vụ!');
      return;
    }

    if (hasError) {
      return;
    }

    try {
      setIsLoading(true);
      console.log('📝 Registering user:', email);

      // Gọi API register
      const response = await registerAPI(fullName, email, password);

      if (response.success || response.message) {
        // Đăng ký thành công
        console.log('✅ Registration successful:', response);

        // Navigate đến màn hình verify email với email param
        router.push({
          pathname: '/(auth)/verify-email',
          params: { email: email }
        });
      } else {
        // Đăng ký thất bại - có thể là email đã tồn tại
        setEmailError('Email này đã được sử dụng');
      }
    } catch (error: any) {
      console.error('❌ Register error:', error);

      // Xử lý các loại lỗi khác nhau
      if (error.message === 'Network request failed') {
        setEmailError('Lỗi kết nối mạng');
      } else {
        setEmailError(error.message || 'Đã xảy ra lỗi');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // HANDLE GOOGLE REGISTER
  // ============================================
  /**
   * handleGoogleRegister: Đăng ký với Google
   * 
   * Flow: Giống như login, backend sẽ tự tạo account nếu chưa có
   * 1. Gọi initiateGoogleOAuth từ service
   * 2. Service xử lý OAuth flow
   * 3. Gọi signInWithGoogle với token
   */
  const handleGoogleRegister = async () => {
    setIsGoogleLoading(true);

    try {
      console.log('🔐 Starting Google registration...');

      // Gọi Google OAuth service
      const result = await initiateGoogleOAuth();

      if (result.success && result.token) {
        console.log('✅ Google OAuth successful, signing in...');

        // Gọi signInWithGoogle với token
        // Backend sẽ tự tạo account nếu chưa tồn tại
        await signInWithGoogle(result.token);

        console.log('✅ Google registration complete');
      } else {
        // OAuth failed hoặc user cancelled
        console.error('❌ Google OAuth failed:', result.error);
        if (result.error && result.error !== 'Người dùng đã hủy đăng nhập') {
          Alert.alert('Lỗi', result.error);
        }
      }
    } catch (error: any) {
      console.error('❌ Google registration error:', error);
      Alert.alert('Lỗi', error.message || 'Đăng ký Google thất bại');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Removed testGoogleRegisterWithToken - using real OAuth flow now

  const handleSocialRegister = (provider: string) => {
    // TODO: Implement social registration
    if (provider === 'google') {
      handleGoogleRegister();
    } else {
      console.log('Register with:', provider);
      Alert.alert('Thông báo', `Chức năng đăng ký với ${provider} chưa có sẵn`);
    }
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#e8f9ff', '#d1f2ff', '#a9e3fcff']}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.gradientContainer}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
        >
          {/* Header with Logo */}
          <View style={styles.headerContainer}>
            {/* Logo */}
            <View style={styles.logoWrapper}>
              {/* Gradient radial glow effect */}
              <LinearGradient
                colors={['rgba(48, 131, 255, 0.2)', 'rgba(48, 131, 255, 0.1)', 'rgba(48, 131, 255, 0.02)', 'rgba(48, 131, 255, 0)']}
                style={styles.glowContainer}
                start={{ x: 0.5, y: 0.5 }}
                end={{ x: 0, y: 0 }}
              />

              {/* Logo */}
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Title and Subtitle */}
            <View style={styles.header}>
              <Text style={styles.title}>Tạo tài khoản</Text>
              <Text style={styles.subtitle}>Đăng ký để bắt đầu hành trình</Text>
            </View>
          </View>

          {/* Register Form */}
          <View style={styles.formContainer}>
            {/* Full Name Input */}
            <View style={[
              styles.inputContainer,
              fullNameError && styles.inputContainerError
            ]}>
              <FontAwesome
                name="user-o"
                size={20}
                color={fullNameError ? '#F44336' : COLORS.primary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Họ và tên"
                placeholderTextColor="#999"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (fullNameError) setFullNameError('');
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {fullNameError ? (
              <Text style={styles.errorText}>{fullNameError}</Text>
            ) : null}

            {/* Email Input */}
            <View style={[
              styles.inputContainer,
              emailError && styles.inputContainerError
            ]}>
              <FontAwesome
                name="envelope-o"
                size={20}
                color={emailError ? '#F44336' : COLORS.primary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {emailError ? (
              <Text style={styles.errorText}>{emailError}</Text>
            ) : null}

            {/* Password Input */}
            <View style={[
              styles.inputContainer,
              passwordError && styles.inputContainerError
            ]}>
              <FontAwesome
                name="lock"
                size={24}
                color={passwordError ? '#F44336' : COLORS.primary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Mật khẩu"
                placeholderTextColor="#999"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <FontAwesome
                  name={showPassword ? 'eye' : 'eye-slash'}
                  size={20}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}

            {/* Confirm Password Input */}
            <View style={[
              styles.inputContainer,
              confirmPasswordError && styles.inputContainerError
            ]}>
              <FontAwesome
                name="lock"
                size={24}
                color={confirmPasswordError ? '#F44336' : COLORS.primary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Xác nhận mật khẩu"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (confirmPasswordError) setConfirmPasswordError('');
                }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <FontAwesome
                  name={showConfirmPassword ? 'eye' : 'eye-slash'}
                  size={20}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
            {confirmPasswordError ? (
              <Text style={styles.errorText}>{confirmPasswordError}</Text>
            ) : null}

            {/* Terms and Conditions */}
            <TouchableOpacity
              style={styles.termsContainer}
              onPress={() => setAgreeToTerms(!agreeToTerms)}
            >
              <View style={[
                styles.checkbox,
                agreeToTerms && styles.checkboxActive
              ]}>
                {agreeToTerms && (
                  <FontAwesome name="check" size={14} color="#FFFFFF" />
                )}
              </View>
              <Text style={styles.termsText}>
                Tôi đồng ý với{' '}
                <Text style={styles.termsLink}>Điều khoản dịch vụ</Text> và{' '}
                <Text style={styles.termsLink}>Chính sách bảo mật</Text>
              </Text>
            </TouchableOpacity>

            {/* Register Button */}
            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={isLoading}
            >
              <LinearGradient
                colors={['#3083ff', '#1a5fd9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.registerButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.registerButtonText}>Đăng ký</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Hoặc đăng ký với</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Register Buttons */}
            <View style={styles.socialButtonsContainer}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleSocialRegister('google')}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color="#DB4437" size="small" />
                ) : (
                  <FontAwesome name="google" size={24} color="#DB4437" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleSocialRegister('facebook')}
              >
                <FontAwesome name="facebook" size={24} color="#4267B2" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleSocialRegister('apple')}
              >
                <FontAwesome name="apple" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Success Message */}
          {successMessage ? (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Đã có tài khoản? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginLink}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    justifyContent: 'space-between',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  logoWrapper: {
    marginBottom: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    position: 'relative',
  },
  glowContainer: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    zIndex: 0,
  },
  logo: {
    width: 115,
    height: 115,
    zIndex: 1,
  },
  appNameContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3083ff',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#3083ff',
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(48, 131, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    letterSpacing: 0.5,
  },
  formContainer: {
    marginBottom: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: '#d0e8ff',
    shadowColor: '#3083ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inputContainerError: {
    borderColor: '#F44336',
    shadowColor: '#F44336',
    shadowOpacity: 0.15,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: '#1a1a1a',
    borderRadius: 14,
  },
  inputError: {
    borderColor: '#ff4757',
    borderWidth: 2,
  },
  eyeIcon: {
    padding: SPACING.sm,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  registerButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#3083ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  registerButtonGradient: {
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1e9ff',
  },
  dividerText: {
    fontSize: 14,
    color: '#999',
    marginHorizontal: SPACING.md,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  socialButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f4ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  loginText: {
    fontSize: 15,
    color: '#666',
  },
  loginLink: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorText: {
    fontSize: 13,
    color: '#F44336',
    fontWeight: '600',
    marginTop: -SPACING.sm - 2,
    marginBottom: SPACING.sm + 2,
  },
  successContainer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.md,
  },
  successText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginLeft: SPACING.md,
    letterSpacing: 0.2,
  },
});

export default RegisterScreen;
