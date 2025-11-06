// ProfileScreen - Trang hồ sơ người dùng
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, StyleSheet } from 'react-native';
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

const ProfileScreen: React.FC = () => {
  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={simpleStyles.container}
    >
      <Text style={simpleStyles.text}>Profile Screen</Text>
    </LinearGradient>
  );
};

export default ProfileScreen;
