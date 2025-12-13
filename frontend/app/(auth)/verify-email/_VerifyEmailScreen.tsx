import { COLORS, SPACING } from '@/constants';
import { resendVerificationAPI } from '@/services/api';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const VerifyEmailScreen: React.FC = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();
    const email = params.email as string || '';
    const [isResending, setIsResending] = useState(false);

    const handleResendEmail = async () => {
        if (!email) {
            Alert.alert('Lỗi', 'Không tìm thấy địa chỉ email');
            return;
        }

        try {
            setIsResending(true);
            const response = await resendVerificationAPI(email);

            if (response.success) {
                Alert.alert('Thành công', response.message || 'Email xác thực đã được gửi lại!');
            } else {
                Alert.alert('Lỗi', response.message || 'Không thể gửi lại email');
            }
        } catch (error: any) {
            Alert.alert('Lỗi', error.message || 'Đã xảy ra lỗi khi gửi email');
        } finally {
            setIsResending(false);
        }
    }; return (
        <LinearGradient
            colors={['#FFFFFF', '#e8f9ff', '#d1f2ff', '#a9e3fcff']}
            locations={[0, 0.3, 0.6, 1]}
            style={styles.gradientContainer}
        >
            <ScrollView
                contentContainerStyle={[
                    styles.container,
                    { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
                ]}
            >
                {/* Email Icon Animation */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <FontAwesome name="envelope" size={80} color={COLORS.primary} />
                    </View>
                    <View style={styles.checkmarkBadge}>
                        <FontAwesome name="check" size={24} color="#FFFFFF" />
                    </View>
                </View>

                {/* Success Title */}
                <Text style={styles.title}>Kiểm tra email của bạn!</Text>

                {/* Email Display */}
                <View style={styles.emailContainer}>
                    <Text style={styles.emailText}>{email}</Text>
                </View>

                {/* Instructions */}
                <View style={styles.instructionContainer}>
                    <Text style={styles.subtitle}>
                        Chúng tôi đã gửi một email xác thực đến địa chỉ email của bạn.
                    </Text>

                    <View style={styles.stepContainer}>
                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>1</Text>
                            </View>
                            <Text style={styles.stepText}>
                                Mở hộp thư email của bạn
                            </Text>
                        </View>

                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>2</Text>
                            </View>
                            <Text style={styles.stepText}>
                                Tìm email từ Travel App
                            </Text>
                        </View>

                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>3</Text>
                            </View>
                            <Text style={styles.stepText}>
                                Click vào nút "Xác thực tài khoản"
                            </Text>
                        </View>
                    </View>

                    <View style={styles.noteContainer}>
                        <FontAwesome name="info-circle" size={16} color="#FF9800" />
                        <Text style={styles.noteText}>
                            Link xác thực có hiệu lực trong 24 giờ
                        </Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => router.push('/(auth)/login')}
                    >
                        <LinearGradient
                            colors={['#3083ff', '#1a5fd9']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.primaryButtonText}>Đi đến đăng nhập</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={handleResendEmail}
                        disabled={isResending}
                    >
                        {isResending ? (
                            <ActivityIndicator color={COLORS.primary} size="small" />
                        ) : (
                            <Text style={styles.secondaryButtonText}>
                                Không nhận được email? Gửi lại
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Help Text */}
                <Text style={styles.helpText}>
                    Kiểm tra cả thư mục Spam/Junk nếu không thấy email
                </Text>
            </ScrollView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    gradientContainer: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        paddingHorizontal: SPACING.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        position: 'relative',
        marginBottom: SPACING.xl,
    },
    iconCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(48, 131, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(48, 131, 255, 0.2)',
    },
    checkmarkBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.primary,
        textAlign: 'center',
        marginBottom: SPACING.md,
    },
    emailContainer: {
        backgroundColor: 'rgba(48, 131, 255, 0.1)',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
        borderRadius: 12,
        marginBottom: SPACING.xl,
    },
    emailText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.primary,
    },
    instructionContainer: {
        width: '100%',
        marginBottom: SPACING.xl,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: SPACING.lg,
    },
    stepContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    step: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    stepNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.md,
    },
    stepNumberText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    stepText: {
        flex: 1,
        fontSize: 15,
        color: '#333',
        lineHeight: 20,
    },
    noteContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF3E0',
        padding: SPACING.md,
        borderRadius: 12,
        gap: SPACING.sm,
    },
    noteText: {
        flex: 1,
        fontSize: 14,
        color: '#E65100',
        lineHeight: 20,
    },
    actionsContainer: {
        width: '100%',
        marginBottom: SPACING.lg,
    },
    primaryButton: {
        marginBottom: SPACING.md,
        borderRadius: 12,
        overflow: 'hidden',
    },
    buttonGradient: {
        paddingVertical: SPACING.md + 2,
        alignItems: 'center',
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    secondaryButton: {
        paddingVertical: SPACING.md,
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontSize: 14,
        color: COLORS.primary,
        fontWeight: '600',
    },
    helpText: {
        fontSize: 13,
        color: '#999',
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default VerifyEmailScreen;
