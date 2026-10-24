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

  const handlePractice = () => {
    const instObj = INSTRUMENTS.find((i) => i.id === selectedInstrument);
    transitionTo(() => {
      router.push('/practice');
    }, `Opening ${instObj?.label || 'Instrument'} Practice…`);
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
          <Waveform data={animated} color={chosenObj.color || theme.target} height={80} strokeWidth={2.2} />
        </View>

        {/* ── Instrument Selection Before Game Start ── */}
        <View style={styles.pickerSection}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle} numberOfLines={1}>CHOOSE INSTRUMENT</Text>
            <Text style={[styles.pickerActiveBadge, { color: chosenObj.color }]} numberOfLines={1}>
              {chosenObj.emoji} {chosenObj.label.toUpperCase()}
            </Text>
          </View>
          <View style={styles.pickerDescContainer}>
            <Text style={styles.pickerDesc} numberOfLines={2}>
              {selectedInstrument === 'mix'
                ? 'Mix Mode: Blend multiple instruments to build melodies.'
                : `Play all melodies tuned in authentic ${chosenObj.label} acoustics.`}
            </Text>
          </View>

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
                  onPressIn={() => playUiTap()}
                  onPress={() => setSelectedInstrument(inst.id)}>
                  <Text style={styles.instrEmoji}>{inst.emoji}</Text>
                  <Text
                    style={[
                      styles.instrLabel,
                      isSelected && { color: inst.color, fontWeight: '700' },
                    ]}
                    numberOfLines={1}>
                    {inst.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.statsRow}>
          <Stat label="ACTIVE STREAK" value={currentStreak > 0 ? `${currentStreak} 🔥` : '0'} />
          <Stat label="BEST STREAK" value={bestLevel > 0 ? `${bestLevel} 🏆` : '—'} />
          <Stat label="SCORE" value={totalScore.toFixed(0)} />
        </View>

        <View style={styles.actions}>
          <NeonButton
            label={`Start Game (${chosenObj.emoji} ${chosenObj.label})`}
            onPress={handleStart}
          />
          <NeonButton
            label={`Practice (${chosenObj.emoji} ${chosenObj.label})`}
            activeColor="#00f5d4"
            onPress={handlePractice}
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 12,
  },
  hero: { alignItems: 'center', marginBottom: 2 },
  heroLogo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#00f5d450',
    backgroundColor: '#0b1220',
  },
  title: { fontFamily: mono, fontSize: 36, fontWeight: '900', color: theme.text, letterSpacing: 8 },
  titleAccent: {
    fontFamily: mono,
    fontSize: 36,
    fontWeight: '900',
    color: theme.player,
    letterSpacing: 8,
    marginTop: -8,
  },
  subtitle: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 5,
    color: theme.textDim,
    marginTop: 4,
  },
  stage: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.panel,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Picker Section
  pickerSection: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.panel,
    padding: 12,
    minHeight: 152,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
    marginBottom: 4,
  },
  pickerTitle: {
    fontFamily: mono,
    fontSize: 10,
    color: theme.textDim,
    letterSpacing: 2,
    fontWeight: '700',
  },
  pickerActiveBadge: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  pickerDescContainer: {
    minHeight: 32,
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  pickerDesc: {
    fontFamily: mono,
    fontSize: 9.5,
    color: theme.textDim,
    lineHeight: 15,
  },
  pickerScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  instrBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
    minHeight: 62,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  instrEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  instrLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.panel,
    padding: 10,
  },
  statLabel: { fontFamily: mono, fontSize: 8.5, color: theme.textDim, letterSpacing: 1.5 },
  statValue: { fontFamily: mono, fontSize: 18, color: theme.text, fontWeight: '700', marginTop: 3 },

  actions: { gap: 10, marginTop: 2 },
});
