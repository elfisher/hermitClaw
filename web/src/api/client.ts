import type { Crab, CrabWithToken, Pearl, Tide, Pagination } from './types.js';

const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY as string | undefined;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_KEY ? { 'x-admin-api-key': ADMIN_KEY } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Agents (Crabs) ----

export async function getAgents(): Promise<Crab[]> {
  const data = await apiFetch<{ crabs: Crab[] }>('/v1/crabs');
  return data.crabs;
}

export async function createAgent(name: string): Promise<CrabWithToken> {
  return apiFetch<CrabWithToken>('/v1/crabs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function revokeAgent(id: string): Promise<Crab> {
  return apiFetch<Crab>(`/v1/crabs/${id}/revoke`, { method: 'PATCH' });
}

// ---- Secrets (Pearls) ----

export async function getSecrets(crabId?: string): Promise<Pearl[]> {
  const qs = crabId ? `?crabId=${crabId}` : '';
  const data = await apiFetch<{ pearls: Pearl[] }>(`/v1/secrets${qs}`);
  return data.pearls;
}

export async function createSecret(params: {
  crabId: string;
  service: string;
  plaintext: string;
  label?: string;
}): Promise<Pearl> {
  return apiFetch<Pearl>('/v1/secrets', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteSecret(id: string): Promise<void> {
  return apiFetch<void>(`/v1/secrets/${id}`, { method: 'DELETE' });
}

// ---- Audit Log (Tides) ----

export async function getTides(params?: {
  crabId?: string;
  page?: number;
  limit?: number;
  statusCode?: number;
}): Promise<{ tides: Tide[]; pagination: Pagination }> {
  const qs = new URLSearchParams();
  if (params?.crabId) qs.set('crabId', params.crabId);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.statusCode) qs.set('statusCode', String(params.statusCode));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/v1/tides${query}`);
}
