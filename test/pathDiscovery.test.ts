import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findSessionStorePath, SessionNotFoundError } from '../src/pathDiscovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = join(__dirname, 'fixtures', 'store.db');

function makeFakeCursorDir(sessionId: string): string {
  const base = mkdtempSync(join(tmpdir(), 'cursor-test-'));
  const hashDir = join(base, 'chats', 'abc123def', sessionId);
  mkdirSync(hashDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(hashDir, 'store.db'));
  return base;
}

describe('findSessionStorePath', () => {
  it('returns the correct store.db path when session exists', () => {
    const sessionId = 'test-session-abc';
    const cursorDir = makeFakeCursorDir(sessionId);
    const result = findSessionStorePath(sessionId, { cursorDir });
    expect(result).toBe(join(cursorDir, 'chats', 'abc123def', sessionId, 'store.db'));
  });

  it('throws SessionNotFoundError when session is missing', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-test-'));
    mkdirSync(join(base, 'chats'), { recursive: true });
    expect(() => findSessionStorePath('nonexistent-session', { cursorDir: base })).toThrow(
      SessionNotFoundError,
    );
  });

  it('throws SessionNotFoundError when chats dir does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-empty-'));
    expect(() => findSessionStorePath('any-session', { cursorDir: base })).toThrow(
      SessionNotFoundError,
    );
  });

  it('error message includes sessionId', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-test-'));
    mkdirSync(join(base, 'chats'), { recursive: true });
    expect(() => findSessionStorePath('my-session-id', { cursorDir: base })).toThrow(
      /my-session-id/,
    );
  });
});
