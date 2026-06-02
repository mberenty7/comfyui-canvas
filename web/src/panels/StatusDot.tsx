import { useEffect } from 'react';
import { useComfyStatus } from '../comfyStatus';

/** Toolbar ComfyUI connection indicator; polls status every 30s. */
export function StatusDot({ onClick }: { onClick: () => void }) {
  const connected = useComfyStatus((s) => s.connected);
  const comfyUrl = useComfyStatus((s) => s.comfyUrl);
  const check = useComfyStatus((s) => s.check);

  useEffect(() => {
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [check]);

  const title = connected ? `ComfyUI connected — ${comfyUrl}` : `ComfyUI disconnected — ${comfyUrl || 'not set'}`;
  return (
    <span
      className={`cv-status-dot ${connected ? 'connected' : 'disconnected'}`}
      title={title}
      onClick={onClick}
    >
      ●
    </span>
  );
}
