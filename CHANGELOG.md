# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-02

### Fixed

- `enrich()` now retries when the `tool-call` blob is found but its paired `tool-result` hasn't been written to `store.db` yet — fixes the race condition where Cursor fires "completed" before flushing the result blob, causing `result` to be `null`
- After timeout, returns the best partial result (with `args` populated) instead of `null` when the tool-call entry was found but result never arrived

## [0.2.0] - 2026-04-02

### Added

- `result: string | null` field on `EnrichedToolCall` — recovers tool output from paired `tool-result` blobs in `store.db`
- `maxResultLength` option on `EnrichOptions` (default `50_000`) — truncates long results with `…(truncated)` suffix
- Support for both plain-string and content-array result forms

## [0.1.0] - 2026-04-02

### Added

- `CursorToolEnricher` class — enriches ACP `tool_call` events with full args from `store.db`
- `findSessionStorePath` — discovers the SQLite database path for a given Cursor session
- Exponential-backoff retry in `enrich()` for blobs not yet written to disk
- Dual CJS + ESM build with TypeScript declarations
