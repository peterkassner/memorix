<p align="center">
  <img src="assets/logo.png" alt="Memorix" width="120">
</p>

<h1 align="center">Memorix</h1>

<p align="center">
  <strong>Persistent memory layer for AI coding agents.</strong><br>
  One MCP server. Ten agents. Zero context loss.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/v/memorix.svg?style=flat-square&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/dm/memorix.svg?style=flat-square&color=blue" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg?style=flat-square" alt="license"></a>
  <a href="https://github.com/AVIDS2/memorix"><img src="https://img.shields.io/github/stars/AVIDS2/memorix?style=flat-square&color=yellow" alt="stars"></a>
  <img src="https://img.shields.io/badge/tests-753%20passed-brightgreen?style=flat-square" alt="tests">
</p>

<p align="center">
  <strong>v1.0 Stable | 22 MCP tools | Auto-cleanup | Multi-agent collaboration | 10 IDEs supported</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/-Cursor-orange?style=flat-square" alt="Cursor">
  <img src="https://img.shields.io/badge/-Windsurf-blue?style=flat-square" alt="Windsurf">
  <img src="https://img.shields.io/badge/-Claude%20Code-purple?style=flat-square" alt="Claude Code">
  <img src="https://img.shields.io/badge/-Codex-green?style=flat-square" alt="Codex">
  <img src="https://img.shields.io/badge/-Copilot-lightblue?style=flat-square" alt="Copilot">
  <img src="https://img.shields.io/badge/-Kiro-red?style=flat-square" alt="Kiro">
  <img src="https://img.shields.io/badge/-Antigravity-grey?style=flat-square" alt="Antigravity">
  <img src="https://img.shields.io/badge/-OpenCode-teal?style=flat-square" alt="OpenCode">
  <img src="https://img.shields.io/badge/-Trae-FF6B35?style=flat-square" alt="Trae">
  <img src="https://img.shields.io/badge/-Gemini%20CLI-4285F4?style=flat-square" alt="Gemini CLI">
</p>

<p align="center">
  <a href="README.zh-CN.md">中文文档</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="docs/SETUP.md">Setup Guide</a>
</p>

---

## Introduction

AI coding agents lose all context between sessions. Switch IDEs and previous decisions, debugging history, and architectural knowledge are gone. Memorix provides a shared, persistent memory layer across agents and sessions — storing decisions, gotchas, and project knowledge that any agent can retrieve instantly.

```
Session 1 (Cursor):      "Use JWT with refresh tokens, 15-min expiry"  → stored as decision
Session 2 (Claude Code): "Add login endpoint"  → retrieves the decision → implements correctly
```

No re-explaining. No copy-pasting. No vendor lock-in.

### Core Capabilities

- **Cross-Agent Memory**: All agents share the same memory store. Store in Cursor, retrieve in Claude Code.
- **Multi-Agent Collaboration**: Team tools for agent coordination — join/leave, file locks, task boards, and cross-IDE messaging via shared `team-state.json`.
- **Auto-Cleanup on Startup**: Background retention archiving and intelligent deduplication (LLM or heuristic) run automatically — zero manual maintenance.
- **Dual-Mode Quality**: Free heuristic engine for basic dedup; optional LLM mode for intelligent compression, reranking, and conflict resolution.
- **3-Layer Progressive Disclosure**: Search returns compact indices (~50 tokens/result), timeline shows chronological context, detail provides full content. ~10x token savings over full-text retrieval.
- **Mini-Skills**: Promote high-value observations to permanent skills that auto-inject at every session start. Critical knowledge never decays.
- **Auto-Memory Hooks**: Automatically capture decisions, errors, and gotchas from IDE tool calls. Pattern detection in English and Chinese.
- **Knowledge Graph**: Entity-relation model compatible with [MCP Official Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory). Auto-creates relations from entity extraction.

---

## Quick Start

```bash
npm install -g memorix
```

Add to your agent's MCP config:

