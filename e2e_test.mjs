/**
 * E2E Test — Real HTTP requests to MCP server on port 3211
 * Tests the full team collaboration flow: join, send, lock, tasks
 */

const BASE = 'http://127.0.0.1:3211/mcp';
let sessionId = null;
let passed = 0;
let failed = 0;

async function rpc(method, params = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
  const res = await fetch(BASE, { method: 'POST', headers, body });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { return JSON.parse(line.slice(6)); } catch {}
      }
    }
    return null;
  }
  return await res.json();
}

function assert(label, condition, detail = '') {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label} ${detail}`); failed++; }
}

function toolText(resp) {
  return resp?.result?.content?.[0]?.text || '';
}

function extractUUID(text) {
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

function extractShortId(text) {
  // Match "2736a6a8…" style short IDs
  const m = text.match(/([0-9a-f]{8})…/);
  return m ? m[1] : null;
}

async function callTool(name, args = {}) {
  const resp = await rpc('tools/call', { name, arguments: args });
  const text = toolText(resp);
  const isError = resp?.result?.isError === true;
  return { text, isError, raw: resp };
}

// ============================================================
async function main() {
  console.log('\n🧪 Memorix E2E Test — Real HTTP Transport\n');

  // 1. Initialize session
  console.log('📡 Step 1: Initialize MCP session');
  const initResp = await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'e2e-tester', version: '1.0' },
  });
  assert('Session initialized', initResp?.result?.serverInfo?.name === 'memorix');
  assert('Session ID received', !!sessionId);
  await rpc('notifications/initialized', {});

  // 2. List tools
  console.log('\n🔧 Step 2: List tools');
  const toolsResp = await rpc('tools/list', {});
  const toolNames = toolsResp?.result?.tools?.map(t => t.name) || [];
  assert(`${toolNames.length} tools listed`, toolNames.length >= 40);
  const teamTools = ['team_join','team_leave','team_status','team_send','team_broadcast',
    'team_inbox','team_file_lock','team_file_unlock','team_file_status',
    'team_task_create','team_task_claim','team_task_complete','team_task_list'];
  const missingTools = teamTools.filter(t => !toolNames.includes(t));
  assert('All 13 team tools registered', missingTools.length === 0, `missing: ${missingTools.join(', ')}`);

  // 3. Agent joins
  console.log('\n👤 Step 3: Agent registration');
  const j1 = await callTool('team_join', { name: 'cursor-frontend', role: 'Frontend dev', capabilities: ['react', 'css'] });
  const agent1Id = extractUUID(j1.text);
  assert('Agent 1 joined', !!agent1Id && j1.text.includes('cursor-frontend'), j1.text.slice(0, 80));

  const j2 = await callTool('team_join', { name: 'windsurf-backend', role: 'Backend dev', capabilities: ['node', 'postgres'] });
  const agent2Id = extractUUID(j2.text);
  assert('Agent 2 joined', !!agent2Id && j2.text.includes('windsurf-backend'));

  // 4. Team status
  console.log('\n📊 Step 4: Team status');
  const status = await callTool('team_status');
  assert('Status shows 2 active', status.text.includes('2 active'), status.text.slice(0, 80));
  assert('Both agents listed', status.text.includes('cursor-frontend') && status.text.includes('windsurf-backend'));

  // 5. Messaging
  console.log('\n💬 Step 5: Messaging');
  const send = await callTool('team_send', { from: agent1Id, to: agent2Id, type: 'request', content: 'Review auth module' });
  assert('Message sent', send.text.includes('Sent') || send.text.includes('sent') || send.text.includes('✉'), send.text.slice(0, 80));

  const inbox = await callTool('team_inbox', { agentId: agent2Id });
  assert('Inbox has unread', inbox.text.includes('unread') || inbox.text.includes('Review auth'), inbox.text.slice(0, 120));

  const bcast = await callTool('team_broadcast', { from: agent1Id, type: 'announcement', content: 'Deploy in 10 min' });
  assert('Broadcast sent', bcast.text.includes('broadcast') || bcast.text.includes('Broadcast'), bcast.text.slice(0, 80));

  // 6. File locks
  console.log('\n🔒 Step 6: File locks');
  const lock = await callTool('team_file_lock', { file: 'src/auth.ts', agentId: agent1Id });
  assert('File locked by agent 1', lock.text.includes('Locked') || lock.text.includes('locked'), lock.text);

  const lockConflict = await callTool('team_file_lock', { file: 'src/auth.ts', agentId: agent2Id });
  assert('Lock conflict for agent 2', lockConflict.isError || lockConflict.text.includes('locked by'), lockConflict.text);

  const fStatus = await callTool('team_file_status');
  assert('File status shows lock', fStatus.text.includes('auth.ts'), fStatus.text.slice(0, 120));

  const unlock = await callTool('team_file_unlock', { file: 'src/auth.ts', agentId: agent1Id });
  assert('File unlocked', unlock.text.includes('Released') || unlock.text.includes('released') || unlock.text.includes('nlocked'), unlock.text);

  // 7. Tasks
  console.log('\n📋 Step 7: Task DAG');
  const t1 = await callTool('team_task_create', { description: 'Set up database schema' });
  assert('Task 1 created', t1.text.includes('created') || t1.text.includes('Task'), t1.text);
  // Extract task ID (short hash format: "2736a6a8…")
  // Extract task ID — try UUID first, then short ID from create output
  let task1Id = extractUUID(t1.text);
  if (!task1Id) {
    const task1Short = extractShortId(t1.text);
    // Get full ID from task list
    const tList1 = await callTool('team_task_list');
    const allUUIDs = tList1.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
    task1Id = allUUIDs.find(id => task1Short && id.startsWith(task1Short));
    if (!task1Id && allUUIDs.length > 0) task1Id = allUUIDs[0];
  }
  assert('Task 1 ID extracted', !!task1Id, `from: ${t1.text.slice(0, 60)}`);

  let task2Id = null;
  if (task1Id) {
    const t2 = await callTool('team_task_create', { description: 'Implement API endpoints', deps: [task1Id] });
    assert('Task 2 created with dep', t2.text.includes('created') || t2.text.includes('Task'), t2.text);
    // Get task 2 ID
    const tList2 = await callTool('team_task_list');
    const allIds2 = tList2.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
    task2Id = allIds2.find(id => id !== task1Id);
  } else {
    console.log('  ⚠️  Could not extract task1 ID, skipping dep test');
  }

  // Claim task 1
  if (task1Id) {
    const claim1 = await callTool('team_task_claim', { taskId: task1Id, agentId: agent1Id });
    assert('Task 1 claimed', claim1.text.includes('Claimed') || claim1.text.includes('claimed'), claim1.text);
  }

  // Try claim task 2 (should fail — dep not complete)
  if (task2Id) {
    const claim2fail = await callTool('team_task_claim', { taskId: task2Id, agentId: agent2Id });
    assert('Task 2 blocked by dep', claim2fail.isError || claim2fail.text.includes('depend') || claim2fail.text.includes('blocked'), claim2fail.text);
  }

  // Complete task 1
  if (task1Id) {
    const comp1 = await callTool('team_task_complete', { taskId: task1Id, agentId: agent1Id, result: 'Schema with 5 tables' });
    assert('Task 1 completed', comp1.text.includes('Completed') || comp1.text.includes('completed'), comp1.text);
  }

  // Now claim task 2 (deps satisfied)
  if (task2Id) {
    const claim2ok = await callTool('team_task_claim', { taskId: task2Id, agentId: agent2Id });
    assert('Task 2 now claimable', claim2ok.text.includes('Claimed') || claim2ok.text.includes('claimed'), claim2ok.text);
  }

  // 8. Agent leave
  console.log('\n👋 Step 8: Agent lifecycle');
  const leave = await callTool('team_leave', { agentId: agent2Id });
  assert('Agent 2 left', leave.text.includes('left') || leave.text.includes('deactivated') || leave.text.includes('Left'), leave.text);

  const finalStatus = await callTool('team_status');
  assert('Only 1 active', finalStatus.text.includes('1 active'), finalStatus.text.slice(0, 80));

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏁 E2E Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
