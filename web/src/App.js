import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { AgentsPage } from './pages/AgentsPage.js';
import { SecretsPage } from './pages/SecretsPage.js';
import { AuditLogPage } from './pages/AuditLogPage.js';
const TABS = [
    { id: 'agents', label: 'Agents' },
    { id: 'secrets', label: 'Secrets' },
    { id: 'audit', label: 'Audit Log' },
];
export default function App() {
    const [tab, setTab] = useState('agents');
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsxs("header", { className: "bg-white border-b border-gray-200", children: [_jsxs("div", { className: "max-w-5xl mx-auto px-6 py-4 flex items-center gap-4", children: [_jsx("span", { className: "text-2xl", children: "\uD83D\uDC1A" }), _jsxs("div", { children: [_jsx("h1", { className: "text-lg font-bold text-gray-900 leading-none", children: "HermitClaw" }), _jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: "Tide Pool \u2014 Control Panel" })] })] }), _jsx("div", { className: "max-w-5xl mx-auto px-6", children: _jsx("nav", { className: "flex gap-1", children: TABS.map(({ id, label }) => (_jsx("button", { onClick: () => setTab(id), className: `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id
                                    ? 'border-gray-900 text-gray-900'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: label }, id))) }) })] }), _jsxs("main", { className: "max-w-5xl mx-auto px-6 py-8", children: [tab === 'agents' && _jsx(AgentsPage, {}), tab === 'secrets' && _jsx(SecretsPage, {}), tab === 'audit' && _jsx(AuditLogPage, {})] })] }));
}
