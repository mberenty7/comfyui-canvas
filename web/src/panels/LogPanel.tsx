import { useEffect, useRef } from 'react';
import { useLogStore } from '../logStore';

/** Bottom-docked log panel — the React replacement for the legacy #log-panel. */
export function LogPanel() {
  const visible = useLogStore((s) => s.visible);
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const toggle = useLogStore((s) => s.toggle);
  const verbose = useLogStore((s) => s.verbose);
  const setVerbose = useLogStore((s) => s.setVerbose);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest entry.
  useEffect(() => {
    if (visible && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries, visible]);

  if (!visible) return null;

  return (
    <div className="cv-log-panel">
      <div className="cv-log-header">
        <h3>📋 Log</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#888', cursor: 'pointer' }}>
            <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
            Verbose
          </label>
          <button className="prop-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={clear}>
            Clear
          </button>
          <button className="cv-log-close" onClick={toggle}>✕</button>
        </div>
      </div>
      <div className="cv-log-body" ref={bodyRef}>
        {entries.length === 0 ? (
          <div className="cv-log-empty">No log entries yet.</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={`cv-log-entry ${e.level}`}>
              <span className="cv-log-time">{e.time}</span>
              {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
