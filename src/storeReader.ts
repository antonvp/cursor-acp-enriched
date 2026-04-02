import Database from 'better-sqlite3';
import type { EnrichedToolCall } from './types.js';

interface BlobRow {
  id: string;
  data: Buffer;
}

interface ContentResultItem {
  type: string;
  text?: string;
}

interface ContentItem {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string | ContentResultItem[];
}

interface BlobPayload {
  role?: string;
  content?: ContentItem[];
}

function extractResultString(raw: string | ContentResultItem[]): string {
  if (typeof raw === 'string') return raw;
  return raw.map((item) => item.text ?? '').join('');
}

/**
 * Reads the SQLite store.db and searches all blobs for a tool-call entry
 * matching the given toolCallId. Returns the enriched tool call or null.
 * Also recovers the paired tool-result output and truncates it to maxResultLength.
 */
export function readToolCallBlob(
  dbPath: string,
  toolCallId: string,
  maxResultLength = 50_000,
): EnrichedToolCall | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT id, data FROM blobs').all() as BlobRow[];

    let toolCallEntry: { toolName: string; args: Record<string, unknown> } | null = null;
    let resultString: string | null = null;

    for (const row of rows) {
      let payload: BlobPayload;
      try {
        payload = JSON.parse(row.data.toString('utf8')) as BlobPayload;
      } catch {
        continue;
      }

      if (!Array.isArray(payload.content)) continue;

      for (const item of payload.content) {
        if (item.toolCallId !== toolCallId) continue;

        if (
          item.type === 'tool-call' &&
          typeof item.toolName === 'string' &&
          item.args !== undefined
        ) {
          toolCallEntry = { toolName: item.toolName, args: item.args };
        } else if (item.type === 'tool-result' && item.result !== undefined) {
          resultString = extractResultString(item.result);
        }
      }
    }

    if (toolCallEntry === null) return null;

    let result: string | null = resultString;
    if (result !== null && result.length > maxResultLength) {
      result = result.slice(0, maxResultLength) + '…(truncated)';
    }

    return {
      toolCallId,
      toolName: toolCallEntry.toolName,
      args: toolCallEntry.args,
      result,
    };
  } finally {
    db.close();
  }
}
