/**
 * .env Loader for Memorix
 *
 * Loads secrets from project-level .env file.
 * This is the "secrets-only" complement to memorix.yml (behavior config).
 *
 * Design principle:
 *   memorix.yml = behavior configuration (structured YAML)
 *   .env        = secrets only (API keys, base URLs, tokens)
 *
 * Priority (highest wins):
 *   1. System environment variables (from MCP host `env` field or shell)
 *   2. Project .env file (./  .env in project root)
 *   3. User .env file (~/.memorix/.env) — advanced, not promoted
 *
 * Unlike Cipher which puts EVERYTHING in .env (178 lines of flat config),
 * Memorix only uses .env for sensitive values. Structured settings stay in YAML.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { config as dotenvConfig, type DotenvConfigOutput } from 'dotenv';

// ─── State ───

let dotenvLoaded = false;
let dotenvProjectRoot: string | null = null;

/** Track which .env files were loaded (for diagnostics) */
const loadedEnvFiles: string[] = [];

// ─── Public API ───

/**
 * Load .env files into process.env.
 * Called once during startup. Does NOT override existing env vars.
 *
 * @param projectRoot - Project root directory (for project-level .env)
 */
export function loadDotenv(projectRoot?: string): void {
  if (dotenvLoaded && dotenvProjectRoot === (projectRoot ?? null)) return;

  loadedEnvFiles.length = 0;

  // Loading order = priority order (with override: false, first value wins).
  // System env vars already exist in process.env, so they always win.

  // 1. Project-level .env — highest .env priority, load first
  if (projectRoot) {
    const projectEnvPath = join(projectRoot, '.env');
    if (existsSync(projectEnvPath)) {
      const result = dotenvConfig({ path: projectEnvPath, override: false });
      if (!result.error) loadedEnvFiles.push(projectEnvPath);
    }
  }

  // 2. User-level .env (~/.memorix/.env) — lowest .env priority, load second
  //    (override: false means it only fills in keys not already set)
  const userEnvPath = join(homedir(), '.memorix', '.env');
  if (existsSync(userEnvPath)) {
    const result = dotenvConfig({ path: userEnvPath, override: false });
    if (!result.error) loadedEnvFiles.push(userEnvPath);
  }

  dotenvLoaded = true;
  dotenvProjectRoot = projectRoot ?? null;
}

/**
 * Reset dotenv state (for testing or project switch).
 */
export function resetDotenv(): void {
  dotenvLoaded = false;
  dotenvProjectRoot = null;
  loadedEnvFiles.length = 0;
}

/**
 * Get list of .env files that were loaded (for diagnostics).
 */
export function getLoadedEnvFiles(): readonly string[] {
  return loadedEnvFiles;
}

// ─── Supported .env variables ───
// These are the ONLY variables Memorix reads from .env.
// All are secrets or endpoint URLs — no behavior config.
//
// MEMORIX_LLM_API_KEY      — LLM provider API key
// MEMORIX_LLM_BASE_URL     — Custom LLM endpoint
// MEMORIX_EMBEDDING_API_KEY — Embedding API key (falls back to LLM key)
// MEMORIX_EMBEDDING_BASE_URL — Custom embedding endpoint
// MEMORIX_API_KEY           — Unified fallback key (for both LLM + embedding)
// OPENAI_API_KEY            — OpenAI compatibility (lowest priority)
// ANTHROPIC_API_KEY         — Anthropic compatibility
// OPENROUTER_API_KEY        — OpenRouter compatibility
