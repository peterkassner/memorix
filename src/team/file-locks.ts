/**
 * File Lock Registry — Advisory file locks for multi-agent coordination
 *
 * Prevents conflicting edits when multiple agents work on the same project.
 * Locks are advisory (not enforced at OS level) with TTL auto-release.
 * Default TTL: 10 minutes. Agents see lock status via session_start injection.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface LockResult {
  success: boolean;
  lockedBy: string;
  file: string;
}

export interface LockInfo {
  file: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

export interface LockOptions {
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Internal Lock Entry ─────────────────────────────────────────────

interface LockEntry {
  file: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

// ─── Registry ────────────────────────────────────────────────────────

export class FileLockRegistry {
  private locks = new Map<string, LockEntry>();

  /**
   * Attempt to lock a file for an agent.
   * Returns success:true if lock acquired, or success:false with current owner.
   * Same agent re-locking is idempotent (refreshes TTL).
   */
  lock(file: string, agentId: string, options?: LockOptions): LockResult {
    const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;

    // Clean expired locks first
    this.cleanExpiredEntry(file);

    const existing = this.locks.get(file);

    if (existing) {
      if (existing.lockedBy === agentId) {
        // Same agent — refresh TTL
        existing.expiresAt = new Date(Date.now() + ttl);
        return { success: true, lockedBy: agentId, file };
      }
      // Different agent holds the lock
      return { success: false, lockedBy: existing.lockedBy, file };
    }

    // No lock — acquire
    const now = new Date();
    this.locks.set(file, {
      file,
      lockedBy: agentId,
      lockedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
    });

    return { success: true, lockedBy: agentId, file };
  }

  /**
   * Release a lock. Only the owner can release.
   * Returns true if released, false if not found or not owner.
   */
  unlock(file: string, agentId: string): boolean {
    const entry = this.locks.get(file);
    if (!entry) return false;
    if (entry.lockedBy !== agentId) return false;

    this.locks.delete(file);
    return true;
  }

  /**
   * Get lock status for a specific file. Returns null if unlocked.
   */
  getStatus(file: string): LockInfo | null {
    this.cleanExpiredEntry(file);
    const entry = this.locks.get(file);
    if (!entry) return null;
    return { ...entry };
  }

  /**
   * List all active locks, optionally filtered by agent.
   */
  listLocks(agentId?: string): LockInfo[] {
    this.cleanExpired();
    const all = [...this.locks.values()];
    const filtered = agentId ? all.filter(l => l.lockedBy === agentId) : all;
    return filtered.map(l => ({ ...l }));
  }

  /**
   * Release all locks held by a specific agent. Returns count released.
   */
  releaseAll(agentId: string): number {
    let count = 0;
    for (const [file, entry] of this.locks) {
      if (entry.lockedBy === agentId) {
        this.locks.delete(file);
        count++;
      }
    }
    return count;
  }

  /**
   * Remove all expired locks.
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [file, entry] of this.locks) {
      if (entry.expiresAt.getTime() <= now) {
        this.locks.delete(file);
      }
    }
  }

  /**
   * Check and remove a single expired lock entry.
   */
  private cleanExpiredEntry(file: string): void {
    const entry = this.locks.get(file);
    if (entry && entry.expiresAt.getTime() <= Date.now()) {
      this.locks.delete(file);
    }
  }

  /** Serialize state for file persistence */
  serialize(): { locks: Record<string, unknown> } {
    const locks: Record<string, unknown> = {};
    for (const [file, entry] of this.locks) {
      locks[file] = {
        ...entry,
        lockedAt: entry.lockedAt.toISOString(),
        expiresAt: entry.expiresAt.toISOString(),
      };
    }
    return { locks };
  }

  /** Hydrate state from file persistence */
  hydrate(data: { locks?: Record<string, any> }): void {
    this.locks.clear();
    if (!data?.locks) return;
    for (const [file, raw] of Object.entries(data.locks)) {
      this.locks.set(file, {
        ...(raw as any),
        lockedAt: new Date((raw as any).lockedAt),
        expiresAt: new Date((raw as any).expiresAt),
      });
    }
  }
}
