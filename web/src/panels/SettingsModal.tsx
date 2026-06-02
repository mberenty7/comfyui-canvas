import { useEffect, useState } from 'react';
import { useComfyStatus, type ComfyConfig } from '../comfyStatus';

const EMPTY: ComfyConfig = { comfyUrl: '', outputDir: '', comfyApiKey: '', bflApiKey: '' };

/** Settings panel — ComfyUI URL (with Test), output dir, and API keys. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<ComfyConfig>(EMPTY);
  const [testResult, setTestResult] = useState<{ text: string; color: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const recheck = useComfyStatus((s) => s.check);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: Partial<ComfyConfig>) => setCfg({ ...EMPTY, ...c }))
      .catch(() => undefined);
  }, []);

  function set<K extends keyof ComfyConfig>(key: K, value: ComfyConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function postConfig(partial: Partial<ComfyConfig>) {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  }

  async function testConnection() {
    const url = cfg.comfyUrl.trim();
    if (!url) {
      setTestResult({ text: '❌ Enter a URL first', color: '#ff4444' });
      return;
    }
    setTesting(true);
    setTestResult({ text: 'Testing…', color: '#888' });
    try {
      await postConfig({ comfyUrl: url }); // route checks the saved URL
      const raw = await (await fetch('/api/comfy/status')).json();
      const data = raw && typeof raw === 'object' && 'ok' in raw ? raw.data || {} : raw;
      if (data?.connected) {
        setTestResult({ text: `✅ Connected! ComfyUI v${data.system?.comfyui_version || 'unknown'}`, color: '#44ff44' });
      } else {
        setTestResult({ text: `❌ Cannot reach ComfyUI at ${url}`, color: '#ff4444' });
      }
    } catch (e) {
      setTestResult({ text: `❌ Connection failed: ${(e as Error).message}`, color: '#ff4444' });
    } finally {
      setTesting(false);
      recheck();
    }
  }

  async function save() {
    await postConfig(cfg);
    await recheck();
    onClose();
  }

  return (
    <div className="cv-modal-overlay" onClick={onClose}>
      <div className="cv-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="prop-section">
          <label className="prop-section-label">ComfyUI URL</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              className="prop-input"
              style={{ flex: 1 }}
              placeholder="http://localhost:8188"
              value={cfg.comfyUrl}
              onChange={(e) => set('comfyUrl', e.target.value)}
            />
            <button className="prop-btn" style={{ padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap' }} disabled={testing} onClick={testConnection}>
              🔌 Test
            </button>
          </div>
          {testResult && <span style={{ fontSize: 11, marginTop: 4, display: 'block', color: testResult.color }}>{testResult.text}</span>}
        </div>

        <div className="prop-section">
          <label className="prop-section-label">Output Directory</label>
          <input
            type="text"
            className="prop-input"
            placeholder="Path on canvas server to save copies + metadata"
            value={cfg.outputDir}
            onChange={(e) => set('outputDir', e.target.value)}
          />
        </div>

        <div className="prop-section">
          <label className="prop-section-label">Comfy API Key</label>
          <input
            type="password"
            className="prop-input"
            placeholder="For partner nodes (Nano Banana, Flux, etc.)"
            value={cfg.comfyApiKey}
            onChange={(e) => set('comfyApiKey', e.target.value)}
          />
          <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
            Get your key at{' '}
            <a href="https://platform.comfy.org/login" target="_blank" rel="noreferrer" style={{ color: '#4a9eff' }}>
              platform.comfy.org
            </a>
          </p>
        </div>

        <div className="prop-section">
          <label className="prop-section-label">BFL API Key (Flux)</label>
          <input
            type="password"
            className="prop-input"
            placeholder="For Flux txt2img, inpaint via BFL API"
            value={cfg.bflApiKey}
            onChange={(e) => set('bflApiKey', e.target.value)}
          />
          <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
            Get your key at{' '}
            <a href="https://api.bfl.ai" target="_blank" rel="noreferrer" style={{ color: '#00d4aa' }}>
              api.bfl.ai
            </a>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="generate-btn" style={{ flex: 1 }} onClick={save}>Save</button>
          <button className="prop-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
