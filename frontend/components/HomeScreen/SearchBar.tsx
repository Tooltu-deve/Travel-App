import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Keyboard, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../constants';

interface SearchBarProps {
  onExpandChange?: (isExpanded: boolean) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onExpandChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const animatedWidth = useRef(new Animated.Value(50)).current;
  const inputOpacity = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const blurTimeoutRef = useRef<any>(null);
  const isAnimatingRef = useRef(false); // Flag để ngăn spam click

  useEffect(() => {
    // Lắng nghe sự kiện keyboard ẩn
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      if (isExpanded) {
        // Force blur input khi keyboard ẩn
        inputRef.current?.blur();
        // Delay một chút để đảm bảo blur hoàn tất
        setTimeout(() => {
          handleCollapse();
        }, 50);
      }
    });

    // Lắng nghe nút Back trên Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isExpanded) {
        handleCollapse();
        return true; // Prevent default behavior (thoát app)
      }
      return false; // Let default behavior happen
    });

    return () => {
      keyboardDidHideListener.remove();
      backHandler.remove();
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, [isExpanded]);

  const handleCollapse = () => {
    // Nếu đang animate thì bỏ qua
    if (isAnimatingRef.current) return;
    
    isAnimatingRef.current = true;
    
    // Thu gọn
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    
    // Gọi callback ngay lập tức để Welcome bắt đầu fade in
    onExpandChange?.(false);
    
    inputRef.current?.blur();
    Animated.parallel([
      Animated.timing(inputOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animatedWidth, {
        toValue: 50,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setIsExpanded(false);
      isAnimatingRef.current = false;
    });
  };

  const handleToggle = () => {
    // Nếu đang animate thì bỏ qua
    if (isAnimatingRef.current) return;
    
    if (isExpanded) {
      handleCollapse();
    } else {
      // Mở rộng
      isAnimatingRef.current = true;
      onExpandChange?.(true);
      setIsExpanded(true);
      Animated.sequence([
        Animated.timing(animatedWidth, {
          toValue: 280,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(inputOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start(() => {
        inputRef.current?.focus();
        isAnimatingRef.current = false;
      });
    }
  };

  const handleBlur = () => {
    // Tự động thu gọn khi blur (thoát input)
    blurTimeoutRef.current = setTimeout(() => {
      handleCollapse();
    }, 150);
  };

  const handleFocus = () => {
    // Hủy timeout nếu focus lại vào input
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  };

  return (
    <Animated.View
      style={[
        styles.searchContainer,
        {
          width: animatedWidth,
        },
      ]}
    >
      {isExpanded && (
        <Animated.View
          style={[
            styles.inputContainer,
            {
              opacity: inputOpacity,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Tìm kiếm..."
            placeholderTextColor={COLORS.textSecondary}
            onBlur={handleBlur}
            onFocus={handleFocus}
          />
        </Animated.View>
      )}

      <TouchableOpacity style={styles.searchButton} onPress={handleToggle}>
        <FontAwesome name="search" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    height: 50,
    backgroundColor: COLORS.bgMain,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.bgLight,
    zIndex: 1000,
  },

  searchButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },

  inputContainer: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
  },

  input: {
    fontSize: 15,
    color: COLORS.textMain,
    paddingVertical: 0,
    height: 50,
  },
});
