export interface Crab {
  id: string;
  name: string;
  active: boolean;
  uiPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrabWithToken extends Crab {
  token: string; // only returned at creation
}

export interface Pearl {
  id: string;
  crabId: string;
  service: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tide {
  id: string;
  crabId: string | null;
  direction: 'EGRESS' | 'INGRESS';
  tool: string | null;
  targetUrl: string | null;
  statusCode: number | null;
  requestBody: string | null;
  responseBody: string | null;
  error: string | null;
  createdAt: string;
  crab: { name: string } | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ── Phase 8B — Network Rules + Settings ────────────────────────────────────

export type RuleAction = 'ALLOW' | 'DENY';

export interface ConnectRule {
  id: string;
  domain: string;
  action: RuleAction;
  crabId: string | null;
  priority: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Phase 8A — Model Providers ──────────────────────────────────────────────

export type Protocol = 'OPENAI' | 'ANTHROPIC';
export type ProviderScope = 'GLOBAL' | 'RESTRICTED';

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: Protocol;
  pearlService: string | null;
  scope: ProviderScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  access: { crabId: string }[];
}
