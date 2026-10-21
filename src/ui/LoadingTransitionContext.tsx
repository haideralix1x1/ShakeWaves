import { createContext, useContext, useState, type ReactNode } from 'react';
import LoadingScreen from '../ui/LoadingScreen';

interface LoadingTransitionContextType {
  transitionTo: (action: () => void, message?: string) => void;
}

const LoadingTransitionContext = createContext<LoadingTransitionContextType | null>(null);

export function LoadingTransitionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('Loading…');

  const transitionTo = (action: () => void, message = 'Loading…') => {
    setMsg(message);
    setLoading(true);
    action();
  };

  return (
    <LoadingTransitionContext.Provider value={{ transitionTo }}>
      {children}
      {loading && (
        <LoadingScreen
          message={msg}
          durationMs={450} // Half of previous ~950ms for snappy transitions
          onDone={() => setLoading(false)}
        />
      )}
    </LoadingTransitionContext.Provider>
  );
}

export function useLoadingTransition() {
  const ctx = useContext(LoadingTransitionContext);
  if (!ctx) {
    throw new Error('useLoadingTransition must be used within LoadingTransitionProvider');
  }
  return ctx;
}
