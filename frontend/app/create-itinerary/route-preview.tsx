import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
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

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const suggestedTitle =
    destination && destination !== 'Lộ trình mới'
      ? `Lộ trình ${destination}`
      : 'Lộ trình mới';

  const handleSave = async () => {
    if (!routeId) {
      Alert.alert('Lỗi', 'Không tìm thấy ID lộ trình.');
      return;
    }
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
        title: suggestedTitle,
      });

      Alert.alert('Thành công', 'Lộ trình đã được lưu.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/itinerary') },
      ]);
    } catch (error: any) {
      console.error('❌ Update route status error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu lộ trình.');
    } finally {
      setIsSaving(false);
    }
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
    <ItineraryViewScreen
      visible
      routeId={routeId || ''}
      onClose={() => router.back()}
      footerContent={footerButtons}
    />
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
});

