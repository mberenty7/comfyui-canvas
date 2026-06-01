/**
 * Some server routes wrap responses in an envelope: { ok: true, data } or
 * { ok: false, error }. Others return the payload directly. This unwraps the
 * envelope when present and throws on { ok: false }, mirroring the defensive
 * handling the legacy app used for /api/comfy/status.
 */
export function unwrap<T = unknown>(json: unknown): T {
  if (json && typeof json === 'object' && 'ok' in json) {
    const env = json as { ok: boolean; data?: T; error?: { message?: string } };
    if (!env.ok) throw new Error(env.error?.message || 'Request failed');
    return env.data as T;
  }
  return json as T;
}

/** GET a URL and return its unwrapped JSON payload. */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  const resp = await fetch(url);
  return unwrap<T>(await resp.json());
}
