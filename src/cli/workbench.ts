/**
 * Memorix Workbench — Fullscreen Terminal UI
 *
 * A terminal-native workbench that takes over the entire screen,
 * inspired by opencode's clean TUI design.
 *
 * Features:
 * - Alternate screen buffer (no shell prompt visible)
 * - Real-time keystroke handling with raw mode
 * - Slash command autocomplete popup on '/'
 * - Persistent header with project/mode/health status
 * - Clean exit restoring original terminal state
 */

import { createRequire } from 'node:module';
import * as readline from 'node:readline';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// ── ANSI Escape Codes ──────────────────────────────────────────
const ESC = '\x1b';
const CSI = `${ESC}[`;
const ALT_SCREEN_ON = `${CSI}?1049h`;
const ALT_SCREEN_OFF = `${CSI}?1049l`;
const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
const CLEAR_LINE = `${CSI}2K`;

const moveTo = (row: number, col: number) => `${CSI}${row};${col}H`;
const DIM = `${CSI}2m`;
const BOLD = `${CSI}1m`;
const RESET = `${CSI}0m`;
const CYAN = `${CSI}36m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const BLUE = `${CSI}34m`;
const WHITE = `${CSI}37m`;
const BG_DARK = `${CSI}48;5;236m`;
const BG_HIGHLIGHT = `${CSI}48;5;238m`;
const BG_RESET = `${CSI}49m`;
const INVERSE = `${CSI}7m`;

// ── Slash Commands ─────────────────────────────────────────────
interface SlashCommand {
  name: string;
  description: string;
  alias?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/search', description: 'Search memories', alias: '/s' },
  { name: '/remember', description: 'Store a quick memory', alias: '/r' },
  { name: '/recent', description: 'View recent memories' },
  { name: '/doctor', description: 'System diagnostics' },
  { name: '/project', description: 'Project details' },
  { name: '/background', description: 'Background service', alias: '/bg' },
  { name: '/dashboard', description: 'Open dashboard', alias: '/dash' },
  { name: '/configure', description: 'Settings', alias: '/config' },
  { name: '/integrate', description: 'Set up an IDE' },
  { name: '/help', description: 'Show all commands' },
  { name: '/exit', description: 'Exit workbench', alias: '/q' },
];

// ── State ──────────────────────────────────────────────────────
interface WorkbenchState {
  input: string;
  cursorPos: number;
  showSlashMenu: boolean;
  slashMenuIndex: number;
  filteredCommands: SlashCommand[];
  outputLines: string[];
  headerLines: string[];
  running: boolean;
  statusLine: string;
}

// ── Header Detection ───────────────────────────────────────────
async function detectHeader(): Promise<string[]> {
  const lines: string[] = [];

  let projectLabel = `${DIM}no project${RESET}`;
  try {
    const { detectProject } = await import('../project/detector.js');
    const proj = detectProject(process.cwd());
    if (proj) {
      projectLabel = `${WHITE}${proj.name}${RESET} ${DIM}(${proj.id})${RESET}`;
    }
  } catch { /* ignore */ }

  let modeLabel = `${DIM}CLI${RESET}`;
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const bgPath = join(homedir(), '.memorix', 'background.json');
    if (existsSync(bgPath)) {
      const bg = JSON.parse(readFileSync(bgPath, 'utf-8'));
      try { process.kill(bg.pid, 0); modeLabel = `${GREEN}Background${RESET} ${DIM}port ${bg.port}${RESET}`; } catch { /* dead */ }
    }
  } catch { /* ignore */ }

  let searchLabel = `${DIM}BM25 fulltext${RESET}`;
  try {
    const { getEmbeddingMode } = await import('../config.js');
    if (getEmbeddingMode() !== 'off') {
      searchLabel = `${CYAN}hybrid${RESET} ${DIM}BM25 + vector${RESET}`;
    }
  } catch { /* ignore */ }

  let memLabel = '';
  try {
    const { detectProject } = await import('../project/detector.js');
    const { getProjectDataDir, loadObservationsJson } = await import('../store/persistence.js');
    const proj = detectProject(process.cwd());
    if (proj) {
      const dataDir = await getProjectDataDir(proj.id);
      const { existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const obsFile = join(dataDir, 'observations.json');
      if (existsSync(obsFile)) {
        const obs = await loadObservationsJson(dataDir) as any[];
        const active = obs.filter((o: any) => (o.status ?? 'active') === 'active').length;
        memLabel = `${WHITE}${active}${RESET} ${DIM}active${RESET}`;
      }
    }
  } catch { /* ignore */ }
  if (!memLabel) memLabel = `${DIM}--${RESET}`;

  lines.push(`  ${DIM}Project${RESET}   ${projectLabel}`);
  lines.push(`  ${DIM}Mode${RESET}      ${modeLabel}`);
  lines.push(`  ${DIM}Search${RESET}    ${searchLabel}`);
  lines.push(`  ${DIM}Memories${RESET}  ${memLabel}`);

  return lines;
}

// ── Rendering ──────────────────────────────────────────────────
function render(state: WorkbenchState): void {
  const { columns: W, rows: H } = process.stdout;
  let out = '';

  // Clear and position
  out += CLEAR_SCREEN;

  // ── Top bar ──
  const ver = `v${pkg.version}`;
  const titleLine = `  ${BOLD}Memorix Workbench${RESET}`;
  const verPad = Math.max(2, W - 20 - ver.length);
  out += moveTo(2, 1) + titleLine + ' '.repeat(verPad) + `${DIM}${ver}${RESET}`;
  out += moveTo(3, 1) + `  ${DIM}${'─'.repeat(Math.min(W - 4, 70))}${RESET}`;

  // ── Header info ──
  for (let i = 0; i < state.headerLines.length; i++) {
    out += moveTo(4 + i, 1) + state.headerLines[i];
  }
  const headerEnd = 4 + state.headerLines.length;
  out += moveTo(headerEnd, 1) + `  ${DIM}${'─'.repeat(Math.min(W - 4, 70))}${RESET}`;

  // ── Input area ──
  const inputRow = headerEnd + 2;
  const inputDisplay = state.input || '';
  const placeholder = !inputDisplay ? `${DIM}Search memories or type / for commands${RESET}` : '';

  out += moveTo(inputRow, 1) + `  ${CYAN}>${RESET} ${placeholder}${WHITE}${inputDisplay}${RESET}`;

  // ── Slash command popup ──
  if (state.showSlashMenu && state.filteredCommands.length > 0) {
    const menuRow = inputRow + 1;
    const cmds = state.filteredCommands;
    const maxVisible = Math.min(cmds.length, H - menuRow - 4);

    out += moveTo(menuRow, 1) + `  ${DIM}┌${'─'.repeat(50)}┐${RESET}`;
    for (let i = 0; i < maxVisible; i++) {
      const cmd = cmds[i];
      const isSelected = i === state.slashMenuIndex;
      const prefix = isSelected ? `${BG_HIGHLIGHT}${YELLOW}` : `  `;
      const nameStr = `${isSelected ? YELLOW : CYAN}${cmd.name.padEnd(16)}${RESET}`;
      const descStr = `${DIM}${cmd.description}${RESET}`;
      const line = isSelected
        ? `${BG_HIGHLIGHT}  ${nameStr}${descStr}${''.padEnd(Math.max(0, 48 - cmd.name.length - cmd.description.length))}${BG_RESET}`
        : `  ${nameStr}${descStr}`;
      out += moveTo(menuRow + 1 + i, 1) + `  ${DIM}│${RESET}${line}${DIM}│${RESET}`;
    }
    out += moveTo(menuRow + 1 + maxVisible, 1) + `  ${DIM}└${'─'.repeat(50)}┘${RESET}`;
  }

  // ── Output area ──
  const outputStart = state.showSlashMenu
    ? inputRow + 3 + Math.min(state.filteredCommands.length, H - inputRow - 6)
    : inputRow + 2;
  const maxOutputLines = Math.max(0, H - outputStart - 2);
  const visibleOutput = state.outputLines.slice(-maxOutputLines);
  for (let i = 0; i < visibleOutput.length; i++) {
    out += moveTo(outputStart + i, 1) + `  ${visibleOutput[i]}`;
  }

  // ── Bottom bar ──
  out += moveTo(H, 1) + `${BG_DARK}  ${DIM}/${RESET}${BG_DARK} commands  ${DIM}esc${RESET}${BG_DARK} clear  ${DIM}ctrl+c${RESET}${BG_DARK} exit`;
  if (state.statusLine) {
    out += `  ${DIM}${state.statusLine}${RESET}`;
  }
  out += ' '.repeat(Math.max(0, W - 50)) + BG_RESET;

  // Position cursor at input
  out += moveTo(inputRow, 5 + state.cursorPos);
  out += CURSOR_SHOW;

  process.stdout.write(out);
}

// ── Command Execution ──────────────────────────────────────────
async function executeCommand(state: WorkbenchState, input: string): Promise<void> {
  const raw = input.trim();
  if (!raw) return;

  if (raw.startsWith('/')) {
    const parts = raw.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case 'search':
      case 's':
        if (arg) {
          await doSearch(state, arg);
        } else {
          state.outputLines.push(`${YELLOW}Usage: /search <query>${RESET}`);
        }
        break;
      case 'remember':
      case 'r':
        if (arg) {
          await doRemember(state, arg);
        } else {
          state.outputLines.push(`${YELLOW}Usage: /remember <text>${RESET}`);
        }
        break;
      case 'recent':
        await doRecent(state);
        break;
      case 'doctor':
        state.outputLines.push(`${DIM}Running diagnostics...${RESET}`);
        render(state);
        await doDoctor(state);
        break;
      case 'project':
      case 'status':
        await doProject(state);
        break;
      case 'background':
      case 'bg':
        state.outputLines.push(`${DIM}Use CLI: memorix background start|stop|status|restart${RESET}`);
        break;
      case 'dashboard':
      case 'dash':
        state.outputLines.push(`${DIM}Use CLI: memorix dashboard${RESET}`);
        break;
      case 'configure':
      case 'config':
        state.outputLines.push(`${DIM}Use CLI: memorix configure${RESET}`);
        break;
      case 'integrate':
      case 'setup':
        state.outputLines.push(`${DIM}Use CLI: memorix integrate${RESET}`);
        break;
      case 'help':
      case '?':
        for (const c of SLASH_COMMANDS) {
          state.outputLines.push(`  ${CYAN}${c.name.padEnd(16)}${RESET}${DIM}${c.description}${c.alias ? ` (${c.alias})` : ''}${RESET}`);
        }
        break;
      case 'exit':
      case 'quit':
      case 'q':
        state.running = false;
        break;
      default:
        state.outputLines.push(`${YELLOW}Unknown command: /${cmd}${RESET} ${DIM}Type /help for available commands${RESET}`);
    }
  } else {
    // Default: search
    await doSearch(state, raw);
  }
}

async function doSearch(state: WorkbenchState, query: string): Promise<void> {
  state.outputLines.push(`${DIM}Searching: "${query}"...${RESET}`);
  render(state);

  try {
    const { searchObservations, getDb } = await import('../store/orama-store.js');
    const { getProjectDataDir } = await import('../store/persistence.js');
    const { detectProject } = await import('../project/detector.js');
    const { initObservations } = await import('../memory/observations.js');

    const proj = detectProject(process.cwd());
    if (!proj) { state.outputLines.push(`${YELLOW}No project detected. Run git init first.${RESET}`); return; }
    const dataDir = await getProjectDataDir(proj.id);
    await initObservations(dataDir);
    await getDb();

    const results = await searchObservations({ query, limit: 8, projectId: proj.id });
    state.outputLines.pop(); // Remove "Searching..."

    if (results.length === 0) {
      state.outputLines.push(`${DIM}No results for "${query}"${RESET}`);
      return;
    }

    state.outputLines.push(`${GREEN}${results.length} results${RESET} ${DIM}for "${query}"${RESET}`);
    for (const r of results) {
      state.outputLines.push(`  ${r.icon} ${DIM}#${r.id}${RESET} ${WHITE}${r.title.slice(0, 70)}${RESET}`);
    }
  } catch (err) {
    state.outputLines.push(`${YELLOW}Search error: ${err instanceof Error ? err.message : err}${RESET}`);
  }
}

