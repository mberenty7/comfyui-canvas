import { create } from 'zustand';

export interface PaintEditorOpts {
  imageUrl: string;
  width: number;
  height: number;
  onSave: (compositeDataUrl: string) => void;
}

interface PaintEditorState {
  opts: PaintEditorOpts | null;
  open: (opts: PaintEditorOpts) => void;
  close: () => void;
}

/** Drives the Paint modal (carries the per-open callback). */
export const usePaintEditor = create<PaintEditorState>((set) => ({
  opts: null,
  open: (opts) => set({ opts }),
  close: () => set({ opts: null }),
}));
