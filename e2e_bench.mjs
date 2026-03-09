/**
 * Performance Benchmark — Memorix Team Collaboration
 * Measures real HTTP latency for team operations under realistic scenarios
 */

const BASE = 'http://127.0.0.1:3211/mcp';
let sessionId = null;
let reqId = 0;

async function rpc(method, params = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const body = JSON.stringify({ jsonrpc: '2.0', id: ++reqId, method, params });
  const t0 = performance.now();
  const res = await fetch(BASE, { method: 'POST', headers, body });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const ct = res.headers.get('content-type') || '';
  let data;
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { data = JSON.parse(line.slice(6)); } catch {}
      }
    }
  } else {
    data = await res.json();
  }
  return { data, ms: performance.now() - t0 };
}

async function callTool(name, args = {}) {
  return rpc('tools/call', { name, arguments: args });
}

function extractUUID(text) {
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

function stats(times) {
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];
  return { avg: avg.toFixed(1), p50: p50.toFixed(1), p95: p95.toFixed(1), p99: p99.toFixed(1), min: min.toFixed(1), max: max.toFixed(1) };
}

function printStats(label, times) {
  const s = stats(times);
  console.log(`  ${label.padEnd(25)} avg=${s.avg}ms  p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms  min=${s.min}ms  max=${s.max}ms  (n=${times.length})`);
}

