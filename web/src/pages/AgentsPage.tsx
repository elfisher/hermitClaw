import { useState, useEffect, useCallback } from 'react';
import { getAgents, createAgent, revokeAgent } from '../api/client.js';
import type { Crab, CrabWithToken } from '../api/types.js';

export function AgentsPage() {
  const [agents, setAgents] = useState<Crab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<CrabWithToken | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAgents(await getAgents());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createAgent(newName.trim());
      setNewToken(created);
      setNewName('');
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (agent: Crab) => {
    if (!confirm(`Revoke access for "${agent.name}"? This cannot be undone.`)) return;
    try {
      await revokeAgent(agent.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke agent');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Agents</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
        >
          + Register Agent
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Token reveal — shown once after creation */}
      {newToken && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-md">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            Agent "{newToken.name}" registered. Copy this token — it won't be shown again.
          </p>
          <code className="block text-xs bg-amber-100 text-amber-900 p-2 rounded break-all font-mono">
            {newToken.token}
          </code>
          <button
            onClick={() => setNewToken(null)}
            className="mt-2 text-xs text-amber-700 underline"
          >
            I've saved it, dismiss
          </button>
        </div>
      )}

      {/* Register form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Agent name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. dev-bot"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50"
          >
            {creating ? 'Registering…' : 'Register'}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setNewName(''); }}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-gray-400">No agents registered yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Registered</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {agents.map((agent) => (
              <tr key={agent.id} className="py-2">
                <td className="py-3 pr-4 font-mono text-gray-800">{agent.name}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    agent.active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${agent.active ? 'bg-green-500' : 'bg-red-500'}`} />
                    {agent.active ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  {agent.active && (
                    <button
                      onClick={() => handleRevoke(agent)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
