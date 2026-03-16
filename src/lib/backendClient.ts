import { supabase } from '@/lib/supabaseClient';

export const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const shouldLogPerf = Boolean(import.meta.env.DEV);

let cachedAccessToken: string | null | undefined;
let sessionLoadPromise: Promise<string | null> | null = null;

const resolveCachedAccessToken = async () => {
  if (cachedAccessToken !== undefined) return cachedAccessToken;
  if (sessionLoadPromise) return sessionLoadPromise;

  sessionLoadPromise = supabase.auth
    .getSession()
    .then(({ data }) => {
      cachedAccessToken = data?.session?.access_token || null;
      return cachedAccessToken;
    })
    .finally(() => {
      sessionLoadPromise = null;
    });

  return sessionLoadPromise;
};

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token || null;
});

if (typeof window !== 'undefined') {
  void resolveCachedAccessToken();
}

export class BackendRequestError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "BackendRequestError";
    this.status = status;
    this.data = data;
  }
}

export async function backendRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await resolveCachedAccessToken();
  const startedAt = shouldLogPerf && typeof performance !== 'undefined' ? performance.now() : 0;

  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `Erro HTTP ${response.status}`;
    const detail = data?.detail ? ` - ${data.detail}` : "";
    throw new BackendRequestError(`${message}${detail}`, response.status, data);
  }

  if (shouldLogPerf && typeof performance !== 'undefined') {
    const elapsed = Math.round((performance.now() - startedAt) * 100) / 100;
    console.debug(`[backendRequest] ${init.method || "GET"} ${path} ${elapsed}ms`);
  }

  return data as T;
}
