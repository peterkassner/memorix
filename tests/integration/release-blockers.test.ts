/**
 * Release Blocker Regression Tests (codex/dev105)
 *
 * Tests for the 5 critical fixes:
 * B1: CORS wildcard leak in dashboard JSON API
 * B2: /api/config startup project YAML leak via global fallback
 * B3: memorix_detail bare numeric ID cross-project ambiguity
 * B4: topicKey upsert non-atomic concurrent race (TOCTOU)
 * B5: search mode process-level global → project-scoped
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

vi.mock('../../src/embedding/provider.js', () => ({
  getEmbeddingProvider: async () => null,
  isVectorSearchAvailable: async () => false,
  isEmbeddingExplicitlyDisabled: () => true,
  resetProvider: () => {},
}));

vi.mock('../../src/llm/provider.js', () => ({
  initLLM: () => null,
  isLLMEnabled: () => false,
  getLLMConfig: () => null,
}));

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadYamlConfig, initProjectRoot, resetYamlConfigCache } from '../../src/config/yaml-loader.js';
import { compactDetail } from '../../src/compact/engine.js';
import { storeObservation, initObservations, getObservationCount } from '../../src/memory/observations.js';
import { getLastSearchMode, resetDb, searchObservations } from '../../src/store/orama-store.js';

// ================================================================
// B2: /api/config startup project YAML leak via global fallback
// ================================================================
describe('B2: loadYamlConfig(null) skips global fallback', () => {
  let testDir: string;
  let ymlPath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-b2-'));
    ymlPath = path.join(testDir, 'memorix.yml');
    resetYamlConfigCache();
  });

  afterEach(() => {
    resetYamlConfigCache();
    try { unlinkSync(ymlPath); } catch { /* ignore */ }
  });

  it('loadYamlConfig(null) should NOT use globalProjectRoot', () => {
    // Set up a project-level memorix.yml with distinctive config
    writeFileSync(ymlPath, 'llm:\n  provider: secret-startup-provider\n', 'utf-8');
    initProjectRoot(testDir);

    // Verify no-arg call DOES pick it up (baseline)
    const withGlobal = loadYamlConfig();
    expect(withGlobal.llm?.provider).toBe('secret-startup-provider');

    // Verify explicit null DOES NOT pick it up (the fix)
    resetYamlConfigCache();
    const withNull = loadYamlConfig(null);
    expect(withNull.llm?.provider).not.toBe('secret-startup-provider');
  });

  it('loadYamlConfig(null) should still return a valid config object', () => {
    resetYamlConfigCache();
    const cfg = loadYamlConfig(null);
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe('object');
  });
});

// ================================================================
// B3: memorix_detail bare numeric ID cross-project ambiguity
// ================================================================
describe('B3: compactDetail project-scoped lookup', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-b3-'));
    await resetDb();
    await initObservations(testDir);
  });

  it('should return observation when projectId matches', async () => {
    const { observation } = await storeObservation({
      entityName: 'auth',
      type: 'decision',
      title: 'Use JWT',
      narrative: 'JWT for auth',
      projectId: 'project-alpha',
    });

    const result = await compactDetail([{ id: observation.id, projectId: 'project-alpha' }]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].projectId).toBe('project-alpha');
  });

  it('should NOT return observation when projectId mismatches', async () => {
    const { observation } = await storeObservation({
      entityName: 'auth',
      type: 'decision',
      title: 'Use JWT',
      narrative: 'JWT for auth',
      projectId: 'project-alpha',
    });

    const result = await compactDetail([{ id: observation.id, projectId: 'project-beta' }]);
    expect(result.documents).toHaveLength(0);
  });

  it('bare numeric IDs without projectId should still work (backward compat)', async () => {
    const { observation } = await storeObservation({
      entityName: 'auth',
      type: 'decision',
      title: 'Use JWT',
      narrative: 'JWT for auth',
      projectId: 'project-alpha',
    });

    const result = await compactDetail([observation.id]);
    expect(result.documents).toHaveLength(1);
  });
});

