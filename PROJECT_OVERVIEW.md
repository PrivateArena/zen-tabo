# Zen-Tabo — Project Architecture

## Purpose

In-browser spreadsheet application with a canvas-rendered grid, DuckDB-WASM SQL engine, SharedArrayBuffer-backed data plane, and an AI-agent HTTP/WebSocket bridge for programmatic control via the Vite dev server.

## File Tree

```
src/components/
src/core/
src/renderer/
```

## Component Roles

| File / Directory | Role |
|---|---|
| src/core/sheet-store.ts | Central reactive store managing spreadsheet state, DAG formula evaluation, and column operations |
| src/core/shared-memory.ts | SharedArrayBuffer-backed Float64Array grid enabling lock-free data access across threads |
| src/core/db-engine.ts | Web Worker wrapper routing SQL queries to DuckDB-WASM and returning columnar results |
| src/core/history.ts | Undo/redo command stack for transactional cell edits and column mutations |
| src/components/Viewport.tsx | Canvas-based grid viewport rendering cells and handling scroll, selection, and keyboard input |
| src/renderer/canvas-fallback.ts | Low-level Canvas 2D drawing routines for grid lines, cells, selection overlays, and headers |

## Key Architectural Patterns

1. **SharedArrayBuffer Data Plane**: All cell values live in a single Float64Array backed by SharedArrayBuffer, enabling zero-copy concurrent access between the main thread and web workers without serialization.
2. **Web Worker Isolation**: Formula evaluation (`eval.worker.ts`) and SQL execution (`db-engine.worker.ts`) run in dedicated workers, keeping the UI thread free for rendering and input.
3. **Reactive Single-Store**: `SheetStore` is a SolidJS reactive root owning all spreadsheet state; components subscribe to fine-grained signals for targeted re-renders without virtual DOM diffing.
4. **DAG-Based Formula Evaluation**: Column dependencies form a directed acyclic graph; on any cell change only the minimal set of affected columns is re-evaluated in topological order.
5. **Agent API Bridge**: The Vite dev server injects middleware exposing an HTTP `/api/*` endpoint that tunnels requests to the browser via WebSocket, allowing external AI agents to query and mutate spreadsheet state in real time.

## Dependencies

| Package | Role |
|---|---|
| solid-js | Reactive UI framework providing fine-grained signal-based rendering |
| @duckdb/duckdb-wasm | In-browser OLAP SQL engine compiled to WebAssembly for columnar queries |
| apache-arrow | Zero-copy columnar data format for transferring query results between DuckDB and the UI |
| yjs | CRDT-based data synchronization for collaborative multi-user editing |
| vite | Build tool and dev server with SharedArrayBuffer COOP/COEP headers and WebSocket support |
