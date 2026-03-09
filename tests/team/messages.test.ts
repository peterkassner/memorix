/**
 * Team Message Bus Tests (TDD — RED phase)
 *
 * Tests for agent-to-agent messaging: send, broadcast, inbox.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../../src/team/registry.js';
import { MessageBus } from '../../src/team/messages.js';

let registry: AgentRegistry;
let bus: MessageBus;

beforeEach(() => {
  registry = new AgentRegistry();
  bus = new MessageBus(registry);
});

describe('MessageBus', () => {
  describe('send', () => {
    it('should deliver a message to a specific agent', () => {
      const sender = registry.join({ name: 'cursor' });
      const receiver = registry.join({ name: 'windsurf' });

      bus.send({
        from: sender.id,
        to: receiver.id,
        type: 'request',
        content: 'What is the API schema for auth?',
      });

      const inbox = bus.getInbox(receiver.id);
      expect(inbox).toHaveLength(1);
      expect(inbox[0].from).toBe(sender.id);
      expect(inbox[0].content).toBe('What is the API schema for auth?');
      expect(inbox[0].type).toBe('request');
      expect(inbox[0].read).toBe(false);
    });

    it('should not deliver to sender inbox', () => {
      const sender = registry.join({ name: 'cursor' });
      const receiver = registry.join({ name: 'windsurf' });

      bus.send({ from: sender.id, to: receiver.id, type: 'info', content: 'hello' });

      expect(bus.getInbox(sender.id)).toHaveLength(0);
    });

    it('should throw for unknown receiver', () => {
      const sender = registry.join({ name: 'cursor' });
      expect(() => {
        bus.send({ from: sender.id, to: 'nonexistent', type: 'info', content: 'test' });
      }).toThrow();
    });

    it('should throw when sending to inactive agent', () => {
      const sender = registry.join({ name: 'cursor' });
      const receiver = registry.join({ name: 'windsurf' });
      registry.leave(receiver.id);

      expect(() => {
        bus.send({ from: sender.id, to: receiver.id, type: 'info', content: 'hello' });
      }).toThrow(/inactive/);
    });

    it('should assign unique message IDs', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg1' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg2' });

      const inbox = bus.getInbox(b.id);
      expect(inbox[0].id).not.toBe(inbox[1].id);
    });
  });

  describe('broadcast', () => {
    it('should deliver message to all active agents except sender', () => {
      const cursor = registry.join({ name: 'cursor' });
      const windsurf = registry.join({ name: 'windsurf' });
      const claude = registry.join({ name: 'claude' });

      bus.broadcast({
        from: cursor.id,
        type: 'announcement',
        content: 'I finished the auth module',
      });

      expect(bus.getInbox(cursor.id)).toHaveLength(0);
      expect(bus.getInbox(windsurf.id)).toHaveLength(1);
      expect(bus.getInbox(claude.id)).toHaveLength(1);
      expect(bus.getInbox(windsurf.id)[0].content).toBe('I finished the auth module');
    });

    it('should not deliver to inactive agents', () => {
      const cursor = registry.join({ name: 'cursor' });
      const windsurf = registry.join({ name: 'windsurf' });
      registry.leave(windsurf.id);

      bus.broadcast({ from: cursor.id, type: 'info', content: 'test' });

      expect(bus.getInbox(windsurf.id)).toHaveLength(0);
    });
  });

  describe('getInbox', () => {
    it('should return empty array for agent with no messages', () => {
      const agent = registry.join({ name: 'cursor' });
      expect(bus.getInbox(agent.id)).toHaveLength(0);
    });

    it('should return messages in chronological order', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'first' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'second' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'third' });

      const inbox = bus.getInbox(b.id);
      expect(inbox.map(m => m.content)).toEqual(['first', 'second', 'third']);
    });
  });

  describe('markRead', () => {
    it('should mark specific messages as read', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg1' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg2' });

      const inbox = bus.getInbox(b.id);
      bus.markRead(b.id, [inbox[0].id]);

      const updated = bus.getInbox(b.id);
      expect(updated[0].read).toBe(true);
      expect(updated[1].read).toBe(false);
    });
  });

  describe('inbox size cap', () => {
    it('should cap inbox at 200 messages', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      for (let i = 0; i < 250; i++) {
        bus.send({ from: a.id, to: b.id, type: 'info', content: `msg-${i}` });
      }

      const inbox = bus.getInbox(b.id);
      expect(inbox.length).toBeLessThanOrEqual(200);
    });

    it('should evict oldest read messages first when over cap', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      // Send 200 messages, mark first 50 as read
      for (let i = 0; i < 200; i++) {
        bus.send({ from: a.id, to: b.id, type: 'info', content: `msg-${i}` });
      }
      const inbox = bus.getInbox(b.id);
      bus.markRead(b.id, inbox.slice(0, 50).map(m => m.id));

      // Send 10 more — should evict 10 oldest read messages
      for (let i = 0; i < 10; i++) {
        bus.send({ from: a.id, to: b.id, type: 'info', content: `new-${i}` });
      }

      const updated = bus.getInbox(b.id);
      expect(updated.length).toBeLessThanOrEqual(200);
      // Last messages should be the new ones
      expect(updated[updated.length - 1].content).toBe('new-9');
    });
  });

  describe('pruneRead', () => {
    it('should remove all read messages', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg1' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg2' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg3' });

      const inbox = bus.getInbox(b.id);
      bus.markRead(b.id, [inbox[0].id, inbox[1].id]);

      const pruned = bus.pruneRead(b.id);
      expect(pruned).toBe(2);
      expect(bus.getInbox(b.id)).toHaveLength(1);
      expect(bus.getInbox(b.id)[0].content).toBe('msg3');
    });
  });

  describe('clearInbox', () => {
    it('should remove all messages for an agent', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg1' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg2' });

      bus.clearInbox(b.id);
      expect(bus.getInbox(b.id)).toHaveLength(0);
      expect(bus.getUnreadCount(b.id)).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should count unread messages', () => {
      const a = registry.join({ name: 'cursor' });
      const b = registry.join({ name: 'windsurf' });

      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg1' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg2' });
      bus.send({ from: a.id, to: b.id, type: 'info', content: 'msg3' });

      expect(bus.getUnreadCount(b.id)).toBe(3);

      const inbox = bus.getInbox(b.id);
      bus.markRead(b.id, [inbox[0].id]);

      expect(bus.getUnreadCount(b.id)).toBe(2);
    });
  });
});