// ================================================================
// B4: topicKey upsert non-atomic concurrent race (TOCTOU)
// ================================================================
describe('B4: topicKey upsert atomicity', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-b4-'));
    await resetDb();
    await initObservations(testDir);
  });

  it('concurrent upserts with same topicKey should not create duplicates', async () => {
    const topicKey = 'architecture/auth-model';
    const projectId = 'test/b4';

    const promises = Array.from({ length: 5 }, (_, i) =>
      storeObservation({
        entityName: 'auth',
        type: 'decision',
        title: `Auth model v${i + 1}`,
        narrative: `Revision ${i + 1} of auth architecture`,
        topicKey,
        projectId,
      }),
    );

    const results = await Promise.all(promises);

    const creates = results.filter(r => !r.upserted);
    const upserts = results.filter(r => r.upserted);

    expect(creates.length + upserts.length).toBe(5);
    expect(creates.length).toBeLessThanOrEqual(1);

    const ids = new Set(results.map(r => r.observation.id));
    expect(ids.size).toBe(1);

    expect(getObservationCount()).toBe(1);
  });

  it('different topicKeys should create separate observations', async () => {
    const projectId = 'test/b4';

    const [r1, r2] = await Promise.all([
      storeObservation({
        entityName: 'auth',
        type: 'decision',
        title: 'Auth v1',
        narrative: 'Auth design',
        topicKey: 'architecture/auth',
        projectId,
      }),
      storeObservation({
        entityName: 'db',
        type: 'decision',
        title: 'DB v1',
        narrative: 'DB design',
        topicKey: 'architecture/db',
        projectId,
      }),
    ]);

    expect(r1.observation.id).not.toBe(r2.observation.id);
    expect(getObservationCount()).toBe(2);
  });
});

// ================================================================
// B5: search mode project-scoped (not process-global)
// ================================================================
describe('B5: search mode is project-scoped', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-b5-'));
    await resetDb();
    await initObservations(testDir);
  });

  it('getLastSearchMode should return fulltext by default', () => {
    expect(getLastSearchMode('project-x')).toBe('fulltext');
    expect(getLastSearchMode('project-y')).toBe('fulltext');
  });

  it('search mode should be tracked per project', async () => {
    await storeObservation({
      entityName: 'test',
      type: 'discovery',
      title: 'Alpha finding',
      narrative: 'Found something in alpha',
      projectId: 'project-alpha',
    });
    await storeObservation({
      entityName: 'test',
      type: 'discovery',
      title: 'Beta finding',
      narrative: 'Found something in beta',
      projectId: 'project-beta',
    });

    await searchObservations({ query: 'finding', projectId: 'project-alpha' });
    const modeAlpha = getLastSearchMode('project-alpha');

    await searchObservations({ query: 'finding', projectId: 'project-beta' });
    const modeBeta = getLastSearchMode('project-beta');

    expect(modeAlpha).toBe('fulltext');
    expect(modeBeta).toBe('fulltext');
    expect(getLastSearchMode('project-alpha')).toBe('fulltext');
  });

  it('different projects should not leak search mode to each other', async () => {
    await storeObservation({
      entityName: 'test',
      type: 'discovery',
      title: 'X finding',
      narrative: 'X project data',
      projectId: 'project-x',
    });

    await searchObservations({ query: 'X', projectId: 'project-x' });

    expect(getLastSearchMode('project-x')).toBeTruthy();
    expect(getLastSearchMode('project-y')).toBe('fulltext');
  });
});

