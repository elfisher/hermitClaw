import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { getTides } from '../api/client.js';
export function AuditLogPage() {
    const [tides, setTides] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getTides({ page, limit: 50 });
            setTides(data.tides);
            setPagination(data.pagination);
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load audit log');
        }
        finally {
            setLoading(false);
        }
    }, [page]);
    useEffect(() => { load(); }, [load]);
    const statusColor = (code) => {
        if (code === null)
            return 'text-gray-400';
        if (code < 300)
            return 'text-green-600';
        if (code < 400)
            return 'text-blue-600';
        if (code < 500)
            return 'text-amber-600';
        return 'text-red-600';
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h2", { className: "text-xl font-semibold text-gray-800", children: "Audit Log" }), _jsx("button", { onClick: load, className: "text-sm text-gray-500 hover:text-gray-700 underline", children: "Refresh" })] }), error && (_jsx("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm", children: error })), loading ? (_jsx("p", { className: "text-sm text-gray-400", children: "Loading\u2026" })) : tides.length === 0 ? (_jsx("p", { className: "text-sm text-gray-400", children: "No activity recorded yet." })) : (_jsxs(_Fragment, { children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: [_jsx("th", { className: "pb-2 pr-3", children: "Time" }), _jsx("th", { className: "pb-2 pr-3", children: "Agent" }), _jsx("th", { className: "pb-2 pr-3", children: "Direction" }), _jsx("th", { className: "pb-2 pr-3", children: "Target" }), _jsx("th", { className: "pb-2 pr-3", children: "Status" }), _jsx("th", { className: "pb-2", children: "Error" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: tides.map((tide) => (_jsxs("tr", { className: tide.error ? 'bg-red-50' : '', children: [_jsx("td", { className: "py-2 pr-3 text-xs text-gray-400 whitespace-nowrap", children: new Date(tide.createdAt).toLocaleTimeString() }), _jsx("td", { className: "py-2 pr-3 font-mono text-gray-700 text-xs", children: tide.crab?.name ?? _jsx("span", { className: "text-gray-400", children: "\u2014" }) }), _jsx("td", { className: "py-2 pr-3", children: _jsx("span", { className: `text-xs font-medium px-1.5 py-0.5 rounded ${tide.direction === 'EGRESS'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-purple-100 text-purple-700'}`, children: tide.direction }) }), _jsx("td", { className: "py-2 pr-3 text-xs text-gray-500 max-w-xs truncate font-mono", children: tide.targetUrl ?? '—' }), _jsx("td", { className: `py-2 pr-3 text-xs font-mono font-semibold ${statusColor(tide.statusCode)}`, children: tide.statusCode ?? '—' }), _jsx("td", { className: "py-2 text-xs text-red-500 max-w-xs truncate", children: tide.error ?? '' })] }, tide.id))) })] }), pagination && pagination.pages > 1 && (_jsxs("div", { className: "mt-4 flex items-center gap-3 justify-end text-sm", children: [_jsxs("span", { className: "text-gray-400 text-xs", children: [pagination.total, " entries \u00B7 page ", pagination.page, " of ", pagination.pages] }), _jsx("button", { disabled: page === 1, onClick: () => setPage((p) => p - 1), className: "px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50", children: "\u2190 Prev" }), _jsx("button", { disabled: page >= pagination.pages, onClick: () => setPage((p) => p + 1), className: "px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50", children: "Next \u2192" })] }))] }))] }));
}
