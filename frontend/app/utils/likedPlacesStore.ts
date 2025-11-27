import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LikedPlace {
  id: string;
  name: string;
  address: string;
  moods: string[];
  googlePlaceId?: string;
  rating: number | null;
}

const STORAGE_KEY = 'likedPlaces_v1';

let cache: LikedPlace[] = [];
const subscribers: Array<(places: LikedPlace[]) => void> = [];

const notify = () => {
  subscribers.forEach(s => {
    try { s(cache.slice()); } catch (e) { /* ignore */ }
  });
};

export const initLikedPlaces = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = JSON.parse(raw);
    } else {
      cache = [];
    }
  } catch (e) {
    cache = [];
  }
  notify();
};

export const getLikedPlaces = (): LikedPlace[] => cache.slice();

const persist = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    // ignore
  }
};

export const addLikedPlace = async (place: LikedPlace) => {
  const exists = cache.find(p => p.id === place.id);
  if (exists) return;
  cache = [place, ...cache];
  await persist();
  notify();
};

export const removeLikedPlace = async (id: string) => {
  const before = cache.length;
  cache = cache.filter(p => p.id !== id);
  if (cache.length !== before) {
    await persist();
    notify();
  }
};

export const setLikedPlaces = async (places: LikedPlace[]) => {
  cache = places.slice();
  await persist();
  notify();
};

export const subscribeLikedPlaces = (fn: (places: LikedPlace[]) => void) => {
  subscribers.push(fn);
  // call immediately with current cache
  try { fn(cache.slice()); } catch (e) {}
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
};

export default {
  initLikedPlaces,
  getLikedPlaces,
  addLikedPlace,
  removeLikedPlace,
  subscribeLikedPlaces,
};
