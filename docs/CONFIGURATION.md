# Memorix Configuration Guide

Memorix is designed around one simple idea:

- `memorix.yml` controls behavior
- `.env` stores secrets

Everything else exists for compatibility or advanced overrides.

---

## Two Files, Two Roles

### `memorix.yml`

Use `memorix.yml` for structured project behavior:

- LLM provider and model defaults
- embedding mode
- Git-Memory settings
- session injection behavior
- server and dashboard settings
- team or hub-mode options

Recommended location:

- project root: `./memorix.yml`

Optional advanced location:

- user defaults: `~/.memorix/memorix.yml`

### `.env`

Use `.env` for secrets only:

- API keys
- base URLs
- provider tokens

Recommended location:

- project root: `./.env`

Optional advanced location:

- user defaults: `~/.memorix/.env`

---

## Resolution Order

### Behavior settings

For normal configuration values, Memorix resolves in this order:

1. environment variables
2. project `memorix.yml`
3. user `~/.memorix/memorix.yml`
4. legacy `~/.memorix/config.json`
5. hardcoded defaults

### Secrets

For secrets loaded through dotenv, Memorix resolves in this order:

1. system environment variables from the shell or MCP host config
2. project `.env`
3. user `~/.memorix/.env`

This means host-provided env vars always win.

---

## Minimal Example

`memorix.yml`

```yml
llm:
  provider: openai
  model: gpt-4o-mini

embedding:
  provider: off

git:
  autoHook: true
  ingestOnCommit: true
  skipMergeCommits: true

behavior:
  formationMode: active
  sessionInject: minimal

server:
  transport: stdio
  dashboard: true
```

`.env`

```bash
MEMORIX_LLM_API_KEY=sk-...
MEMORIX_EMBEDDING_API_KEY=sk-...
MEMORIX_LLM_BASE_URL=https://api.openai.com/v1
MEMORIX_EMBEDDING_BASE_URL=https://api.openai.com/v1
```

If you do not need LLM or embedding features yet, you can leave `.env` empty and Memorix will still work.

---

## Key Sections in `memorix.yml`

### `llm`

Used for optional LLM-enhanced behavior such as:

- formation quality uplift
- compression
- reranking
- smarter deduplication

Common keys:

- `provider`
- `model`
- `baseUrl`

### `embedding`

Controls semantic search mode.

Common values:

- `off`
- `api`
- `fastembed`
- `transformers`
- `auto`

### `git`

Controls Git-Memory behavior.

Common keys:

- `autoHook`
- `ingestOnCommit`
- `maxDiffSize`
- `skipMergeCommits`
- `excludePatterns`
- `noiseKeywords`

### `behavior`

Controls runtime behavior.

Common keys:

- `sessionInject`
- `syncAdvisory`
- `autoCleanup`
- `formationMode`

### `server`

Controls transport and dashboard behavior.

Common keys:

- `transport`
- `port`
- `dashboard`
- `dashboardPort`

---

## Diagnosing Active Config

Run:

```bash
memorix status
```

`memorix status` shows:

- which config files exist
- which `.env` files were loaded
- where important values came from
- whether env vars overrode YAML

This is the fastest way to debug “why is Memorix using this value?”

---

## Legacy Config

Memorix still supports:

- `~/.memorix/config.json`

This exists mainly for backward compatibility with older TUI-based configuration flows.

For new setups, prefer:

- `memorix.yml`
- `.env`

---

## Recommended Team Conventions

For most teams, keep it simple:

- commit `memorix.yml`
- do **not** commit `.env`
- keep user-level config only for personal defaults

This gives you:

- reproducible project behavior
- local secret isolation
- cleaner onboarding for new contributors

---

## Related Docs

- [Setup Guide](SETUP.md)
- [Git Memory Guide](GIT_MEMORY.md)
- [Architecture](ARCHITECTURE.md)
- [Development Guide](DEVELOPMENT.md)
