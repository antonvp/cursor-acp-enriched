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

// Tool result blob — paired result for the same toolCallId, with highLevelToolCallResult
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
  providerOptions: {
    cursor: {
      highLevelToolCallResult: {
        workspaceResults: [
          { filePath: '/home/user/project/src/index.ts', lines: ['export default function main() {}'] },
        ],
      },
    },
  },
};

// Grep tool call — has rich workspaceResults
const grepAssistantBlob = {
  role: 'assistant',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'toolu_test_grep_fixture_001',
      toolName: 'Grep',
      args: { pattern: 'function main', path: '/home/user/project' },
    },
  ],
};

const grepToolResultBlob = {
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: 'toolu_test_grep_fixture_001',
      toolName: 'Grep',
      result: 'src/index.ts:1:export default function main() {}',
    },
  ],
  providerOptions: {
    cursor: {
      highLevelToolCallResult: {
        workspaceResults: [
          { filePath: 'src/index.ts', matchingLines: [{ lineNumber: 1, content: 'export default function main() {}' }] },
        ],
      },
    },
  },
};

// Shell tool call — no highLevelToolCallResult (tests null case)
const shellAssistantBlob = {
  role: 'assistant',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'toolu_test_shell_fixture_001',
      toolName: 'Shell',
      args: { command: 'echo hello' },
    },
  ],
};

const shellToolResultBlob = {
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: 'toolu_test_shell_fixture_001',
      toolName: 'Shell',
      result: 'hello\n',
    },
  ],
};

const insert = db.prepare('INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)');
insert.run('blob-assistant-001', Buffer.from(JSON.stringify(assistantBlob)));
insert.run('blob-tool-result-001', Buffer.from(JSON.stringify(toolResultBlob)));
insert.run('blob-assistant-grep', Buffer.from(JSON.stringify(grepAssistantBlob)));
insert.run('blob-tool-result-grep', Buffer.from(JSON.stringify(grepToolResultBlob)));
insert.run('blob-assistant-shell', Buffer.from(JSON.stringify(shellAssistantBlob)));
insert.run('blob-tool-result-shell', Buffer.from(JSON.stringify(shellToolResultBlob)));

db.close();
console.log('Created', dbPath);
