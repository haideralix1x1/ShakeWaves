import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function NeonButton({ label, onPress, variant = 'primary', disabled, style }: Props) {
  const color =
    variant === 'primary' ? theme.player : variant === 'danger' ? theme.danger : theme.textDim;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { borderColor: color, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
        variant === 'primary' && { backgroundColor: 'rgba(255,61,240,0.12)' },
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
    fontSize: 14,
    letterSpacing: 2,
  },
});
