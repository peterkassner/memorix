import os from 'node:os';
import path from 'node:path';

export type CursorInstall = 'cursor' | 'cursor-nightly';

export function defaultCursorSupportDir(install: CursorInstall = 'cursor'): string {
  const home = os.homedir();
  // macOS (primary on this machine)
  if (process.platform === 'darwin') {
    return path.join(
      home,
      'Library',
      'Application Support',
      install === 'cursor-nightly' ? 'Cursor Nightly' : 'Cursor',
    );
  }

  // Windows (best-effort)
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, install === 'cursor-nightly' ? 'Cursor Nightly' : 'Cursor');
  }

  // Linux (best-effort)
  return path.join(home, '.config', install === 'cursor-nightly' ? 'Cursor Nightly' : 'Cursor');
}

export function defaultCursorStateDbPath(install: CursorInstall = 'cursor'): string {
  return path.join(defaultCursorSupportDir(install), 'User', 'globalStorage', 'state.vscdb');
}

export function defaultCursorStateDbBackupPath(install: CursorInstall = 'cursor'): string {
  return path.join(defaultCursorSupportDir(install), 'User', 'globalStorage', 'state.vscdb.backup');
}

