import { useMemo, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { playUiTap } from '../audio/sfx';
import { mono, theme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  active?: boolean;
  activeColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  haptic?: boolean;
}

export function NeonButton({
  label,
  onPress,
  variant = 'primary',
  active = false,
  activeColor,
  disabled,
  style,
  haptic = true,
}: Props) {
  const scaleAnim = useMemo(() => new Animated.Value(1), []);
  const chosenColor = activeColor || (variant === 'primary' ? theme.player : variant === 'danger' ? theme.danger : theme.textDim);
  const color = active ? (activeColor || theme.target) : chosenColor;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    if (haptic) playUiTap();
    onPress();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          {
            borderColor: color,
            opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
            backgroundColor: active
              ? `${color}28`
              : variant === 'primary'
              ? 'rgba(255,61,240,0.12)'
              : 'transparent',
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: active ? 0.6 : 0.2,
            shadowRadius: active ? 8 : 4,
          },
        ]}>
        <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: mono,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 2,
  },
});
