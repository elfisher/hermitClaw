import type { Crab, CrabWithToken, Pearl, Tide, Pagination, ModelProvider, ConnectRule } from './types.js';

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

// ---- Auth ----

export async function login(apiKey: string): Promise<void> {
  return apiFetch<void>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
    credentials: 'same-origin',
  });
}

export async function logout(): Promise<void> {
  return apiFetch<void>('/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

export async function checkSession(): Promise<boolean> {
  try {
    await apiFetch('/v1/auth/me', { credentials: 'same-origin' });
    return true;
  } catch {
    return false;
  }
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

// ---- Model Providers ----

export async function getProviders(): Promise<ModelProvider[]> {
  const data = await apiFetch<{ providers: ModelProvider[] }>('/v1/providers');
  return data.providers;
}

export async function createProvider(params: {
  name: string;
  baseUrl: string;
  protocol?: 'OPENAI' | 'ANTHROPIC';
  pearlService?: string;
  scope?: 'GLOBAL' | 'RESTRICTED';
}): Promise<ModelProvider> {
  return apiFetch<ModelProvider>('/v1/providers', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateProvider(
  id: string,
  params: Partial<{
    name: string;
    baseUrl: string;
    protocol: 'OPENAI' | 'ANTHROPIC';
    pearlService: string;
    scope: 'GLOBAL' | 'RESTRICTED';
    active: boolean;
  }>,
): Promise<ModelProvider> {
  return apiFetch<ModelProvider>(`/v1/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export async function deleteProvider(id: string): Promise<void> {
  return apiFetch<void>(`/v1/providers/${id}`, { method: 'DELETE' });
}

export async function grantProviderAccess(providerId: string, crabId: string): Promise<void> {
  return apiFetch<void>(`/v1/providers/${providerId}/access`, {
    method: 'POST',
    body: JSON.stringify({ crabId }),
  });
}

export async function revokeProviderAccess(providerId: string, crabId: string): Promise<void> {
  return apiFetch<void>(`/v1/providers/${providerId}/access/${crabId}`, { method: 'DELETE' });
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

// ---- Network Rules (Connect Rules) ----

export async function getConnectRules(): Promise<ConnectRule[]> {
  const data = await apiFetch<{ rules: ConnectRule[] }>('/v1/connect-rules');
  return data.rules;
}

export async function createConnectRule(params: {
  domain: string;
  action: 'ALLOW' | 'DENY';
  crabId?: string;
  priority?: number;
  note?: string;
}): Promise<ConnectRule> {
  return apiFetch<ConnectRule>('/v1/connect-rules', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteConnectRule(id: string): Promise<void> {
  return apiFetch<void>(`/v1/connect-rules/${id}`, { method: 'DELETE' });
}

// ---- System Settings ----

export async function getSettings(): Promise<Record<string, string>> {
  const data = await apiFetch<{ settings: Record<string, string> }>('/v1/settings');
  return data.settings;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  return apiFetch<void>(`/v1/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}
