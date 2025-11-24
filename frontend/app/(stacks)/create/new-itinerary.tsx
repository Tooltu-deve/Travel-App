import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import { SPACING } from '../../../constants/spacing';
import { COLORS } from '../../../constants/colors';

export default function NewItineraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleCreate = (data: { name: string; startDate?: string; notes?: string }) => {
    // For now we'll navigate to the detail screen after creation.
    // You can extend to persist the new itinerary in a store/backend.
    router.push('/detail/itinerary-detail');
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}> 
        <View style={styles.header}>
          <Text style={styles.heroBadge}>TẠO MỚI</Text>
          <Text style={styles.heroTitle}>Lên kế hoạch cho chuyến đi tuyệt vời của bạn</Text>
          <Text style={styles.heroLead}>Chọn cách tạo lộ trình phù hợp với bạn — nhanh bằng AI hoặc thủ công tùy chỉnh.</Text>
        </View>

        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[styles.optionCard, styles.optionPrimary]}
            activeOpacity={0.9}
            accessibilityRole="button"
            onPress={() => router.push('/create/ai-prompt')}
          >
            <View style={styles.optionIcon}><FontAwesome name="rocket" size={26} color="#fff" /></View>
            <Text style={styles.optionTitle}>Tạo với AI</Text>
            <Text style={styles.optionSubtitle}>Sinh tự động hành trình thông minh dựa trên sở thích và thời gian của bạn.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, styles.optionOutline]}
            activeOpacity={0.9}
            accessibilityRole="button"
            onPress={() => { /* no-op manual flow for now */ }}
          >
            <View style={[styles.optionIcon, styles.iconOutline]}><FontAwesome name="pencil" size={22} color={COLORS.primary} /></View>
            <Text style={[styles.optionTitle, styles.outlineTitle]}>Tạo thủ công</Text>
            <Text style={styles.optionSubtitle}>Tùy chỉnh từng điểm đến và thời gian theo ý thích (chưa triển khai).</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Tạo lộ trình nhanh & thông minh</Text>
          <Text style={styles.infoText}>
            Bạn có thể chọn ‘Tạo với AI’ để nhận một đề xuất lộ trình tối ưu dựa trên thời gian, địa điểm ưa thích và mức chi phí mong muốn. Hoặc chọn ‘Tạo thủ công’ nếu muốn toàn quyền tùy chỉnh từng điểm đến.
          </Text>

          <View style={styles.benefitsRow}>
            <View style={styles.benefitItem}>
              <FontAwesome name="check" size={14} color={COLORS.primary} />
              <Text style={styles.benefitText}>Lộ trình tối ưu theo thời gian</Text>
            </View>
            <View style={styles.benefitItem}>
              <FontAwesome name="check" size={14} color={COLORS.primary} />
              <Text style={styles.benefitText}>Gợi ý địa điểm & trải nghiệm</Text>
            </View>
          </View>

          {/* Tips section removed per request */}

          <Text style={styles.footerNote}>Dữ liệu lộ trình hiện tại sẽ chỉ lưu tạm thời trong thiết bị trừ khi bạn đăng nhập và lưu trên tài khoản.</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  title: { fontSize: 22, fontWeight: '900', color: '#fff' },
  subtitle: { marginTop: SPACING.xs, color: 'rgba(255,255,255,0.9)' },
  optionsRow: { paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, gap: SPACING.md },
  optionCard: { borderRadius: 14, padding: SPACING.md, minHeight: 160, justifyContent: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 6 },
  optionPrimary: { backgroundColor: COLORS.primary, overflow: 'hidden' },
  optionOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  optionIcon: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  iconOutline: { backgroundColor: 'transparent' },
  optionTitle: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: SPACING.xs },
  outlineTitle: { color: COLORS.textMain },
  optionSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  heroBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(33, 185, 255, 1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, color: 'rgba(255, 255, 255, 0.86)', fontWeight: '900', marginBottom: SPACING.sm, textShadowColor: 'rgba(0,0,0,0.06)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: COLORS.textMain, marginBottom: SPACING.xs, lineHeight: 36, textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
  heroLead: { color: COLORS.textMain, fontSize: 15, marginBottom: SPACING.sm, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.08)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 6 },
  // make info section transparent and use dark text for readability over gradient
  infoSection: { paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, backgroundColor: 'transparent', padding: SPACING.md, borderRadius: 12 },
  infoTitle: { fontSize: 16, fontWeight: '900', color: COLORS.textMain, marginBottom: SPACING.xs },
  infoText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md },
  // show benefits stacked so longer texts wrap onto their own line
  benefitsRow: { flexDirection: 'column', marginBottom: SPACING.md, gap: SPACING.md },
  benefitItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  benefitText: { color: COLORS.textMain, marginLeft: SPACING.xs, fontWeight: '700' },
  /* tips section removed */
  footerNote: { color: COLORS.textSecondary, fontSize: 12, marginTop: SPACING.sm },
});
