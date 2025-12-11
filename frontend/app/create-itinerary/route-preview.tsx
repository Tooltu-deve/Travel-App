import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { updateRouteStatusAPI, deleteRouteAPI } from '@/services/api';
import { ItineraryViewScreen } from '@/components/itinerary/ItineraryViewScreen';

interface RoutePreviewParams {
  routeId?: string;
  destination?: string;
}

export default function RoutePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as RoutePreviewParams;
  const routeId = params.routeId;
  const destination = params.destination || 'Lộ trình mới';

  const suggestedTitle =
    destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [routeTitle, setRouteTitle] = useState(suggestedTitle);

  const handleSaveConfirm = async () => {
    console.log('[RoutePreview] handleSaveConfirm pressed', { routeId, title: routeTitle });
    if (!routeId) {
      Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
      return;
    }
    const titleToSave = routeTitle?.trim() || suggestedTitle;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Lỗi', 'Bạn cần đăng nhập để lưu lộ trình.');
        router.replace('/(auth)/login');
        return;
      }

      await updateRouteStatusAPI(token, routeId, {
        status: 'CONFIRMED',
        title: titleToSave,
      });
      console.log('[RoutePreview] updateRouteStatusAPI success');
      
      Alert.alert('Thành công', 'Lộ trình đã được lưu.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/itinerary') },
      ]);
    } catch (error: any) {
      console.error('❌ Update route status error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình.');
    } finally {
      setIsSaving(false);
      setIsNameModalVisible(false);
    }
  };

  const handleSave = () => {
    console.log('[RoutePreview] handleSave pressed, open name modal');
    setRouteTitle(suggestedTitle);
    setIsNameModalVisible(true);
  };

  const handleCancel = () => {
    Alert.alert('Hủy lộ trình', 'Bạn có chắc chắn muốn hủy lộ trình này?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Có',
        style: 'destructive',
        onPress: async () => {
          if (!routeId) {
            Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
            return;
          }
          setIsDeleting(true);
          try {
            const token = await AsyncStorage.getItem('userToken');
            if (!token) {
              Alert.alert('Lỗi', 'Bạn cần đăng nhập để thực hiện thao tác này.');
              router.replace('/(auth)/login');
              return;
            }
            await deleteRouteAPI(token, routeId);
            Alert.alert('Đã hủy', 'Lộ trình đã được xóa.', [
              { text: 'OK', onPress: () => router.replace('/(tabs)/itinerary') },
            ]);
          } catch (error: any) {
            console.error('❌ Delete route error:', error);
            Alert.alert('Lỗi', error.message || 'Không thể hủy lộ trình.');
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  const footerButtons = (
    <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerButton, styles.cancelButton]}
            onPress={handleCancel}
        disabled={isDeleting || isSaving}
            activeOpacity={0.7}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={COLORS.textDark} />
            ) : (
              <Text style={styles.cancelButtonText}>Hủy</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerButton, styles.confirmButton]}
        onPress={handleSave}
        disabled={isSaving || isDeleting}
            activeOpacity={0.7}
          >
        {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.textWhite} />
            ) : (
          <Text style={styles.confirmButtonText}>Lưu lộ trình</Text>
            )}
          </TouchableOpacity>
        </View>
  );

  return (
    <>
      <ItineraryViewScreen
        visible
        routeId={routeId || ''}
        onClose={() => router.back()}
        footerContent={footerButtons}
        overlayContent={
          isNameModalVisible && (
            <View style={styles.inlineModalOverlay} pointerEvents="box-none">
              <View style={styles.modalBackdrop} />
              <View style={styles.inlineModalContent}>
                <Text style={styles.modalTitle}>Đặt tên lộ trình</Text>
            <TextInput
              style={styles.modalInput}
                  placeholder="Nhập tên lộ trình"
                  value={routeTitle}
                  onChangeText={setRouteTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancel]}
                    onPress={() => setIsNameModalVisible(false)}
                    disabled={isSaving}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                    style={[styles.modalButton, styles.modalConfirm]}
                    onPress={handleSaveConfirm}
                    disabled={isSaving}
              >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={COLORS.textWhite} />
                    ) : (
                <Text style={styles.modalConfirmText}>Lưu</Text>
                    )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  footerButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  inlineModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    zIndex: 9999,
  },
  inlineModalContent: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderRadius: SPACING.md,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  modalButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: SPACING.md,
  },
  modalCancel: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalConfirm: {
    backgroundColor: COLORS.primary,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
});