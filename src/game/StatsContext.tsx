import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { configureAudio } from '../audio/player';

const KEY_BEST = 'shakewaves.best';
const KEY_CURRENT = 'shakewaves.current_streak';
const KEY_TOTAL = 'shakewaves.total';

export interface Stats {
  bestLevel: number;
  currentStreak: number;
  totalScore: number;
}

interface StatsContextValue extends Stats {
  ready: boolean;
  recordRun(passed: boolean, score: number): Promise<void>;
  resetCurrentStreak(): Promise<void>;
}

const StatsContext = createContext<StatsContextValue | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats>({ bestLevel: 0, currentStreak: 0, totalScore: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    configureAudio();
    (async () => {
      try {
        const [best, cur, total] = await Promise.all([
          AsyncStorage.getItem(KEY_BEST),
          AsyncStorage.getItem(KEY_CURRENT),
          AsyncStorage.getItem(KEY_TOTAL),
        ]);
        setStats({
          bestLevel: best ? Number(best) : 0,
          currentStreak: cur ? Number(cur) : 0,
          totalScore: total ? Number(total) : 0,
        });
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const recordRun = useCallback(async (passed: boolean, score: number) => {
    setStats((current) => {
      const newStreak = passed ? current.currentStreak + 1 : 0;
      const next: Stats = {
        bestLevel: Math.max(current.bestLevel, newStreak),
        currentStreak: newStreak,
        totalScore: current.totalScore + score,
      };
      AsyncStorage.multiSet([
        [KEY_BEST, String(next.bestLevel)],
        [KEY_CURRENT, String(next.currentStreak)],
        [KEY_TOTAL, String(next.totalScore)],
      ]).catch(() => undefined);
      return next;
    });
  }, []);

  const resetCurrentStreak = useCallback(async () => {
    setStats((current) => {
      const next: Stats = {
        ...current,
        currentStreak: 0,
      };
      AsyncStorage.setItem(KEY_CURRENT, '0').catch(() => undefined);
      return next;
    });
  }, []);

  return (
    <StatsContext.Provider
      value={{
        ...stats,
        ready,
        recordRun,
        resetCurrentStreak,
      }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats(): StatsContextValue {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
}
