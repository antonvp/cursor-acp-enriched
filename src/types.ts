export interface EnrichedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface EnricherOptions {
  cursorDir?: string;
  defaultTimeoutMs?: number;
}

export interface EnrichOptions {
  timeoutMs?: number;
}