async function doRemember(state: WorkbenchState, text: string): Promise<void> {
  try {
    const { detectProject } = await import('../project/detector.js');
    const { getProjectDataDir } = await import('../store/persistence.js');
    const { initObservations, storeObservation } = await import('../memory/observations.js');

    const proj = detectProject(process.cwd());
    if (!proj) { state.outputLines.push(`${YELLOW}No project detected.${RESET}`); return; }
    const dataDir = await getProjectDataDir(proj.id);
    await initObservations(dataDir);

    const result = await storeObservation({
      entityName: 'quick-note', type: 'discovery',
      title: text.slice(0, 100), narrative: text, facts: [], projectId: proj.id,
    });

    state.outputLines.push(`${GREEN}Stored${RESET} #${result.observation.id}: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`);
  } catch (err) {
    state.outputLines.push(`${YELLOW}Store error: ${err instanceof Error ? err.message : err}${RESET}`);
  }
}

async function doRecent(state: WorkbenchState): Promise<void> {
  try {
    const { detectProject } = await import('../project/detector.js');
    const { getProjectDataDir, loadObservationsJson } = await import('../store/persistence.js');

    const proj = detectProject(process.cwd());
    if (!proj) { state.outputLines.push(`${YELLOW}No project detected.${RESET}`); return; }
    const dataDir = await getProjectDataDir(proj.id);
    const obs = await loadObservationsJson(dataDir) as any[];
    const active = obs.filter((o: any) => (o.status ?? 'active') === 'active');
    const recent = active.slice(-8).reverse();

    if (recent.length === 0) {
      state.outputLines.push(`${DIM}No memories yet.${RESET}`);
      return;
    }

    const typeIcons: Record<string, string> = {
      gotcha: '!', decision: 'D', 'problem-solution': 'S', discovery: '?',
      'how-it-works': 'H', 'what-changed': 'C', 'trade-off': 'T', reasoning: 'R',
    };

    state.outputLines.push(`${GREEN}Recent memories${RESET} ${DIM}(${active.length} active)${RESET}`);
    for (const o of recent) {
      const icon = typeIcons[o.type] || '.';
      state.outputLines.push(`  ${DIM}[${icon}]${RESET} ${DIM}#${o.id}${RESET} ${WHITE}${(o.title || '').slice(0, 65)}${RESET}`);
    }
  } catch (err) {
    state.outputLines.push(`${YELLOW}Error: ${err instanceof Error ? err.message : err}${RESET}`);
  }
}

