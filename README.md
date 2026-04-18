<p align="center">
  <img src="https://raw.githubusercontent.com/AVIDS2/memorix/main/assets/readme-logo-bridge.png" alt="Memorix Bridge" width="720">
</p>

<h1 align="center">Memorix</h1>

<p align="center">
  <strong>Open-source cross-agent memory layer for coding agents.</strong><br>
  Tiered MCP support across Cursor, Claude Code, Codex, Windsurf, Gemini CLI, GitHub Copilot, Kiro, OpenCode, Antigravity, and Trae.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/v/memorix.svg?style=flat-square&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/dm/memorix.svg?style=flat-square&color=blue" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg?style=flat-square" alt="license"></a>
  <a href="https://github.com/AVIDS2/memorix/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/AVIDS2/memorix/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/AVIDS2/memorix"><img src="https://img.shields.io/github/stars/AVIDS2/memorix?style=flat-square&color=yellow" alt="stars"></a>
</p>

<p align="center">
  <strong>Git Memory</strong> | <strong>Reasoning Memory</strong> | <strong>Cross-Agent Recall</strong> | <strong>Control Plane Dashboard</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">Chinese</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#docker">Docker</a> |
  <a href="#supported-clients">Supported Clients</a> |
  <a href="#core-workflows">Core Workflows</a> |
  <a href="#documentation">Documentation</a> |
  <a href="docs/SETUP.md">Setup Guide</a>
</p>

---

## For Coding Agents

If you are using an AI coding agent to install or operate Memorix, have it read the [Agent Operator Playbook](docs/AGENT_OPERATOR_PLAYBOOK.md) first.

That playbook is the canonical AI-facing guide for:

- installation and runtime-mode selection
- Git/project binding rules
- stdio vs HTTP control-plane setup
- per-agent integration and hooks
- generated dot-directory behavior
- troubleshooting and safe operating rules

## Why Memorix

**The only cross-agent memory layer that preserves Git truth, reasoning context, and local control — across 10 IDEs and agents.**

Most coding agents remember only the current thread. Memorix gives them a shared, persistent memory layer across IDEs, sessions, and projects.

<table>
<tr><td><b>Git Memory</b></td><td>Turn <code>git commit</code> into searchable engineering memory with noise filtering and commit provenance.</td></tr>
<tr><td><b>Reasoning Memory</b></td><td>Store why a decision was made, not just what changed — alternatives, trade-offs, risks.</td></tr>
<tr><td><b>Cross-Agent Recall</b></td><td>Multiple IDEs and agents read the same local memory base instead of living in isolated silos.</td></tr>
<tr><td><b>Memory Quality Pipeline</b></td><td>Formation, compaction, retention, and source-aware retrieval work together instead of acting like isolated tools.</td></tr>
</table>

## Supported Clients

| Tier | Clients |
|------|---------|
| ★ Core | Claude Code, Cursor, Windsurf |
| ◆ Extended | GitHub Copilot, Kiro, Codex |
| ○ Community | Gemini CLI, OpenCode, Antigravity, Trae |

**Core** = full hook integration + tested MCP + rules sync. **Extended** = hook integration with platform caveats. **Community** = best-effort hooks, community-reported compatibility.

If a client can speak MCP and launch a local command or HTTP endpoint, it can usually connect to Memorix even if it is not in the list above yet.

---

## Quick Start

Install globally:

```bash
npm install -g memorix
```

Initialize Memorix config:

```bash
memorix init
```

`memorix init` lets you choose between `Global defaults` and `Project config`.

Memorix uses two files with two roles:

- `memorix.yml` for behavior and project settings
- `.env` for secrets such as API keys

Then pick the path that matches what you want to do:

| You want | Run | Best for |
| --- | --- | --- |
| Quick MCP setup inside one IDE | `memorix serve` | Cursor, Claude Code, Codex, Windsurf, Gemini CLI, and other stdio MCP clients |
| Dashboard + long-lived HTTP MCP in the background | `memorix background start` | Daily use, multiple agents, collaboration, dashboard |
| Foreground HTTP mode for debugging or a custom port | `memorix serve-http --port 3211` | Manual supervision, debugging, custom launch control |

Most users should choose **one** of the first two options above.

Companion commands: `memorix background status|logs|stop`. For multi-workspace HTTP sessions, bind with `memorix_session_start(projectRoot=...)`.

