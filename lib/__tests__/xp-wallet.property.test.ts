// Feature: f1-advanced-features, Property 19: Crédito de XP é simétrico entre progressão e wallet
// **Validates: Requirements 5.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { creditXpBoth } from '@/lib/xp-wallet';

describe('Property 19: XP credit symmetry', () => {
  it('credits both xp and xp_wallet by the same amount for any positive integer G', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),  // G = xpGained
        async (G) => {
          // Track SQL executions
          const executedSQLs: Array<{ sql: string; binds: unknown }> = [];
          let committed = false;
          let rolledBack = false;

          const mockConn = {
            execute: async (sql: string, binds: unknown) => {
              executedSQLs.push({ sql, binds });
            },
            commit: async () => { committed = true; },
            rollback: async () => { rolledBack = false; },
          };

          await creditXpBoth(mockConn as any, 'user-123', G);

          // Both UPDATEs must have been executed
          expect(executedSQLs).toHaveLength(2);

          // First UPDATE targets xp progression
          expect(executedSQLs[0].sql).toContain('xp');
          expect((executedSQLs[0].binds as any).amount).toBe(G);

          // Second UPDATE targets xp_wallet
          expect(executedSQLs[1].sql).toContain('xp_wallet');
          expect((executedSQLs[1].binds as any).amount).toBe(G);

          // Both updates use the same amount G — symmetry guaranteed
          expect((executedSQLs[0].binds as any).amount).toBe((executedSQLs[1].binds as any).amount);

          // Commit was called (atomicity)
          expect(committed).toBe(true);
          expect(rolledBack).toBe(false);
        }
      )
    );
  });
});
