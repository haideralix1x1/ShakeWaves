import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { configureAudio } from '../audio/player';

const KEY_BEST = 'shakewaves.best';
const KEY_TOTAL = 'shakewaves.total';

export interface Stats {
  bestLevel: number;
  totalScore: number;
}

interface StatsContextValue extends Stats {
  ready: boolean;
  recordRun(level: number, score: number): Promise<void>;
}

const StatsContext = createContext<StatsContextValue | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats>({ bestLevel: 0, totalScore: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    configureAudio();
    (async () => {
      try {
        const [best, total] = await Promise.all([AsyncStorage.getItem(KEY_BEST), AsyncStorage.getItem(KEY_TOTAL)]);
        setStats({
          bestLevel: best ? Number(best) : 0,
          totalScore: total ? Number(total) : 0,
        });
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const recordRun = useCallback(async (level: number, score: number) => {
    setStats((current) => {
      const next: Stats = {
        bestLevel: Math.max(current.bestLevel, level),
        totalScore: current.totalScore + score,
      };
      AsyncStorage.multiSet([
        [KEY_BEST, String(next.bestLevel)],
        [KEY_TOTAL, String(next.totalScore)],
      ]).catch(() => {
        // ignore
      });
      return next;
    });
  }, []);

  return (
    <StatsContext.Provider value={{ ...stats, ready, recordRun }}>{children}</StatsContext.Provider>
  );
}

export function useStats(): StatsContextValue {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
}

