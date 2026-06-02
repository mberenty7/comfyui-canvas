import { create } from 'zustand';

export interface MaskEditorOpts {
  imageUrl: string;
  width: number;
  height: number;
  existingMask?: string | null;
  onSave: (maskDataUrl: string) => void;
}

interface MaskEditorState {
  opts: MaskEditorOpts | null;
  open: (opts: MaskEditorOpts) => void;
  close: () => void;
}

/** Drives the mask editor modal (carries the per-open callback). */
export const useMaskEditor = create<MaskEditorState>((set) => ({
  opts: null,
  open: (opts) => set({ opts }),
  close: () => set({ opts: null }),
}));
