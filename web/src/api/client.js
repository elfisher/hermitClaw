async function apiFetch(path, init) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        ...init,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Request failed: ${res.status}`);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ---- Agents (Crabs) ----
export async function getAgents() {
    const data = await apiFetch('/v1/crabs');
    return data.crabs;
}
export async function createAgent(name) {
    return apiFetch('/v1/crabs', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}
export async function revokeAgent(id) {
    return apiFetch(`/v1/crabs/${id}/revoke`, { method: 'PATCH' });
}
// ---- Secrets (Pearls) ----
export async function getSecrets(crabId) {
    const qs = crabId ? `?crabId=${crabId}` : '';
    const data = await apiFetch(`/v1/secrets${qs}`);
    return data.pearls;
}
export async function createSecret(params) {
    return apiFetch('/v1/secrets', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}
export async function deleteSecret(id) {
    return apiFetch(`/v1/secrets/${id}`, { method: 'DELETE' });
}
// ---- Audit Log (Tides) ----
export async function getTides(params) {
    const qs = new URLSearchParams();
    if (params?.crabId)
        qs.set('crabId', params.crabId);
    if (params?.page)
        qs.set('page', String(params.page));
    if (params?.limit)
        qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch(`/v1/tides${query}`);
}
