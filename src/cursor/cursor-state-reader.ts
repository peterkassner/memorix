import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

export type CursorComposerMeta = {
  composerId: string;
  name?: string;
  subtitle?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  trackedRepoPaths: string[];
};

export type CursorBubbleRecord = {
  composerId: string;
  bubbleKey: string;
  bubbleId: string;
  createdAt?: string;
  type?: number;
  text?: string;
  workspaceUris?: string[];
  toolFormerData?: unknown;
};

function safeJsonParse(value: unknown): any | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function parseComposerIdFromKey(key: string): string | null {
  if (!key.startsWith('composerData:')) return null;
  return key.slice('composerData:'.length) || null;
}

function parseBubblePartsFromKey(key: string): { composerId: string; bubbleId: string } | null {
  // Expected: bubbleId:<composerId>:<bubbleId>
  if (!key.startsWith('bubbleId:')) return null;
  const rest = key.slice('bubbleId:'.length);
  const parts = rest.split(':');
  if (parts.length < 2) return null;
  const composerId = parts[0] || '';
  const bubbleId = parts.slice(1).join(':') || '';
  if (!composerId || !bubbleId) return null;
  return { composerId, bubbleId };
}

export async function makeReadableCopyOfSqliteDb(dbPath: string): Promise<{ readablePath: string; cleanup: () => Promise<void> }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-cursor-'));
  const readablePath = path.join(tmpDir, 'state.vscdb');
  await fs.copyFile(dbPath, readablePath);
  return {
    readablePath,
    cleanup: async () => {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

export function readCursorComposerMeta(dbFilePath: string): Map<string, CursorComposerMeta> {
  const db = new Database(dbFilePath, { readonly: true, fileMustExist: true });
  try {
    const map = new Map<string, CursorComposerMeta>();
    const stmt = db.prepare(
      `select key as key, cast(value as text) as value
       from cursorDiskKV
       where key like 'composerData:%'`,
    );
    for (const row of stmt.iterate() as Iterable<{ key: string; value: string }>) {
      const composerId = parseComposerIdFromKey(row.key);
      if (!composerId) continue;
      const json = safeJsonParse(row.value);
      if (!json) continue;
      const trackedRepoPaths: string[] = [];
      const tracked = (json.trackedGitRepos ?? json.trackedRepos ?? []) as any[];
      if (Array.isArray(tracked)) {
        for (const r of tracked) {
          const repoPath = typeof r?.repoPath === 'string' ? r.repoPath : undefined;
          if (repoPath) trackedRepoPaths.push(repoPath);
        }
      }
      map.set(composerId, {
        composerId,
        name: typeof json.name === 'string' ? json.name : undefined,
        subtitle: typeof json.subtitle === 'string' ? json.subtitle : undefined,
        createdAt: typeof json.createdAt === 'number' ? json.createdAt : undefined,
        lastUpdatedAt: typeof json.lastUpdatedAt === 'number' ? json.lastUpdatedAt : undefined,
        trackedRepoPaths,
      });
    }
    return map;
  } finally {
    db.close();
  }
}

export function *iterateCursorBubbles(dbFilePath: string): Generator<CursorBubbleRecord> {
  const db = new Database(dbFilePath, { readonly: true, fileMustExist: true });
  try {
    const stmt = db.prepare(
      `select key as key, cast(value as text) as value
       from cursorDiskKV
       where key like 'bubbleId:%'`,
    );
    for (const row of stmt.iterate() as Iterable<{ key: string; value: string }>) {
      const parts = parseBubblePartsFromKey(row.key);
      if (!parts) continue;
      const json = safeJsonParse(row.value);
      if (!json) continue;
      yield {
        composerId: parts.composerId,
        bubbleKey: row.key,
        bubbleId: typeof json.bubbleId === 'string' ? json.bubbleId : parts.bubbleId,
        createdAt: typeof json.createdAt === 'string' ? json.createdAt : undefined,
        type: typeof json.type === 'number' ? json.type : undefined,
        text: typeof json.text === 'string' ? json.text : undefined,
        workspaceUris: Array.isArray(json.workspaceUris) ? json.workspaceUris.filter((u: unknown) => typeof u === 'string') : undefined,
        toolFormerData: json.toolFormerData,
      };
    }
  } finally {
    db.close();
  }
}
