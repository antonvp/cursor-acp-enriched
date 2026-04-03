export interface EnrichedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string | null;
}

export interface EnricherOptions {
  cursorDir?: string;
  defaultTimeoutMs?: number;
}

export interface EnrichOptions {
  timeoutMs?: number;
  maxResultLength?: number;
}