async function main() {
  console.log('\n⚡ Memorix Team Collaboration — Performance Benchmark\n');
  console.log('Testing against real HTTP MCP server on port 3211\n');

  // ─── 1. Session init ───
  console.log('📡 Benchmark 1: MCP Session Initialization');
  const initTimes = [];
  for (let i = 0; i < 5; i++) {
    sessionId = null;
    const { ms } = await rpc('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: `bench-${i}`, version: '1.0' },
    });
    initTimes.push(ms);
    await rpc('notifications/initialized', {});
  }
  printStats('session_init', initTimes);

  // ─── 2. Agent join/leave cycle ───
  console.log('\n👤 Benchmark 2: Agent Join/Leave Cycle (50 iterations)');
  const joinTimes = [];
  const leaveTimes = [];
  for (let i = 0; i < 50; i++) {
    const { data: jd, ms: jms } = await callTool('team_join', { name: `agent-${i}`, role: 'worker' });
    joinTimes.push(jms);
    const agentId = extractUUID(jd?.result?.content?.[0]?.text || '');
    if (agentId) {
      const { ms: lms } = await callTool('team_leave', { agentId });
      leaveTimes.push(lms);
    }
  }
  printStats('team_join', joinTimes);
  printStats('team_leave', leaveTimes);

  // ─── 3. Messaging throughput ───
  console.log('\n💬 Benchmark 3: Messaging (100 messages between 2 agents)');
  // Setup: 2 agents
  const { data: a1d } = await callTool('team_join', { name: 'sender-agent', role: 'sender' });
  const agent1 = extractUUID(a1d?.result?.content?.[0]?.text || '');
  const { data: a2d } = await callTool('team_join', { name: 'receiver-agent', role: 'receiver' });
  const agent2 = extractUUID(a2d?.result?.content?.[0]?.text || '');

  const sendTimes = [];
  const inboxTimes = [];
  for (let i = 0; i < 100; i++) {
    const { ms: sms } = await callTool('team_send', { from: agent1, to: agent2, type: 'info', content: `msg-${i}` });
    sendTimes.push(sms);
  }
  // Read inbox
  for (let i = 0; i < 10; i++) {
    const { ms: ims } = await callTool('team_inbox', { agentId: agent2, markRead: true });
    inboxTimes.push(ims);
  }
  printStats('team_send', sendTimes);
  printStats('team_inbox', inboxTimes);

  // ─── 4. File lock contention ───
  console.log('\n🔒 Benchmark 4: File Lock Operations (50 lock/unlock cycles)');
  const lockTimes = [];
  const unlockTimes = [];
  const conflictTimes = [];
  for (let i = 0; i < 50; i++) {
    const file = `src/module-${i}.ts`;
    const { ms: lms } = await callTool('team_file_lock', { file, agentId: agent1 });
    lockTimes.push(lms);
    // Conflict attempt
    const { ms: cms } = await callTool('team_file_lock', { file, agentId: agent2 });
    conflictTimes.push(cms);
    // Unlock
    const { ms: ums } = await callTool('team_file_unlock', { file, agentId: agent1 });
    unlockTimes.push(ums);
  }
  printStats('file_lock', lockTimes);
  printStats('file_lock (conflict)', conflictTimes);
  printStats('file_unlock', unlockTimes);

  // ─── 5. Task DAG performance ───
  console.log('\n📋 Benchmark 5: Task DAG (create chain of 20 tasks, claim & complete)');
  const createTimes = [];
  const claimTimes = [];
  const completeTimes = [];
  let prevTaskId = null;
  const taskIds = [];

  // Create a chain: task0 -> task1 -> task2 -> ...
  for (let i = 0; i < 20; i++) {
    const deps = prevTaskId ? [prevTaskId] : [];
    const { data: td, ms: tms } = await callTool('team_task_create', { description: `Task step ${i}`, deps });
    createTimes.push(tms);
    const taskId = extractUUID(td?.result?.content?.[0]?.text || '');
    taskIds.push(taskId);
    prevTaskId = taskId;
  }
  printStats('task_create', createTimes);

  // Claim and complete the chain sequentially (must respect deps)
  for (const taskId of taskIds) {
    if (!taskId) continue;
    const { ms: cms } = await callTool('team_task_claim', { taskId, agentId: agent1 });
    claimTimes.push(cms);
    const { ms: dms } = await callTool('team_task_complete', { taskId, agentId: agent1, result: 'done' });
    completeTimes.push(dms);
  }
  printStats('task_claim', claimTimes);
  printStats('task_complete', completeTimes);

  // Task list with many tasks
  const listTimes = [];
  for (let i = 0; i < 20; i++) {
    const { ms } = await callTool('team_task_list');
    listTimes.push(ms);
  }
  printStats('task_list (20 tasks)', listTimes);

  // ─── 6. Parallel burst ───
  console.log('\n🚀 Benchmark 6: Parallel Burst (10 concurrent tool calls)');
  const burstStart = performance.now();
  const burst = await Promise.all([
    callTool('team_status'),
    callTool('team_file_status'),
    callTool('team_task_list'),
    callTool('team_inbox', { agentId: agent1 }),
    callTool('team_inbox', { agentId: agent2 }),
    callTool('team_send', { from: agent1, to: agent2, type: 'info', content: 'burst-1' }),
    callTool('team_send', { from: agent2, to: agent1, type: 'info', content: 'burst-2' }),
    callTool('team_file_lock', { file: 'burst-test.ts', agentId: agent1 }),
    callTool('team_task_create', { description: 'burst task' }),
    callTool('team_status'),
  ]);
  const burstTotal = performance.now() - burstStart;
  const burstTimes = burst.map(b => b.ms);
  printStats('parallel burst (10)', burstTimes);
  console.log(`  Total wall time for 10 parallel calls: ${burstTotal.toFixed(1)}ms`);

  // ─── 7. Overhead analysis ───
  console.log('\n📊 Benchmark 7: Overhead Analysis — memorix_store vs team coordination');
  const storeTimes = [];
  for (let i = 0; i < 20; i++) {
    const { ms } = await callTool('memorix_store', {
      entityName: 'bench-entity',
      type: 'discovery',
      title: `Bench observation ${i}`,
      narrative: `Testing performance of observation storage ${i}`,
    });
    storeTimes.push(ms);
  }
  printStats('memorix_store', storeTimes);

  const searchTimes = [];
  for (let i = 0; i < 20; i++) {
    const { ms } = await callTool('memorix_search', { query: 'bench' });
    searchTimes.push(ms);
  }
  printStats('memorix_search', searchTimes);

  // ─── Summary ───
  console.log('\n' + '═'.repeat(70));
  console.log('  📈 Summary: Team Operation Overhead');
  console.log('═'.repeat(70));
  
  const avgSend = parseFloat(stats(sendTimes).avg);
  const avgLock = parseFloat(stats(lockTimes).avg);
  const avgClaim = parseFloat(stats(claimTimes).avg);
  const avgStore = parseFloat(stats(storeTimes).avg);
  const avgSearch = parseFloat(stats(searchTimes).avg);
  
  console.log(`\n  Core memory ops:   store=${avgStore.toFixed(1)}ms  search=${avgSearch.toFixed(1)}ms`);
  console.log(`  Team coordination: send=${avgSend.toFixed(1)}ms  lock=${avgLock.toFixed(1)}ms  claim=${avgClaim.toFixed(1)}ms`);
  console.log(`  Overhead ratio:    send/store=${(avgSend/avgStore).toFixed(2)}x  lock/store=${(avgLock/avgStore).toFixed(2)}x`);
  
  if (avgSend < avgStore * 2) {
    console.log('\n  ✅ Team operations are FAST — less than 2x core memory op latency');
  } else if (avgSend < avgStore * 5) {
    console.log('\n  ⚠️  Team operations have moderate overhead — 2-5x core memory op latency');
  } else {
    console.log('\n  ❌ Team operations are SLOW — more than 5x core memory op latency');
  }

  console.log(`\n  Wall time for 10 parallel calls: ${burstTotal.toFixed(1)}ms (avg ${(burstTotal/10).toFixed(1)}ms/call effective)`);
  console.log('═'.repeat(70) + '\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
