import { useState } from 'react';
import { AgentsPage } from './pages/AgentsPage.js';
import { SecretsPage } from './pages/SecretsPage.js';
import { AuditLogPage } from './pages/AuditLogPage.js';

type Tab = 'agents' | 'secrets' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'audit', label: 'Audit Log' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('agents');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <span className="text-2xl">🐚</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">HermitClaw</h1>
            <p className="text-xs text-gray-400 mt-0.5">Tide Pool — Control Panel</p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex gap-1">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === 'agents' && <AgentsPage />}
        {tab === 'secrets' && <SecretsPage />}
        {tab === 'audit' && <AuditLogPage />}
      </main>
    </div>
  );
}
