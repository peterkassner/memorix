/**
 * Memorix TUI Theme — Colors, constants, and slash command definitions
 *
 * Design: dark, calm, infrastructural — inspired by opencode
 */

// ── Slash Commands ─────────────────────────────────────────────
export interface SlashCommand {
  name: string;
  description: string;
  alias?: string;
  /** If true, this command exits Ink and runs an interactive @clack/prompts flow */
  interactive?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/search',     description: 'Search memories',          alias: '/s' },
  { name: '/remember',   description: 'Store a quick memory',     alias: '/r' },
  { name: '/recent',     description: 'Recent memory activity',   alias: '/v' },
  { name: '/doctor',     description: 'Run diagnostics',          alias: '/d' },
  { name: '/project',    description: 'Current project info',     alias: '/p' },
  { name: '/background', description: 'Control plane service',    alias: '/bg' },
  { name: '/dashboard',  description: 'Open web dashboard',       alias: '/dash' },
  { name: '/home',       description: 'Back to home',             alias: '/h' },
  { name: '/configure',  description: 'Settings',                 alias: '/config', interactive: true },
  { name: '/integrate',  description: 'Set up an IDE',            alias: '/setup', interactive: true },
  { name: '/cleanup',    description: 'Cleanup & purge' },
  { name: '/ingest',     description: 'Git -> Memory' },
  { name: '/help',       description: 'Show commands',            alias: '/?' },
  { name: '/exit',       description: 'Exit workbench',           alias: '/q' },
];

// ── Type Icons ─────────────────────────────────────────────────
export const TYPE_ICONS: Record<string, string> = {
  gotcha: '!',
  decision: 'D',
  'problem-solution': 'S',
  discovery: '?',
  'how-it-works': 'H',
  'what-changed': 'C',
  'trade-off': 'T',
  reasoning: 'R',
  'session-request': '⊙',
  'why-it-exists': 'W',
};

// ── Color Palette ──────────────────────────────────────────────
// Ink uses chalk-style color names or hex
export const COLORS = {
  accent: 'cyan',
  accentDim: '#5f8787',
  success: '#5faf5f',
  warning: '#d7af5f',
  error: '#af5f5f',
  muted: 'gray',
  text: 'white',
  textDim: '#808080',
  border: '#444444',
  highlight: '#3a3a3a',
  brand: 'cyan',
} as const;

// ── Box Drawing ────────────────────────────────────────────────
export const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  lt: '├', rt: '┤', tt: '┬', bt: '┴',
  cross: '┼',
} as const;

// ── View Types ─────────────────────────────────────────────────
export type ViewType = 'home' | 'search' | 'doctor' | 'project' | 'background' | 'dashboard' | 'recent' | 'cleanup' | 'ingest';
