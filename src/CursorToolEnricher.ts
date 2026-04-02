import { findSessionStorePath } from './pathDiscovery.js';
import { readToolCallBlob } from './storeReader.js';
import type { EnrichedToolCall, EnricherOptions, EnrichOptions } from './types.js';

export class CursorToolEnricher {
  private readonly sessionId: string;
  private readonly cursorDir: string | undefined;
  private readonly defaultTimeoutMs: number;
  private cachedDbPath: string | null = null;

  constructor(sessionId: string, options?: EnricherOptions) {
    this.sessionId = sessionId;
    this.cursorDir = options?.cursorDir;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 1000;
  }

  private getDbPath(): string {
    if (this.cachedDbPath === null) {
      this.cachedDbPath = findSessionStorePath(this.sessionId, {
        cursorDir: this.cursorDir,
      });
    }
    return this.cachedDbPath;
  }

  /**
   * Looks up a tool call by its ID. If not found immediately and timeoutMs > 0,
   * retries with exponential backoff until the timeout is reached.
   */
  async enrich(toolCallId: string, options?: EnrichOptions): Promise<EnrichedToolCall | null> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxResultLength = options?.maxResultLength ?? 50_000;
    const dbPath = this.getDbPath();

    const result = readToolCallBlob(dbPath, toolCallId, maxResultLength);
    const hasResult = result !== null && result.result !== null;
    if (hasResult || timeoutMs <= 0) {
      return result;
    }

    // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ...
    // Retries when blob is not found yet (result === null) OR when the tool-call
    // entry exists but tool-result hasn't been written yet (result.result === null).
    // ACP may fire "completed" before Cursor flushes the result blob to store.db.
    const start = Date.now();
    let delay = 50;
    let best = result;

    while (Date.now() - start < timeoutMs) {
      await sleep(Math.min(delay, timeoutMs - (Date.now() - start)));
      const retryResult = readToolCallBlob(dbPath, toolCallId, maxResultLength);
      if (retryResult !== null) {
        best = retryResult;
        if (retryResult.result !== null) {
          return retryResult;
        }
      }
      delay *= 2;
    }

    return best;
  }

  /** Clears the cached store.db path (useful if the session directory moves). */
  close(): void {
    this.cachedDbPath = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
