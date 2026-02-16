import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { getAgents, createAgent, revokeAgent } from '../api/client.js';
export function AgentsPage() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [newToken, setNewToken] = useState(null);
    const load = useCallback(async () => {
        try {
            setLoading(true);
            setAgents(await getAgents());
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load agents');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim())
            return;
        setCreating(true);
        try {
            const created = await createAgent(newName.trim());
            setNewToken(created);
            setNewName('');
            setShowForm(false);
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create agent');
        }
        finally {
            setCreating(false);
        }
    };
    const handleRevoke = async (agent) => {
        if (!confirm(`Revoke access for "${agent.name}"? This cannot be undone.`))
            return;
        try {
            await revokeAgent(agent.id);
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to revoke agent');
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h2", { className: "text-xl font-semibold text-gray-800", children: "Agents" }), _jsx("button", { onClick: () => setShowForm(true), className: "px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors", children: "+ Register Agent" })] }), error && (_jsx("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm", children: error })), newToken && (_jsxs("div", { className: "mb-6 p-4 bg-amber-50 border border-amber-300 rounded-md", children: [_jsxs("p", { className: "text-sm font-semibold text-amber-800 mb-1", children: ["Agent \"", newToken.name, "\" registered. Copy this token \u2014 it won't be shown again."] }), _jsx("code", { className: "block text-xs bg-amber-100 text-amber-900 p-2 rounded break-all font-mono", children: newToken.token }), _jsx("button", { onClick: () => setNewToken(null), className: "mt-2 text-xs text-amber-700 underline", children: "I've saved it, dismiss" })] })), showForm && (_jsxs("form", { onSubmit: handleCreate, className: "mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 flex gap-3 items-end", children: [_jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1", children: "Agent name" }), _jsx("input", { autoFocus: true, value: newName, onChange: (e) => setNewName(e.target.value), placeholder: "e.g. dev-bot", className: "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400" })] }), _jsx("button", { type: "submit", disabled: creating || !newName.trim(), className: "px-4 py-2 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50", children: creating ? 'Registering…' : 'Register' }), _jsx("button", { type: "button", onClick: () => { setShowForm(false); setNewName(''); }, className: "px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100", children: "Cancel" })] })), loading ? (_jsx("p", { className: "text-sm text-gray-400", children: "Loading\u2026" })) : agents.length === 0 ? (_jsx("p", { className: "text-sm text-gray-400", children: "No agents registered yet." })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: [_jsx("th", { className: "pb-2 pr-4", children: "Name" }), _jsx("th", { className: "pb-2 pr-4", children: "Status" }), _jsx("th", { className: "pb-2 pr-4", children: "Registered" }), _jsx("th", { className: "pb-2" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: agents.map((agent) => (_jsxs("tr", { className: "py-2", children: [_jsx("td", { className: "py-3 pr-4 font-mono text-gray-800", children: agent.name }), _jsx("td", { className: "py-3 pr-4", children: _jsxs("span", { className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${agent.active
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-red-100 text-red-700'}`, children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${agent.active ? 'bg-green-500' : 'bg-red-500'}` }), agent.active ? 'Active' : 'Revoked'] }) }), _jsx("td", { className: "py-3 pr-4 text-gray-400 text-xs", children: new Date(agent.createdAt).toLocaleDateString() }), _jsx("td", { className: "py-3 text-right", children: agent.active && (_jsx("button", { onClick: () => handleRevoke(agent), className: "text-xs text-red-600 hover:text-red-800 font-medium", children: "Revoke" })) })] }, agent.id))) })] }))] }));
}
