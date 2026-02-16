import { useState, useEffect, useCallback } from 'react';
import { getTides } from '../api/client.js';
import type { Tide, Pagination } from '../api/types.js';

export function AuditLogPage() {
  const [tides, setTides] = useState<Tide[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTides({ page, limit: 50 });
      setTides(data.tides);
      setPagination(data.pagination);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const statusColor = (code: number | null) => {
    if (code === null) return 'text-gray-400';
    if (code < 300) return 'text-green-600';
    if (code < 400) return 'text-blue-600';
    if (code < 500) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Audit Log</h2>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : tides.length === 0 ? (
        <p className="text-sm text-gray-400">No activity recorded yet.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-3">Time</th>
                <th className="pb-2 pr-3">Agent</th>
                <th className="pb-2 pr-3">Direction</th>
                <th className="pb-2 pr-3">Target</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tides.map((tide) => (
                <tr key={tide.id} className={tide.error ? 'bg-red-50' : ''}>
                  <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(tide.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-700 text-xs">
                    {tide.crab?.name ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      tide.direction === 'EGRESS'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {tide.direction}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-500 max-w-xs truncate font-mono">
                    {tide.targetUrl ?? '—'}
                  </td>
                  <td className={`py-2 pr-3 text-xs font-mono font-semibold ${statusColor(tide.statusCode)}`}>
                    {tide.statusCode ?? '—'}
                  </td>
                  <td className="py-2 text-xs text-red-500 max-w-xs truncate">
                    {tide.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="mt-4 flex items-center gap-3 justify-end text-sm">
              <span className="text-gray-400 text-xs">
                {pagination.total} entries · page {pagination.page} of {pagination.pages}
              </span>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
