<p align="center">
  <img src="assets/logo.png" alt="Memorix" width="120">
</p>

<h1 align="center">Memorix</h1>

<p align="center">
  <strong>Local-first memory platform for AI coding agents.</strong><br>
  Git truth, reasoning memory, and cross-agent recall in one MCP server.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/v/memorix.svg?style=flat-square&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/memorix"><img src="https://img.shields.io/npm/dm/memorix.svg?style=flat-square&color=blue" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg?style=flat-square" alt="license"></a>
  <a href="https://github.com/AVIDS2/memorix/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/AVIDS2/memorix/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/AVIDS2/memorix"><img src="https://img.shields.io/github/stars/AVIDS2/memorix?style=flat-square&color=yellow" alt="stars"></a>
</p>

<p align="center">
  <strong>Git Memory</strong> · <strong>Reasoning Memory</strong> · <strong>Cross-Agent Recall</strong> · <strong>Control Plane Dashboard</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文文档</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="docs/SETUP.md">Setup Guide</a>
</p>

---

## Why Memorix

Most AI coding agents remember only the current thread. Memorix gives them a shared, persistent memory layer across IDEs, sessions, and projects.

What makes Memorix different:

- **Git Memory**: turn `git commit` into searchable engineering memory with noise filtering and commit provenance.
- **Reasoning Memory**: store why a decision was made, not just what changed.
- **Cross-Agent Local Recall**: Cursor, Windsurf, Claude Code, Codex, Copilot, Kiro, OpenCode, Gemini CLI, and more can read the same local memory base.
- **Memory Quality Pipeline**: formation, compaction, retention, and source-aware retrieval work together instead of acting like isolated tools.

---

## Quick Start

Install globally:

```bash
npm install -g memorix
```

Initialize project config:

```bash
memorix init
```

Memorix uses two files with two roles:

- `memorix.yml` for behavior and project settings
- `.env` for secrets such as API keys

Choose one runtime mode:

```bash
memorix serve
```

Use `serve` for normal stdio MCP integrations.

```bash
memorix serve-http --port 3211
```

Use `serve-http` when you want the HTTP transport, collaboration features, and the dashboard on the same port.

In HTTP control-plane mode, agents should call `memorix_session_start` with `projectRoot` set to the **absolute path of the current workspace or repo root** when that path is available. Git remains the source of truth for the final project identity; `projectRoot` is the detection anchor that keeps parallel sessions from drifting into the wrong project bucket.

Add Memorix to your MCP client:

<details open>
<summary><strong>Cursor</strong> · <code>.cursor/mcp.json</code></summary>

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
<summary><strong>Codex</strong> · <code>~/.codex/config.toml</code></summary>

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
memorix serve-http --port 3211
```

Then open:

- MCP HTTP endpoint: `http://localhost:3211/mcp`
- Dashboard: `http://localhost:3211`

This mode gives you collaboration tools, project identity diagnostics, config provenance, Git Memory views, and the dashboard in one place.

When multiple HTTP sessions are open at once, each session should bind itself with `memorix_session_start(projectRoot=...)` before using project-scoped memory tools.

---

## How It Works

```mermaid
graph TB
    A["git commit / agent tool call / manual store"] --> B["Memorix Runtime"]
    B --> C["Observation / Reasoning / Git Memory"]
    C --> D["Formation + Indexing + Graph + Retention"]
    D --> E["Search / Detail / Timeline / Dashboard / Team"]
```

### Memory Layers

- **Observation Memory**: what changed, how something works, gotchas, problem-solution notes
- **Reasoning Memory**: why a choice was made, alternatives, trade-offs, risks
- **Git Memory**: immutable engineering facts derived from commits

### Retrieval Model

- Default search is **project-scoped**
- `scope="global"` searches across projects
- Global hits can be opened explicitly with project-aware refs
- Source-aware retrieval boosts Git memories for “what changed” questions and reasoning memories for “why” questions

---

## Documentation

### Getting Started

- [Setup Guide](docs/SETUP.md)
- [Configuration Guide](docs/CONFIGURATION.md)

### Product and Architecture

- [Architecture](docs/ARCHITECTURE.md)
- [Memory Formation Pipeline](docs/MEMORY_FORMATION_PIPELINE.md)
- [Design Decisions](docs/DESIGN_DECISIONS.md)

### Reference

- [API Reference](docs/API_REFERENCE.md)
- [Git Memory Guide](docs/GIT_MEMORY.md)
- [Modules](docs/MODULES.md)

### Development

- [Development Guide](docs/DEVELOPMENT.md)
- [Known Issues and Roadmap](docs/KNOWN_ISSUES_AND_ROADMAP.md)

### AI-Facing Project Docs

- [`llms.txt`](llms.txt)
- [`llms-full.txt`](llms-full.txt)

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
