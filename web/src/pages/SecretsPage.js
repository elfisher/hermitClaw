import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { getAgents, getSecrets, createSecret, deleteSecret } from '../api/client.js';
export function SecretsPage() {
    const [agents, setAgents] = useState([]);
    const [selectedCrabId, setSelectedCrabId] = useState('');
    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load agents');
        }
    }, [selectedCrabId]);
    const loadSecrets = useCallback(async () => {
        if (!selectedCrabId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            setSecrets(await getSecrets(selectedCrabId));
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load secrets');
        }
        finally {
            setLoading(false);
        }
    }, [selectedCrabId]);
    useEffect(() => { loadAgents(); }, [loadAgents]);
    useEffect(() => { loadSecrets(); }, [loadSecrets]);
    const handleSave = async (e) => {
        e.preventDefault();
        if (!selectedCrabId || !form.service.trim() || !form.plaintext.trim())
            return;
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
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save secret');
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (pearl) => {
        if (!confirm(`Delete "${pearl.service}" credential? This cannot be undone.`))
            return;
        try {
            await deleteSecret(pearl.id);
            await loadSecrets();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete secret');
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h2", { className: "text-xl font-semibold text-gray-800", children: "Secrets" }), _jsx("button", { onClick: () => setShowForm(true), disabled: !selectedCrabId, className: "px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors disabled:opacity-40", children: "+ Add Secret" })] }), error && (_jsx("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm", children: error })), _jsxs("div", { className: "mb-6", children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Agent" }), _jsxs("select", { value: selectedCrabId, onChange: (e) => setSelectedCrabId(e.target.value), className: "px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400", children: [agents.length === 0 && _jsx("option", { value: "", children: "No agents registered" }), agents.map((a) => (_jsxs("option", { value: a.id, children: [a.name, !a.active ? ' (revoked)' : ''] }, a.id)))] })] }), showForm && (_jsxs("form", { onSubmit: handleSave, className: "mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-3", children: [_jsx("p", { className: "text-sm font-medium text-gray-700", children: "New Secret" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1", children: "Service name *" }), _jsx("input", { autoFocus: true, value: form.service, onChange: (e) => setForm({ ...form, service: e.target.value }), placeholder: "e.g. github", className: "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1", children: "Label (optional)" }), _jsx("input", { value: form.label, onChange: (e) => setForm({ ...form, label: e.target.value }), placeholder: "e.g. Personal GitHub token", className: "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 mb-1", children: "Secret value *" }), _jsx("input", { type: "password", value: form.plaintext, onChange: (e) => setForm({ ...form, plaintext: e.target.value }), placeholder: "Paste your API key or token", className: "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 font-mono" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving || !form.service.trim() || !form.plaintext.trim(), className: "px-4 py-2 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50", children: saving ? 'Saving…' : 'Save Secret' }), _jsx("button", { type: "button", onClick: () => { setShowForm(false); setForm({ service: '', plaintext: '', label: '' }); }, className: "px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100", children: "Cancel" })] })] })), loading ? (_jsx("p", { className: "text-sm text-gray-400", children: "Loading\u2026" })) : !selectedCrabId ? (_jsx("p", { className: "text-sm text-gray-400", children: "Register an agent first." })) : secrets.length === 0 ? (_jsx("p", { className: "text-sm text-gray-400", children: "No secrets stored for this agent." })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: [_jsx("th", { className: "pb-2 pr-4", children: "Service" }), _jsx("th", { className: "pb-2 pr-4", children: "Label" }), _jsx("th", { className: "pb-2 pr-4", children: "Value" }), _jsx("th", { className: "pb-2 pr-4", children: "Updated" }), _jsx("th", { className: "pb-2" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: secrets.map((pearl) => (_jsxs("tr", { children: [_jsx("td", { className: "py-3 pr-4 font-mono text-gray-800", children: pearl.service }), _jsx("td", { className: "py-3 pr-4 text-gray-500", children: pearl.label ?? '—' }), _jsx("td", { className: "py-3 pr-4", children: _jsx("span", { className: "text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded font-mono", children: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }) }), _jsx("td", { className: "py-3 pr-4 text-gray-400 text-xs", children: new Date(pearl.updatedAt).toLocaleDateString() }), _jsx("td", { className: "py-3 text-right", children: _jsx("button", { onClick: () => handleDelete(pearl), className: "text-xs text-red-600 hover:text-red-800 font-medium", children: "Delete" }) })] }, pearl.id))) })] }))] }));
}
