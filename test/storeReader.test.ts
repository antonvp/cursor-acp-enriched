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
const KNOWN_RESULT = 'export default function main() {}';

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
    expect(result?.result).toBe(KNOWN_RESULT);
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

  it('returns result: null when no tool-result blob exists for the toolCallId', () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-no-result-')), 'store.db');
    const db = new Database(tmpPath);
    db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
    const blob = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'toolu_no_result_001',
          toolName: 'Bash',
          args: { command: 'ls' },
        },
      ],
    };
    db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(
      'blob-001',
      Buffer.from(JSON.stringify(blob)),
    );
    db.close();

    const result = readToolCallBlob(tmpPath, 'toolu_no_result_001');
    expect(result).not.toBeNull();
    expect(result?.result).toBeNull();
  });

  it('truncates result to maxResultLength with …(truncated) suffix', () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-trunc-')), 'store.db');
    const db = new Database(tmpPath);
    db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');

    const longResult = 'x'.repeat(200);
    const toolCallBlob = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'toolu_trunc_001',
          toolName: 'Read',
          args: { path: '/tmp/file.ts' },
        },
      ],
    };
    const toolResultBlob = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'toolu_trunc_001',
          toolName: 'Read',
          result: longResult,
        },
      ],
    };
    const insert = db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)');
    insert.run('blob-tc-001', Buffer.from(JSON.stringify(toolCallBlob)));
    insert.run('blob-tr-001', Buffer.from(JSON.stringify(toolResultBlob)));
    db.close();

    const result = readToolCallBlob(tmpPath, 'toolu_trunc_001', 100);
    expect(result?.result).toBe('x'.repeat(100) + '…(truncated)');
  });

  it('extracts result from content-array form', () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'store-array-')), 'store.db');
    const db = new Database(tmpPath);
    db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');

    const toolCallBlob = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'toolu_array_001',
          toolName: 'WebSearch',
          args: { query: 'vitest' },
        },
      ],
    };
    const toolResultBlob = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'toolu_array_001',
          toolName: 'WebSearch',
          result: [
            { type: 'text', text: 'Result one. ' },
            { type: 'text', text: 'Result two.' },
          ],
        },
      ],
    };
    const insert = db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)');
    insert.run('blob-tc-array', Buffer.from(JSON.stringify(toolCallBlob)));
    insert.run('blob-tr-array', Buffer.from(JSON.stringify(toolResultBlob)));
    db.close();

    const result = readToolCallBlob(tmpPath, 'toolu_array_001');
    expect(result?.result).toBe('Result one. Result two.');
  });
});
