import Database from 'better-sqlite3';
import type { EnrichedToolCall } from './types.js';

interface BlobRow {
  id: string;
  data: Buffer;
}

interface ContentItem {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
}

interface BlobPayload {
  role?: string;
  content?: ContentItem[];
}

/**
 * Reads the SQLite store.db and searches all blobs for a tool-call entry
 * matching the given toolCallId. Returns the enriched tool call or null.
 */
export function readToolCallBlob(dbPath: string, toolCallId: string): EnrichedToolCall | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT id, data FROM blobs').all() as BlobRow[];

    for (const row of rows) {
      let payload: BlobPayload;
      try {
        payload = JSON.parse(row.data.toString('utf8')) as BlobPayload;
      } catch {
        continue;
      }

      if (!Array.isArray(payload.content)) continue;

      for (const item of payload.content) {
        if (
          item.type === 'tool-call' &&
          item.toolCallId === toolCallId &&
          typeof item.toolName === 'string' &&
          item.args !== undefined
        ) {
          return {
            toolCallId,
            toolName: item.toolName,
            args: item.args,
          };
        }
      }
    }

    return null;
  } finally {
    db.close();
  }
}
