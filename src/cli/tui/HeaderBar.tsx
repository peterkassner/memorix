/**
 * HeaderBar — Top status bar for Memorix workbench
 *
 * Single-line dense header: brand left, project center, status badges right
 */

import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';
import type { ProjectInfo, HealthInfo } from './data.js';

interface HeaderBarProps {
  version: string;
  project: ProjectInfo | null;
  health: HealthInfo;
  mode: string;
}

export function HeaderBar({ version, project, health, mode }: HeaderBarProps): React.ReactElement {
  const projectLabel = project ? project.name : 'no project';

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
    >
      {/* Left: Brand */}
      <Box>
        <Text color={COLORS.brand} bold>◆ Memorix</Text>
        <Text color={COLORS.muted}> v{version}</Text>
      </Box>

      {/* Center: Project */}
      <Box>
        <Text color={COLORS.text}>{projectLabel}</Text>
      </Box>

      {/* Right: Status badges */}
      <Box gap={1}>
        <Text color={COLORS.accentDim}>{mode.toLowerCase()}</Text>
        <Text color={COLORS.muted}>·</Text>
        <Text color={
          health.searchMode.includes('hybrid') ? COLORS.success
          : health.searchMode.includes('vector') ? COLORS.accent
          : health.searchMode.includes('rerank') ? COLORS.success
          : COLORS.warning
        }>
          {health.searchMode}
        </Text>
        <Text color={COLORS.muted}>·</Text>
        <Text color={COLORS.text}>{health.activeMemories} memories</Text>
      </Box>
    </Box>
  );
}
