// FavoritesScreen - Trang danh sách yêu thích
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TouchableOpacity,
  FlatList,
  Image,
  ListRenderItemInfo,
  Animated,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { SearchBar } from '../../components/HomeScreen/SearchBar';
import { getLikedPlaces } from '../../services/api';
import LikeButton from '../../components/HomeScreen/LikeButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { SPACING } from '../../constants/spacing';
import { favoriteDestinations } from '../../utils/mockData';

type Chip = {
  id: string;
  label: string;
};

const CHIPS: Chip[] = [
  { id: 'yentinh', label: 'Yên tĩnh' },
  { id: 'thugian', label: 'Thư giãn' },
  { id: 'langman', label: 'Lãng mạn' },
  { id: 'naonhiet', label: 'Náo nhiệt' },
  { id: 'maohiem', label: 'Mạo hiểm' },
  { id: 'thuvui', label: 'Thú vị' },
  { id: 'giadinh', label: 'Gia đình' },
  { id: 'thoaimai', label: 'Thoải mái' },
  { id: 'tamlinh', label: 'Tâm linh' },
];

const FavoritesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const headerOpacity = useRef(new Animated.Value(1)).current;
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [selectedChip, setSelectedChip] = useState<string>('breakfast');

  const handleSearchExpand = (isExpanded: boolean) => {
    Animated.timing(headerOpacity, {
      toValue: isExpanded ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await getLikedPlaces(token || undefined);
      console.log('✅ liked-places response:', res);
      if (!mountedRef.current) return;
      setFavorites(Array.isArray(res) ? res : res?.places ?? []);
    } catch (err: any) {
      console.error('❌ failed to fetch liked-places', err?.message ?? err);
      // fallback to empty list on error
      if (mountedRef.current) setFavorites([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadFavorites();
    return () => {
      mountedRef.current = false;
    };
  }, [loadFavorites]);

  const renderChip = (chip: Chip) => {
    const active = chip.id === selectedChip;

    return (
      <Pressable
        key={chip.id}
        onPress={() => setSelectedChip(chip.id)}
        style={[styles.chip, active && styles.chipActive]}
        android_ripple={{ color: 'transparent' }}
        accessibilityRole="button"
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
      </Pressable>
    );
  };

  const renderItem = ({ item }: ListRenderItemInfo<any>) => (
    <View style={styles.cardWrap}>
      <Image source={typeof item.image === 'string' ? { uri: item.image } : item.image} style={styles.cardImage} />

      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
          <View style={styles.cardIconsRow}>
              <LikeButton
                isFavorite={true}
                placeId={item.id}
                onToggle={(next) => {
                  // optional immediate UI changes could go here
                }}
                onSuccess={() => {
                  // reload favorites list after server confirms change
                  loadFavorites();
                }}
                size={36}
              />
            <TouchableOpacity style={styles.menuButton}>
              <FontAwesome name="ellipsis-v" size={16} color={COLORS.icon} />
            </TouchableOpacity>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.cardSubtitle}>{item.location}</Text>

        <View style={styles.cardMetaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.amenities?.[0] ?? '—'}</Text>
          </View>
          <View style={styles.ratingRow}>
            <FontAwesome name="star" size={12} color={COLORS.ratingAlt} />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.25, 0.6, 1]}
      style={styles.container}
    >
      <View
        style={[styles.header, { paddingTop: insets.top + SPACING.lg }] }
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Animated.View style={[styles.headerLeft, { opacity: headerOpacity }]}>
          <FontAwesome name="heart" size={28} color={COLORS.favoriteActive} />
          <Text style={styles.headerTitle}>Yêu Thích</Text>
        </Animated.View>
        <View style={styles.searchWrapper}>
          <SearchBar onExpandChange={handleSearchExpand} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipsRowWrapper, { top: headerHeight + SPACING.xs }]}
        contentContainerStyle={styles.chipsRowInner}
      >
        {CHIPS.map(renderChip)}
      </ScrollView>

          {loading ? (
            <View style={[styles.listContent, { paddingTop: headerHeight + 56 + SPACING.sm }]}> 
              <Text style={{ textAlign: 'center', color: COLORS.icon }}>Đang tải danh sách...</Text>
            </View>
          ) : favorites.length === 0 ? (
            <View style={[styles.listContent, styles.emptyState, { paddingTop: headerHeight + 56 + SPACING.sm }]}> 
              <FontAwesome name="heart-o" size={46} color={COLORS.icon} />
              <Text style={{ marginTop: SPACING.md, color: COLORS.icon, fontWeight: '600' }}>Chưa có địa điểm yêu thích</Text>
              <Text style={{ marginTop: SPACING.xs, color: COLORS.icon, textAlign: 'center', maxWidth: 320 }}>Hãy khám phá và nhấn tim ở những nơi bạn thích để lưu vào danh sách này.</Text>
            </View>
          ) : (
            <FlatList
              data={favorites}
              keyExtractor={(i) => String(i.id)}
              renderItem={renderItem}
              contentContainerStyle={[styles.listContent, { paddingTop: headerHeight + 56 + SPACING.sm }]}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              showsVerticalScrollIndicator={false}
            />
          )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: COLORS.textDark,
    marginLeft: SPACING.md,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.bgLight,
  },
  searchWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    overflow: 'visible',
    paddingRight: SPACING.md,
    maxWidth: 360,
  },
  chipsRowWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
  },
  chipsRowInner: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    minHeight: 56,
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    minWidth: 84,
    borderRadius: 20,
    backgroundColor: COLORS.bgLightBlue,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    marginRight: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.bgLightBlue,
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'visible',
  },
  chipPressed: {
    // Reduce shadow and avoid showing a dark outline on press
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    borderColor: 'transparent',
  },
  chipText: {
    color: COLORS.textDark,
    fontWeight: '600',
    fontSize: 14,
    includeFontPadding: false,
    textAlign: 'center',
    maxWidth: 160,
  },
  chipTextActive: {
    color: COLORS.primary,
  },
  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, paddingTop: SPACING.xl + 40 },
  cardWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgLightBlue,
    borderRadius: 12,
    padding: SPACING.sm,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  cardImage: { width: 84, height: 84, borderRadius: 10, marginRight: SPACING.md },
  cardContent: { flex: 1 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark, flex: 1, marginRight: SPACING.md },
  cardIconsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  heartButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgLight },
  menuButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgLight },
  cardSubtitle: { color: COLORS.icon, fontSize: 13, marginTop: 4 },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  badge: { backgroundColor: COLORS.bgLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  badgeText: { color: COLORS.primary, fontWeight: '600', fontSize: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { color: COLORS.icon, fontWeight: '700', marginLeft: 6 },
  separator: { height: SPACING.md },
});

export default FavoritesScreen;