Deeper details on startup, project binding, config precedence, and agent workflows: [docs/SETUP.md](docs/SETUP.md) and the [Agent Operator Playbook](docs/AGENT_OPERATOR_PLAYBOOK.md).

## Docker

Memorix now includes an official Docker path for the **HTTP control plane**.

Quick start:

```bash
docker compose up --build -d
```

Then connect to:

- dashboard: `http://localhost:3211`
- MCP: `http://localhost:3211/mcp`

Important: Docker support is for `serve-http`, not `memorix serve`. Project-scoped Git/config behavior only works when the container can see the repositories it is asked to bind.

Full Docker guide: [docs/DOCKER.md](docs/DOCKER.md)

Add Memorix to your MCP client:

### Generic stdio MCP config

```json
{
  "mcpServers": {
    "memorix": {
      "command": "memorix",
      "args": ["serve"]
    }
  }
}
```

### Generic HTTP MCP config

```json
{
  "mcpServers": {
    "memorix": {
      "transport": "http",
      "url": "http://localhost:3211/mcp"
    }
  }
}
```

The per-client examples below show the simplest stdio shape. If you prefer the shared HTTP control plane, keep the generic HTTP block above and use the client-specific variants in [docs/SETUP.md](docs/SETUP.md).

<details open>
<summary><strong>Cursor</strong> | <code>.cursor/mcp.json</code></summary>

```json
{
  "mcpServers": {
    "memorix": {
      "command": "memorix",
      "args": ["serve"]
    }
  }
}
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add memorix -- memorix serve
```
</details>

<details>
<summary><strong>Codex</strong> | <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.memorix]
command = "memorix"
args = ["serve"]
```
</details>

For the full IDE matrix, Windows notes, and troubleshooting, see [docs/SETUP.md](docs/SETUP.md).

---

## Core Workflows

### 1. Store and retrieve memory

Use MCP tools such as:

- `memorix_store`
- `memorix_search`
- `memorix_detail`
- `memorix_timeline`
- `memorix_resolve`

This covers decisions, gotchas, problem-solution notes, and session handoff context.

### 2. Capture Git truth automatically

Install the post-commit hook:

```bash
memorix git-hook --force
```

Or ingest manually:

```bash
memorix ingest commit
memorix ingest log --count 20
```

Git memories are stored with `source='git'`, commit hashes, changed files, and noise filtering.

### 3. Run the control plane

```bash
memorix background start
```

Then open:

- MCP HTTP endpoint: `http://localhost:3211/mcp`
- Dashboard: `http://localhost:3211`

Companion commands:

```bash
memorix background status
memorix background logs
memorix background stop
```

Use `background start` as the default long-lived HTTP mode. If you need to keep the control plane in the foreground for debugging or manual supervision, use:

```bash
memorix serve-http --port 3211
```

This HTTP mode gives you collaboration tools, project identity diagnostics, config provenance, Git Memory views, and the dashboard in one place.

When multiple HTTP sessions are open at once, each session should bind itself with `memorix_session_start(projectRoot=...)` before using project-scoped memory tools.

---

## How It Works

```mermaid
flowchart LR
    subgraph Ingress["Ingress Surfaces"]
        A1["Git hooks / ingest"]
        A2["MCP tools"]
        A3["CLI / TUI"]
        A4["HTTP dashboard"]
    end

    subgraph Runtime["Memorix Runtime"]
        B1["stdio MCP server"]
        B2["HTTP control plane"]
        B3["project binding + config"]
    end

    subgraph Memory["Memory Substrates"]
        C1["Observation memory"]
        C2["Reasoning memory"]
        C3["Git memory"]
        C4["Session + team state"]
    end

    subgraph Processing["Async Processing"]
        D1["Formation pipeline"]
        D2["Embedding + indexing"]
        D3["Graph linking"]
        D4["Dedup + retention"]
    end

    subgraph Consumption["Consumption Surfaces"]
        E1["Search / detail / timeline"]
        E2["Dashboard / team views"]
        E3["Agent recall / handoff"]
    end

    A1 --> B1
    A2 --> B1
    A2 --> B2
    A3 --> B1
    A3 --> B2
    A4 --> B2

    B1 --> B3
    B2 --> B3

    B3 --> C1
    B3 --> C2
    B3 --> C3
    B3 --> C4

    C1 --> D1
    C1 --> D2
    C1 --> D3
    C1 --> D4
    C2 --> D1
    C2 --> D3
    C3 --> D2
    C4 --> D3

    D1 --> E1
    D2 --> E1
    D3 --> E2
    D4 --> E3
    C4 --> E3
```

