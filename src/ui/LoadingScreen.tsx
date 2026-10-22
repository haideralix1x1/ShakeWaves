import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { mono, theme } from './theme';

interface Props {
  onDone: () => void;
  message?: string;
  durationMs?: number;
  showBrand?: boolean;
}

function makePath(phase: number, width: number, height: number): string {
  const mid = height / 2;
  const amp = height / 2 - 6;
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const t = (i / steps) * Math.PI * 4 + phase;
    const y = mid - Math.sin(t) * amp * Math.abs(Math.sin(t / 2));
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d.trim();
}

const WAVE_W = 260;
const WAVE_H = 65;

export default function LoadingScreen({
  onDone,
  message = 'Synchronizing Waves…',
  durationMs = 450,
  showBrand = false,
}: Props) {
  const [progressAnim] = useState(() => new Animated.Value(0));
  const [opacityAnim] = useState(() => new Animated.Value(1));
  const [wavePath, setWavePath] = useState(() => makePath(0, WAVE_W, WAVE_H));
  const doneRef = useRef(false);

  useEffect(() => {
    let phase = 0;
    const waveTimer = setInterval(() => {
      phase += 0.12;
      setWavePath(makePath(phase, WAVE_W, WAVE_H));
    }, 16);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150, // Fast snappy fade out
        useNativeDriver: true,
      }).start(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      });
    });

    return () => {
      clearInterval(waveTimer);
      doneRef.current = true;
    };
  }, [durationMs, onDone, opacityAnim, progressAnim]);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.root, { opacity: opacityAnim }]} pointerEvents="none">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.inner}>
          {/* Logo */}
          <View style={styles.logoBlock}>
            <Image
              source={require('../../assets/Fevicon.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <Text style={styles.logoTop}>SHAKE</Text>
            <Text style={styles.logoBot}>WAVES</Text>
          </View>

          {/* Waveform graphic */}
          <View style={styles.waveWrap}>
            <Svg width={WAVE_W} height={WAVE_H}>
              <Defs>
                <LinearGradient id="loadGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={theme.player} stopOpacity="0.9" />
                  <Stop offset="0.5" stopColor={theme.target} stopOpacity="0.9" />
                  <Stop offset="1" stopColor={theme.player} stopOpacity="0.9" />
                </LinearGradient>
              </Defs>
              <Path
                d={wavePath}
                stroke="url(#loadGrad)"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          {/* Progress bar */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth }]} />
          </View>

          <Text style={styles.stageText}>{message}</Text>
        </View>

        {showBrand && (
          <View style={styles.splashBrand}>
            <Image
              source={require('../../assets/Company-dark.png')}
              style={styles.splashCompanyLogo}
              resizeMode="contain"
            />
            <Text style={styles.splashCopyrightText}>© 2026 NAMELESS FORGE STUDIOS</Text>
            <Text style={styles.splashCopyrightSub}>ALL RIGHTS RESERVED</Text>
          </View>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    zIndex: 9999,
  },
  safe: { flex: 1 },
  splashBrand: {
    alignItems: 'center',
    paddingBottom: 22,
    gap: 4,
  },
  splashCompanyLogo: {
    width: 140,
    height: 38,
    marginBottom: 2,
    opacity: 0.9,
  },
  splashCopyrightText: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 2,
    fontWeight: '700',
  },
  splashCopyrightSub: {
    fontFamily: mono,
    fontSize: 7.5,
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: 1.5,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 18,
  },
  logoBlock: { alignItems: 'center', marginBottom: 4 },
  logoImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#00f5d450',
    backgroundColor: '#0b1220',
  },
  logoTop: {
    fontFamily: mono,
    fontSize: 42,
    fontWeight: '900',
    color: theme.text,
    letterSpacing: 9,
  },
  logoBot: {
    fontFamily: mono,
    fontSize: 42,
    fontWeight: '900',
    color: theme.player,
    letterSpacing: 9,
    marginTop: -8,
  },
  waveWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.panel,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  barTrack: {
    width: '100%',
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.target,
  },
  stageText: {
    fontFamily: mono,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});
