import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPACING } from '../../../constants/spacing';
import { COLORS } from '../../../constants/colors';
import { generateItineraryAPI } from '../../../services/api';

export default function AIPromptScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);

    if (!prompt.trim()) {
      setError('Vui lòng nhập prompt mô tả mong muốn của bạn.');
      return;
    }

    setLoading(true);
    try {
      // Try to get token from AsyncStorage if user is logged in
      const token = await AsyncStorage.getItem('userToken');

      // Build a minimal ItineraryRequestDto body. In a real app, replace current_location
      // with the device GPS or user's profile location.
      // Parse destination and budget from prompt
      let destination = '';
      let budgetRange = '';
      const lowerPrompt = prompt.toLowerCase();
      // Simple parsing: look for "đi" followed by location until comma or end
      const diMatch = lowerPrompt.match(/đi\s+([^,]+)/);
      if (diMatch) {
        destination = diMatch[1].trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }
      // Look for "tiền" or "triệu" and map to budget range
      const tienMatch = lowerPrompt.match(/(\d+)\s*triệu/);
      if (tienMatch) {
        const amount = parseInt(tienMatch[1]);
        if (amount <= 5) budgetRange = 'cheap';
        else if (amount <= 15) budgetRange = 'affordable';
        else if (amount <= 30) budgetRange = 'expensive';
        else budgetRange = 'luxury';
      }

      const body = {
        destination: destination || undefined, // Send as string or undefined
        budget: budgetRange || undefined, // Backend expects 'budget' not 'budgetRange'
        travelRadiusKm: 50,
        current_location: { lat: 21.0278, lng: 105.8342 }, // default: Hà Nội
        start_datetime: new Date().toISOString(),
        user_mood: prompt,
        duration_days: 1,
      };

      // Always call API even if token is not present. If backend requires auth it will return 401.
      const res = await generateItineraryAPI(body, token ?? undefined);

      // backend may return a structured error object with statusCode
      if (res && typeof res === 'object' && (res.statusCode || res.status)) {
        const code = res.statusCode || res.status;
        if (code >= 400) {
          const msg = res.message || res.error || `Server returned ${code}`;
          setError(msg);
          setLoading(false);
          return;
        }
      }

      setResult(res);
    } catch (e: any) {
      console.error(e);
      // try to extract useful message
      const message = e?.response?.data?.message || e?.message || 'Lỗi khi gọi API';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearSafeAreaView insets={insets}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nhập prompt cho AI</Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ví dụ: 'Lộ trình 3 ngày ở Đà Nẵng, ưu tiên cảnh đẹp, ít tốn kém'"
          style={styles.input}
          multiline
          numberOfLines={5}
        />

        {error ? (
            <View>
              <Text style={styles.error}>{error}</Text>
              <View style={styles.errorActions}>
                <TouchableOpacity style={styles.retryBtn} onPress={handleRun} activeOpacity={0.85}><Text style={styles.retryText}>Thử lại</Text></TouchableOpacity>
              </View>
            </View>
        ) : null}

        <TouchableOpacity style={styles.runBtn} onPress={handleRun} activeOpacity={0.9} accessibilityRole="button">
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.runBtnText}>Chạy AI</Text>}
        </TouchableOpacity>

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Kết quả (raw)</Text>
            <Text style={styles.resultText}>{JSON.stringify(result, null, 2)}</Text>
            <TouchableOpacity style={styles.gotoDetail} onPress={() => router.push('/detail/itinerary-detail')}><Text style={styles.gotoText}>Xem chi tiết (demo)</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </LinearSafeAreaView>
  );
}

function LinearSafeAreaView({ children, insets }: { children: React.ReactNode; insets: any }) {
  // simple wrapper to keep consistent top/bottom padding
  return (
    <SafeAreaView style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg },
  label: { fontSize: 16, fontWeight: '800', color: COLORS.textMain, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.bgCard, padding: SPACING.md, borderRadius: 12, textAlignVertical: 'top', color: COLORS.textMain, minHeight: 120, marginBottom: SPACING.md },
  runBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  runBtnText: { color: '#fff', fontWeight: '900' },
  error: { color: '#b00020', marginBottom: SPACING.sm },
  resultCard: { marginTop: SPACING.md, backgroundColor: COLORS.bgCard, padding: SPACING.md, borderRadius: 12 },
  resultTitle: { fontWeight: '900', marginBottom: SPACING.xs, color: COLORS.textMain },
  resultText: { fontFamily: 'monospace', color: COLORS.textSecondary, fontSize: 12 },
  gotoDetail: { marginTop: SPACING.md, alignItems: 'center' },
  gotoText: { color: COLORS.primary, fontWeight: '800' },
  errorActions: { flexDirection: 'row', marginBottom: SPACING.md },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignSelf: 'flex-start' },
  retryText: { color: '#fff', fontWeight: '800' },
  // removed login/mock button styles per user request
});
