import { create } from 'zustand';

export interface ComfyConfig {
  comfyUrl: string;
  outputDir: string;
  comfyApiKey: string;
  bflApiKey: string;
}

interface ComfyStatusState {
  connected: boolean;
  comfyUrl: string;
  version: string;
  checking: boolean;
  check: () => Promise<void>;
}

/**
 * Tracks ComfyUI reachability for the toolbar status dot and Settings panel.
 * /api/comfy/status returns { ok:false } when disconnected (a normal state),
 * so we read the envelope manually instead of throwing via unwrap().
 */
export const useComfyStatus = create<ComfyStatusState>((set) => ({
  connected: false,
  comfyUrl: '',
  version: '',
  checking: false,
  check: async () => {
    set({ checking: true });
    try {
      const cfg = (await (await fetch('/api/config')).json()) as Partial<ComfyConfig>;
      const raw = await (await fetch('/api/comfy/status')).json();
      const data = raw && typeof raw === 'object' && 'ok' in raw ? raw.data || {} : raw;
      set({
        comfyUrl: cfg.comfyUrl || '',
        connected: !!data?.connected,
        version: data?.system?.comfyui_version || '',
      });
    } catch {
      set({ connected: false });
    } finally {
      set({ checking: false });
    }
  },
}));
