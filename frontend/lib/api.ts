const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_BASE  = process.env.NEXT_PUBLIC_WS_URL  ?? "ws://localhost:8000";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function wsUrl(conversationId: string, token: string): string {
  return `${WS_BASE}/ws/${conversationId}?token=${token}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(apiUrl(path), { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err?.message ?? "Request failed"), { status: res.status, data: err });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
