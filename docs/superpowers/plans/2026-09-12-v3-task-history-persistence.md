# V3 Task History Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist V3 task history, restore completed tasks correctly, and reconcile stale running tasks after restart.

**Architecture:** SQLite stores validated V3 snapshots and task metadata. `V3TaskEventService` owns persistence and recovery, V3 IPC exposes listing/restoration, and the renderer consumes only the V3 history API.

**Tech Stack:** TypeScript, Electron IPC, React, Zod, node:sqlite, Vitest

**Spec:** `docs/superpowers/specs/2026-09-12-v3-task-history-persistence-design.md`

## Global Constraints

- Do not delete or rewrite legacy task rows.
- Keep history scoped by V3 workspace ID.
- Persist only schema-validated snapshots.
- Convert stale `pending` and `running` tasks to `cancelled` once at startup.

---

### Task 1: Persisted task records

**Files:**
- Modify: `packages/contracts/src/v3-task-conversation.ts`
- Modify: `packages/task-store/src/schema.ts`
- Modify: `packages/task-store/src/v3-repository.ts`
- Test: `packages/task-store/test/v3-repository.test.ts`

- [ ] Add the V3 history metadata schema and SQLite table.
- [ ] Write failing repository round-trip/filter/reconcile tests.
- [ ] Implement validated save/get/list/reconcile methods.
- [ ] Run the task-store tests.

### Task 2: Persist event service state

**Files:**
- Modify: `apps/desktop/src/main/ai/v3-task-event-service.ts`
- Test: `apps/desktop/src/main/ai/v3-task-event-service.test.ts`

- [ ] Write a failing reload test.
- [ ] Inject the repository, register metadata, and persist every mutation.
- [ ] Reconcile interrupted tasks during construction.
- [ ] Run event-service tests.

### Task 3: Wire backend and V3 IPC

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`

- [ ] Expose the shared V3 repository from the local backend.
- [ ] Pass it to V3 IPC and register `v3.ai.listTaskSnapshots`.
- [ ] Register task metadata before streams start.
- [ ] Run IPC tests.

### Task 4: Consume V3 history in the renderer

**Files:**
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.test.tsx`

- [ ] Add the typed V3 history API.
- [ ] Replace legacy task listing and status mapping.
- [ ] Verify clicking a completed row opens the matching persisted task ID.
- [ ] Run renderer tests and typecheck.

### Task 5: Package verification

- [ ] Run focused tests and the desktop typecheck.
- [ ] Build the portable desktop package.
- [ ] Launch the packaged Qt UI Copilot for visual smoke testing.