<details open>
<summary><strong>Cursor</strong> · <code>.cursor/mcp.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add memorix -- memorix serve
```
</details>

<details>
<summary><strong>Windsurf</strong> · <code>~/.codeium/windsurf/mcp_config.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>VS Code Copilot</strong> · <code>.vscode/mcp.json</code></summary>

```json
{ "servers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>Codex</strong> · <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.memorix]
command = "memorix"
args = ["serve"]
```
</details>

<details>
<summary><strong>Kiro</strong> · <code>.kiro/settings/mcp.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>Antigravity</strong> · <code>~/.gemini/antigravity/mcp_config.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"], "env": { "MEMORIX_PROJECT_ROOT": "/your/project/path" } } } }
```
</details>

<details>
<summary><strong>OpenCode</strong> · <code>~/.config/opencode/config.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>Trae</strong> · <code>~/%APPDATA%/Trae/User/mcp.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

<details>
<summary><strong>Gemini CLI</strong> · <code>.gemini/settings.json</code></summary>

```json
{ "mcpServers": { "memorix": { "command": "memorix", "args": ["serve"] } } }
```
</details>

Restart your agent. No API keys required. No cloud. No external dependencies.

> **Auto-update**: Memorix checks for updates on startup (once per 24h) and self-updates in the background.

> **Note**: Do not use `npx` — it re-downloads on each invocation and causes MCP timeout. Use global install.
>
> [Full setup guide](docs/SETUP.md) · [Troubleshooting](docs/SETUP.md#troubleshooting)

---

## Features

### 22 MCP Tools (Default)

| Category | Tools |
|----------|-------|
| **Memory** | `memorix_store` · `memorix_search` · `memorix_detail` · `memorix_timeline` · `memorix_resolve` · `memorix_deduplicate` · `memorix_suggest_topic_key` |
| **Sessions** | `memorix_session_start` · `memorix_session_end` · `memorix_session_context` |
| **Skills** | `memorix_skills` · `memorix_promote` |
| **Workspace** | `memorix_workspace_sync` · `memorix_rules_sync` |
| **Maintenance** | `memorix_retention` · `memorix_consolidate` · `memorix_transfer` |
| **Team** | `team_manage` · `team_file_lock` · `team_task` · `team_message` |
| **Dashboard** | `memorix_dashboard` |

<details>
<summary><strong>+9 Optional: Knowledge Graph tools</strong> (enable in <code>~/.memorix/settings.json</code>)</summary>

`create_entities` · `create_relations` · `add_observations` · `delete_entities` · `delete_observations` · `delete_relations` · `search_nodes` · `open_nodes` · `read_graph`

Enable with: `{ "knowledgeGraph": true }` in `~/.memorix/settings.json`
</details>

### Observation Types

Nine structured types for classifying stored knowledge:

`session-request` · `gotcha` · `problem-solution` · `how-it-works` · `what-changed` · `discovery` · `why-it-exists` · `decision` · `trade-off`

### Hybrid Search

BM25 fulltext search works out of the box with minimal resources (~50MB RAM). Semantic vector search is opt-in with three provider options:

| Provider | Configuration | Resources | Quality |
|----------|--------------|-----------|---------|
| **API** (recommended) | `MEMORIX_EMBEDDING=api` | Zero local RAM | Highest |
| **fastembed** | `MEMORIX_EMBEDDING=fastembed` | ~300MB RAM | High |
| **transformers** | `MEMORIX_EMBEDDING=transformers` | ~500MB RAM | High |
| **Off** (default) | `MEMORIX_EMBEDDING=off` | ~50MB RAM | BM25 only |

API embedding works with any OpenAI-compatible endpoint — OpenAI, Qwen/DashScope, OpenRouter, Ollama, or any proxy:

```bash
MEMORIX_EMBEDDING=api
MEMORIX_EMBEDDING_API_KEY=sk-xxx
MEMORIX_EMBEDDING_MODEL=text-embedding-3-small
MEMORIX_EMBEDDING_BASE_URL=https://api.openai.com/v1    # optional
MEMORIX_EMBEDDING_DIMENSIONS=512                         # optional
```

Embedding infrastructure includes 10K LRU cache with disk persistence, batch API calls (up to 2048 texts per request), parallel processing (4 concurrent chunks), and text normalization for improved cache hit rates. Zero external dependencies — no Chroma, no SQLite.

For local embedding:

```bash
npm install -g fastembed                     # ONNX runtime
npm install -g @huggingface/transformers     # JS/WASM runtime
```

### LLM Enhanced Mode

Optional LLM integration that significantly improves memory quality. Three capabilities layered on top of the base search:

| Capability | Description | Measured Impact |
|-----------|-------------|-----------------|
| **Narrative Compression** | Compresses verbose observations before storage, preserving all technical facts | 27% token reduction (up to 44% on narrative-heavy content) |
| **Search Reranking** | LLM reranks search results by semantic relevance to the current query | 60% of queries improved, 0% degraded |
| **Compact on Write** | Detects duplicates and conflicts at write time; merges, updates, or skips as appropriate | Prevents redundant storage, resolves contradictions |

Smart filtering ensures LLM calls are only made when beneficial — structured content like commands and file paths is bypassed automatically.

```bash
MEMORIX_LLM_API_KEY=sk-xxx
MEMORIX_LLM_PROVIDER=openai          # openai | anthropic | openrouter | custom
MEMORIX_LLM_MODEL=gpt-4.1-nano       # any chat completion model
MEMORIX_LLM_BASE_URL=https://...     # custom endpoint (optional)
```

Memorix auto-detects existing environment variables:

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENROUTER_API_KEY` | OpenRouter |

**Without LLM**: Free heuristic deduplication (similarity-based rules). **With LLM**: Intelligent compression, contextual reranking, contradiction detection, and fact extraction.

### Mini-Skills

Promote high-value observations to permanent skills using `memorix_promote`. Mini-skills are:

- **Permanent** — exempt from retention decay, never archived
- **Auto-injected** — loaded into context at every `memorix_session_start`
- **Project-scoped** — isolated per project, no cross-project pollution

Use this for critical knowledge that must survive indefinitely: deployment procedures, architectural constraints, recurring gotchas.

### Team Collaboration

Multiple agents working in the same workspace can coordinate via 4 team tools:

| Tool | Actions | Purpose |
|------|---------|---------|
| `team_manage` | join, leave, status | Agent registry — see who's active |
| `team_file_lock` | lock, unlock, status | Advisory file locks to prevent conflicts |
| `team_task` | create, claim, complete, list | Shared task board with dependencies |
| `team_message` | send, broadcast, inbox | Direct and broadcast messaging |

State is persisted to `team-state.json` and shared across all IDE processes. See [TEAM.md](TEAM.md) for the full protocol.

### Auto-Memory Hooks

```bash
memorix hooks install
```

Captures decisions, errors, and gotchas automatically from IDE tool calls. Pattern detection supports English and Chinese. Smart filtering applies 30-second cooldown and skips trivial commands. High-value memories are injected at session start.

### Interactive CLI

```bash
memorix              # Interactive menu
memorix configure    # LLM + Embedding provider setup
memorix status       # Project info and statistics
memorix dashboard    # Web UI at localhost:3210
memorix hooks install # Install auto-capture for IDEs
```

---

## Architecture

```
┌─────────┐  ┌───────────┐  ┌────────────┐  ┌───────┐  ┌──────────┐
│ Cursor  │  │ Claude    │  │ Windsurf   │  │ Codex │  │ +6 more  │
│         │  │ Code      │  │            │  │       │  │          │
└────┬────┘  └─────┬─────┘  └─────┬──────┘  └───┬───┘  └────┬─────┘
     │             │              │              │           │
     └─────────────┴──────┬───────┴──────────────┴───────────┘
                          │ MCP (stdio)
                   ┌──────┴──────┐
                   │   Memorix   │
                   │  MCP Server │
                   └──────┬──────┘
                          │
     ┌──────────┬─────────┼─────────┬──────────┐
     │          │         │         │          │
┌────┴─────┐ ┌─┴───────┐ │  ┌──────┴──────┐ ┌─┴────────┐
│  Search  │ │  Team   │ │  │  Rules &    │ │  Auto-   │
│ Pipeline │ │  Collab │ │  │  Workspace  │ │  Cleanup │
│          │ │         │ │  │  Sync       │ │          │
│ BM25     │ │ Agents  │ │  └─────────────┘ │ Retention│
│ +Vector  │ │ Tasks   │ │                  │ +LLM     │
│ +Rerank  │ │ Locks   │ │                  │  Dedup   │
└──────────┘ │ Msgs    │ │                  └──────────┘
      │      └─────────┘ │
      │           │      │
~/.memorix/data/  │  Knowledge
(local, per-project)  │  Graph
             team-state.json
```

### Search Pipeline

Three-stage retrieval with progressive quality enhancement:

```
Stage 1:  Orama (BM25 + Vector Hybrid)  →  Top-N candidates
Stage 2:  LLM Reranking (optional)      →  Reordered by semantic relevance
Stage 3:  Recency + Project Affinity    →  Final scored results
```

### Write Pipeline

```
Input  →  LLM Compression (optional)  →  Compact on Write (dedup/merge)  →  Store + Index
```

### Key Design Decisions

- **Project isolation**: Auto-detected from `git remote`. Scoped search by default.
- **Shared storage**: All agents read/write `~/.memorix/data/`. Cross-IDE by design.
- **Token efficiency**: 3-layer progressive disclosure (search, timeline, detail). ~10x savings.
- **Graceful degradation**: Every LLM and embedding feature is optional. Core functionality requires zero configuration.

---

## Development

```bash
git clone https://github.com/AVIDS2/memorix.git
cd memorix && npm install

npm run dev       # watch mode
npm test          # 753 tests
npm run build     # production build
```

[Architecture](docs/ARCHITECTURE.md) · [API Reference](docs/API_REFERENCE.md) · [Modules](docs/MODULES.md) · [Design Decisions](docs/DESIGN_DECISIONS.md)

> For AI agents: [`llms.txt`](llms.txt) · [`llms-full.txt`](llms-full.txt)

---

## Acknowledgements

Built on ideas from [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service), [MemCP](https://github.com/maydali28/memcp), [claude-mem](https://github.com/anthropics/claude-code), and [Mem0](https://github.com/mem0ai/mem0).

## Star History

<a href="https://star-history.com/#AVIDS2/memorix&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=AVIDS2/memorix&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=AVIDS2/memorix&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=AVIDS2/memorix&type=Date" width="600" />
 </picture>
</a>

## License

[Apache 2.0](LICENSE)
