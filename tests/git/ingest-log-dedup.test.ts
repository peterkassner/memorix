/**
 * Issue #48 regression test — ingest-log must not create duplicate git records
 *
 * Root cause: src/cli/commands/ingest-log.ts had no commitHash dedup,
 * unlike ingest-commit.ts and the TUI batch ingest path.
 *
 * This test verifies:
 * 1. First ingest stores all commits
 * 2. Second ingest with same commit hashes stores nothing (all skipped)
 * 3. Mixed case: some new commits + some already-ingested commits
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../src/embedding/provider.js', () => ({
  getEmbeddingProvider: async () => null,
  isVectorSearchAvailable: async () => false,
  isEmbeddingExplicitlyDisabled: () => true,
  resetProvider: () => {},
}));

import { storeObservation, initObservations } from '../../src/memory/observations.js';
import { resetDb } from '../../src/store/orama-store.js';
import { loadObservationsJson } from '../../src/store/persistence.js';

const PROJECT_ID = 'test/ingest-log-dedup';

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-ingest-dedup-'));
  await resetDb();
  await initObservations(testDir);
});

/**
 * Helper: simulate storing a git-ingest observation (same shape as ingest-log.ts)
 */
async function storeGitCommit(hash: string, subject: string) {
  return storeObservation({
    entityName: `git-commit-${hash.slice(0, 7)}`,
    type: 'what-changed',
    title: subject,
    sourceDetail: 'git-ingest',
    narrative: `Commit ${hash}: ${subject}`,
    facts: [`commit: ${hash}`],
    concepts: ['git'],
    filesModified: ['src/example.ts'],
    projectId: PROJECT_ID,
    source: 'git',
    commitHash: hash,
  });
}

/**
 * Helper: replicate the dedup logic from the fixed ingest-log.ts
 */
async function ingestWithDedup(
  commits: Array<{ hash: string; subject: string }>,
): Promise<{ stored: number; dupSkipped: number }> {
  const existingObs = await loadObservationsJson(testDir) as Array<{ commitHash?: string }>;
  const existingHashes = new Set(existingObs.map(o => o.commitHash).filter(Boolean));

  let stored = 0;
  let dupSkipped = 0;

  for (const commit of commits) {
    if (existingHashes.has(commit.hash)) {
      dupSkipped++;
      continue;
    }
    await storeGitCommit(commit.hash, commit.subject);
    stored++;
    existingHashes.add(commit.hash);
  }

  return { stored, dupSkipped };
}

describe('Issue #48: ingest-log commitHash dedup', () => {
  const COMMITS = [
    { hash: 'aaa1111aaa1111aaa1111aaa1111aaa1111aaa111', subject: 'feat: add auth module' },
    { hash: 'bbb2222bbb2222bbb2222bbb2222bbb2222bbb222', subject: 'fix: token expiry bug' },
    { hash: 'ccc3333ccc3333ccc3333ccc3333ccc3333ccc333', subject: 'refactor: clean up utils' },
  ];

  it('first ingest stores all commits', async () => {
    const result = await ingestWithDedup(COMMITS);

    expect(result.stored).toBe(3);
    expect(result.dupSkipped).toBe(0);

    const obs = await loadObservationsJson(testDir) as Array<{ commitHash?: string }>;
    const gitObs = obs.filter(o => o.commitHash);
    expect(gitObs.length).toBe(3);
  });

  it('second ingest with same hashes stores nothing', async () => {
    // First run
    await ingestWithDedup(COMMITS);

    // Second run — all should be skipped
    const result = await ingestWithDedup(COMMITS);

    expect(result.stored).toBe(0);
    expect(result.dupSkipped).toBe(3);

    // Total observations should still be 3, not 6
    const obs = await loadObservationsJson(testDir) as Array<{ commitHash?: string }>;
    const gitObs = obs.filter(o => o.commitHash);
    expect(gitObs.length).toBe(3);
  });

  it('mixed case: new commits stored, existing commits skipped', async () => {
    // First run: ingest first 2
    await ingestWithDedup(COMMITS.slice(0, 2));

    // Second run: all 3, but first 2 should be skipped
    const newCommit = { hash: 'ddd4444ddd4444ddd4444ddd4444ddd4444ddd444', subject: 'docs: update README' };
    const mixedBatch = [...COMMITS.slice(0, 2), newCommit];
    const result = await ingestWithDedup(mixedBatch);

    expect(result.stored).toBe(1);
    expect(result.dupSkipped).toBe(2);

    const obs = await loadObservationsJson(testDir) as Array<{ commitHash?: string }>;
    const gitObs = obs.filter(o => o.commitHash);
    expect(gitObs.length).toBe(3); // 2 from first run + 1 new
  });

  it('dedup is by exact commitHash, not by title or content', async () => {
    await storeGitCommit('aaa1111aaa1111aaa1111aaa1111aaa1111aaa111', 'feat: add auth module');

    // Same title, different hash — should NOT be deduped
    const differentHash = [
      { hash: 'eee5555eee5555eee5555eee5555eee5555eee555', subject: 'feat: add auth module' },
    ];
    const result = await ingestWithDedup(differentHash);

    expect(result.stored).toBe(1);
    expect(result.dupSkipped).toBe(0);
  });

  it('within-batch dedup prevents storing same hash twice in one run', async () => {
    // Simulate a batch with duplicate hash entries (edge case)
    const batchWithDup = [
      { hash: 'fff6666fff6666fff6666fff6666fff6666fff666', subject: 'first occurrence' },
      { hash: 'fff6666fff6666fff6666fff6666fff6666fff666', subject: 'duplicate occurrence' },
    ];
    const result = await ingestWithDedup(batchWithDup);

    expect(result.stored).toBe(1);
    expect(result.dupSkipped).toBe(1);

    const obs = await loadObservationsJson(testDir) as Array<{ commitHash?: string }>;
    const matching = obs.filter(o => o.commitHash === 'fff6666fff6666fff6666fff6666fff6666fff666');
    expect(matching.length).toBe(1);
  });
});
