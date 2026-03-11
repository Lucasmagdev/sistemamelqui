export const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

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
    throw new BackendRequestError(`${message}${detail}`, response.status, data);
  }

  return data as T;
}
