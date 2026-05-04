import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findSessionStorePath, SessionNotFoundError } from '../src/pathDiscovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = join(__dirname, 'fixtures', 'store.db');

function makeLegacyCursorDir(sessionId: string): string {
  const base = mkdtempSync(join(tmpdir(), 'cursor-legacy-'));
  const hashDir = join(base, 'chats', 'abc123def', sessionId);
  mkdirSync(hashDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(hashDir, 'store.db'));
  return base;
}

function makeFlatCursorDir(sessionId: string): string {
  const base = mkdtempSync(join(tmpdir(), 'cursor-flat-'));
  const sessionDir = join(base, 'acp-sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(sessionDir, 'store.db'));
  return base;
}

function makeBothLayoutsCursorDir(sessionId: string): string {
  const base = mkdtempSync(join(tmpdir(), 'cursor-both-'));
  const flatDir = join(base, 'acp-sessions', sessionId);
  mkdirSync(flatDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(flatDir, 'store.db'));
  const legacyDir = join(base, 'chats', 'abc123def', sessionId);
  mkdirSync(legacyDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(legacyDir, 'store.db'));
  return base;
}

describe('findSessionStorePath', () => {
  it('returns the flat acp-sessions path when only the new layout exists', () => {
    const sessionId = 'test-session-flat';
    const cursorDir = makeFlatCursorDir(sessionId);
    const result = findSessionStorePath(sessionId, { cursorDir });
    expect(result).toBe(join(cursorDir, 'acp-sessions', sessionId, 'store.db'));
  });

  it('returns the legacy chats path when only the old layout exists', () => {
    const sessionId = 'test-session-legacy';
    const cursorDir = makeLegacyCursorDir(sessionId);
    const result = findSessionStorePath(sessionId, { cursorDir });
    expect(result).toBe(join(cursorDir, 'chats', 'abc123def', sessionId, 'store.db'));
  });

  it('prefers the flat acp-sessions path when both layouts exist', () => {
    const sessionId = 'test-session-both';
    const cursorDir = makeBothLayoutsCursorDir(sessionId);
    const result = findSessionStorePath(sessionId, { cursorDir });
    expect(result).toBe(join(cursorDir, 'acp-sessions', sessionId, 'store.db'));
  });

  it('throws SessionNotFoundError when session is missing in both layouts', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-missing-'));
    mkdirSync(join(base, 'chats'), { recursive: true });
    mkdirSync(join(base, 'acp-sessions'), { recursive: true });
    expect(() => findSessionStorePath('nonexistent-session', { cursorDir: base })).toThrow(
      SessionNotFoundError,
    );
  });

  it('throws SessionNotFoundError when neither chats nor acp-sessions exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-empty-'));
    expect(() => findSessionStorePath('any-session', { cursorDir: base })).toThrow(
      SessionNotFoundError,
    );
  });

  it('error message includes sessionId', () => {
    const base = mkdtempSync(join(tmpdir(), 'cursor-msg-'));
    mkdirSync(join(base, 'chats'), { recursive: true });
    expect(() => findSessionStorePath('my-session-id', { cursorDir: base })).toThrow(
      /my-session-id/,
    );
  });
});
