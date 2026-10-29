# Configurable Component Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted local and MCP component sources with synchronization, safe caching, real Qt preview, and explicit AI-task reuse.

**Architecture:** Source adapters normalize external data into strict database snapshots. Renderer and generation paths consume only those snapshots through Main-process IPC, so remote availability and trust do not leak into preview or project writes.

**Tech Stack:** TypeScript, Electron, React, Zod, node:sqlite, `@modelcontextprotocol/client` v2, Qt PreviewHost, Vitest

**Spec:** `docs/superpowers/specs/2026-09-13-configurable-component-sources-design.md`

## Global Constraints

- Source access and credentials remain in Electron Main.
- MCP integration calls only `qt_components_list` and `qt_component_get`.
- Remote data is validated and cached before preview or reuse.
- Local hybrid scanning never writes the source directory.
- Last successful snapshots survive failed synchronization.
- Existing bundled components remain available as a protected source.

---

### Task 1: Source contracts and persistence

**Files:** `packages/contracts/src/component-source.ts`, `packages/task-store/src/schema.ts`, `packages/task-store/src/settings-repository.ts`, tests.

- [ ] Define strict public configuration, health, item and IPC input schemas.
- [ ] Add source and item tables with cascading ownership.
- [ ] Add source CRUD and transactional snapshot replacement tests.
- [ ] Implement repository methods and run package tests/typechecks.

### Task 2: Local hybrid adapter

**Files:** `packages/component-library/src/local-source-adapter.ts`, tests.

- [ ] Test manifest-first discovery and automatic `.ui` inference.
- [ ] Test traversal, symlink and payload bounds.
- [ ] Implement read-only discovery with adjacent QSS/QRC inference.
- [ ] Run component-library tests.

### Task 3: MCP adapter

**Files:** `apps/desktop/src/main/components/mcp-component-source-adapter.ts`, tests, `apps/desktop/package.json`.

- [ ] Add the official MCP v2 client dependency.
- [ ] Test tool discovery, pagination, bundle validation and connection closure with a fake client.
- [ ] Implement stdio and Streamable HTTP transports.
- [ ] Reject endpoints lacking the fixed read-only component tools.

### Task 4: Source orchestration and IPC

**Files:** `apps/desktop/src/main/components/component-source-service.ts`, `apps/desktop/src/main/ipc/register-v3-ipc.ts`, preload/API files, tests.

- [ ] Implement CRUD/test/sync/search orchestration and atomic cache replacement.
- [ ] Encrypt optional MCP bearer credentials with safeStorage.
- [ ] Add strict IPC handlers and preload methods.
- [ ] Merge enabled source snapshots with the bundled catalogue.

### Task 5: Cached component preview

**Files:** `apps/desktop/src/main/components/component-preview-service.ts`, IPC tests.

- [ ] Stage UI/QSS/QRC assets under the application cache.
- [ ] Render with the active workspace Qt profile.
- [ ] Return image, dimensions, findings and source metadata.
- [ ] Preserve last preview on a later preview failure.

### Task 6: Settings and component browser UI

**Files:** settings section components, `ComponentLibraryPanel.tsx`, CSS and tests.

- [ ] Add source cards and type-specific add form.
- [ ] Add test, sync, enable/disable and remove interactions.
- [ ] Add source/compatibility filters and preview/details pane.
- [ ] Keep selected compatible items connected to task creation.

### Task 7: Verification and packaging

- [ ] Run package and full desktop tests/typechecks.
- [ ] Validate local inferred components with Qt 5.9 uic.
- [ ] Package source-management assets and launch the portable application.