async function doDoctor(state: WorkbenchState): Promise<void> {
  try {
    const m = await import('./commands/doctor.js');
    // Capture doctor output
    const origLog = console.log;
    const captured: string[] = [];
    console.log = (...args: any[]) => captured.push(args.join(' '));
    await m.default.run?.({ args: { _: [], json: false }, rawArgs: [], cmd: m.default } as any);
    console.log = origLog;
    for (const line of captured) {
      if (line.trim()) state.outputLines.push(line);
    }
  } catch (err) {
    state.outputLines.push(`${YELLOW}Doctor error: ${err instanceof Error ? err.message : err}${RESET}`);
  }
}

async function doProject(state: WorkbenchState): Promise<void> {
  try {
    const { detectProject } = await import('../project/detector.js');
    const { getProjectDataDir } = await import('../store/persistence.js');
    const proj = detectProject(process.cwd());
    if (!proj) { state.outputLines.push(`${YELLOW}No project detected.${RESET}`); return; }
    const dataDir = await getProjectDataDir(proj.id);
    state.outputLines.push(`${GREEN}Project${RESET}`);
    state.outputLines.push(`  ${DIM}Name:${RESET}    ${WHITE}${proj.name}${RESET}`);
    state.outputLines.push(`  ${DIM}ID:${RESET}      ${WHITE}${proj.id}${RESET}`);
    state.outputLines.push(`  ${DIM}Root:${RESET}    ${WHITE}${proj.rootPath}${RESET}`);
    state.outputLines.push(`  ${DIM}Remote:${RESET}  ${WHITE}${proj.gitRemote || 'none'}${RESET}`);
    state.outputLines.push(`  ${DIM}Data:${RESET}    ${WHITE}${dataDir}${RESET}`);
  } catch (err) {
    state.outputLines.push(`${YELLOW}Error: ${err instanceof Error ? err.message : err}${RESET}`);
  }
}

