// ItineraryScreen - Trang lộ trình du lịch
import React, { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ImageBackground,
  ListRenderItemInfo,
  Modal,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { mockItineraries } from '../mockData';

const ItineraryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const renderPrevious = ({ item }: ListRenderItemInfo<typeof mockItineraries[0]>) => {
    const firstPlace = item.places?.[0] ?? {};

    return (
      <TouchableOpacity style={styles.itineraryItem} activeOpacity={0.85}>
        <Image source={typeof firstPlace.image === 'string' ? { uri: firstPlace.image } : firstPlace.image} style={styles.itemImage} />

        <View style={styles.itemContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
            <Text numberOfLines={1} style={styles.itemTitle}>{item.name}</Text>
          </View>

          <Text numberOfLines={1} style={styles.itemDetails}>{firstPlace.location ?? firstPlace.name ?? '—'}</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs }}>
            <View style={{ backgroundColor: COLORS.bgLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 12 }}>{firstPlace.amenities?.[0] ?? '—'}</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FontAwesome name="star" size={12} color={COLORS.ratingAlt} />
              <Text style={{ color: COLORS.icon, fontWeight: '700', marginLeft: 6 }}>{firstPlace.rating ?? '—'}</Text>
            </View>
          </View>

          {/* travel dates removed per request */}
        </View>

        <FontAwesome name="chevron-right" size={16} color={COLORS.icon} />
      </TouchableOpacity>
    );
  };

  const current = mockItineraries.find((it) => it.status === 'current');
  const previous = mockItineraries.filter((it) => it.status === 'previous');

  const [currentItinerary, setCurrentItinerary] = useState<any>(current);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const renderListHeader = () => (
    <>
      {currentItinerary && (
        <View style={styles.currentSection}>
          <TouchableOpacity
            style={styles.currentCardWrapper}
            activeOpacity={0.9}
            onPress={() => {}}
            accessibilityRole="button"
          >
            <ImageBackground source={currentItinerary.places[0].image} style={styles.currentImage} imageStyle={styles.currentImageStyle}>
              <LinearGradient colors={[ 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.2)' ]} style={styles.currentOverlay} />
              <View style={styles.currentInner}>
                <View style={styles.currentCardTag}><Text style={styles.currentCardTagText}>Lộ trình hiện tại</Text></View>
                <Text style={styles.currentTitle}>{currentItinerary.places[0].name || currentItinerary.name}</Text>
                <View style={styles.ctaRowLarge}>
                  <TouchableOpacity onPress={() => router.push('/detail/itinerary-detail')} style={styles.ctaPrimaryLarge} activeOpacity={0.9}><Text style={styles.ctaPrimaryText}>Xem lộ trình →</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.ctaOutlineLarge} activeOpacity={0.9} onPress={() => setConfirmVisible(true)}><Text style={styles.ctaOutlineText}>Kết thúc lộ trình</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.currentActionCard} pointerEvents="box-none">
                <TouchableOpacity style={styles.currentActionBtn} activeOpacity={0.9}><Text style={styles.currentActionBtnText}>Bắt đầu</Text></TouchableOpacity>
              </View>
            </ImageBackground>
          </TouchableOpacity>

          {/* Overlapping white sheet to emphasize separation between current and previous */}
          <View style={styles.sheet}>
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{currentItinerary.name}</Text>
              <Text style={styles.sheetSubtitle}>{currentItinerary.places.length} địa điểm</Text>
            </View>
          </View>
        </View>
      )}

      {previous.length > 0 && <Text style={[styles.cardLabel, { paddingTop: SPACING.md }]}>Lộ trình trước</Text>}
    </>
  );

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + SPACING.lg }]}>
        <View style={styles.headerLeft}>
          <FontAwesome name="map-o" size={26} color={COLORS.primary} />
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Lộ trình</Text>
            <Text style={styles.headerSubtitle}>Quản lý & xem lịch trình của bạn</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={previous}
        renderItem={renderPrevious}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderListHeader}
      />

      {/* Confirmation modal for finishing the current itinerary */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kết thúc lộ trình</Text>
            <Text style={styles.modalMessage}>Bạn có chắc chắn muốn kết thúc lộ trình hiện tại? Hành động này sẽ ẩn lộ trình này khỏi mục Lộ trình hiện tại.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)} style={styles.modalBtnOutline} activeOpacity={0.85}><Text style={styles.modalBtnOutlineText}>Hủy</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setCurrentItinerary(null); setConfirmVisible(false); }} style={styles.modalBtnConfirm} activeOpacity={0.85}><Text style={styles.modalBtnConfirmText}>Kết thúc</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={styles.createButton} activeOpacity={0.85} onPress={() => router.push('/create/new-itinerary')}><FontAwesome name="plus" size={20} color="#fff" /><Text style={styles.createButtonText}>Tạo lộ trình mới</Text></TouchableOpacity>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLight,
  },
  headerTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerTextBlock: { marginLeft: SPACING.md },
  headerSubtitle: { fontSize: 12, color: COLORS.primary, marginTop: -2 },
  headerRight: { width: 44 },

  chipsRow: {
    // placeholder if/when chips are added to itinerary similar to favorites
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    minHeight: 56,
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },

  /* current (featured) itinerary */
  currentSection: { marginBottom: SPACING.lg },
  currentLabel: { paddingHorizontal: SPACING.lg, color: COLORS.primary, fontWeight: '900', marginBottom: SPACING.sm, fontSize: 18 },
  currentCardWrapper: { marginBottom: SPACING.lg },
  currentImage: { width: '100%', height: 320, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-start' },
  currentImageStyle: { borderRadius: 16 },
  currentOverlay: { ...StyleSheet.absoluteFillObject },
  currentInner: { zIndex: 2, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xxxl },
  // make the in-card "Lộ trình hiện tại" label larger (1.5x) and more roomy
  currentCardTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 20, marginBottom: SPACING.sm },
  currentCardTagText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  currentTitle: { color: '#fff', fontSize: 30, fontWeight: '900', marginBottom: SPACING.md, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 10 },

  ctaRowLarge: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  ctaPrimaryLarge: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 28 },
  ctaPrimaryText: { color: '#fff', fontWeight: '800' },
  ctaOutlineLarge: { borderWidth: 1.5, borderColor: '#fff', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.06)' },
  ctaOutlineText: { color: '#fff', fontWeight: '700' },

  currentActionCard: { position: 'absolute', left: SPACING.lg, right: SPACING.lg, bottom: -36, alignItems: 'center', zIndex: 3 },
  currentActionBtn: { width: '100%', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 8 },
  currentActionBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  /* previous items */
  cardLabel: { paddingHorizontal: SPACING.lg, color: COLORS.primary, fontWeight: '900', fontSize: 18, marginBottom: SPACING.xs },
  itineraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  itemImage: { width: 60, height: 60, borderRadius: 8, marginRight: SPACING.md },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark },
  itemDetails: { fontSize: 14, color: COLORS.icon, marginTop: SPACING.xs },
  /* removed itemDates display */

  createButton: { position: 'absolute', left: SPACING.lg, right: SPACING.lg, bottom: SPACING.lg, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, borderRadius: 999, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: SPACING.sm },
  /* overlapping white sheet under the featured card */
  // sheet with light-blue background and white border
  sheet: {
    marginHorizontal: SPACING.lg,
    marginTop: -36,
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  sheetContent: { alignItems: 'flex-start' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textDark, marginBottom: SPACING.xs },
  sheetSubtitle: { fontSize: 13, color: COLORS.icon },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: SPACING.lg, width: '100%', maxWidth: 480 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.textDark, marginBottom: SPACING.sm },
  modalMessage: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  modalBtnOutline: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bgLight, backgroundColor: 'transparent' },
  modalBtnOutlineText: { color: COLORS.textDark, fontWeight: '700' },
  modalBtnConfirm: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: COLORS.primary },
  modalBtnConfirmText: { color: '#fff', fontWeight: '900' },
});

export default ItineraryScreen;
