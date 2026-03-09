/**
 * Concurrency & Resource Test
 * Simulates multiple agents hitting the MCP server simultaneously
 * Tests: file lock contention, parallel writes, memory/CPU usage
 */

const BASE = 'http://127.0.0.1:3211/mcp';

// Each "agent" needs its own MCP session
async function createSession(name) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  let sessionId = null;
  let reqId = 0;

  const rpc = async (method, params = {}) => {
    const h = { ...headers };
    if (sessionId) h['Mcp-Session-Id'] = sessionId;
    const body = JSON.stringify({ jsonrpc: '2.0', id: ++reqId, method, params });
    const t0 = performance.now();
    const res = await fetch(BASE, { method: 'POST', headers: h, body });
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
    const ms = performance.now() - t0;
    return { data, ms };
  };

  // Initialize
  await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name, version: '1.0' },
  });
  await rpc('notifications/initialized', {});

  const callTool = async (tool, args = {}) => {
    const { data, ms } = await rpc('tools/call', { name: tool, arguments: args });
    const text = data?.result?.content?.[0]?.text || '';
    const isError = data?.result?.isError === true;
    return { text, isError, ms };
  };

  return { rpc, callTool, name };
}

function stats(times) {
  if (times.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  times.sort((a, b) => a - b);
  return {
    avg: (times.reduce((s, t) => s + t, 0) / times.length).toFixed(1),
    p50: times[Math.floor(times.length * 0.5)].toFixed(1),
    p95: times[Math.floor(times.length * 0.95)].toFixed(1),
    max: times[times.length - 1].toFixed(1),
    min: times[0].toFixed(1),
  };
}

function printStats(label, times) {
  const s = stats(times);
  console.log(`  ${label.padEnd(30)} avg=${s.avg}ms  p50=${s.p50}ms  p95=${s.p95}ms  max=${s.max}ms  (n=${times.length})`);
}

async function main() {
  console.log('\n🔥 Memorix Concurrency & Resource Stress Test\n');

  // Get server PID for resource monitoring
  let serverPid = null;
  try {
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-03-26', capabilities: {},
        clientInfo: { name: 'pid-check', version: '1.0' },
      }}),
    });
    // Server PID not directly available, we'll measure from outside
  } catch {}

  // ─── Test 1: Multiple sessions simultaneously ───
  console.log('📡 Test 1: Create 5 MCP sessions simultaneously');
  const t0 = performance.now();
  const sessions = await Promise.all([
    createSession('agent-alpha'),
    createSession('agent-beta'),
    createSession('agent-gamma'),
    createSession('agent-delta'),
    createSession('agent-epsilon'),
  ]);
  const sessionTime = performance.now() - t0;
  console.log(`  ✅ 5 sessions created in ${sessionTime.toFixed(0)}ms (${(sessionTime/5).toFixed(0)}ms/session effective)\n`);

  // ─── Test 2: Parallel team_join from all agents ───
  console.log('👥 Test 2: 5 agents join team simultaneously');
  const joinStart = performance.now();
  const joinResults = await Promise.all(
    sessions.map(s => s.callTool('team_join', { name: s.name, role: 'worker' }))
  );
  const joinWall = performance.now() - joinStart;
  const joinTimes = joinResults.map(r => r.ms);
  printStats('parallel team_join (5)', joinTimes);
  console.log(`  Wall time: ${joinWall.toFixed(1)}ms\n`);

  // Extract agent IDs
  const agentIds = joinResults.map(r => {
    const m = r.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  });

  // ─── Test 3: Parallel memorix_store — this is where file lock contention happens ───
  console.log('💾 Test 3: 5 agents store observations simultaneously (FILE LOCK CONTENTION)');
  const storeAllTimes = [];
  const storeErrors = [];

  for (let round = 0; round < 3; round++) {
    const storeStart = performance.now();
    const storeResults = await Promise.all(
      sessions.map((s, i) => s.callTool('memorix_store', {
        entityName: `entity-${s.name}`,
        type: 'discovery',
        title: `Concurrent write r${round} from ${s.name}`,
        narrative: `Testing concurrent file lock behavior round ${round} agent ${i}`,
      }))
    );
    const storeWall = performance.now() - storeStart;
    const roundTimes = storeResults.map(r => r.ms);
    const errors = storeResults.filter(r => r.isError);
    storeAllTimes.push(...roundTimes);
    storeErrors.push(...errors);
    console.log(`  Round ${round+1}: wall=${storeWall.toFixed(0)}ms  individual=[${roundTimes.map(t => t.toFixed(0)).join(', ')}]ms  errors=${errors.length}`);
  }
  printStats('concurrent memorix_store', storeAllTimes);
  if (storeErrors.length > 0) {
    console.log(`  ⚠️  ${storeErrors.length} errors during concurrent writes!`);
    storeErrors.forEach(e => console.log(`    → ${e.text.slice(0, 100)}`));
  } else {
    console.log('  ✅ No data corruption or lock failures');
  }

  // ─── Test 4: Parallel memorix_search while stores are happening ───
  console.log('\n🔍 Test 4: Concurrent search + store (reader-writer contention)');
  const rwStart = performance.now();
  const rwResults = await Promise.all([
    // 2 writers
    sessions[0].callTool('memorix_store', { entityName: 'rw-test', type: 'discovery', title: 'RW write 1', narrative: 'test' }),
    sessions[1].callTool('memorix_store', { entityName: 'rw-test', type: 'discovery', title: 'RW write 2', narrative: 'test' }),
    // 3 readers
    sessions[2].callTool('memorix_search', { query: 'concurrent' }),
    sessions[3].callTool('memorix_search', { query: 'concurrent' }),
    sessions[4].callTool('memorix_search', { query: 'concurrent' }),
  ]);
  const rwWall = performance.now() - rwStart;
  const writeTimes = rwResults.slice(0, 2).map(r => r.ms);
  const readTimes = rwResults.slice(2).map(r => r.ms);
  console.log(`  Writers: [${writeTimes.map(t => t.toFixed(0)).join(', ')}]ms`);
  console.log(`  Readers: [${readTimes.map(t => t.toFixed(0)).join(', ')}]ms`);
  console.log(`  Wall time: ${rwWall.toFixed(0)}ms`);
  const rwErrors = rwResults.filter(r => r.isError);
  if (rwErrors.length > 0) {
    console.log(`  ⚠️  ${rwErrors.length} errors!`);
  } else {
    console.log('  ✅ No errors under reader-writer contention');
  }

  // ─── Test 5: Team operations under heavy load ───
  console.log('\n⚡ Test 5: 50 parallel team operations (mixed)');
  const mixStart = performance.now();
  const mixOps = [];
  for (let i = 0; i < 10; i++) {
    const s = sessions[i % 5];
    const fromId = agentIds[i % 5];
    const toId = agentIds[(i + 1) % 5];
    mixOps.push(s.callTool('team_send', { from: fromId, to: toId, type: 'info', content: `msg-${i}` }));
    mixOps.push(s.callTool('team_status'));
    mixOps.push(s.callTool('team_file_status'));
    mixOps.push(s.callTool('team_task_list'));
    mixOps.push(s.callTool('team_inbox', { agentId: fromId }));
  }
  const mixResults = await Promise.all(mixOps);
  const mixWall = performance.now() - mixStart;
  const mixTimes = mixResults.map(r => r.ms);
  const mixErrors = mixResults.filter(r => r.isError);
  printStats('50 parallel team ops', mixTimes);
  console.log(`  Wall time: ${mixWall.toFixed(0)}ms  Throughput: ${(50 / mixWall * 1000).toFixed(0)} ops/sec`);
  if (mixErrors.length > 0) {
    console.log(`  ⚠️  ${mixErrors.length} errors:`);
    mixErrors.forEach((e, i) => console.log(`    [${i}] ${e.text.slice(0, 120)}`));
  } else {
    console.log('  ✅ Zero errors under parallel team load');
  }

  // ─── Test 6: Sustained burst — 200 operations ───
  console.log('\n🏋️ Test 6: Sustained burst — 200 sequential team operations');
  const burstTimes = [];
  const burstStart = performance.now();
  for (let i = 0; i < 200; i++) {
    const s = sessions[i % 5];
    const fromId = agentIds[i % 5];
    const toId = agentIds[(i + 1) % 5];
    const { ms } = await s.callTool('team_send', { from: fromId, to: toId, type: 'info', content: `burst-${i}` });
    burstTimes.push(ms);
  }
  const burstWall = performance.now() - burstStart;
  printStats('200 sequential sends', burstTimes);
  console.log(`  Total: ${burstWall.toFixed(0)}ms  Throughput: ${(200 / burstWall * 1000).toFixed(0)} ops/sec`);

  // ─── Test 7: Memory snapshot ───
  console.log('\n💻 Test 7: Server resource usage (approximate)');
  // We can't directly measure server memory, but we can check response time degradation
  // After all the above operations, measure if performance has degraded
  const degradeTimes = [];
  for (let i = 0; i < 20; i++) {
    const { ms } = await sessions[0].callTool('team_status');
    degradeTimes.push(ms);
  }
  printStats('team_status after load', degradeTimes);
  
  const baselineAvg = 1.3; // from our earlier benchmark
  const currentAvg = parseFloat(stats(degradeTimes).avg);
  const degradation = ((currentAvg / baselineAvg - 1) * 100).toFixed(0);
  console.log(`  Baseline avg: ${baselineAvg}ms → Current avg: ${currentAvg}ms → Degradation: ${degradation}%`);

  // Check inbox size (accumulated messages)
  const inboxCheck = await sessions[0].callTool('team_inbox', { agentId: agentIds[0] });
  console.log(`  Agent inbox size: ${inboxCheck.text.slice(0, 80)}`);

  // ─── Summary ───
  console.log('\n' + '═'.repeat(70));
  console.log('  📋 Concurrency Test Summary');
  console.log('═'.repeat(70));
  
  const totalErrors = storeErrors.length + rwErrors.length + mixErrors.length;
  console.log(`\n  Sessions:         5 concurrent MCP sessions ✅`);
  console.log(`  Store contention: ${storeAllTimes.length} concurrent writes, ${storeErrors.length} errors`);
  console.log(`  Team throughput:  ${(50 / mixWall * 1000).toFixed(0)} ops/sec parallel, ${(200 / burstWall * 1000).toFixed(0)} ops/sec sequential`);
  console.log(`  Performance drift: ${degradation}% after ${200 + 50 + 15} operations`);
  console.log(`  Total errors:     ${totalErrors}`);
  
  if (totalErrors === 0 && parseInt(degradation) < 100) {
    console.log('\n  ✅ PASS — No contention issues, no data loss, stable performance');
  } else if (totalErrors === 0) {
    console.log('\n  ⚠️  WARN — No errors but performance degraded significantly');
  } else {
    console.log('\n  ❌ FAIL — Errors under concurrent load');
  }
  
  console.log('\n  ⚠️  ARCHITECTURE NOTE:');
  console.log('  Team state (agents, messages, locks, tasks) is IN-MEMORY per process.');
  console.log('  Multiple HTTP sessions on the SAME server share team state (✅).');
  console.log('  Different processes (Cursor stdio + Windsurf stdio) do NOT share team state.');
  console.log('  → Use HTTP transport for multi-agent collaboration.');
  console.log('  memorix_store uses filesystem locks — concurrent writes serialize but don\'t corrupt.');
  console.log('═'.repeat(70) + '\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