// ── Main Entry ─────────────────────────────────────────────────
export async function startWorkbench(): Promise<void> {
  // Enter alternate screen
  process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE + CLEAR_SCREEN);

  // Enable raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const state: WorkbenchState = {
    input: '',
    cursorPos: 0,
    showSlashMenu: false,
    slashMenuIndex: 0,
    filteredCommands: [],
    outputLines: [],
    headerLines: [],
    running: true,
    statusLine: '',
  };

  // Detect header info
  try {
    state.headerLines = await detectHeader();
  } catch {
    state.headerLines = [`  ${DIM}(detecting project...)${RESET}`];
  }

  // Clean exit handler
  const cleanup = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // Handle terminal resize
  process.stdout.on('resize', () => render(state));

  // Initial render
  render(state);

  // Input loop
  return new Promise<void>((resolve) => {
    process.stdin.on('data', async (data: Buffer) => {
      if (!state.running) return;

      const key = data.toString('utf-8');
      const code = data[0];

      // Ctrl+C — exit
      if (code === 3) {
        state.running = false;
        cleanup();
        process.exit(0);
      }

      // Escape — clear input or close menu
      if (code === 27 && data.length === 1) {
        if (state.showSlashMenu) {
          state.showSlashMenu = false;
        } else {
          state.input = '';
          state.cursorPos = 0;
          state.outputLines = [];
        }
        render(state);
        return;
      }

      // Arrow keys in slash menu
      if (state.showSlashMenu && data.length === 3 && data[0] === 27 && data[1] === 91) {
        if (data[2] === 65) { // Up
          state.slashMenuIndex = Math.max(0, state.slashMenuIndex - 1);
          render(state);
          return;
        }
        if (data[2] === 66) { // Down
          state.slashMenuIndex = Math.min(state.filteredCommands.length - 1, state.slashMenuIndex + 1);
          render(state);
          return;
        }
      }

      // Enter
      if (code === 13) {
        if (state.showSlashMenu && state.filteredCommands.length > 0) {
          // Accept selected slash command
          const selected = state.filteredCommands[state.slashMenuIndex];
          state.input = selected.name + ' ';
          state.cursorPos = state.input.length;
          state.showSlashMenu = false;
          render(state);
          return;
        }
        // Execute input
        const input = state.input;
        state.input = '';
        state.cursorPos = 0;
        state.showSlashMenu = false;
        state.outputLines.push('');
        render(state);
        await executeCommand(state, input);
        if (!state.running) {
          cleanup();
          resolve();
          return;
        }
        render(state);
        return;
      }

      // Backspace
      if (code === 127 || code === 8) {
        if (state.cursorPos > 0) {
          state.input = state.input.slice(0, state.cursorPos - 1) + state.input.slice(state.cursorPos);
          state.cursorPos--;
        }
        updateSlashMenu(state);
        render(state);
        return;
      }

      // Tab — autocomplete slash command
      if (code === 9 && state.showSlashMenu && state.filteredCommands.length > 0) {
        const selected = state.filteredCommands[state.slashMenuIndex];
        state.input = selected.name + ' ';
        state.cursorPos = state.input.length;
        state.showSlashMenu = false;
        render(state);
        return;
      }

      // Printable character
      if (key.length === 1 && code >= 32) {
        state.input = state.input.slice(0, state.cursorPos) + key + state.input.slice(state.cursorPos);
        state.cursorPos++;
        updateSlashMenu(state);
        render(state);
        return;
      }
    });
  });
}

function updateSlashMenu(state: WorkbenchState): void {
  if (state.input.startsWith('/')) {
    const partial = state.input.toLowerCase();
    // Don't show menu if there's already a space (command + argument)
    if (partial.includes(' ')) {
      state.showSlashMenu = false;
      return;
    }
    state.filteredCommands = SLASH_COMMANDS.filter(c =>
      c.name.startsWith(partial) || (c.alias && c.alias.startsWith(partial))
    );
    state.showSlashMenu = state.filteredCommands.length > 0;
    state.slashMenuIndex = Math.min(state.slashMenuIndex, Math.max(0, state.filteredCommands.length - 1));
  } else {
    state.showSlashMenu = false;
  }
}
