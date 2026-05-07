/**
 * CLI Command: memorix ingest cursor
 *
 * Ingest historical Cursor conversations from Cursor's global `state.vscdb`.
 * Primary goal: backfill past Cursor work into Memorix for cross-agent retrieval.
 */

import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import path from 'node:path';

import { defaultCursorStateDbBackupPath, defaultCursorStateDbPath, type CursorInstall } from '../../cursor/cursor-paths.js';
import { iterateCursorBubbles, makeReadableCopyOfSqliteDb, readCursorComposerMeta } from '../../cursor/cursor-state-reader.js';

function clampText(input: string, maxChars: number): string {
  const s = input.trim();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n\n[truncated to ${maxChars} chars]`;
}

function extractUsefulBubbleText(bubble: { text?: string; toolFormerData?: unknown }, maxChars: number): string | null {
  const direct = typeof bubble.text === 'string' ? bubble.text.trim() : '';
  if (direct) return clampText(direct, maxChars);

  // Tool bubbles often have empty `text` but have useful details in toolFormerData.
  // Keep this conservative to avoid ingesting huge blobs.
  const tfd: any = bubble.toolFormerData;
  if (!tfd || typeof tfd !== 'object') return null;

  const parts: string[] = [];
  if (typeof tfd.name === 'string') parts.push(`tool: ${tfd.name}`);
  if (typeof tfd.status === 'string') parts.push(`status: ${tfd.status}`);
  if (typeof tfd.rawArgs === 'string' && tfd.rawArgs.trim()) parts.push(`rawArgs: ${clampText(tfd.rawArgs, 1200)}`);

  // Some tool results are embedded as a JSON string; take a small slice only.
  if (typeof tfd.result === 'string' && tfd.result.trim()) parts.push(`result: ${clampText(tfd.result, 4000)}`);

  if (parts.length === 0) return null;
  return clampText(parts.join('\n'), maxChars);
}

function parseIsoDateOrNull(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export default defineCommand({
  meta: {
    name: 'cursor',
    description: 'Ingest historical Cursor conversations from state.vscdb',
  },
  args: {
    db: {
      type: 'string',
      description: 'Path to Cursor state.vscdb (defaults to macOS Cursor install)',
      required: false,
    },
    install: {
      type: 'string',
      description: 'Cursor install: cursor | cursor-nightly (default: cursor)',
      required: false,
    },
    max: {
      type: 'string',
      description: 'Max bubbles to ingest (default: 2000)',
      required: false,
    },
    since: {
      type: 'string',
      description: 'Only ingest bubbles created at/after this ISO datetime',
      required: false,
    },
    dryRun: {
      type: 'boolean',
      description: 'Scan and print summary without writing to Memorix',
      required: false,
    },
    maxChars: {
      type: 'string',
      description: 'Max chars stored per bubble (default: 8000)',
      required: false,
    },
    includeToolBubbles: {
      type: 'boolean',
      description: 'Include tool bubbles when text is empty (default: false)',
      required: false,
    },
  },
  run: async ({ args }) => {
    const os = await import('node:os');
    let cwd: string;
    try { cwd = process.cwd(); } catch { cwd = os.homedir(); }

    const install = (args.install || 'cursor') as CursorInstall;
    const max = Math.max(1, parseInt(args.max || '2000', 10));
    const maxChars = Math.max(500, parseInt(args.maxChars || '8000', 10));
    const includeToolBubbles = Boolean(args.includeToolBubbles);

    const since = parseIsoDateOrNull(args.since);
    if (args.since && !since) {
      console.error(`Invalid --since value (expected ISO datetime): ${args.since}`);
      return;
    }

    const candidateDb = args.db
      ? path.resolve(cwd, args.db)
      : defaultCursorStateDbPath(install);

    const backupDb = defaultCursorStateDbBackupPath(install);

    p.intro('Cursor → Memorix ingestion');

    // Choose DB path (prefer live DB, fall back to backup)
    const fs = await import('node:fs/promises');
    let chosenDb = candidateDb;
    try {
      await fs.access(chosenDb);
    } catch {
      chosenDb = backupDb;
    }

    console.log(`Reading Cursor DB: ${chosenDb}`);
    if (since) console.log(`Filter: createdAt >= ${since.toISOString()}`);
    console.log(`Limit: ${max} bubbles`);
    if (args.dryRun) console.log('Mode: dry-run (no writes)');

    // Copy DB to a temp file so we don't contend with Cursor's WAL/locks.
    const { readablePath, cleanup } = await makeReadableCopyOfSqliteDb(chosenDb);
    try {
      const composerMeta = readCursorComposerMeta(readablePath);

      // Prepare Memorix writer
      const { storeObservation, initObservations } = await import('../../memory/observations.js');
      const { getProjectDataDir } = await import('../../store/persistence.js');
      const { initObservationStore } = await import('../../store/obs-store.js');
      const { detectProject } = await import('../../project/detector.js');

      const dataDir = await getProjectDataDir('cursor-ingest');
      await initObservationStore(dataDir);
      await initObservations(dataDir);

      let scanned = 0;
      let stored = 0;
      let skippedEmpty = 0;
      let skippedSince = 0;

      for (const bubble of iterateCursorBubbles(readablePath)) {
        if (stored >= max) break;
        scanned++;

        const bubbleCreatedAt = parseIsoDateOrNull(bubble.createdAt);
        if (since && bubbleCreatedAt && bubbleCreatedAt < since) {
          skippedSince++;
          continue;
        }

        const text = extractUsefulBubbleText(bubble, maxChars);
        const allowToolBubble = includeToolBubbles || (bubble.type !== 2);
        if ((!text || text.length < 40) && !allowToolBubble) {
          skippedEmpty++;
          continue;
        }

        const meta = composerMeta.get(bubble.composerId);
        const repoPath = meta?.trackedRepoPaths?.[0];
        const project = repoPath ? detectProject(repoPath) : null;
        const projectId = project?.id || 'cursor/global';

        const titleParts = [];
        if (meta?.name) titleParts.push(meta.name);
        titleParts.push(`Cursor bubble ${bubble.bubbleId}`);
        if (bubble.createdAt) titleParts.push(`@ ${bubble.createdAt}`);

        const narrativeParts = [];
        if (meta?.subtitle) narrativeParts.push(`subtitle: ${meta.subtitle}`);
        if (repoPath) narrativeParts.push(`repoPath: ${repoPath}`);
        if (bubble.workspaceUris?.length) narrativeParts.push(`workspaceUris: ${bubble.workspaceUris.join(', ')}`);
        if (bubbleCreatedAt) narrativeParts.push(`bubbleCreatedAt: ${bubbleCreatedAt.toISOString()}`);
        if (text) narrativeParts.push(text);

        if (args.dryRun) {
          stored++;
          continue;
        }

        await storeObservation({
          entityName: meta?.name || 'cursor.app',
          type: 'discovery',
          title: titleParts.join(' — '),
          sourceDetail: 'explicit',
          narrative: clampText(narrativeParts.join('\n'), maxChars),
          facts: [
            `cursor.composerId=${bubble.composerId}`,
            `cursor.bubbleKey=${bubble.bubbleKey}`,
            `cursor.bubbleId=${bubble.bubbleId}`,
            bubble.type != null ? `cursor.bubbleType=${bubble.type}` : '',
          ].filter(Boolean),
          concepts: ['cursor', 'cursor-history', 'cursor-ingest'],
          filesModified: [],
          projectId,
          source: 'manual',
          createdByAgentId: 'cursor',
          topicKey: `cursor/bubble/${bubble.composerId}/${bubble.bubbleId}`,
        });
        stored++;
      }

      p.outro(
        args.dryRun
          ? `Dry-run complete. Would ingest up to ${stored}/${max} bubbles (scanned ${scanned}).`
          : `Ingested ${stored}/${max} bubbles (scanned ${scanned}, skippedEmpty ${skippedEmpty}, skippedSince ${skippedSince}).`,
      );
    } finally {
      await cleanup();
    }
  },
});
