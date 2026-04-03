// Generates a minimal synthetic store.db for tests.
// Run with: node test/fixtures/create-fixture.mjs
import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'store.db');

// Always start fresh — never inherit data from a previous (potentially real) DB
rmSync(dbPath, { force: true });

const db = new Database(dbPath);
db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');

// Assistant blob — contains the tool-call entry
const assistantBlob = {
  role: 'assistant',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'toolu_test_read_fixture_001',
      toolName: 'Read',
      args: { path: '/home/user/project/src/index.ts' },
    },
  ],
};

// Tool result blob — paired result for the same toolCallId
const toolResultBlob = {
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: 'toolu_test_read_fixture_001',
      toolName: 'Read',
      result: 'export default function main() {}',
    },
  ],
};

const insert = db.prepare('INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)');
insert.run('blob-assistant-001', Buffer.from(JSON.stringify(assistantBlob)));
insert.run('blob-tool-result-001', Buffer.from(JSON.stringify(toolResultBlob)));

db.close();
console.log('Created', dbPath);
