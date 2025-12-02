import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { likePlaceAPI, getLikedPlacesAPI, getPlaceByIdAPI } from '@/services/api';
import { translatePlaceType } from '../constants/placeTypes';
import { useAuth } from './AuthContext';

type PlaceDetail = any;

type FavoritesContextValue = {
  likedPlaceIds: Set<string>;
  favorites: PlaceDetail[];
  isLiked: (id?: string) => boolean;
  toggleLike: (id: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  getPlaceDetails: (id: string) => Promise<PlaceDetail | null>;
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [likedPlaceIds, setLikedPlaceIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<PlaceDetail[]>([]);
  const cacheRef = useRef<Map<string, PlaceDetail>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const { token: authToken } = useAuth() as any || {};

  const getToken = useCallback(async () => {
    if (authToken) return authToken;
    return await AsyncStorage.getItem('userToken');
  }, [authToken]);

  const isLiked = useCallback((id?: string) => !!id && likedPlaceIds.has(id), [likedPlaceIds]);

  const getPlaceDetails = useCallback(async (id: string) => {
    if (!id) return null;
    const cache = cacheRef.current;
    if (cache.has(id)) return cache.get(id)!;
    try {
      const detail = await getPlaceByIdAPI(id);
      if (detail) cache.set(id, detail);
      return detail;
    } catch (e) {
      return null;
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setFavorites([]);
        setLikedPlaceIds(new Set());
        return;
      }
      const remote = (await getLikedPlacesAPI(token)) || [];
      const enriched = (await Promise.all(remote.map(async (p: any) => {
        // backend may return `place_id` (snake_case) or `placeId`/`_id` etc.
        const id = p.place_id || p.placeId || p._id || p.id;
        let base = p;
        if (!p.name || !p.type) {
          const d = id ? await getPlaceDetails(id) : null;
          if (!d) return null; // skip invalid places
          base = { ...p, ...d };
        }

        // normalize/translate moods/type to Vietnamese labels for UI consistency
        let moods: string[] = [];
        if (Array.isArray(base.moods) && base.moods.length) moods = base.moods.map((m: string) => translatePlaceType(m));
        else if (base.mood) moods = [translatePlaceType(base.mood)];
        else if (base.type) moods = [translatePlaceType(base.type)];

        return { ...base, moods };
      }))).filter(Boolean); // filter out nulls
      setFavorites(enriched);
      // include place_id (snake_case) when building the set of liked ids
      const ids = new Set<string>(enriched.map((p: any) => p.google_place_id || p.googlePlaceId || p.place_id || p.placeId || p.id || p._id).filter(Boolean) as string[]);
      setLikedPlaceIds(ids);
    } catch (err) {
      console.warn('refreshFavorites failed', err);
    }
  }, [getToken, getPlaceDetails]);

  useEffect(() => {
    // initial load
    refreshFavorites();
  }, [refreshFavorites]);

  const toggleLike = useCallback(async (id: string) => {
    if (!id) return;
    const token = await getToken();
    if (!token) throw new Error('Not logged in');

    // optimistic
    setLikedPlaceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    pendingRef.current.add(id);

    try {
      await likePlaceAPI(token, id);
      // background refresh favorites
      refreshFavorites().catch(() => {});
    } catch (err) {
      // rollback
      setLikedPlaceIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      throw err;
    } finally {
      pendingRef.current.delete(id);
    }
  }, [getToken, refreshFavorites]);

  return (
    <FavoritesContext.Provider value={{ likedPlaceIds, favorites, isLiked, toggleLike, refreshFavorites, getPlaceDetails }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
};

export default FavoritesContext;