// ================================================================
// B1 + B2: Real embedded serve-http route tests
//
// These tests spawn the REAL `memorix serve-http` binary as a child
// process and hit the actual /api/* routes. This verifies the full
// production handler chain, not a mirror or copy of the logic.
//
// Requires: `npm run build` must have been run first.
// ================================================================
describe('B1+B2: Real embedded serve-http route tests', () => {
  const REAL_PORT = 19879;
  const REAL_BASE = `http://127.0.0.1:${REAL_PORT}`;
  let serverProcess: ChildProcess;
  let startupDir: string;
  const distCli = path.resolve('dist', 'cli', 'index.js');

  beforeAll(async () => {
    if (!existsSync(distCli)) {
      throw new Error(`dist/cli/index.js not found at ${distCli}. Run \`npm run build\` first.`);
    }

    // Create temp dir with fake git repo + memorix.yml containing canary values
    startupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-real-http-'));
    await fs.mkdir(path.join(startupDir, '.git'), { recursive: true });
    await fs.writeFile(
      path.join(startupDir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/test/real-http-blocker.git\n',
      'utf-8',
    );
    writeFileSync(
      path.join(startupDir, 'memorix.yml'),
      'llm:\n  provider: leak-canary-http\n  model: canary-model-http\n',
      'utf-8',
    );

    // Spawn real serve-http binary — this runs the full production handler
    serverProcess = spawn(
      process.execPath,
      [distCli, 'serve-http', '--port', String(REAL_PORT), '--cwd', startupDir],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MEMORIX_EMBEDDING: 'off',
          MEMORIX_LLM_PROVIDER: '',
          MEMORIX_LLM_MODEL: '',
          MEMORIX_LLM_API_KEY: '',
        },
      },
    );

    // Wait for "listening" on stderr (server ready)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('serve-http did not start within 20s')), 20_000);
      let stderr = '';
      serverProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess.on('error', (err) => { clearTimeout(timeout); reject(err); });
      serverProcess.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`serve-http exited early (code ${code}). stderr:\n${stderr}`));
      });
    });
  }, 30_000);

  afterAll(() => {
    try { serverProcess?.kill(); } catch { /* already exited */ }
  });

  // ── B1: CORS on real embedded /api/* routes ──

  it('B1: hostile origin → no Access-Control-Allow-Origin on real /api/project', async () => {
    const res = await fetch(`${REAL_BASE}/api/project`, {
      headers: { 'Origin': 'https://evil.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('B1: localhost origin → ACAO echoed on real /api/project', async () => {
    const res = await fetch(`${REAL_BASE}/api/project`, {
      headers: { 'Origin': `http://localhost:${REAL_PORT}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(`http://localhost:${REAL_PORT}`);
  });

  it('B1: 127.0.0.1 origin → ACAO echoed on real /api/project', async () => {
    const res = await fetch(`${REAL_BASE}/api/project`, {
      headers: { 'Origin': `http://127.0.0.1:${REAL_PORT}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(`http://127.0.0.1:${REAL_PORT}`);
  });

  it('B1: no Origin → no ACAO on real /api/project', async () => {
    const res = await fetch(`${REAL_BASE}/api/project`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('B1: OPTIONS preflight hostile origin → no ACAO on real route', async () => {
    const res = await fetch(`${REAL_BASE}/api/project`, {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://attacker.io' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  // ── B2: /api/config leak prevention on real embedded route ──

  it('B2: init MCP session then /api/config?project=other must NOT leak startup YAML', async () => {
    // Step 1: Init an MCP session to trigger createMemorixServer → initProjectRoot.
    // This sets globalProjectRoot to startupDir in the real server process.
    const initRes = await fetch(`${REAL_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'b2-test-agent', version: '1.0' },
        },
        id: 1,
      }),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Step 2: Hit /api/config for a DIFFERENT project
    const configRes = await fetch(`${REAL_BASE}/api/config?project=other/secondary`);
    expect(configRes.status).toBe(200);
    const data = await configRes.json() as any;

    // The canary value should NOT appear for non-startup project
    expect(data.isStartupProject).toBe(false);
    const providerVal = data.values?.find((v: any) => v.key === 'llm.provider');
    expect(providerVal?.value).not.toBe('leak-canary-http');
    const modelVal = data.values?.find((v: any) => v.key === 'llm.model');
    expect(modelVal?.value).not.toBe('canary-model-http');
  }, 15_000);

  it('B2: startup project /api/config should still return its own YAML values', async () => {
    const res = await fetch(`${REAL_BASE}/api/config`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.isStartupProject).toBe(true);
    const providerVal = data.values?.find((v: any) => v.key === 'llm.provider');
    expect(providerVal?.value).toBe('leak-canary-http');
  });
});

// ================================================================
// P1: CLI `memorix search` cold-start must find persisted memories
//
// Spawns the REAL built CLI binary in a temp git repo with
// pre-seeded observations.json and verifies search returns results.
// ================================================================
describe('P1: CLI cold-start search finds persisted memories', () => {
  const distCli = path.resolve('dist', 'cli', 'index.js');
  let repoDir: string;
  let dataDir: string;

  const PROJECT_ID = 'test/cold-search';

  beforeAll(async () => {
    if (!existsSync(distCli)) {
      throw new Error(`dist/cli/index.js not found at ${distCli}. Run \`npm run build\` first.`);
    }

    // Fake git repo whose remote normalizes to "test/cold-search"
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-cold-search-repo-'));
    await fs.mkdir(path.join(repoDir, '.git'), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/test/cold-search.git\n',
      'utf-8',
    );

    // Isolated data dir with pre-seeded observation
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-cold-search-data-'));
    const seedObs = [
      {
        id: 1,
        projectId: PROJECT_ID,
        entityName: 'git-hook',
        type: 'what-changed',
        title: 'Auto-committed smoke test observation',
        narrative: 'This observation was created by a git hook commit during smoke testing.',
        facts: ['commit triggered hook', 'hook wrote memory'],
        concepts: ['git', 'hook', 'smoke', 'commit'],
        status: 'active',
        source: 'git',
        tokens: 42,
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: '',
        filesModified: [],
      },
    ];
    await fs.writeFile(
      path.join(dataDir, 'observations.json'),
      JSON.stringify(seedObs, null, 2),
      'utf-8',
    );
    await fs.writeFile(
      path.join(dataDir, 'counter.json'),
      JSON.stringify({ nextId: 2 }),
      'utf-8',
    );
  });

  /**
   * Spawn `memorix search <query>` as a fresh process (cold start)
   * and return its stdout. The CLI process may not exit on its own
   * (Orama keeps the event loop alive), so we collect output for up
   * to 8 seconds then kill the process and return what we have.
   */
  function runCliSearch(query: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [distCli, 'search', query],
        {
          cwd: repoDir,
          env: {
            ...process.env,
            MEMORIX_DATA_DIR: dataDir,
            MEMORIX_EMBEDDING: 'off',
            MEMORIX_LLM_API_KEY: '',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch { /* already exited */ }
        resolve({ stdout, stderr });
      };
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
        // Resolve early once search output is complete
        if (stdout.includes('Search complete') || stdout.includes('No memories found')) {
          setTimeout(finish, 200); // small grace period for trailing output
        }
      });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', finish);
      setTimeout(finish, 10_000); // hard fallback
    });
  }

  it('search "smoke" finds the persisted observation', async () => {
    const { stdout } = await runCliSearch('smoke');
    expect(stdout).toContain('smoke test observation');
  }, 15_000);

  it('search "hook" finds the persisted observation', async () => {
    const { stdout } = await runCliSearch('hook');
    expect(stdout).toContain('smoke test observation');
  }, 15_000);

  it('search "commit" finds the persisted observation', async () => {
    const { stdout } = await runCliSearch('commit');
    expect(stdout).toContain('smoke test observation');
  }, 15_000);

  it('search for unrelated term returns no results', async () => {
    const { stdout } = await runCliSearch('xyznonexistent');
    expect(stdout).toContain('No memories found');
  }, 15_000);
});

// ================================================================
// Git-missing prompt: CLI shows unified message when no git repo
// ================================================================
describe('Git-missing prompt: CLI shows clear guidance', () => {
  const distCli = path.resolve('dist', 'cli', 'index.js');
  let noGitDir: string;

  beforeAll(async () => {
    if (!existsSync(distCli)) {
      throw new Error(`dist/cli/index.js not found. Run \`npm run build\` first.`);
    }
    // Directory with NO .git
    noGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-nogit-'));
  });

  function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [distCli, ...args], {
        cwd: noGitDir,
        env: { ...process.env, MEMORIX_EMBEDDING: 'off', MEMORIX_LLM_API_KEY: '' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch { /* already exited */ }
        resolve({ stdout, stderr });
      };
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
        if (stdout.includes('git repo') || stdout.includes('git init')) {
          setTimeout(finish, 200);
        }
      });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', finish);
      setTimeout(finish, 8_000);
    });
  }

  it('memorix search in non-git dir shows unified git prompt', async () => {
    const { stdout } = await runCli(['search', 'test']);
    expect(stdout).toContain('git repo');
    expect(stdout).toContain('git init');
  }, 15_000);

  it('memorix recent in non-git dir shows unified git prompt', async () => {
    const { stdout } = await runCli(['recent']);
    expect(stdout).toContain('git repo');
    expect(stdout).toContain('git init');
  }, 15_000);
});
