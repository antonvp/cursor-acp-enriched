import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { CursorToolEnricher } from '../src/CursorToolEnricher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DB = join(__dirname, 'fixtures', 'store.db');

const SESSION_ID = 'test-session-fixture-0001';
const KNOWN_TOOL_CALL_ID = 'toolu_test_read_fixture_001';

function makeFakeCursorDir(): string {
  const base = mkdtempSync(join(tmpdir(), 'enricher-test-'));
  const sessionDir = join(base, 'chats', 'abc123def', SESSION_ID);
  mkdirSync(sessionDir, { recursive: true });
  copyFileSync(FIXTURE_DB, join(sessionDir, 'store.db'));
  return base;
}

/** Creates a fresh cursor dir with a DB that has only the tool-call entry, no tool-result. */
function makeCursorDirWithCallOnly(): { cursorDir: string; dbPath: string } {
  const base = mkdtempSync(join(tmpdir(), 'enricher-test-'));
  const sessionDir = join(base, 'chats', 'abc123def', SESSION_ID);
  mkdirSync(sessionDir, { recursive: true });
  const dbPath = join(sessionDir, 'store.db');
  const db = new Database(dbPath);
  db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
  const blob = {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: KNOWN_TOOL_CALL_ID,
        toolName: 'Read',
        args: { path: '/home/user/project/src/index.ts' },
      },
    ],
  };
  db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(
    'blob-call',
    Buffer.from(JSON.stringify(blob)),
  );
  db.close();
  return { cursorDir: base, dbPath };
}

describe('CursorToolEnricher', () => {
  it('enriches a known toolCallId', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    const result = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0 });
    expect(result).not.toBeNull();
    expect(result?.toolCallId).toBe(KNOWN_TOOL_CALL_ID);
    expect(result?.toolName).toBe('Read');
    expect(result?.args.path).toBe('/home/user/project/src/index.ts');
    expect(result?.result).toBe('export default function main() {}');
  });

  it('result field is truncated when maxResultLength is set', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    // fixture result is "export default function main() {}" — 34 chars
    const result = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0, maxResultLength: 10 });
    expect(result?.result).toBe('export def' + '…(truncated)');
  });

  it('returns null for unknown toolCallId with no timeout', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    const result = await enricher.enrich('toolu_nonexistent', { timeoutMs: 0 });
    expect(result).toBeNull();
  });

  it('returns null after timeout for missing toolCallId', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir, defaultTimeoutMs: 100 });
    const result = await enricher.enrich('toolu_nonexistent');
    expect(result).toBeNull();
  });

  it('caches the store.db path on second enrich call', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    // Two calls should both succeed without re-scanning the filesystem
    const r1 = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0 });
    const r2 = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0 });
    expect(r1?.toolCallId).toBe(KNOWN_TOOL_CALL_ID);
    expect(r2?.toolCallId).toBe(KNOWN_TOOL_CALL_ID);
  });

  it('close() clears the cached path', async () => {
    const cursorDir = makeFakeCursorDir();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0 });
    enricher.close();
    // After close, re-discovery should still work
    const result = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 0 });
    expect(result).not.toBeNull();
  });

  it('retries when tool-call is found but tool-result not yet written, then returns result', async () => {
    // Simulates the ACP race condition: Cursor fires "completed" before flushing tool-result to store.db.
    const { cursorDir, dbPath } = makeCursorDirWithCallOnly();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });

    // Write the tool-result blob after 100ms — while the enricher is polling
    setTimeout(() => {
      const db = new Database(dbPath);
      const blob = {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: KNOWN_TOOL_CALL_ID,
            toolName: 'Read',
            result: 'export default function main() {}',
          },
        ],
      };
      db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(
        'blob-result',
        Buffer.from(JSON.stringify(blob)),
      );
      db.close();
    }, 100);

    const result = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 500 });
    expect(result).not.toBeNull();
    expect(result?.result).toBe('export default function main() {}');
  });

  it('returns partial result (args only) when tool-result never arrives before timeout', async () => {
    const { cursorDir } = makeCursorDirWithCallOnly();
    const enricher = new CursorToolEnricher(SESSION_ID, { cursorDir });
    const result = await enricher.enrich(KNOWN_TOOL_CALL_ID, { timeoutMs: 100 });
    // Tool-call entry was found, so we get args — but result is null after timeout
    expect(result).not.toBeNull();
    expect(result?.toolName).toBe('Read');
    expect(result?.args.path).toBe('/home/user/project/src/index.ts');
    expect(result?.result).toBeNull();
  });
});
