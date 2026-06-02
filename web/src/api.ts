/**
 * Some server routes wrap responses in an envelope: { ok: true, data } or
 * { ok: false, error }. Others return the payload directly. This unwraps the
 * envelope when present and throws on { ok: false }, mirroring the defensive
 * handling the legacy app used for /api/comfy/status.
 */
export function unwrap<T = unknown>(json: unknown): T {
  if (json && typeof json === 'object' && 'ok' in json) {
    const env = json as { ok: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } };
    if (!env.ok) {
      const e = env.error;
      const msg = [e?.message, e?.code].filter(Boolean).join(' ');
      throw new Error(msg || (e ? JSON.stringify(e) : 'Request failed'));
    }
    return env.data as T;
  }
  return json as T;
}

/** GET a URL and return its unwrapped JSON payload. */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  const resp = await fetch(url);
  return unwrap<T>(await resp.json());
}

/** POST JSON and return the unwrapped payload. */
export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return unwrap<T>(await resp.json());
}

/** POST a FormData (file upload) and return the unwrapped payload. */
export async function apiUpload<T = unknown>(url: string, form: FormData): Promise<T> {
  const resp = await fetch(url, { method: 'POST', body: form });
  return unwrap<T>(await resp.json());
}
