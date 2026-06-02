import { create } from 'zustand';

interface Viewer3DState {
  open: { modelUrl: string; filename: string } | null;
  openViewer: (modelUrl: string, filename: string) => void;
  close: () => void;
}

/** Drives the 3D viewer modal. */
export const useViewer3D = create<Viewer3DState>((set) => ({
  open: null,
  openViewer: (modelUrl, filename) => set({ open: { modelUrl, filename } }),
  close: () => set({ open: null }),
}));
