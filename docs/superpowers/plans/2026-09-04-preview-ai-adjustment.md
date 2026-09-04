# Preview AI Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI conversation to the preview tab that adjusts the current UI through the existing task session, validates the result, refreshes the preview, and supports Diff/undo/approval.

**Architecture:** Add a typed adjustment request to the V3 task stream. The Main process applies AI-generated `VisualEnhancementOperation` values against the current candidate or UI revision, stages the new source, then invokes uic/build/PreviewHost before publishing the updated candidate. The preview tab reuses the existing task composer and TaskStreamStore queue rather than creating a second conversation system.

**Tech Stack:** TypeScript, Zod, Electron IPC, React, existing `UiEnhancementPlanner`, `RevisionService`, `UiCreationService`, PreviewHost, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-preview-ai-adjustment-design.md`

## Global Constraints

- Adjustments reuse the current `taskId` and are queued while that task is running.
- Candidate/project files remain staged until approval; the previous valid source and preview remain recoverable.
- AI output is limited to registered structured UI operations; no arbitrary XML, code, scripts, or paths.
- XML parse, semantic, uic, build, and preview failures must preserve the previous valid version.
- Creation mode changes only the candidate UI file; non-UI project files are unchanged.

---

### Task 1: Define adjustment contracts and task-stream state

**Files:**
- Modify: `packages/contracts/src/v3-ui-enhancement.ts`
- Modify: `packages/contracts/src/v3-task-conversation.ts`
- Modify: `packages/contracts/src/v3-ui-creation.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/renderer/v3/state/task-stream-store.tsx`
- Test: `packages/contracts/test/v3-ui-enhancement.test.ts`
- Test: `apps/desktop/src/renderer/v3/state/task-stream-store.test.tsx`

**Interfaces:**
- Add `V3TaskStreamAdjustRequestSchema` with `taskId`, `uiFile`, `uiContent`, `requirement`, `contextMode`, and optional `previewDataUrl`.
- Add `V3StartTaskInput` variant `{ kind: 'adjust'; taskId: string; request: V3TaskStreamAdjustRequest }`.
- Add `adjustTask(input): Promise<string>` to the renderer task controller; it calls `queueMessage` when the task is running and starts the same task when idle.

- [ ] **Step 1: Write failing schema tests** for a valid adjustment with a bounded data URL, rejection of absolute/oversized paths and arbitrary operation payloads, and compatibility of existing create/modify variants.
- [ ] **Step 2: Run** `pnpm --filter @qt-ui-copilot/contracts exec vitest run test/v3-ui-enhancement.test.ts` and the focused task-store test; verify the new cases fail.
- [ ] **Step 3: Implement schemas and the `adjust` discriminated-union variant** while keeping existing request parsing unchanged.
- [ ] **Step 4: Extend `TaskStreamController` and `useTaskStream`** with `adjustTask`, preserving queue ordering and stale-event sequence checks.
- [ ] **Step 5: Run** the focused tests and `pnpm --filter @qt-ui-copilot/desktop typecheck`; commit `feat: add preview adjustment task contracts`.

### Task 2: Implement safe AI adjustment application

**Files:**
- Create: `apps/desktop/src/main/ai/ui-adjustment-service.ts`
- Create: `apps/desktop/src/main/ai/ui-adjustment-service.test.ts`
- Modify: `apps/desktop/src/main/ai/ui-enhancement-planner.ts`
- Modify: `apps/desktop/src/main/revisions/revision-service.ts`

**Interfaces:**
- `UiAdjustmentService.adjust(input: { uiFile: string; uiContent: string; requirement: string; previewDataUrl?: string; contextMode: 'focused_ui' | 'whole_project'; signal?: AbortSignal }): Promise<{ source: string; operations: VisualEnhancementOperation[]; beforeHash: string; afterHash: string; summary: string }>`.
- The service calls `UiEnhancementPlanner.plan`, applies only `VisualEnhancementOperation` values supported by `applyEnhancement`, parses the resulting UI, and returns the prior source unchanged on failure.

- [ ] **Step 1: Write failing tests** for one successful operation, multiple operations, invalid target rollback, planner format failure, uic failure, and cancellation.
- [ ] **Step 2: Run** `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/ui-adjustment-service.test.ts`; verify failures.
- [ ] **Step 3: Implement the service** with SHA-256 hashes, bounded operation application, and explicit errors for unsupported or unsafe operations.
- [ ] **Step 4: Add revision history support** so each successful adjustment can be undone without overwriting an external change; keep `RevisionService.undo/redo/rebaseAfterExternalChange` semantics intact.
- [ ] **Step 5: Run** focused adjustment and revision tests; commit `feat: apply structured ai ui adjustments`.

### Task 3: Wire Main-process adjustment execution and preview refresh

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/ai/v3-task-event-service.ts`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`
- Test: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.test.tsx`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- `UiPreviewTab` receives `taskId`, current source, and `onAdjust(requirement, previewDataUrl)`; it renders a composer below the image and never clears the last valid image while a new adjustment runs.
- Main `runTaskStream` handles `kind: 'adjust'` with ordered stages `analyzing`, `applying`, `validating`, `building`, `previewing`, `waiting_approval`.
- Candidate updates replace only `source`, `sourceHash`, `previewDataUrl`, validation fields, and Diff metadata.

- [ ] **Step 1: Add failing IPC tests** that send an adjust request, assert ordered task events, and verify an invalid operation emits a failed event while the original candidate remains.
- [ ] **Step 2: Add failing renderer tests** for the preview adjustment input, send/stop actions, queued status, updated image, and error recovery message.
- [ ] **Step 3: Implement Main adjustment execution** using `UiAdjustmentService`, candidate staging, existing Qt build service for project candidates, and PreviewHost rendering.
- [ ] **Step 4: Implement renderer wiring** from `UiPreviewTab` through `V3App` to the active task controller; reuse `TaskComposer` styles and queue semantics.
- [ ] **Step 5: Add “查看 Diff”“撤销本次调整”“恢复上一版本” actions** and ensure approval still commits the current candidate only.
- [ ] **Step 6: Run** focused IPC/renderer tests and desktop typecheck; commit `feat: enable ai adjustments from preview`.

### Task 4: Verify failure recovery, UX, and packaging

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Modify: `README.md`
- Test: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.test.tsx`
- Test: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.test.tsx`

- [ ] **Step 1: Add regression tests** for task cancellation, queued adjustments, preview/build failure preserving the last image, and undo after a successful adjustment.
- [ ] **Step 2: Style** the preview conversation area, pending/error states, operation summary, and compact layout at the existing mobile breakpoint.
- [ ] **Step 3: Run the full suite** with `pnpm test`, `pnpm --filter @qt-ui-copilot/desktop typecheck`, and the Qt PreviewHost CTest builds.
- [ ] **Step 4: Manually verify** an adjustment in both creation and modification modes using the existing task session, then verify reject, undo, and approval flows.
- [ ] **Step 5: Package** with `pnpm --filter @qt-ui-copilot/desktop package:portable`; record the executable path and commit `test: verify preview ai adjustment flow`.
