import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string, cursorDir: string) {
    super(`Session "${sessionId}" not found under ${cursorDir}/chats/`);
    this.name = 'SessionNotFoundError';
  }
}

// Scans ~/.cursor/chats/<hash>/<sessionId>/store.db to locate the SQLite
// database for a given Cursor session. Returns the full path to store.db.
export function findSessionStorePath(sessionId: string, options?: { cursorDir?: string }): string {
  const cursorDir = options?.cursorDir ?? join(homedir(), '.cursor');
  const chatsDir = join(cursorDir, 'chats');

  let hashDirs: string[];
  try {
    hashDirs = readdirSync(chatsDir);
  } catch {
    throw new SessionNotFoundError(sessionId, cursorDir);
  }

  for (const hash of hashDirs) {
    const candidate = join(chatsDir, hash, sessionId, 'store.db');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new SessionNotFoundError(sessionId, cursorDir);
}
