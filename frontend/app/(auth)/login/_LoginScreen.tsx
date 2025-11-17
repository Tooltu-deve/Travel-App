import { COLORS, SPACING } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { loginAPI } from '@/services/api';
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

const LoginScreen: React.FC = () => {
  // ============================================
  // HOOKS
  // ============================================
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth(); // ⬅️ Lấy signIn và signInWithGoogle từ AuthContext
  
  // ============================================
  // STATE
  // ============================================
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ============================================
  // HANDLE LOGIN
  // ============================================
  /**
   * handleLogin: Xử lý đăng nhập với Backend API
   * 
   * Flow:
   * 1. Validate input
   * 2. Gọi loginAPI
   * 3. Nếu thành công → Lưu token + userData → Gọi signIn()
   * 4. RootNavigator tự động chuyển sang Main App
   */
  const handleLogin = async () => {
    // Reset errors
    setEmailError('');
    setPasswordError('');

    // Validate input
    let hasError = false;
    
    if (!email) {
      setEmailError('Email không được để trống');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Mật khẩu không được để trống');
      hasError = true;
    }

    // Validate email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Email không hợp lệ');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    try {
      setIsLoading(true);
      console.log('🔐 Logging in with:', email);

      // Gọi API login
      const response = await loginAPI(email, password);

      if ((response.success || response.access_token) && response.user) {
        // Login thành công
        console.log('✅ Login successful:', response.user);
        
        // Reset errors
        setEmailError('');
        setPasswordError('');
        
        // Lấy token từ response (có thể là access_token hoặc token)
        const token = response.access_token || response.token;
        
        // Gọi signIn từ AuthContext để lưu token và userData
        await signIn(token as string, response.user);
        
        // RootNavigator sẽ tự động chuyển sang Main App
        // Không cần navigation.navigate('Main')
      } else {
        // Login thất bại - hiện lỗi cho cả 2 field
        setEmailError(response.message || 'Sai email hoặc mật khẩu');
        setPasswordError(response.message || 'Sai email hoặc mật khẩu');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      // Xử lý các loại lỗi khác nhau
      if (error.message === 'Network request failed') {
        setEmailError('Lỗi kết nối');
        setPasswordError('Vui lòng kiểm tra mạng');
      } else {
        setEmailError('Lỗi');
        setPasswordError(error.message || 'Đã xảy ra lỗi');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // TODO: Implement forgot password logic
    console.log('Forgot password');
  };

  // ============================================
  // HANDLE GOOGLE LOGIN
  // ============================================
  /**
   * handleGoogleLogin: Đăng nhập với Google
   * 
   * Flow:
   * 1. Gọi initiateGoogleOAuth từ service
   * 2. Service mở WebBrowser tới /api/v1/auth/google
   * 3. Backend xử lý OAuth và redirect về app
   * 4. Service parse token từ callback URL
   * 5. Gọi signInWithGoogle với token
   */
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    
    try {
      console.log('🔐 Starting Google login...');

      // Gọi Google OAuth service
      const result = await initiateGoogleOAuth();

      if (result.success && result.token) {
        console.log('✅ Google OAuth successful, signing in...');
        
        // Gọi signInWithGoogle với token
        await signInWithGoogle(result.token);
        
        console.log('✅ Google login complete');
      } else {
        // OAuth failed hoặc user cancelled
        console.error('❌ Google OAuth failed:', result.error);
        if (result.error && result.error !== 'Người dùng đã hủy đăng nhập') {
          Alert.alert('Lỗi', result.error);
        }
      }
    } catch (error: any) {
      console.error('❌ Google login error:', error);
      Alert.alert('Lỗi', error.message || 'Đăng nhập Google thất bại');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Removed testGoogleLoginWithToken - using real OAuth flow now

  const handleSocialLogin = (provider: string) => {
    // TODO: Implement social login
    if (provider === 'google') {
      handleGoogleLogin();
    } else {
      console.log('Login with:', provider);
      Alert.alert('Thông báo', `Chức năng đăng nhập với ${provider} chưa có sẵn`);
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
              <Text style={styles.title}>Chào mừng !</Text>
              <Text style={styles.subtitle}>Đăng nhập để tiếp tục hành trình</Text>
            </View>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {/* Email Input */}
            <View style={[
              styles.inputContainer,
              emailError && styles.inputContainerError
            ]}>
              <FontAwesome
                name="envelope"
                size={24}
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
                  // Clear error when user starts typing
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
                  // Clear error when user starts typing
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

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={handleForgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity 
              style={styles.loginButton} 
              onPress={handleLogin}
              disabled={isLoading}
            >
              <LinearGradient
                colors={['#3083ff', '#1a5fd9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Đăng nhập</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Hoặc đăng nhập với</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Login Buttons */}
            <View style={styles.socialButtonsContainer}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleSocialLogin('google')}
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
                onPress={() => handleSocialLogin('facebook')}
              >
                <FontAwesome name="facebook" size={24} color="#4267B2" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleSocialLogin('apple')}
              >
                <FontAwesome name="apple" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign Up Link */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.signupLink}>Đăng ký ngay</Text>
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
    marginBottom: SPACING.lg,
  },
  logoWrapper: {
    marginBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    position: 'relative',
  },
  glowContainer: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    zIndex: 0,
  },
  logo: {
    width: 168,
    height: 168,
    zIndex: 1,
  },
  appNameContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
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
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(48, 131, 255, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
    letterSpacing: 0.5,
  },
  formContainer: {
    marginBottom: SPACING.xl,
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
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.lg,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loginButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#3083ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonGradient: {
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
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
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  signupText: {
    fontSize: 15,
    color: '#666',
  },
  signupLink: {
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
    marginLeft: SPACING.md,
    letterSpacing: 0.2,
  },
});

export default LoginScreen;
