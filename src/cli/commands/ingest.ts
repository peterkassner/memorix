/**
 * CLI Command: memorix ingest
 *
 * Parent command for Git→Memory and image ingestion.
 */

import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'ingest',
    description: 'Ingest engineering knowledge from Git, Cursor, and images',
  },
  subCommands: {
    commit: () => import('./ingest-commit.js').then((module) => module.default),
    log: () => import('./ingest-log.js').then((module) => module.default),
    image: () => import('./ingest-image.js').then((module) => module.default),
    cursor: () => import('./ingest-cursor.js').then((module) => module.default),
  },
  run: async ({ args }) => {
    // Guard: citty resolves subcommands, but still calls parent run() in some cases.
    // If a known subcommand is present, do nothing here to avoid double output.
    const maybeSub = process.argv[3] || (args._ as string[])?.[0] || '';
    const knownSubs = ['commit', 'log', 'image', 'cursor'];
    if (maybeSub && knownSubs.includes(maybeSub)) return;

    console.log('Memorix Ingest Commands');
    console.log('');
    console.log('Usage:');
    console.log('  memorix ingest commit [--ref HEAD]');
    console.log('  memorix ingest log [--count 10]');
    console.log('  memorix ingest cursor [--max 2000] [--db <path>] [--since <iso>]');
    console.log('  memorix ingest image --path ./diagram.png');
  },
});
