# cursor-acp-enriched

Recovers missing tool call arguments from Cursor's ACP (Agent Client Protocol) events by reading the local SQLite `store.db`.

## The problem

Cursor's ACP stream emits `tool_call` notifications with an empty `rawInput` field — you can see _that_ a tool was called but not _what arguments_ it received (which file was read, which command was run, etc.).

Cursor does write the full tool call data — including arguments — to a local SQLite database at:

```
~/.cursor/chats/<hash>/<sessionId>/store.db
```

This package reads that database to recover the missing arguments, using the `toolCallId` as the join key between ACP events and store.db blobs.

## Installation

```bash
npm install cursor-acp-enriched
```

## Quick start

```typescript
import { CursorToolEnricher } from 'cursor-acp-enriched';

// sessionId comes from the ACP session notification
const enricher = new CursorToolEnricher(sessionId);

// toolCallId comes from the ACP tool_call event
const result = await enricher.enrich(toolCallId);

if (result) {
  console.log(result.toolName); // e.g. "Read"
  console.log(result.args); // e.g. { path: "/foo/bar.ts" }
  console.log(result.result); // e.g. "export default function main() {}"
}

// With a polling timeout (retries until blob appears or timeout expires)
const result = await enricher.enrich(toolCallId, { timeoutMs: 2000 });

// Limit result length (default is 50 000 characters)
const result = await enricher.enrich(toolCallId, { maxResultLength: 5000 });
```

## API reference

### `new CursorToolEnricher(sessionId, options?)`

Creates an enricher for the given Cursor session.

| Option             | Type     | Default     | Description                         |
| ------------------ | -------- | ----------- | ----------------------------------- |
| `cursorDir`        | `string` | `~/.cursor` | Override the Cursor data directory  |
| `defaultTimeoutMs` | `number` | `1000`      | Default retry window for `enrich()` |

### `enricher.enrich(toolCallId, options?)`

Looks up the tool call in `store.db`. Returns `EnrichedToolCall | null`.

If the blob isn't found immediately and `timeoutMs > 0`, retries with exponential backoff (50ms → 100ms → 200ms…) until the timeout is reached. Useful when the blob may not be written yet.

| Option            | Type     | Default  | Description                                       |
| ----------------- | -------- | -------- | ------------------------------------------------- |
| `timeoutMs`       | `number` |          | Overrides `defaultTimeoutMs` for this call        |
| `maxResultLength` | `number` | `50_000` | Truncates the recovered result to this many chars |

### `enricher.close()`

Clears the cached `store.db` path. The next `enrich()` call will re-discover it.

### `findSessionStorePath(sessionId, options?)`

Low-level helper. Scans `~/.cursor/chats/*/` for a subdirectory matching `sessionId` and returns the full path to `store.db`. Throws `SessionNotFoundError` if not found.

### Types

```typescript
interface EnrichedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string | null; // tool output; null when no tool-result blob was found
}
```

## How it works

1. **Path discovery** — scans `~/.cursor/chats/<hash>/<sessionId>/store.db` to find the database for the session
2. **Blob correlation** — opens the database read-only in WAL mode, iterates all rows in the `blobs` table; finds the `type === "tool-call"` entry for the given `toolCallId` (for args) and the paired `type === "tool-result"` entry (for output)
3. **Retry** — if the blob isn't present yet (Cursor may not have flushed it), polls with exponential backoff up to the configured timeout

## Limitations

- macOS and Linux only (no Windows support in v1)
- Depends on Cursor's internal `store.db` schema, which may change across Cursor versions
- Read-only: does not write to or modify the database

## License

MIT
