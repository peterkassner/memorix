/**
 * Panels — Content panels for the main work area
 *
 * HomeView, SearchResultsView, DoctorView, ProjectView, BackgroundView
 */

import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, TYPE_ICONS } from './theme.js';
import type {
  MemoryItem,
  SearchResult,
  DoctorResult,
  ProjectInfo,
  BackgroundInfo,
} from './data.js';

// ── Source Badge Colors ────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  git: '#5faf5f',
  agent: 'cyan',
  hook: '#d7af5f',
  session: '#af87d7',
  manual: '#5f87af',
  skill: '#87afaf',
  reasoning: '#af87af',
};

function sourceBadge(source: string): string {
  return source || '?';
}

// ── Lightweight grouping for Recent Activity ──────────────────

interface GroupedItem extends MemoryItem {
  count: number;
}

function groupRecent(items: MemoryItem[]): GroupedItem[] {
  if (items.length === 0) return [];
  const groups: GroupedItem[] = [];
  let current: GroupedItem = { ...items[0], count: 1 };

  for (let i = 1; i < items.length; i++) {
    const m = items[i];
    // Group if same entity or very similar title prefix (first 20 chars)
    const sameEntity = current.entityName && m.entityName && current.entityName === m.entityName;
    const similarTitle = current.title.slice(0, 20) === m.title.slice(0, 20);
    if (sameEntity || similarTitle) {
      current.count++;
    } else {
      groups.push(current);
      current = { ...m, count: 1 };
    }
  }
  groups.push(current);
  return groups;
}

// ── Landing View (center-first workbench) ─────────────────────

interface LandingViewProps {
  recentMemories: MemoryItem[];
  highValueSignals: MemoryItem[];
  project: ProjectInfo | null;
  background: BackgroundInfo;
  health: { activeMemories: number; searchMode: string; embeddingProvider: string };
  loading: boolean;
}

const LANDING_ACTIONS = [
  { key: 's', label: 'Search',     cmd: '/search' },
  { key: 'r', label: 'Remember',   cmd: '/remember' },
  { key: 'd', label: 'Doctor',     cmd: '/doctor' },
  { key: 'b', label: 'Background', cmd: '/background' },
  { key: 'w', label: 'Dashboard',  cmd: '/dashboard' },
  { key: 'c', label: 'Configure',  cmd: '/configure' },
];

