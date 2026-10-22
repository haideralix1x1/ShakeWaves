import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';

export interface ScreenShakeHandle {
  shake: (intensity?: number) => void;
}

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const ScreenShake = forwardRef<ScreenShakeHandle, Props>(function ScreenShake(
  { children, style },
  ref
) {
  const shakeAnim = useMemo(() => new Animated.Value(0), []);

  useImperativeHandle(ref, () => ({
    shake: (intensity = 10) => {
      shakeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: intensity, duration: 35, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -intensity * 0.8, duration: 35, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: intensity * 0.6, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -intensity * 0.4, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: intensity * 0.2, duration: 45, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
      ]).start();
    },
  }));

  const animatedStyle = {
    transform: [{ translateX: shakeAnim }],
  };

  return <Animated.View style={[styles.container, style, animatedStyle]}>{children}</Animated.View>;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
