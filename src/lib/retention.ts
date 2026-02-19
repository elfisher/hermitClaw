/**
 * Audit log retention — prunes Tide records older than the configured retention window.
 *
 * Setting key: audit_log_retention_days
 *   "0"  → keep forever (no pruning)
 *   "7"  → delete entries older than 7 days
 *   etc.
 *
 * Called on a 24-hour interval from index.ts (NOT on startup).
 */

import { db } from './db.js';

export async function pruneOldTides(): Promise<void> {
  const setting = await db.systemSetting.findUnique({
    where: { key: 'audit_log_retention_days' },
  });

  const days = parseInt(setting?.value ?? '0', 10);
  if (!days || days <= 0) return; // 0 = keep forever

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await db.tide.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (count > 0) {
    console.log(`[retention] Pruned ${count} tide record(s) older than ${days} day(s).`);
  }
}
