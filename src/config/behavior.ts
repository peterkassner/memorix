/**
 * Behavior Configuration Reader
 *
 * Reads behavior settings from memorix.yml, with ~/.memorix/config.json as a
 * legacy fallback.
 * Falls back to sensible defaults if config is missing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadYamlConfig } from './yaml-loader.js';

export interface BehaviorConfig {
  sessionInject: 'full' | 'minimal' | 'silent';
  syncAdvisory: boolean;
  autoCleanup: boolean;
  formationMode: 'shadow' | 'active' | 'fallback';
}

const DEFAULTS: BehaviorConfig = {
  sessionInject: 'minimal',
  syncAdvisory: true,
  autoCleanup: true,
  formationMode: 'active',
};

let cached: BehaviorConfig | null = null;

/**
 * Load behavior config from ~/.memorix/config.json.
 * Caches after first read. Returns defaults if file is missing.
 */
export function getBehaviorConfig(): BehaviorConfig {
  if (cached) return cached;

  try {
    const yamlBehavior = loadYamlConfig().behavior ?? {};
    const configPath = join(homedir(), '.memorix', 'config.json');
    let legacyBehavior: Partial<BehaviorConfig> = {};
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      legacyBehavior = config.behavior ?? {};
    } catch { /* legacy file is optional */ }
    const behavior = { ...legacyBehavior, ...yamlBehavior };

    cached = {
      sessionInject: behavior.sessionInject ?? DEFAULTS.sessionInject,
      syncAdvisory: behavior.syncAdvisory ?? DEFAULTS.syncAdvisory,
      autoCleanup: behavior.autoCleanup ?? DEFAULTS.autoCleanup,
      formationMode: behavior.formationMode ?? DEFAULTS.formationMode,
    };
  } catch {
    cached = { ...DEFAULTS };
  }

  return cached;
}

/**
 * Reset cached config (for testing or after config change).
 */
export function resetBehaviorConfigCache(): void {
  cached = null;
}
