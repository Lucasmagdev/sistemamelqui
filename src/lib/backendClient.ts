export const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export async function backendRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `Erro HTTP ${response.status}`;
    const detail = data?.detail ? ` - ${data.detail}` : "";
    throw new Error(`${message}${detail}`);
  }

  return data as T;
}