export function LandingView({ recentMemories, highValueSignals, project, background, health, loading }: LandingViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Brand block */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={COLORS.accent} bold>{'  '}◇ Memorix</Text>
        <Text color={COLORS.muted}>Memory workbench for code and agents</Text>
      </Box>

      {/* Project + system status — single compact line */}
      <Box justifyContent="center" marginBottom={1}>
        <Text color={COLORS.text}>{project?.name || 'no project'}</Text>
        <Text color={COLORS.muted}> · </Text>
        <Text color={COLORS.textDim}>{health.activeMemories} memories</Text>
        <Text color={COLORS.muted}> · </Text>
        <Text color={health.searchMode.includes('hybrid') ? COLORS.success : COLORS.warning}>{health.searchMode}</Text>
        <Text color={COLORS.muted}> · </Text>
        <Text color={background.healthy ? COLORS.success : background.running ? COLORS.warning : COLORS.muted}>
          {background.healthy ? 'bg running' : background.running ? 'bg unhealthy' : 'bg stopped'}
        </Text>
      </Box>

      {/* Suggested Actions — compact chip row */}
      <Box justifyContent="center" gap={2} marginBottom={1}>
        {LANDING_ACTIONS.map((a) => (
          <Box key={a.key}>
            <Text color={COLORS.accentDim} bold>{a.key}</Text>
            <Text color={COLORS.text}> {a.label}</Text>
          </Box>
        ))}
      </Box>

      {/* Current Focus — top signals */}
      {!loading && highValueSignals.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={COLORS.accent} bold>Focus</Text>
          {highValueSignals.map((m) => (
            <Box key={m.id}>
              <Text color={SOURCE_COLORS[m.source] || COLORS.muted}>{sourceBadge(m.source).padEnd(6)} </Text>
              <Text color={COLORS.warning}>{(TYPE_ICONS[m.type] || '·')} </Text>
              <Text color={COLORS.text} bold>{m.title.slice(0, 60)}{m.title.length > 60 ? '...' : ''}</Text>
              <Text color={COLORS.textDim}> #{m.id}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Recent Activity — grouped */}
      {!loading && recentMemories.length > 0 && (
        <Box flexDirection="column">
          <Text color={COLORS.accentDim} bold>Recent</Text>
          {groupRecent(recentMemories).map((item, idx) =>
            item.count > 1 ? (
              <Box key={`g-${idx}`}>
                <Text color={SOURCE_COLORS[item.source] || COLORS.muted}>{sourceBadge(item.source).padEnd(6)} </Text>
                <Text color={COLORS.muted}>  </Text>
                <Text color={COLORS.textDim}>{item.count} related: </Text>
                <Text color={COLORS.text}>{item.title.slice(0, 50)}{item.title.length > 50 ? '...' : ''}</Text>
              </Box>
            ) : (
              <Box key={item.id}>
                <Text color={SOURCE_COLORS[item.source] || COLORS.muted}>{sourceBadge(item.source).padEnd(6)} </Text>
                <Text color={COLORS.muted}>{(TYPE_ICONS[item.type] || '·')} </Text>
                <Text color={COLORS.textDim}>#{item.id} </Text>
                <Text color={COLORS.text}>{item.title.slice(0, 55)}{item.title.length > 55 ? '...' : ''}</Text>
              </Box>
            )
          )}
        </Box>
      )}

      {loading && <Text color={COLORS.muted}>Loading...</Text>}
    </Box>
  );
}

// ── Search Results View ────────────────────────────────────────

interface SearchResultsViewProps {
  results: SearchResult[];
  query: string;
  loading: boolean;
}

export function SearchResultsView({ results, query, loading }: SearchResultsViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={COLORS.accent} bold>Search: </Text>
        <Text color={COLORS.text}>"{query}"</Text>
        {!loading && <Text color={COLORS.muted}> — {results.length} results</Text>}
      </Box>

      {loading ? (
        <Text color={COLORS.muted}>Searching...</Text>
      ) : results.length === 0 ? (
        <Text color={COLORS.muted}>No results found.</Text>
      ) : (
        results.map((r) => (
          <Box key={r.id}>
            <Text color={COLORS.muted}>[{r.icon}] </Text>
            <Text color={COLORS.textDim}>#{r.id} </Text>
            <Text color={COLORS.text}>{r.title.slice(0, 60)}{r.title.length > 60 ? '…' : ''}</Text>
            <Text color={COLORS.muted}> ({(r.score * 100).toFixed(0)}%)</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

// ── Doctor View ────────────────────────────────────────────────

interface DoctorViewProps {
  doctor: DoctorResult | null;
  loading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ok: COLORS.success,
  warn: COLORS.warning,
  error: COLORS.error,
  info: COLORS.textDim,
};

const STATUS_ICONS: Record<string, string> = {
  ok: '✓',
  warn: '⚠',
  error: '✗',
  info: '·',
};

export function DoctorView({ doctor, loading }: DoctorViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.accent} bold>Diagnostics</Text>

      {loading ? (
        <Text color={COLORS.muted}>Running diagnostics...</Text>
      ) : !doctor ? (
        <Text color={COLORS.warning}>Failed to run diagnostics.</Text>
      ) : (
        doctor.sections.map((section, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={COLORS.text} bold>{section.title}</Text>
            {section.items.map((item, j) => (
              <Box key={j}>
                <Text color={STATUS_COLORS[item.status] || COLORS.muted}>
                  {STATUS_ICONS[item.status] || '·'}{' '}
                </Text>
                <Text color={COLORS.muted}>{item.label.padEnd(12)}</Text>
                <Text color={COLORS.text}>{item.value}</Text>
              </Box>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}

// ── Project View ───────────────────────────────────────────────

interface ProjectViewProps {
  project: ProjectInfo | null;
}

export function ProjectView({ project }: ProjectViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.accent} bold>Project Details</Text>

      {!project ? (
        <Text color={COLORS.warning}>No project detected. Run git init first.</Text>
      ) : (
        <Box flexDirection="column">
          {([
            ['Name', project.name],
            ['ID', project.id],
            ['Root', project.rootPath],
            ['Remote', project.gitRemote],
          ] as const).map(([label, value]) => (
            <Box key={label}>
              <Text color={COLORS.muted}>{String(label).padEnd(10)}</Text>
              <Text color={COLORS.text}>{value}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Background View ────────────────────────────────────────────

interface BackgroundViewProps {
  background: BackgroundInfo;
  loading: boolean;
}

export function BackgroundView({ background, loading }: BackgroundViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.accent} bold>Background Control Plane</Text>

      {loading ? (
        <Text color={COLORS.muted}>Checking status...</Text>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text color={COLORS.muted}>{'Status'.padEnd(12)}</Text>
            <Text color={background.healthy ? COLORS.success : background.running ? COLORS.warning : COLORS.muted}>
              {background.healthy ? '✓ Running & Healthy' : background.running ? '⚠ Running (unhealthy)' : '✗ Not running'}
            </Text>
          </Box>
          {background.pid && (
            <Box>
              <Text color={COLORS.muted}>{'PID'.padEnd(12)}</Text>
              <Text color={COLORS.text}>{background.pid}</Text>
            </Box>
          )}
          {background.port && (
            <>
              <Box>
                <Text color={COLORS.muted}>{'Port'.padEnd(12)}</Text>
                <Text color={COLORS.text}>{background.port}</Text>
              </Box>
              <Box>
                <Text color={COLORS.muted}>{'Dashboard'.padEnd(12)}</Text>
                <Text color={COLORS.accent}>{background.dashboard}</Text>
              </Box>
              <Box>
                <Text color={COLORS.muted}>{'MCP'.padEnd(12)}</Text>
                <Text color={COLORS.accent}>{background.mcp}</Text>
              </Box>
            </>
          )}
          {background.startedAt && (
            <Box>
              <Text color={COLORS.muted}>{'Started'.padEnd(12)}</Text>
              <Text color={COLORS.text}>{background.startedAt}</Text>
            </Box>
          )}
          {background.agents != null && (
            <Box>
              <Text color={COLORS.muted}>{'Agents'.padEnd(12)}</Text>
              <Text color={COLORS.text}>{background.agents}</Text>
            </Box>
          )}
          {background.sessions != null && (
            <Box>
              <Text color={COLORS.muted}>{'Sessions'.padEnd(12)}</Text>
              <Text color={COLORS.text}>{background.sessions}</Text>
            </Box>
          )}
          {background.message && (
            <Box marginTop={1}>
              <Text color={COLORS.muted}>{background.message}</Text>
            </Box>
          )}

          {/* Actions */}
          <Box marginTop={1} flexDirection="column">
            <Text color={COLORS.accentDim} bold>Actions</Text>
            {background.running ? (
              <Box flexDirection="column">
                <Text color={COLORS.text}>  memorix background restart</Text>
                <Text color={COLORS.text}>  memorix background stop</Text>
                <Text color={COLORS.text}>  memorix background logs</Text>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Text color={COLORS.success}>  memorix background start</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Dashboard View ─────────────────────────────────────────────

interface DashboardViewProps {
  background: BackgroundInfo;
}

export function DashboardView({ background }: DashboardViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.accent} bold>Dashboard</Text>

      {background.healthy && background.dashboard ? (
        <Box flexDirection="column">
          <Box>
            <Text color={COLORS.muted}>{'URL'.padEnd(8)}</Text>
            <Text color={COLORS.accent} bold>{background.dashboard}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={COLORS.accentDim} bold>Actions</Text>
            <Text color={COLORS.text}>  Open {background.dashboard} in browser</Text>
            <Text color={COLORS.text}>  memorix dashboard (standalone)</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={COLORS.warning}>○ No running control plane</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={COLORS.accentDim} bold>Actions</Text>
            <Text color={COLORS.success}>  memorix background start</Text>
            <Text color={COLORS.text}>  memorix dashboard (standalone)</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Status Message ─────────────────────────────────────────────

interface StatusMessageProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

export function StatusMessage({ message, type }: StatusMessageProps): React.ReactElement {
  const color = type === 'success' ? COLORS.success : type === 'error' ? COLORS.error : COLORS.muted;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '·';
  return (
    <Box paddingX={1}>
      <Text color={color}>{icon} {message}</Text>
    </Box>
  );
}
