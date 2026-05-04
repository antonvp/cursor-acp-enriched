import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string, cursorDir: string) {
    super(
      `Session "${sessionId}" not found under ${cursorDir}/acp-sessions/ or ${cursorDir}/chats/`,
    );
    this.name = 'SessionNotFoundError';
  }
}

// Locates the SQLite store.db for a given Cursor ACP session.
//
// Cursor has used two on-disk layouts:
//
//   1. Current (Cursor ≥ mid-2026): flat
//      ~/.cursor/acp-sessions/<sessionId>/store.db
//
//   2. Legacy: hashed
//      ~/.cursor/chats/<hash>/<sessionId>/store.db
//
// The current layout is checked first because it is a single existsSync()
// call. If it is missing, fall back to scanning the legacy chats/ tree so
// long-running clients can still enrich pre-migration sessions.
export function findSessionStorePath(sessionId: string, options?: { cursorDir?: string }): string {
  const cursorDir = options?.cursorDir ?? join(homedir(), '.cursor');

  const flatPath = join(cursorDir, 'acp-sessions', sessionId, 'store.db');
  if (existsSync(flatPath)) {
    return flatPath;
  }

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
