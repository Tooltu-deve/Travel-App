import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants';

const FavoritesScreen: React.FC = () => {
  return (
    <LinearGradient
      colors={['#FFFFFF', '#e8f9ff', '#d1f2ff', '#a9e3fcff']}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <Text style={styles.text}>Favorites Screen</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    color: COLORS.textMain,
  },
});

export default FavoritesScreen;
