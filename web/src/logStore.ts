import { create } from 'zustand';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: number;
  time: string;
  message: string;
  level: LogLevel;
}

interface LogState {
  entries: LogEntry[];
  visible: boolean;
  verbose: boolean;
  add: (message: string, level?: LogLevel) => void;
  clear: () => void;
  toggle: () => void;
  show: () => void;
  setVerbose: (v: boolean) => void;
}

const MAX_ENTRIES = 500;
let counter = 0;

/** Standalone store for the Log panel (independent of the canvas store). */
export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  visible: false,
  verbose: false,
  add: (message, level = 'info') => {
    const entry: LogEntry = { id: ++counter, time: new Date().toLocaleTimeString(), message, level };
    set({ entries: [...get().entries.slice(-(MAX_ENTRIES - 1)), entry] });
  },
  clear: () => set({ entries: [] }),
  toggle: () => set({ visible: !get().visible }),
  show: () => set({ visible: true }),
  setVerbose: (v) => set({ verbose: v }),
}));

/** Convenience logger usable outside React components. */
export function addLog(message: string, level: LogLevel = 'info') {
  useLogStore.getState().add(message, level);
}

/** Log only when verbose mode is enabled. */
export function addVerbose(message: string, level: LogLevel = 'info') {
  if (useLogStore.getState().verbose) useLogStore.getState().add(message, level);
}
