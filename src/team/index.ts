/**
 * Team Module — Multi-Agent Collaboration
 *
 * Provides agent registry, message bus, file locks, and task management
 * for coordinating multiple AI agents working on the same project.
 *
 * Usage via HTTP transport:
 *   memorix serve-http --port 3211
 *
 * All team state is in-memory and shared across MCP sessions on the same server.
 */

export { AgentRegistry } from './registry.js';
export type { AgentInfo, AgentJoinInput, AgentListFilter } from './registry.js';

export { MessageBus } from './messages.js';
export type { Message, MessageType, MessageSendInput, MessageBroadcastInput } from './messages.js';

export { FileLockRegistry } from './file-locks.js';
export type { LockResult, LockInfo, LockOptions } from './file-locks.js';

export { TaskManager } from './tasks.js';
export type { Task, TaskStatus, TaskCreateInput, TaskListFilter } from './tasks.js';
