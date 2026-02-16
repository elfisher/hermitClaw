import { useState, useEffect, useCallback } from 'react';
import { getAgents, getSecrets, createSecret, deleteSecret } from '../api/client.js';
import type { Crab, Pearl } from '../api/types.js';

export function SecretsPage() {
  const [agents, setAgents] = useState<Crab[]>([]);
  const [selectedCrabId, setSelectedCrabId] = useState<string>('');
  const [secrets, setSecrets] = useState<Pearl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ service: '', plaintext: '', label: '' });
  const [saving, setSaving] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      const data = await getAgents();
      setAgents(data);
      if (data.length > 0 && !selectedCrabId) {
        setSelectedCrabId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    }
  }, [selectedCrabId]);

  const loadSecrets = useCallback(async () => {
    if (!selectedCrabId) { setLoading(false); return; }
    setLoading(true);
    try {
      setSecrets(await getSecrets(selectedCrabId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  }, [selectedCrabId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCrabId || !form.service.trim() || !form.plaintext.trim()) return;
    setSaving(true);
    try {
      await createSecret({
        crabId: selectedCrabId,
        service: form.service.trim(),
        plaintext: form.plaintext.trim(),
        label: form.label.trim() || undefined,
      });
      setForm({ service: '', plaintext: '', label: '' });
      setShowForm(false);
      await loadSecrets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pearl: Pearl) => {
    if (!confirm(`Delete "${pearl.service}" credential? This cannot be undone.`)) return;
    try {
      await deleteSecret(pearl.id);
      await loadSecrets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete secret');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Secrets</h2>
        <button
          onClick={() => setShowForm(true)}
          disabled={!selectedCrabId}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          + Add Secret
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Agent selector */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-500 mb-1">Agent</label>
        <select
          value={selectedCrabId}
          onChange={(e) => setSelectedCrabId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          {agents.length === 0 && <option value="">No agents registered</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}{!a.active ? ' (revoked)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Add secret form */}
      {showForm && (
        <form onSubmit={handleSave} className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-3">
          <p className="text-sm font-medium text-gray-700">New Secret</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service name *</label>
              <input
                autoFocus
                value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
                placeholder="e.g. github"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Personal GitHub token"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Secret value *</label>
            <input
              type="password"
              value={form.plaintext}
              onChange={(e) => setForm({ ...form, plaintext: e.target.value })}
              placeholder="Paste your API key or token"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !form.service.trim() || !form.plaintext.trim()}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Secret'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm({ service: '', plaintext: '', label: '' }); }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !selectedCrabId ? (
        <p className="text-sm text-gray-400">Register an agent first.</p>
      ) : secrets.length === 0 ? (
        <p className="text-sm text-gray-400">No secrets stored for this agent.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-2 pr-4">Service</th>
              <th className="pb-2 pr-4">Label</th>
              <th className="pb-2 pr-4">Value</th>
              <th className="pb-2 pr-4">Updated</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {secrets.map((pearl) => (
              <tr key={pearl.id}>
                <td className="py-3 pr-4 font-mono text-gray-800">{pearl.service}</td>
                <td className="py-3 pr-4 text-gray-500">{pearl.label ?? '—'}</td>
                <td className="py-3 pr-4">
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded font-mono">
                    ••••••••
                  </span>
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">
                  {new Date(pearl.updatedAt).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => handleDelete(pearl)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
