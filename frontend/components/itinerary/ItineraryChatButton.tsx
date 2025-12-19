import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants';
import { ItineraryChatModal } from './ItineraryChatModal';

interface ItineraryChatButtonProps {
  visible: boolean;
  itineraryData: any; // Full itinerary data to pass to chat
  routeId?: string;
}

export const ItineraryChatButton: React.FC<ItineraryChatButtonProps> = ({ 
  visible, 
  itineraryData,
  routeId 
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  console.log('[ItineraryChatButton] Rendered, visible:', visible);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <>
      <Animated.View
        style={[
          styles.chatBubble,
          {
            opacity,
            transform: [
              {
                scale: opacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }),
              },
            ],
          },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={() => setModalVisible(true)}>
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientChat, COLORS.primary]}
            style={styles.chatBubbleGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.chatBubbleInner}>
              <MaterialCommunityIcons name="robot" size={32} color={COLORS.primary} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      <ItineraryChatModal 
        visible={modalVisible} 
        onClose={() => setModalVisible(false)}
        itineraryData={itineraryData}
        routeId={routeId}
      />
    </>
  );
};

const styles = StyleSheet.create({
  chatBubble: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 999,
  },

  chatBubbleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32.5,
    justifyContent: 'center',
    alignItems: 'center',
  },

  chatBubbleInner: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
});
