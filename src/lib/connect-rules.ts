/**
 * Phase 8B — HTTP CONNECT Proxy: Rule Evaluation
 *
 * Evaluates whether an outbound CONNECT tunnel to a given host should be
 * allowed or denied, based on priority-ordered ConnectRule records.
 *
 * Rule matching semantics:
 *   - Rules are sorted by `priority` ASC (lower number = evaluated first)
 *   - First matching rule wins (allow or deny)
 *   - Per-crab rules and global rules are evaluated together in priority order
 *   - If no rule matches, falls back to the `connect_proxy_default` SystemSetting
 *   - If that setting is also absent, the default is ALLOW (permissive for dev)
 *
 * Domain pattern syntax:
 *   - '*'             matches any host
 *   - '*.example.com' matches 'api.example.com', 'bot.example.com'
 *                     but NOT 'example.com' itself
 *   - 'example.com'   exact match only
 */

import { db } from './db.js';

export async function evaluateConnectRules(
  host: string,
  crabId: string | null,
): Promise<boolean> {
  // Load all rules that apply: global rules always, plus per-crab if we have an identity
  const rules = await db.connectRule.findMany({
    where: crabId
      ? { OR: [{ crabId: null }, { crabId }] }
      : { crabId: null },
    orderBy: { priority: 'asc' },
  });

  for (const rule of rules) {
    if (domainMatches(rule.domain, host)) {
      return rule.action === 'ALLOW';
    }
  }

  // No rule matched — check system default
  const setting = await db.systemSetting.findUnique({
    where: { key: 'connect_proxy_default' },
  });
  return (setting?.value ?? 'ALLOW') === 'ALLOW';
}

/**
 * Matches a host against a domain pattern.
 *
 * Examples:
 *   domainMatches('*', 'anything.com')          → true
 *   domainMatches('*.telegram.org', 'api.telegram.org') → true
 *   domainMatches('*.telegram.org', 'telegram.org')     → false
 *   domainMatches('api.github.com', 'api.github.com')   → true
 *   domainMatches('api.github.com', 'gist.github.com')  → false
 */
export function domainMatches(pattern: string, host: string): boolean {
  if (pattern === '*') return true;

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.telegram.org'
    return host.endsWith(suffix);    // matches 'api.telegram.org' but not 'telegram.org'
  }

  return host === pattern;
}
