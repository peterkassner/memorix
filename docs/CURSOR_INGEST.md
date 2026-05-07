# Cursor History Ingest

Memorix can backfill historical work from Cursor’s local chat storage into the Memorix SQLite store so it becomes searchable (BM25 + embeddings when enabled).

## Command

```bash
memorix ingest cursor --max 2000
```

Useful flags:

- `--since 2026-01-01T00:00:00.000Z` — only ingest bubbles on/after a date
- `--db /path/to/state.vscdb` — override the Cursor DB path
- `--install cursor-nightly` — use Cursor Nightly paths
- `--dryRun` — scan without writing
- `--includeToolBubbles` — also ingest tool bubbles when `text` is empty

## Notes

- Default DB path (macOS): `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- The ingest uses `topicKey` (`cursor/bubble/<composerId>/<bubbleId>`) so reruns are idempotent.
- The DB is copied to a temp file before reading to reduce contention with Cursor’s WAL/locks.

