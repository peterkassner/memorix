/**
 * File Lock Registry Tests (TDD)
 *
 * Advisory file locks with TTL auto-release.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileLockRegistry } from '../../src/team/file-locks.js';

let locks: FileLockRegistry;

beforeEach(() => {
  locks = new FileLockRegistry();
});

describe('FileLockRegistry', () => {
  describe('lock', () => {
    it('should lock a file for an agent', () => {
      const result = locks.lock('src/auth.ts', 'agent-1');
      expect(result.success).toBe(true);
      expect(result.lockedBy).toBe('agent-1');
    });

    it('should reject lock if file is already locked by another agent', () => {
      locks.lock('src/auth.ts', 'agent-1');
      const result = locks.lock('src/auth.ts', 'agent-2');
      expect(result.success).toBe(false);
      expect(result.lockedBy).toBe('agent-1');
    });

    it('should allow same agent to re-lock (idempotent)', () => {
      locks.lock('src/auth.ts', 'agent-1');
      const result = locks.lock('src/auth.ts', 'agent-1');
      expect(result.success).toBe(true);
    });

    it('should support custom TTL', () => {
      const result = locks.lock('src/auth.ts', 'agent-1', { ttlMs: 5000 });
      expect(result.success).toBe(true);
    });
  });

  describe('unlock', () => {
    it('should release a lock', () => {
      locks.lock('src/auth.ts', 'agent-1');
      const released = locks.unlock('src/auth.ts', 'agent-1');
      expect(released).toBe(true);

      // Now another agent can lock it
      const result = locks.lock('src/auth.ts', 'agent-2');
      expect(result.success).toBe(true);
    });

    it('should reject unlock from non-owner', () => {
      locks.lock('src/auth.ts', 'agent-1');
      const released = locks.unlock('src/auth.ts', 'agent-2');
      expect(released).toBe(false);
    });

    it('should return false for unlocked file', () => {
      expect(locks.unlock('nonexistent.ts', 'agent-1')).toBe(false);
    });
  });

  describe('status', () => {
    it('should return lock info for a file', () => {
      locks.lock('src/auth.ts', 'agent-1');
      const status = locks.getStatus('src/auth.ts');
      expect(status?.lockedBy).toBe('agent-1');
      expect(status?.lockedAt).toBeInstanceOf(Date);
    });

    it('should return null for unlocked file', () => {
      expect(locks.getStatus('nonexistent.ts')).toBeNull();
    });

    it('should list all locked files', () => {
      locks.lock('src/auth.ts', 'agent-1');
      locks.lock('src/db.ts', 'agent-2');
      locks.lock('src/api.ts', 'agent-1');

      const all = locks.listLocks();
      expect(all).toHaveLength(3);
    });

    it('should list locks filtered by agent', () => {
      locks.lock('src/auth.ts', 'agent-1');
      locks.lock('src/db.ts', 'agent-2');
      locks.lock('src/api.ts', 'agent-1');

      const agent1Locks = locks.listLocks('agent-1');
      expect(agent1Locks).toHaveLength(2);
      expect(agent1Locks.every(l => l.lockedBy === 'agent-1')).toBe(true);
    });
  });

  describe('TTL auto-release', () => {
    it('should auto-release expired locks', () => {
      // Lock with 1ms TTL
      locks.lock('src/auth.ts', 'agent-1', { ttlMs: 1 });

      // Wait for expiry
      return new Promise<void>(resolve => {
        setTimeout(() => {
          locks.cleanExpired();
          const status = locks.getStatus('src/auth.ts');
          expect(status).toBeNull();

          // Another agent can now lock it
          const result = locks.lock('src/auth.ts', 'agent-2');
          expect(result.success).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('should not release non-expired locks', () => {
      locks.lock('src/auth.ts', 'agent-1', { ttlMs: 60_000 });
      locks.cleanExpired();
      expect(locks.getStatus('src/auth.ts')).not.toBeNull();
    });
  });

  describe('releaseAll', () => {
    it('should release all locks held by an agent', () => {
      locks.lock('src/auth.ts', 'agent-1');
      locks.lock('src/db.ts', 'agent-1');
      locks.lock('src/api.ts', 'agent-2');

      const released = locks.releaseAll('agent-1');
      expect(released).toBe(2);
      expect(locks.getStatus('src/auth.ts')).toBeNull();
      expect(locks.getStatus('src/db.ts')).toBeNull();
      expect(locks.getStatus('src/api.ts')).not.toBeNull();
    });
  });
});
