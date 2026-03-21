/**
 * WorkbenchApp — Main Ink application for Memorix TUI
 *
 * Three-panel layout: HeaderBar + (MainContent | Sidebar) + CommandBar
 * Manages global state, view routing, and command execution.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useStdout, useInput } from 'ink';
import { COLORS, SLASH_COMMANDS } from './theme.js';
import type { ViewType } from './theme.js';
import { HeaderBar } from './HeaderBar.js';
import { Sidebar } from './Sidebar.js';
import { CommandBar } from './CommandBar.js';
import {
  HomeView,
  RecentView,
  SearchResultsView,
  DoctorView,
  ProjectView,
  BackgroundView,
  DashboardView,
  CleanupView,
  IngestView,
  StatusMessage,
} from './Panels.js';
import type {
  ProjectInfo,
  HealthInfo,
  BackgroundInfo,
  MemoryItem,
  SearchResult,
  DoctorResult,
} from './data.js';
import {
  getProjectInfo,
  getHealthInfo,
  getRecentMemories,
  getBackgroundStatus,
  searchMemories,
  storeQuickMemory,
  getDoctorSummary,
  detectMode,
} from './data.js';

interface AppProps {
  version: string;
  onExitForInteractive: (cmd: string) => void;
}

export function WorkbenchApp({ version, onExitForInteractive }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // ── State ──────────────────────────────────────────────────
  const [view, setView] = useState<ViewType>('home');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo>({
    embeddingProvider: 'disabled',
    embeddingProviderName: undefined,
    embeddingLabel: 'Disabled',
    searchMode: 'fulltext',
    searchModeLabel: 'BM25 full-text',
    searchDiagnostic: '',
    backfillPending: 0,
    totalMemories: 0,
    activeMemories: 0,
    sessions: 0,
  });
  const [background, setBackground] = useState<BackgroundInfo>({ running: false, healthy: false });
  const [recentMemories, setRecentMemories] = useState<MemoryItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [doctor, setDoctor] = useState<DoctorResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [mode, setMode] = useState('CLI');
  const [actionStatus, setActionStatus] = useState('');

  // Views that handle their own number/letter keys
  const isActionView = view === 'cleanup' || view === 'ingest' || view === 'background' || view === 'dashboard';

  // View-specific key dispatch: intercept 1-4, h, w on action views
  useInput((ch) => {
    if (!isActionView) return;
    if (view === 'cleanup' && (ch === '1' || ch === '2' || ch === '3')) {
      handleCleanupAction(ch);
    } else if (view === 'ingest' && (ch === '1' || ch === '2' || ch === '3' || ch === '4')) {
      handleIngestAction(ch);
    } else if ((view === 'cleanup' || view === 'ingest') && ch === 'h') {
      handleCommand('/home');
    } else if (view === 'background' && (ch === '1' || ch === '2' || ch === '3')) {
      handleBackgroundAction(ch);
    } else if (view === 'background' && ch === 'w' && background.dashboard) {
      handleBackgroundAction('w');
    } else if (view === 'dashboard' && (ch === '1' || ch === '2')) {
      handleDashboardAction(ch);
    }
  });

  // ── Initial data load ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [proj, recent, bg] = await Promise.all([
          getProjectInfo(),
          getRecentMemories(8),
          getBackgroundStatus(),
        ]);
        if (cancelled) return;

        setProject(proj);
        setRecentMemories(recent);
        setBackground(bg);

        const h = await getHealthInfo(proj?.id);
        if (cancelled) return;
        setHealth(h);

        const m = detectMode();
        setMode(m.mode);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Command handler ────────────────────────────────────────
  const handleCommand = useCallback(async (input: string) => {
    const raw = input.trim();
    if (!raw) return;

    // Clear status
    setStatusMsg(null);

    if (raw.startsWith('/')) {
      const parts = raw.slice(1).split(/\s+/);
      const cmd = parts[0]?.toLowerCase() || '';
      const arg = parts.slice(1).join(' ');

      // Find command definition
      const cmdDef = SLASH_COMMANDS.find(c =>
        c.name === `/${cmd}` || c.alias === `/${cmd}`
      );

      // Interactive commands → exit Ink, run @clack/prompts, re-enter
      if (cmdDef?.interactive) {
        onExitForInteractive(`/${cmd}`);
        return;
      }

      switch (cmd) {
        case 'search':
        case 's': {
          const query = arg || '';
          if (!query) {
            setStatusMsg({ text: 'Usage: /search <query>', type: 'info' });
            return;
          }
          setView('search');
          setSearchQuery(query);
          setLoading(true);
          const results = await searchMemories(query);
          setSearchResults(results);
          setLoading(false);
          break;
        }

        case 'remember':
        case 'r': {
          if (!arg) {
            setStatusMsg({ text: 'Usage: /remember <text>', type: 'info' });
            return;
          }
          setLoading(true);
          const stored = await storeQuickMemory(arg);
          setLoading(false);
          if (stored) {
            setStatusMsg({ text: `Stored #${stored.id}: ${stored.title}`, type: 'success' });
            // Refresh recent
            const recent = await getRecentMemories(8);
            setRecentMemories(recent);
            const h = await getHealthInfo(project?.id);
            setHealth(h);
          } else {
            setStatusMsg({ text: 'Failed to store memory', type: 'error' });
          }
          break;
        }

        case 'recent':
        case 'v': {
          setView('recent');
          setLoading(true);
          const recent = await getRecentMemories(12);
          setRecentMemories(recent);
          setLoading(false);
          break;
        }

        case 'home':
        case 'h': {
          setView('home');
          break;
        }

        case 'cleanup': {
          setView('cleanup');
          setActionStatus('');
          break;
        }

        case 'ingest': {
          setView('ingest');
          setActionStatus('');
          break;
        }

        case 'doctor': {
          setView('doctor');
          setLoading(true);
          const d = await getDoctorSummary();
          setDoctor(d);
          setLoading(false);
          break;
        }

        case 'project':
        case 'status': {
          setView('project');
          break;
        }

        case 'background':
        case 'bg': {
          setView('background');
          setLoading(true);
          const bg = await getBackgroundStatus();
          setBackground(bg);
          setLoading(false);
          break;
        }

        case 'dashboard':
        case 'dash': {
          setView('dashboard');
          // Refresh background info for dashboard URL
          const bg = await getBackgroundStatus();
          setBackground(bg);
          break;
        }

        case 'help':
        case '?': {
          setStatusMsg({
            text: SLASH_COMMANDS.map(c =>
              `${c.name.padEnd(16)} ${c.description}${c.alias ? ` (${c.alias})` : ''}`
            ).join('\n'),
            type: 'info',
          });
          break;
        }

        case 'exit':
        case 'quit':
        case 'q': {
          exit();
          return;
        }

        default:
          setStatusMsg({ text: `Unknown command: /${cmd}. Type /help for available commands.`, type: 'error' });
      }
    } else {
      // Default: search
      setView('search');
      setSearchQuery(raw);
      setLoading(true);
      const results = await searchMemories(raw);
      setSearchResults(results);
      setLoading(false);
    }
  }, [project, exit, onExitForInteractive]);

  // ── Action handlers for Cleanup and Ingest views ──────────
  const handleCleanupAction = useCallback(async (action: string) => {
    setActionStatus('Executing...');
    try {
      const { detectProject } = await import('../../project/detector.js');
      const { getProjectDataDir } = await import('../../store/persistence.js');
      const proj = detectProject(process.cwd());

      switch (action) {
        case '1': { // Uninstall project artifacts
          if (!proj) { setActionStatus('No project detected.'); return; }
          try {
            const { execSync } = await import('node:child_process');
            execSync('memorix git-hook-uninstall', { cwd: process.cwd(), stdio: 'pipe' });
            setActionStatus('Project artifacts uninstalled.');
          } catch { setActionStatus('No artifacts to uninstall.'); }
          break;
        }
        case '2': { // Purge current project memory
          if (!proj) { setActionStatus('No project detected.'); return; }
          const dataDir = await getProjectDataDir(proj.id);
          const fs = await import('node:fs');
          const path = await import('node:path');
          const obsPath = path.join(dataDir, 'observations.json');
          if (fs.existsSync(obsPath)) {
            fs.writeFileSync(obsPath, '[]');
            setActionStatus(`Purged memory for ${proj.name}. Observations reset to empty.`);
          } else {
            setActionStatus('No observations file found.');
          }
          break;
        }
        case '3': { // Purge ALL memory
          const dataDir = await getProjectDataDir('_');
          const fs = await import('node:fs');
          const path = await import('node:path');
          const obsPath = path.join(dataDir, 'observations.json');
          if (fs.existsSync(obsPath)) {
            fs.writeFileSync(obsPath, '[]');
            setActionStatus('All memory purged. Observations reset to empty.');
          } else {
            setActionStatus('No observations file found.');
          }
          break;
        }
        default:
          setActionStatus('');
      }
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleIngestAction = useCallback(async (action: string) => {
    setActionStatus('Executing...');
    try {
      switch (action) {
        case '1': { // Ingest recent commits
          try {
            const { execSync } = await import('node:child_process');
            const out = execSync('memorix ingest-commit --last 5', { cwd: process.cwd(), stdio: 'pipe' });
            setActionStatus(`Ingested recent commits. ${out.toString().trim()}`);
          } catch (e) {
            setActionStatus(`Ingest failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }
        case '2': { // Ingest git log
          try {
            const { execSync } = await import('node:child_process');
            const out = execSync('memorix ingest-log --last 20', { cwd: process.cwd(), stdio: 'pipe' });
            setActionStatus(`Ingested git log. ${out.toString().trim()}`);
          } catch (e) {
            setActionStatus(`Ingest failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }
        case '3': { // Install post-commit hook
          try {
            const { execSync } = await import('node:child_process');
            execSync('memorix git-hook-install', { cwd: process.cwd(), stdio: 'pipe' });
            setActionStatus('Post-commit hook installed.');
          } catch (e) {
            setActionStatus(`Hook install failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }
        case '4': { // Uninstall post-commit hook
          try {
            const { execSync } = await import('node:child_process');
            execSync('memorix git-hook-uninstall', { cwd: process.cwd(), stdio: 'pipe' });
            setActionStatus('Post-commit hook uninstalled.');
          } catch (e) {
            setActionStatus(`Hook uninstall failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }
        default:
          setActionStatus('');
      }
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // ── Action handlers for Background and Dashboard views ─────
  const handleBackgroundAction = useCallback(async (action: string) => {
    setStatusMsg(null);
    try {
      const { execSync } = await import('node:child_process');
      if (background.running) {
        switch (action) {
          case 'w': // Open dashboard
            if (background.dashboard) {
              try { execSync(`start "" "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
                try { execSync(`open "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
                  try { execSync(`xdg-open "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
                    setStatusMsg({ text: `Open: ${background.dashboard}`, type: 'info' });
                  }
                }
              }
              setStatusMsg({ text: `Opening ${background.dashboard}`, type: 'success' });
            }
            break;
          case '1': // Restart
            try {
              execSync('memorix background restart', { stdio: 'pipe', timeout: 15000 });
              setStatusMsg({ text: 'Control plane restarted.', type: 'success' });
            } catch (e) { setStatusMsg({ text: `Restart failed: ${e instanceof Error ? e.message : e}`, type: 'error' }); }
            break;
          case '2': // Stop
            try {
              execSync('memorix background stop', { stdio: 'pipe', timeout: 10000 });
              setStatusMsg({ text: 'Control plane stopped.', type: 'success' });
            } catch (e) { setStatusMsg({ text: `Stop failed: ${e instanceof Error ? e.message : e}`, type: 'error' }); }
            break;
          case '3': // Logs
            setStatusMsg({ text: 'Run: memorix background logs (in separate terminal)', type: 'info' });
            break;
        }
      } else {
        switch (action) {
          case '1': // Start
            try {
              execSync('memorix background start', { stdio: 'pipe', timeout: 15000 });
              setStatusMsg({ text: 'Control plane started.', type: 'success' });
            } catch (e) { setStatusMsg({ text: `Start failed: ${e instanceof Error ? e.message : e}`, type: 'error' }); }
            break;
          case '2': // Standalone dashboard
            setStatusMsg({ text: 'Run: memorix dashboard (in separate terminal)', type: 'info' });
            break;
        }
      }
      // Refresh background status after action
      const bg = await getBackgroundStatus();
      setBackground(bg);
    } catch (err) {
      setStatusMsg({ text: `Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    }
  }, [background]);

  const handleDashboardAction = useCallback(async (action: string) => {
    setStatusMsg(null);
    try {
      const { execSync } = await import('node:child_process');
      if (background.healthy && background.dashboard) {
        switch (action) {
          case '1': // Open dashboard URL
            try { execSync(`start "" "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
              try { execSync(`open "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
                try { execSync(`xdg-open "${background.dashboard}"`, { stdio: 'pipe' }); } catch {
                  setStatusMsg({ text: `Open: ${background.dashboard}`, type: 'info' });
                }
              }
            }
            setStatusMsg({ text: `Opening ${background.dashboard}`, type: 'success' });
            break;
          case '2': // Standalone
            setStatusMsg({ text: 'Run: memorix dashboard (in separate terminal)', type: 'info' });
            break;
        }
      } else {
        switch (action) {
          case '1': // Start background first
            try {
              execSync('memorix background start', { stdio: 'pipe', timeout: 15000 });
              setStatusMsg({ text: 'Control plane started. Use /dashboard again to open.', type: 'success' });
              const bg = await getBackgroundStatus();
              setBackground(bg);
            } catch (e) { setStatusMsg({ text: `Start failed: ${e instanceof Error ? e.message : e}`, type: 'error' }); }
            break;
          case '2': // Standalone
            setStatusMsg({ text: 'Run: memorix dashboard (in separate terminal)', type: 'info' });
            break;
        }
      }
    } catch (err) {
      setStatusMsg({ text: `Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    }
  }, [background]);

  // ── Render main content based on view ──────────────────────
  const renderContent = () => {
    switch (view) {
      case 'search':
        return <SearchResultsView results={searchResults} query={searchQuery} loading={loading} />;
      case 'doctor':
        return <DoctorView doctor={doctor} loading={loading} />;
      case 'project':
        return <ProjectView project={project} />;
      case 'background':
        return <BackgroundView background={background} loading={loading} />;
      case 'dashboard':
        return <DashboardView background={background} />;
      case 'recent':
        return <RecentView recentMemories={recentMemories} loading={loading} />;
      case 'cleanup':
        return <CleanupView onAction={handleCleanupAction} statusText={actionStatus} />;
      case 'ingest':
        return <IngestView onAction={handleIngestAction} statusText={actionStatus} />;
      case 'home':
      default:
        return <HomeView project={project} health={health} background={background} loading={loading} />;
    }
  };

  // ── Layout ─────────────────────────────────────────────────
  const termWidth = stdout?.columns || 80;
  const narrow = termWidth < 80;

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <HeaderBar version={version} project={project} health={health} mode={mode} />

      {/* Main area: content + sidebar */}
      <Box flexGrow={1} flexDirection={narrow ? 'column' : 'row'}>
        {/* Main content */}
        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle="single"
          borderColor={COLORS.border}
        >
          {renderContent()}
        </Box>

        {/* Sidebar */}
        {!narrow && (
          <Sidebar
            health={health}
            background={background}
            onAction={handleCommand}
            activeView={view}
          />
        )}
      </Box>

      {/* Status message */}
      {statusMsg && <StatusMessage message={statusMsg.text} type={statusMsg.type} />}

      {/* Command bar */}
      <CommandBar
        onSubmit={handleCommand}
        onExit={() => exit()}
        disabled={isActionView}
        disabledHint={
          view === 'cleanup'
            ? 'cleanup: press 1/2/3, or h for home'
            : view === 'ingest'
              ? 'git > memory: press 1/2/3/4, or h for home'
              : view === 'background'
                ? background.running
                  ? 'background: press w/1/2/3'
                  : 'background: press 1/2'
                : view === 'dashboard'
                  ? 'dashboard: press 1/2'
                  : 'action view active'
        }
      />
    </Box>
  );
}
