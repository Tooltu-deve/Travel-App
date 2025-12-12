/**
 * WeatherWarningModal - Component hiển thị cảnh báo thời tiết
 * 
 * Hỗ trợ 3 mức độ cảnh báo:
 * - normal: Thời tiết bình thường, không hiển thị modal
 * - warning: Thời tiết không thuận lợi, cho phép người dùng chọn tiếp tục hoặc quay lại
 * - danger: Thời tiết nguy hiểm, tự động quay về form nhập thông tin
 */
import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { SPACING } from '../constants/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type WeatherSeverity = 'normal' | 'warning' | 'danger';

export interface WeatherWarningModalProps {
  visible: boolean;
  severity: WeatherSeverity;
  alertMessage?: string;
  destination?: string;
  onContinue?: () => void;
  onGoBack?: () => void;
  onClose?: () => void;
}

const WeatherWarningModal: React.FC<WeatherWarningModalProps> = ({
  visible,
  severity,
  alertMessage,
  destination,
  onContinue,
  onGoBack,
  onClose,
}) => {
  const isWarning = severity === 'warning';
  const isDanger = severity === 'danger';
  const isNormal = severity === 'normal';

  const getIcon = () => {
    if (isDanger) {
      return 'exclamation-triangle';
    }
    if (isNormal) {
      return 'check-circle';
    }
    return 'exclamation-circle';
  };

  const getIconColor = () => {
    if (isDanger) {
      return '#FF4444';
    }
    if (isNormal) {
      return '#4CAF50';
    }
    return '#FFA500';
  };

  const getTitle = () => {
    if (isDanger) {
      return 'Cảnh báo thời tiết nguy hiểm!';
    }
    if (isNormal) {
      return 'Thời tiết thuận lợi!';
    }
    return 'Lưu ý về thời tiết';
  };

  const getMessage = () => {
    if (alertMessage && alertMessage !== 'empty') {
      return alertMessage;
    }
    if (isDanger) {
      return `Thời tiết tại ${destination || 'điểm đến'} đang trong tình trạng nguy hiểm. Vui lòng chọn điểm đến hoặc ngày đi khác để đảm bảo an toàn.`;
    }
    if (isNormal) {
      return `Thời tiết tại ${destination || 'điểm đến'} trong thời gian bạn dự định đi rất thuận lợi. Hãy tiếp tục tạo lộ trình của bạn!`;
    }
    return `Thời tiết tại ${destination || 'điểm đến'} có thể không thuận lợi trong thời gian bạn dự định đi. Bạn có muốn tiếp tục tạo lộ trình không?`;
  };

  const getGradientColors = (): [string, string] => {
    if (isDanger) {
      return ['#FF6B6B', '#FF4444'];
    }
    if (isNormal) {
      return ['#66BB6A', '#4CAF50'];
    }
    return ['#FFB347', '#FFA500'];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header với gradient */}
          <LinearGradient
            colors={getGradientColors()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.iconContainer}>
              <FontAwesome name={getIcon()} size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{getTitle()}</Text>
          </LinearGradient>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.message}>{getMessage()}</Text>

            {/* Weather info badge */}
            <View style={[styles.severityBadge, isDanger ? styles.dangerBadge : isNormal ? styles.normalBadge : styles.warningBadge]}>
              <FontAwesome 
                name={isDanger ? 'warning' : isNormal ? 'sun-o' : 'cloud'} 
                size={16} 
                color={isDanger ? '#FF4444' : isNormal ? '#4CAF50' : '#FFA500'} 
              />
              <Text style={[styles.severityText, isDanger ? styles.dangerText : isNormal ? styles.normalText : styles.warningText]}>
                {isDanger ? 'Mức độ: Nguy hiểm' : isNormal ? 'Mức độ: Tốt' : 'Mức độ: Cảnh báo'}
              </Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {isNormal ? (
              // Normal: Chỉ hiển thị 1 nút - Xác nhận để tiếp tục
              <TouchableOpacity
                style={[styles.button, styles.successButton, styles.fullWidthButton]}
                onPress={onContinue}
                activeOpacity={0.8}
              >
                <Text style={styles.successButtonText}>Xác nhận</Text>
                <FontAwesome name="arrow-right" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : isWarning ? (
              // Warning: Hiển thị 2 nút - Quay lại và Tiếp tục
              <>
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={onGoBack}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="arrow-left" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.secondaryButtonText}>Quay lại</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={onContinue}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Tiếp tục</Text>
                  <FontAwesome name="arrow-right" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              // Danger: Chỉ hiển thị 1 nút - Quay lại
              <TouchableOpacity
                style={[styles.button, styles.dangerButton, styles.fullWidthButton]}
                onPress={onGoBack}
                activeOpacity={0.8}
              >
                <FontAwesome name="arrow-left" size={16} color="#FFFFFF" />
                <Text style={styles.dangerButtonText}>Quay lại chọn lại thông tin</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    width: SCREEN_WIDTH - SPACING.lg * 2,
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerGradient: {
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  content: {
    padding: SPACING.lg,
  },
  message: {
    fontSize: 15,
    color: COLORS.textMain,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
    alignSelf: 'center',
    gap: SPACING.xs,
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
  },
  dangerBadge: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  normalBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  severityText: {
    fontSize: 13,
    fontWeight: '600',
  },
  warningText: {
    color: '#FFA500',
  },
  dangerText: {
    color: '#FF4444',
  },
  normalText: {
    color: '#4CAF50',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingTop: 0,
    gap: SPACING.md,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 12,
    gap: SPACING.sm,
  },
  fullWidthButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dangerButton: {
    backgroundColor: '#FF4444',
  },
  successButton: {
    backgroundColor: '#4CAF50',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default WeatherWarningModal;
