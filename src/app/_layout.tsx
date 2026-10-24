import { useEffect, useState } from 'react';
import { StatsProvider } from '../game/StatsContext';
import { InstrumentProvider } from '../game/InstrumentContext';
import { LoadingTransitionProvider } from '../ui/LoadingTransitionContext';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoadingScreen from '../ui/LoadingScreen';
import { theme } from '../ui/theme';
import { configureAudio } from '../audio/player';
import { preloadClickSfx } from '../audio/sfx';

export default function RootLayout() {
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    configureAudio().catch(() => {});
    preloadClickSfx().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <SafeAreaProvider>
        <StatsProvider>
          <InstrumentProvider>
            <LoadingTransitionProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.bg },
                  animation: 'none',
                }}
              />
              {!initialLoaded && (
                <LoadingScreen
                  message="Initializing ShakeWaves…"
                  durationMs={1200}
                  showBrand={true}
                  onDone={() => setInitialLoaded(true)}
                />
              )}
            </LoadingTransitionProvider>
          </InstrumentProvider>
        </StatsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
