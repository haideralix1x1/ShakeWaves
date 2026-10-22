import { useEffect, useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARTICLE_COLORS = [
  '#00f5d4', // Neon Cyan
  '#ff007f', // Neon Pink
  '#ffd166', // Golden Sparkle
  '#7209b7', // Electric Purple
  '#00e5ff', // Sky Cyber
  '#38e07b', // Mint Laser
  '#ffffff', // Pure Star
];

interface ParticleData {
  id: number;
  color: string;
  size: number;
  isCircle: boolean;
  animX: Animated.Value;
  animY: Animated.Value;
  animRotate: Animated.Value;
  animOpacity: Animated.Value;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function ConfettiParticles({ count = 38 }: { count?: number }) {
  const particles = useMemo<ParticleData[]>(() => {
    const list: ParticleData[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: i,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        size: Math.floor(6 + seededRandom(i * 3 + 1) * 8),
        isCircle: seededRandom(i * 5 + 2) > 0.4,
        animX: new Animated.Value(0),
        animY: new Animated.Value(0),
        animRotate: new Animated.Value(0),
        animOpacity: new Animated.Value(1),
      });
    }
    return list;
  }, [count]);

  useEffect(() => {
    const animations = particles.map((p) => {
      // Randomized initial velocities and spread
      const targetX = (Math.random() - 0.5) * (SCREEN_WIDTH * 0.95);
      const peakY = -(120 + Math.random() * 220);
      const fallY = SCREEN_HEIGHT * 0.75 + Math.random() * 200;
      const rotation = (Math.random() - 0.5) * 720;
      const duration = 2200 + Math.random() * 1200;

      return Animated.parallel([
        Animated.sequence([
          Animated.timing(p.animY, {
            toValue: peakY,
            duration: duration * 0.35,
            useNativeDriver: true,
          }),
          Animated.timing(p.animY, {
            toValue: fallY,
            duration: duration * 0.65,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(p.animX, {
          toValue: targetX,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.animRotate, {
          toValue: rotation,
          duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(duration * 0.6),
          Animated.timing(p.animOpacity, {
            toValue: 0,
            duration: duration * 0.4,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });

    Animated.stagger(18, animations).start();
  }, [particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => {
        const spin = p.animRotate.interpolate({
          inputRange: [-720, 720],
          outputRange: ['-720deg', '720deg'],
        });

        return (
          <Animated.View
            key={p.id}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.isCircle ? p.size : p.size * 1.5,
                borderRadius: p.isCircle ? p.size / 2 : 2,
                backgroundColor: p.color,
                shadowColor: p.color,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
                transform: [
                  { translateX: p.animX },
                  { translateY: p.animY },
                  { rotate: spin },
                ],
                opacity: p.animOpacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: '35%',
    left: '50%',
  },
});
