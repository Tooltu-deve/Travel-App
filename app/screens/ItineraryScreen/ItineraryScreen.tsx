import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { COLORS } from '../../../constants';

const ItineraryScreen: React.FC = () => {
  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientBlue1, COLORS.gradientBlue2, COLORS.gradientBlue3]}
      locations={[0, 0.3, 0.6, 1]}
      style={styles.container}
    >
      <Text style={styles.text}>Itinerary Screen</Text>
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

export default ItineraryScreen;
