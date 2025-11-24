import React, { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { SPACING, BORDER_RADIUS } from '../../../constants/spacing';

export default function ItineraryDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const days = [
    {
      title: 'DAY 1 — BÀ NÀ HILLS',
      image: require('../../../assets/images/test_address/cau-vang-ba-na-19072019-1.jpg'),
      morning: '06:00',
      afternoon: '15:00',
      description:
        'Bắt đầu hành trình tại Bà Nà Hills: tham quan Cầu Vàng, đi cáp treo, khám phá vườn hoa, và thưởng thức ẩm thực địa phương tại các quán ăn đặc trưng. Lịch trình linh hoạt, có thời gian tự do để chụp ảnh và mua sắm. Hướng dẫn viên sẽ hỗ trợ di chuyển giữa các điểm, đảm bảo bạn có trải nghiệm trọn vẹn trong ngày.',
    },
    {
      title: 'DAY 2 — ĐÀ LẠT',
      image: require('../../../assets/images/test_address/canh-dep-da-lat-1.png'),
      morning: '08:00',
      afternoon: '14:00',
      description:
        'Khám phá những thắng cảnh nổi tiếng ở Đà Lạt: thăm vườn hoa, Hồ Xuân Hương, và trải nghiệm ẩm thực đường phố. Lộ trình dành cho người thích thiên nhiên và chụp ảnh. Có các tùy chọn tham gia tour ngắn nếu muốn.',
    },
    {
      title: 'DAY 3 — HỘI AN',
      image: require('../../../assets/images/test_address/anh-01-16859402497861207466047.png'),
      morning: '07:30',
      afternoon: '16:00',
      description:
        'Dạo phố cổ Hội An, tham quan các di tích lịch sử, thử các món ăn truyền thống và mua sắm đồ thủ công mỹ nghệ. Thời gian buổi chiều tự do để thư giãn hoặc khám phá thêm những con hẻm nhỏ ẩn chứa nhiều bất ngờ.',
    },
  ];

  const DayCard = ({ d, i }: any) => {
    const [expanded, setExpanded] = useState(false);
    const shouldShowToggle = typeof d.description === 'string' && d.description.length > 180;

    return (
      <TouchableOpacity
        key={i}
        style={styles.dayCard}
        activeOpacity={0.9}
        onPress={() => {}}
        accessibilityRole="button"
      >
        <Image source={d.image} style={styles.dayImage} />
        <View style={styles.dayBody}>
          <Text style={styles.dayTitle}>{d.title}</Text>

          <View style={styles.timelineRow}>
            <View style={styles.dayTimes}>
              <Text style={styles.timeLabel}>SÁNG</Text>
              <Text style={styles.timeValue}>{d.morning}</Text>

              <View style={{ height: SPACING.md }} />

              <Text style={styles.timeLabel}>CHIỀU</Text>
              <Text style={styles.timeValue}>{d.afternoon}</Text>
            </View>

            <View style={styles.dayTextBlock}>
              <Text numberOfLines={expanded ? undefined : 3} style={styles.paragraph}>
                {d.description}
              </Text>

              {shouldShowToggle && (
                <TouchableOpacity onPress={() => setExpanded((s) => !s)} activeOpacity={0.8}>
                  <Text style={styles.readMore}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + SPACING.lg }]}> 
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="chevron-left" size={20} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.smallLabel}>LỘ TRÌNH</Text>
          <Text style={styles.title}>Cầu Vàng — Bà Nà Hills</Text>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={() => { /* placeholder for share/book */ }}>
          <Text style={styles.actionText}>Chia sẻ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaCard}>
          <View>
            <Text style={styles.metaLabel}>Thời lượng</Text>
            <Text style={styles.metaValue}>3 ngày</Text>
          </View>

          <View>
            <Text style={styles.metaLabel}>Khởi hành</Text>
            <Text style={styles.metaValue}>Hà Nội</Text>
          </View>

          <View>
            <Text style={styles.metaLabel}>Ngày</Text>
            <Text style={styles.metaValue}>12/07/2025</Text>
          </View>
        </View>

        {days.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={styles.dayCard}
            activeOpacity={0.9}
            onPress={() => {}}
            accessibilityRole="button"
          >
            <Image source={d.image} style={styles.dayImage} />
            <View style={styles.dayBody}>
              <Text style={styles.dayTitle}>{d.title}</Text>

              <View style={styles.timelineRow}>
                <View style={styles.dayTimes}>
                  <Text style={styles.timeLabel}>SÁNG</Text>
                  <Text style={styles.timeValue}>{d.morning}</Text>

                  <View style={{ height: SPACING.md }} />

                  <Text style={styles.timeLabel}>CHIỀU</Text>
                  <Text style={styles.timeValue}>{d.afternoon}</Text>
                </View>

                <View style={styles.dayTextBlock}>
                  <Text style={styles.paragraph}>Tham quan điểm nổi bật và chụp ảnh check-in, thưởng thức ẩm thực địa phương, di chuyển chủ động theo lịch.</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLight,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgLight,
    marginRight: SPACING.md,
  },
  titleWrap: { flex: 1 },
  smallLabel: { fontSize: 12, color: COLORS.primary, fontWeight: '700', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.textMain, letterSpacing: 0.2 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.primary },
  actionText: { color: COLORS.textWhite, fontWeight: '700' },

  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  metaCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  metaLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  metaValue: { fontSize: 15, color: COLORS.textMain, marginTop: SPACING.xs, fontWeight: '900' },

  dayCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  dayImage: { width: 110, height: 110, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.lg },
  dayBody: { flex: 1 },
  dayTitle: { fontWeight: '900', color: COLORS.textMain, fontSize: 18, marginBottom: SPACING.sm, letterSpacing: 0.3 },
  timelineRow: { flexDirection: 'row' },
  dayTimes: { width: 90, alignItems: 'flex-start' },
  timeLabel: { fontWeight: '900', color: COLORS.primary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  timeValue: { color: COLORS.textMain, fontSize: 13, marginTop: SPACING.xs, fontWeight: '700' },
  dayTextBlock: { flex: 1, paddingLeft: SPACING.md },
  paragraph: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 22, letterSpacing: 0.1 },
  readMore: { color: COLORS.primary, marginTop: SPACING.xs, fontWeight: '800' },
});
