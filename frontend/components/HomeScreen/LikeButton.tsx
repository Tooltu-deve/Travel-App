import React, { useEffect, useRef, useState } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { likePlaceAPI } from '../../services/api';

type LikeButtonProps = {
  isFavorite: boolean;
  placeId?: string; // optional: if provided, component will call backend
  onToggle?: (next: boolean) => void; // callback to parent for optimistic update
  onSuccess?: (liked: boolean) => void; // called after server confirms like state
  size?: number;
};

const LikeButton: React.FC<LikeButtonProps> = ({ isFavorite, placeId, onToggle, onSuccess, size = 36 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const fillOpacity = useRef(new Animated.Value(isFavorite ? 1 : 0)).current;
  const [busy, setBusy] = useState(false);
  const [localFav, setLocalFav] = useState(isFavorite);

  useEffect(() => {
    // animate on change
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.15, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    Animated.timing(fillOpacity, {
      toValue: localFav ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [localFav]);

  // keep localFav in sync if parent changes prop
  useEffect(() => {
    setLocalFav(isFavorite);
  }, [isFavorite]);

  const handlePress = async () => {
    console.log('[LikeButton] pressed', { placeId, localFav, busy });
    if (busy) return;
    const next = !localFav;

    // optimistic update
    setLocalFav(next);
    onToggle?.(next);

    if (!placeId) return;

    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await likePlaceAPI(placeId, token || undefined);
      console.log('✅ like-place response:', res);
      const serverLiked = res?.liked;
      const finalLiked = typeof serverLiked === 'boolean' ? serverLiked : next;
      onSuccess?.(finalLiked);
    } catch (err) {
      // revert optimistic update
      setLocalFav(!next);
      onToggle?.(!next);
      console.warn('Like/unlike request failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} accessibilityRole="button" activeOpacity={0.8} hitSlop={8}>
      <Animated.View
        style={[
          styles.wrapper,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]} />

        {/* outline heart (shown when not favorite) */}
        <Animated.View
          style={[
            styles.iconOverlay,
            { opacity: fillOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
          pointerEvents="none"
        >
          <FontAwesome name="heart-o" size={Math.round(size * 0.56)} color={COLORS.textWhite} />
        </Animated.View>

        {/* filled heart (shown when favorite) */}
        <Animated.View style={[styles.iconOverlay, { opacity: fillOpacity }]} pointerEvents="none">
          <FontAwesome name="heart" size={Math.round(size * 0.56)} color={COLORS.favoriteActive} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
    backgroundColor: COLORS.favorite,
    opacity: 0.06,
  },
  iconOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LikeButton;
