// FavoritesScreen - Trang danh sách yêu thích
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { COLORS } from '../../constants/colors';

const simpleStyles = StyleSheet.create({
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

const FavoritesScreen: React.FC = () => {
  const { darkMode } = useTheme();
  return (
    <LinearGradient
      colors={darkMode ? ['#181A20', '#23262F'] : [COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={darkMode ? [0, 1] : [0, 0.3, 0.6, 1]}
      style={simpleStyles.container}
    >
      <Text style={[simpleStyles.text, darkMode && { color: '#fff', fontWeight:'bold', fontSize:22 }]}>Favorites Screen</Text>
    </LinearGradient>
  );
};

export default FavoritesScreen;
