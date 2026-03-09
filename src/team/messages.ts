/**
 * Message Bus — Agent-to-agent communication
 *
 * In-memory message queue for team coordination.
 * Messages are temporary (not persisted as observations).
 * Supports direct send, broadcast, inbox retrieval, and read tracking.
 */

import { randomUUID } from 'node:crypto';
import type { AgentRegistry } from './registry.js';

// ─── Types ───────────────────────────────────────────────────────────

export type MessageType = 'request' | 'response' | 'info' | 'announcement' | 'contract' | 'error';

export interface MessageSendInput {
  from: string;
  to: string;
  type: MessageType;
  content: string;
}

export interface MessageBroadcastInput {
  from: string;
  type: MessageType;
  content: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  read: boolean;
}

// ─── Message Bus ─────────────────────────────────────────────────────

/** Max messages per inbox. Oldest read messages are evicted first. */
const MAX_INBOX_SIZE = 200;
/** Max message content length in bytes */
const MAX_CONTENT_LENGTH = 10_000;

export class MessageBus {
  private inboxes = new Map<string, Message[]>();
  private registry: AgentRegistry;

  constructor(registry: AgentRegistry) {
    this.registry = registry;
  }

  /**
   * Send a message to a specific agent.
   * Throws if receiver is unknown.
   */
  send(input: MessageSendInput): Message {
    const receiver = this.registry.getAgent(input.to);
    if (!receiver) {
      throw new Error(`Unknown receiver agent: ${input.to}`);
    }
    if (receiver.status !== 'active') {
      throw new Error(`Receiver agent is inactive: ${receiver.name}`);
    }

    const msg: Message = {
      id: randomUUID(),
      from: input.from,
      to: input.to,
      type: input.type,
      content: input.content,
      timestamp: new Date(),
      read: false,
    };

    const inbox = this.inboxes.get(input.to) ?? [];
    inbox.push(msg);

    // Evict oldest read messages if inbox exceeds limit
    if (inbox.length > MAX_INBOX_SIZE) {
      const readIndices: number[] = [];
      for (let i = 0; i < inbox.length; i++) {
        if (inbox[i].read) readIndices.push(i);
      }
      // Remove oldest read messages first
      const toRemove = inbox.length - MAX_INBOX_SIZE;
      for (let i = Math.min(toRemove, readIndices.length) - 1; i >= 0; i--) {
        inbox.splice(readIndices[i], 1);
      }
      // If still over limit, remove oldest unread
      while (inbox.length > MAX_INBOX_SIZE) {
        inbox.shift();
      }
    }

    this.inboxes.set(input.to, inbox);
    return msg;
  }

  /**
   * Broadcast a message to all active agents except the sender.
   */
  broadcast(input: MessageBroadcastInput): Message[] {
    const activeAgents = this.registry.listAgents({ status: 'active' });
    const messages: Message[] = [];

    for (const agent of activeAgents) {
      if (agent.id === input.from) continue;

      const msg = this.send({
        from: input.from,
        to: agent.id,
        type: input.type,
        content: input.content,
      });
      messages.push(msg);
    }

    return messages;
  }

  /**
   * Get all messages in an agent's inbox (both read and unread).
   */
  getInbox(agentId: string): Message[] {
    return [...(this.inboxes.get(agentId) ?? [])];
  }

  /**
   * Mark specific messages as read.
   */
  markRead(agentId: string, messageIds: string[]): number {
    const inbox = this.inboxes.get(agentId);
    if (!inbox) return 0;

    const idSet = new Set(messageIds);
    let count = 0;
    for (const msg of inbox) {
      if (idSet.has(msg.id) && !msg.read) {
        msg.read = true;
        count++;
      }
    }
    return count;
  }

  /**
   * Count unread messages for an agent.
   */
  getUnreadCount(agentId: string): number {
    const inbox = this.inboxes.get(agentId);
    if (!inbox) return 0;
    return inbox.filter(m => !m.read).length;
  }

  /**
   * Remove all read messages from an agent's inbox.
   * Returns the number of messages pruned.
   */
  pruneRead(agentId: string): number {
    const inbox = this.inboxes.get(agentId);
    if (!inbox) return 0;
    const before = inbox.length;
    const unread = inbox.filter(m => !m.read);
    this.inboxes.set(agentId, unread);
    return before - unread.length;
  }

  /**
   * Clear all messages for an agent (used on agent leave).
   */
  clearInbox(agentId: string): void {
    this.inboxes.delete(agentId);
  }

  /** Max allowed content length */
  static get MAX_CONTENT_LENGTH() { return MAX_CONTENT_LENGTH; }

  /** Serialize state for file persistence */
  serialize(): { inboxes: Record<string, unknown[]> } {
    const inboxes: Record<string, unknown[]> = {};
    for (const [agentId, msgs] of this.inboxes) {
      inboxes[agentId] = msgs.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }));
    }
    return { inboxes };
  }

  /** Hydrate state from file persistence */
  hydrate(data: { inboxes?: Record<string, any[]> }): void {
    this.inboxes.clear();
    if (!data?.inboxes) return;
    for (const [agentId, msgs] of Object.entries(data.inboxes)) {
      this.inboxes.set(agentId, msgs.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })));
    }
  }
}
