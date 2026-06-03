import { create } from 'zustand';

/** Transient UI state for menus and modals (not persisted). */
interface UIState {
  /** Flow-position to place a picked workflow; non-null means the picker is open. */
  workflowPickerPos: { x: number; y: number } | null;
  settingsOpen: boolean;
  quickAddOpen: boolean;
  promptsOpen: boolean;
  galleryOpen: boolean;
  contextMenu: { x: number; y: number; nodeId: string } | null;

  openWorkflowPicker: (pos: { x: number; y: number }) => void;
  closeWorkflowPicker: () => void;
  setSettingsOpen: (open: boolean) => void;
  setQuickAddOpen: (open: boolean) => void;
  togglePrompts: () => void;
  toggleGallery: () => void;
  openContextMenu: (menu: { x: number; y: number; nodeId: string }) => void;
  closeContextMenu: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  workflowPickerPos: null,
  settingsOpen: false,
  quickAddOpen: false,
  promptsOpen: false,
  galleryOpen: false,
  contextMenu: null,

  openWorkflowPicker: (pos) => set({ workflowPickerPos: pos }),
  closeWorkflowPicker: () => set({ workflowPickerPos: null }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),
  // Prompt Library and Gallery share the left dock — opening one closes the other.
  togglePrompts: () => set({ promptsOpen: !get().promptsOpen, galleryOpen: false }),
  toggleGallery: () => set({ galleryOpen: !get().galleryOpen, promptsOpen: false }),
  openContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