Memorix is not a single linear pipeline. It accepts memory from multiple ingress surfaces, persists it across multiple substrates, runs several asynchronous quality/indexing branches, and exposes the results through different retrieval and collaboration surfaces.

### Memory Layers

- **Observation Memory**: what changed, how something works, gotchas, problem-solution notes
- **Reasoning Memory**: why a choice was made, alternatives, trade-offs, risks
- **Git Memory**: immutable engineering facts derived from commits

### Retrieval Model

- Default search is **project-scoped**
- `scope="global"` searches across projects
- Global hits can be opened explicitly with project-aware refs
- Source-aware retrieval boosts Git memories for "what changed" questions and reasoning memories for "why" questions

---

## Documentation

📖 **[Docs Map](docs/README.md)** — fastest route to the right document.

| Section | What's Covered |
| --- | --- |
| [Setup Guide](docs/SETUP.md) | Install, stdio vs HTTP control plane, per-client config |
| [Docker Deployment](docs/DOCKER.md) | Official container image path, compose, healthcheck, and path caveats |
| [Configuration](docs/CONFIGURATION.md) | `memorix.yml`, `.env`, project overrides |
| [Agent Operator Playbook](docs/AGENT_OPERATOR_PLAYBOOK.md) | Canonical AI-facing guide for installation, binding, hooks, troubleshooting |
| [Architecture](docs/ARCHITECTURE.md) | System shape, memory layers, data flows, module map |
| [API Reference](docs/API_REFERENCE.md) | MCP / HTTP / CLI command surface |
| [Git Memory Guide](docs/GIT_MEMORY.md) | Ingestion, noise filtering, retrieval semantics |
| [Development Guide](docs/DEVELOPMENT.md) | Contributor workflow, build, test, release |

Additional deep references:

- [Memory Formation Pipeline](docs/MEMORY_FORMATION_PIPELINE.md)
- [Design Decisions](docs/DESIGN_DECISIONS.md)
- [Modules](docs/MODULES.md)
- [Known Issues and Roadmap](docs/KNOWN_ISSUES_AND_ROADMAP.md)
- [AI Context Note](docs/AI_CONTEXT.md)
- [`llms.txt`](llms.txt)
- [`llms-full.txt`](llms-full.txt)

---

## What's New in 1.0.8

Version `1.0.8` keeps the 1.0.7 coordination/storage/team baseline and adds an official Docker deployment path for the HTTP control plane.

- **Multi-Agent Coordinator**: `memorix orchestrate` runs a structured coordination loop — plan → parallel execution → verify gates → fix loops → review → merge. Supports Claude, Codex, Gemini CLI, and OpenCode with capability routing, worktree isolation, and agent fallback.
- **SQLite Canonical Store**: Observations, mini-skills, sessions, and archives now use SQLite as the single source of truth with shared DB handle and freshness-safe retrieval.
- **Team Identity**: Agent registration, heartbeat, task board, handoff artifacts, and stale detection for multi-agent collaboration.
- **Docker Deployment**: Official `Dockerfile`, `compose.yaml`, healthcheck, and explicit path-truth docs for running the HTTP control plane in a container.
- **Configurable Timeouts**: `MEMORIX_LLM_TIMEOUT_MS` (default 30s) and `MEMORIX_RERANK_TIMEOUT_MS` (default 5s) for slow API providers.
- **Cursor stdio fix**: No longer exits when workspace root is unavailable — starts in deferred-binding mode instead.

---

## Development

```bash
git clone https://github.com/AVIDS2/memorix.git
cd memorix
npm install

npm run dev
npm test
npm run build
```

Key local commands:

```bash
memorix status
memorix dashboard
memorix background start
memorix serve-http --port 3211
memorix git-hook --force
```

---

## Acknowledgements

Memorix builds on ideas from [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service), [MemCP](https://github.com/maydali28/memcp), [claude-mem](https://github.com/anthropics/claude-code), [Mem0](https://github.com/mem0ai/mem0), and the broader MCP ecosystem.

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
