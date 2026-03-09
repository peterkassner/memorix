/**
 * Task Manager — Simple task DAG with dependencies
 *
 * Agents can create tasks, claim them, complete them, and query available work.
 * Dependencies are validated: a task can only be claimed when all deps are completed.
 * Simple JSON format — no complex graph structures.
 */

import { randomUUID } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskCreateInput {
  description: string;
  deps?: string[];
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  deps: string[];
  assignee?: string;
  result?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskListFilter {
  status?: TaskStatus;
  assignee?: string;
}

// ─── Manager ─────────────────────────────────────────────────────────

export class TaskManager {
  private tasks = new Map<string, Task>();

  /**
   * Create a new task. Validates that all dependency IDs exist.
   */
  create(input: TaskCreateInput): Task {
    const deps = input.deps ?? [];

    // Validate deps exist
    for (const dep of deps) {
      if (!this.tasks.has(dep)) {
        throw new Error(`Unknown dependency task: ${dep}`);
      }
    }

    const now = new Date();
    const task: Task = {
      id: randomUUID(),
      description: input.description,
      status: 'pending',
      deps,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    return { ...task };
  }

  /**
   * Claim a pending task for an agent.
   * Validates: task exists, not claimed by another, all deps completed.
   */
  claim(taskId: string, agentId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    // Allow same agent to re-claim
    if (task.assignee && task.assignee !== agentId) {
      throw new Error(`Task already claimed by ${task.assignee}`);
    }

    // Check all dependencies are completed
    for (const depId of task.deps) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        throw new Error(`Cannot claim: dependencies not completed (${depId})`);
      }
    }

    task.assignee = agentId;
    task.status = 'in_progress';
    task.updatedAt = new Date();
    return { ...task };
  }

  /**
   * Complete a task with a result. Only the assignee can complete,
   * unless allowRescue is true (used when original assignee left).
   */
  complete(taskId: string, agentId: string, result: string, allowRescue = false): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.assignee) throw new Error(`Task not claimed: ${taskId}`);
    if (task.assignee !== agentId && !allowRescue) {
      throw new Error(`Only assignee ${task.assignee} can complete this task`);
    }

    task.assignee = agentId;
    task.status = 'completed';
    task.result = result;
    task.updatedAt = new Date();
    return { ...task };
  }

  /**
   * Release all in_progress tasks assigned to a specific agent.
   * Returns them to 'pending' so other agents can claim them.
   */
  releaseByAgent(agentId: string): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.assignee === agentId && task.status === 'in_progress') {
        task.status = 'pending';
        task.assignee = undefined;
        task.updatedAt = new Date();
        count++;
      }
    }
    return count;
  }

  /**
   * List tasks with optional filters.
   */
  list(filter?: TaskListFilter): Task[] {
    let all = [...this.tasks.values()];
    if (filter?.status) {
      all = all.filter(t => t.status === filter.status);
    }
    if (filter?.assignee) {
      all = all.filter(t => t.assignee === filter.assignee);
    }
    return all.map(t => ({ ...t }));
  }

  /**
   * Get tasks that are available to be claimed:
   * - status is 'pending'
   * - all dependencies are 'completed'
   */
  getAvailable(): Task[] {
    const result: Task[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;

      const depsReady = task.deps.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (depsReady) {
        result.push({ ...task });
      }
    }
    return result;
  }

  /**
   * Get a single task by ID.
   */
  getTask(taskId: string): Task | null {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : null;
  }

  /**
   * Check if a task's assignee matches the given agentId.
   */
  isAssignee(taskId: string, agentId: string): boolean {
    const task = this.tasks.get(taskId);
    return task?.assignee === agentId;
  }

  /** Serialize state for file persistence */
  serialize(): { tasks: Record<string, unknown> } {
    const tasks: Record<string, unknown> = {};
    for (const [id, t] of this.tasks) {
      tasks[id] = {
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    }
    return { tasks };
  }

  /** Hydrate state from file persistence */
  hydrate(data: { tasks?: Record<string, any> }): void {
    this.tasks.clear();
    if (!data?.tasks) return;
    for (const [id, raw] of Object.entries(data.tasks)) {
      this.tasks.set(id, {
        ...(raw as any),
        createdAt: new Date((raw as any).createdAt),
        updatedAt: new Date((raw as any).updatedAt),
      });
    }
  }
}
