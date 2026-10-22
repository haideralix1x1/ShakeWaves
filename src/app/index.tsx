import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { INSTRUMENTS } from '../audio/instruments';
import { playUiTap } from '../audio/sfx';

import { useInstrument } from '../game/InstrumentContext';
import { useStats } from '../game/StatsContext';
import { tutorialLevel } from '../game/levels';
import { NeonButton } from '../ui/NeonButton';
import { useLoadingTransition } from '../ui/LoadingTransitionContext';
import { Waveform } from '../ui/Waveform';
import { mono, theme } from '../ui/theme';

export default function Home() {
  const router = useRouter();
  const { bestLevel, currentStreak, totalScore } = useStats();

  const { selectedInstrument, setSelectedInstrument } = useInstrument();
  const { transitionTo } = useLoadingTransition();
  const [phase, setPhase] = useState(0);
  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  const target = useMemo(() => tutorialLevel().targetWaveform, []);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 100), 60);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.07, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();
    return () => clearInterval(id);
  }, [pulseAnim]);

  const animated = useMemo(() => {
    const shift = (phase / 100) * Math.PI * 2;
    return target.map((v, i) => Math.sin((i / target.length) * Math.PI * 4 + shift) * Math.abs(v));
  }, [target, phase]);

  const handleStart = () => {
    const instObj = INSTRUMENTS.find((i) => i.id === selectedInstrument);
    transitionTo(() => {
      router.push('/play');
    }, `Preparing ${instObj?.label || 'Game'}…`);
  };

  const handleHowTo = () => {
    transitionTo(() => {
      router.push('/how-to');
    }, 'Loading Instructions…');
  };

  const chosenObj = INSTRUMENTS.find((i) => i.id === selectedInstrument)!;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Image
              source={require('../../assets/Fevicon.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />
          </Animated.View>
          <Text style={styles.title}>SHAKE</Text>
          <Text style={styles.titleAccent}>WAVES</Text>
          <Text style={styles.subtitle}>MATCH THE FREQUENCY</Text>
        </View>

        <View style={styles.stage}>
          <Waveform data={animated} color={chosenObj.color || theme.target} width={280} height={70} strokeWidth={2} />
        </View>

        {/* ── Instrument Selection Before Game Start ── */}
        <View style={styles.pickerSection}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>CHOOSE INSTRUMENT</Text>
            <Text style={[styles.pickerActiveBadge, { color: chosenObj.color }]}>
              {chosenObj.emoji} {chosenObj.label.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.pickerDesc}>
            {selectedInstrument === 'mix'
              ? 'Mix Mode: Blend multiple instruments to build melodies.'
              : `Acoustic ${chosenObj.label} melody acoustics.`}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickerScroll}>
            {INSTRUMENTS.map((inst) => {
              const isSelected = selectedInstrument === inst.id;
              return (
                <Pressable
                  key={inst.id}
                  style={[
                    styles.instrBtn,
                    isSelected && {
                      borderColor: inst.color,
                      backgroundColor: `${inst.color}25`,
                      shadowColor: inst.color,
                      shadowOpacity: 0.8,
                      shadowRadius: 8,
                      transform: [{ scale: 1.05 }],
                    },
                  ]}
                  onPress={() => {
                    setSelectedInstrument(inst.id);
                    playUiTap(inst.id);
                  }}>
                  <Text style={styles.instrEmoji}>{inst.emoji}</Text>
                  <Text
                    style={[
                      styles.instrLabel,
                      isSelected && { color: inst.color, fontWeight: '700' },
                    ]}>
                    {inst.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.statsRow}>
          <Stat label="STREAK" value={currentStreak > 0 ? `${currentStreak} 🔥` : '0'} />
          <Stat label="BEST" value={bestLevel > 0 ? `${bestLevel} 🏆` : '—'} />
          <Stat label="SCORE" value={totalScore.toFixed(0)} />
        </View>

        <View style={styles.actions}>
          <NeonButton
            label={`Start Game (${chosenObj.emoji} ${chosenObj.label})`}
            onPress={handleStart}
          />
          <NeonButton label="How to Play" variant="ghost" onPress={handleHowTo} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'space-between' },
  hero: { alignItems: 'center', marginBottom: 4 },
  heroLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#00f5d450',
    backgroundColor: '#0b1220',
  },
  title: { fontFamily: mono, fontSize: 28, fontWeight: '900', color: theme.text, letterSpacing: 6 },
  titleAccent: {
    fontFamily: mono,
    fontSize: 28,
    fontWeight: '900',
    color: theme.player,
    letterSpacing: 6,
    marginTop: -6,
  },
  subtitle: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 4,
    color: theme.textDim,
    marginTop: 4,
  },
  stage: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.panel,
    padding: 4,
    alignItems: 'center',
    marginBottom: 6,
  },

  // Picker Section
  pickerSection: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.panel,
    padding: 10,
    marginBottom: 6,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  pickerTitle: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 2,
    fontWeight: '700',
  },
  pickerActiveBadge: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  pickerDesc: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    lineHeight: 13,
    marginBottom: 6,
  },
  pickerScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  instrBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 64,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  instrEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  instrLabel: {
    fontFamily: mono,
    fontSize: 8.5,
    color: theme.textDim,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: theme.panel,
    padding: 8,
  },
  statLabel: { fontFamily: mono, fontSize: 8, color: theme.textDim, letterSpacing: 1.5 },
  statValue: { fontFamily: mono, fontSize: 16, color: theme.text, fontWeight: '700', marginTop: 2 },

  actions: { gap: 8 },
});
