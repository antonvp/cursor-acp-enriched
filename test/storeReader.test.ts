import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readToolCallBlob } from '../src/storeReader.js';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = join(__dirname, 'fixtures', 'store.db');

const KNOWN_TOOL_CALL_ID = 'toolu_test_read_fixture_001';
const KNOWN_TOOL_NAME = 'Read';
const KNOWN_ARGS = { path: '/home/user/project/src/index.ts' };

function copyFixture(): string {
  const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-test-')), 'store.db');
  copyFileSync(FIXTURE_DB, tmpPath);
  return tmpPath;
}

describe('readToolCallBlob', () => {
  it('returns enriched tool call for known toolCallId', () => {
    const dbPath = copyFixture();
    const result = readToolCallBlob(dbPath, KNOWN_TOOL_CALL_ID);
    expect(result).not.toBeNull();
    expect(result?.toolCallId).toBe(KNOWN_TOOL_CALL_ID);
    expect(result?.toolName).toBe(KNOWN_TOOL_NAME);
    expect(result?.args).toEqual(KNOWN_ARGS);
  });

  it('returns null for unknown toolCallId', () => {
    const dbPath = copyFixture();
    const result = readToolCallBlob(dbPath, 'toolu_nonexistent_id');
    expect(result).toBeNull();
  });

  it('returns null for empty database', () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-empty-')), 'store.db');
    const db = new Database(tmpPath);
    db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
    db.close();

    const result = readToolCallBlob(tmpPath, 'any-id');
    expect(result).toBeNull();
  });

  it('skips malformed blob JSON without throwing', () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-bad-')), 'store.db');
    const db = new Database(tmpPath);
    db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
    db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run('b1', Buffer.from('not json'));
    db.close();

    const result = readToolCallBlob(tmpPath, 'any-id');
    expect(result).toBeNull();
  });
});
