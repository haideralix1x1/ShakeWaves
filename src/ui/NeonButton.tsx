import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  active?: boolean;
  activeColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function NeonButton({
  label,
  onPress,
  variant = 'primary',
  active = false,
  activeColor,
  disabled,
  style,
}: Props) {
  const chosenColor = activeColor || (variant === 'primary' ? theme.player : variant === 'danger' ? theme.danger : theme.textDim);
  const color = active ? (activeColor || theme.target) : chosenColor;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: color,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
          backgroundColor: active
            ? `${color}25`
            : variant === 'primary'
            ? 'rgba(255,61,240,0.12)'
            : 'transparent',
        },
        style,
      ]}>
      <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
    </Pressable>
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
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 2,
  },
});
