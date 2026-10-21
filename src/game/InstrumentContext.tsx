import { createContext, useContext, useState, type ReactNode } from 'react';
import { InstrumentId } from '../audio/instruments';

interface InstrumentContextType {
  selectedInstrument: InstrumentId;
  setSelectedInstrument: (inst: InstrumentId) => void;
}

const InstrumentContext = createContext<InstrumentContextType | null>(null);

export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('piano');

  return (
    <InstrumentContext.Provider value={{ selectedInstrument, setSelectedInstrument }}>
      {children}
    </InstrumentContext.Provider>
  );
}

export function useInstrument() {
  const ctx = useContext(InstrumentContext);
  if (!ctx) {
    throw new Error('useInstrument must be used within an InstrumentProvider');
  }
  return ctx;
}
