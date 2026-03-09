/**
 * Task DAG Tests (TDD)
 *
 * Simple task management with dependencies and status tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../../src/team/tasks.js';

let tasks: TaskManager;

beforeEach(() => {
  tasks = new TaskManager();
});

describe('TaskManager', () => {
  describe('create', () => {
    it('should create a task with description', () => {
      const task = tasks.create({ description: 'Build auth module' });
      expect(task.id).toBeTruthy();
      expect(task.description).toBe('Build auth module');
      expect(task.status).toBe('pending');
      expect(task.assignee).toBeUndefined();
      expect(task.deps).toEqual([]);
    });

    it('should create a task with dependencies', () => {
      const t1 = tasks.create({ description: 'Design API' });
      const t2 = tasks.create({
        description: 'Implement API',
        deps: [t1.id],
      });
      expect(t2.deps).toEqual([t1.id]);
    });

    it('should reject unknown dependency IDs', () => {
      expect(() => {
        tasks.create({ description: 'Bad task', deps: ['nonexistent'] });
      }).toThrow();
    });
  });

  describe('claim', () => {
    it('should assign a pending task to an agent', () => {
      const task = tasks.create({ description: 'Build auth' });
      const claimed = tasks.claim(task.id, 'agent-1');
      expect(claimed.assignee).toBe('agent-1');
      expect(claimed.status).toBe('in_progress');
    });

    it('should reject claim if task is already claimed by another', () => {
      const task = tasks.create({ description: 'Build auth' });
      tasks.claim(task.id, 'agent-1');
      expect(() => tasks.claim(task.id, 'agent-2')).toThrow();
    });

    it('should allow same agent to re-claim (idempotent)', () => {
      const task = tasks.create({ description: 'Build auth' });
      tasks.claim(task.id, 'agent-1');
      const reclaimed = tasks.claim(task.id, 'agent-1');
      expect(reclaimed.assignee).toBe('agent-1');
    });

    it('should reject claim if deps are not completed', () => {
      const t1 = tasks.create({ description: 'Design API' });
      const t2 = tasks.create({ description: 'Implement API', deps: [t1.id] });
      expect(() => tasks.claim(t2.id, 'agent-1')).toThrow(/dependencies/i);
    });

    it('should allow claim when all deps are completed', () => {
      const t1 = tasks.create({ description: 'Design API' });
      tasks.claim(t1.id, 'agent-1');
      tasks.complete(t1.id, 'agent-1', 'API designed');

      const t2 = tasks.create({ description: 'Implement API', deps: [t1.id] });
      const claimed = tasks.claim(t2.id, 'agent-2');
      expect(claimed.status).toBe('in_progress');
    });
  });

  describe('complete', () => {
    it('should mark a task as completed with result', () => {
      const task = tasks.create({ description: 'Build auth' });
      tasks.claim(task.id, 'agent-1');
      const completed = tasks.complete(task.id, 'agent-1', 'Auth module built at src/auth/');
      expect(completed.status).toBe('completed');
      expect(completed.result).toBe('Auth module built at src/auth/');
    });

    it('should reject completion by non-assignee', () => {
      const task = tasks.create({ description: 'Build auth' });
      tasks.claim(task.id, 'agent-1');
      expect(() => tasks.complete(task.id, 'agent-2', 'done')).toThrow();
    });

    it('should reject completion of unclaimed task', () => {
      const task = tasks.create({ description: 'Build auth' });
      expect(() => tasks.complete(task.id, 'agent-1', 'done')).toThrow();
    });
  });

  describe('list', () => {
    it('should list all tasks', () => {
      tasks.create({ description: 'Task 1' });
      tasks.create({ description: 'Task 2' });
      tasks.create({ description: 'Task 3' });
      expect(tasks.list()).toHaveLength(3);
    });

    it('should filter by status', () => {
      const t1 = tasks.create({ description: 'Task 1' });
      tasks.create({ description: 'Task 2' });
      tasks.claim(t1.id, 'agent-1');

      expect(tasks.list({ status: 'pending' })).toHaveLength(1);
      expect(tasks.list({ status: 'in_progress' })).toHaveLength(1);
    });

    it('should filter by assignee', () => {
      const t1 = tasks.create({ description: 'Task 1' });
      const t2 = tasks.create({ description: 'Task 2' });
      tasks.claim(t1.id, 'agent-1');
      tasks.claim(t2.id, 'agent-2');

      expect(tasks.list({ assignee: 'agent-1' })).toHaveLength(1);
    });
  });

  describe('releaseByAgent', () => {
    it('should return in_progress tasks to pending when agent leaves', () => {
      const t1 = tasks.create({ description: 'Task 1' });
      const t2 = tasks.create({ description: 'Task 2' });
      tasks.claim(t1.id, 'agent-1');
      tasks.claim(t2.id, 'agent-1');

      const released = tasks.releaseByAgent('agent-1');
      expect(released).toBe(2);

      const list = tasks.list();
      expect(list.every(t => t.status === 'pending')).toBe(true);
      expect(list.every(t => t.assignee === undefined)).toBe(true);
    });

    it('should not affect completed tasks', () => {
      const t1 = tasks.create({ description: 'Task 1' });
      tasks.claim(t1.id, 'agent-1');
      tasks.complete(t1.id, 'agent-1', 'done');

      const released = tasks.releaseByAgent('agent-1');
      expect(released).toBe(0);
      expect(tasks.getTask(t1.id)!.status).toBe('completed');
    });
  });

  describe('allowRescue', () => {
    it('should allow another agent to complete when allowRescue is true', () => {
      const t1 = tasks.create({ description: 'Orphaned task' });
      tasks.claim(t1.id, 'agent-1');

      // agent-1 leaves (but task stays in_progress)
      // agent-2 rescues
      const completed = tasks.complete(t1.id, 'agent-2', 'rescued', true);
      expect(completed.status).toBe('completed');
      expect(completed.assignee).toBe('agent-2');
      expect(completed.result).toBe('rescued');
    });

    it('should reject rescue when allowRescue is false', () => {
      const t1 = tasks.create({ description: 'Task' });
      tasks.claim(t1.id, 'agent-1');

      expect(() => tasks.complete(t1.id, 'agent-2', 'nope', false)).toThrow();
    });
  });

  describe('getAvailable', () => {
    it('should return tasks with all deps completed and no assignee', () => {
      const t1 = tasks.create({ description: 'Design' });
      const t2 = tasks.create({ description: 'Implement', deps: [t1.id] });
      const t3 = tasks.create({ description: 'Independent task' });

      // Only t1 and t3 are available (t2 depends on t1)
      const available = tasks.getAvailable();
      expect(available).toHaveLength(2);
      expect(available.map(t => t.description)).toContain('Design');
      expect(available.map(t => t.description)).toContain('Independent task');

      // Complete t1 → t2 becomes available
      tasks.claim(t1.id, 'agent-1');
      tasks.complete(t1.id, 'agent-1', 'done');

      const nowAvailable = tasks.getAvailable();
      expect(nowAvailable.map(t => t.description)).toContain('Implement');
    });
  });
});
