# Streaming UI Creation and Async Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return a saveable `uic`-validated base UI immediately, run PreviewHost asynchronously, and present ordered structured events in a single-column streaming timeline.

**Architecture:** Generation and preview become separate task lanes sharing one task ID and event store. The compatibility `createUiCandidate` API waits only for `base_candidate_ready`; PreviewHost continues through background events and updates the candidate snapshot when ready.

**Tech Stack:** TypeScript, Zod, Electron IPC, React, Vitest, existing PreviewHost/PreviewClient, Qt 5.9.6 and Qt 6.10.2.

**Spec:** `docs/superpowers/specs/2026-08-26-streaming-ui-creation-preview-design.md`

## Global Constraints

- Do not expose model chain-of-thought.
- Base candidate save depends on XML, semantic and `uic`, never PreviewHost.
- Preview failure/cancellation cannot remove the base candidate.
- Event sequence is strictly increasing per task and details are sanitized.
- Renderer reload must recover task snapshot and recent events.

---

### Task 1: Stream Event Contracts and Store

**Files:**
- Create: `packages/contracts/src/ui-creation-stream.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/desktop/src/main/ai/ui-creation-event-store.ts`
- Test: `packages/contracts/test/ui-creation-stream.test.ts`
- Test: `apps/desktop/src/main/ai/ui-creation-event-store.test.ts`

**Interfaces:**
- Produces `UiCreationStreamEventSchema`, `UiCreationTaskSnapshotSchema`.
- Produces `UiCreationEventStore.append`, `list`, `snapshot`, `subscribe`.

- [ ] Write failing tests for sequence ordering, 200-event retention, duplicate rejection and secret redaction.
- [ ] Run `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test` and the desktop event-store test; expect missing exports.
- [ ] Implement lane/type/stage schemas, bounded detail and snapshot preview states.
- [ ] Implement monotonic sequence allocation in Main; callers never supply sequence.
- [ ] Run tests and commit:

```bash
git add packages/contracts apps/desktop/src/main/ai/ui-creation-event-store*
git commit -m "feat: store ordered UI creation stream events"
```

### Task 2: Base Candidate Early Return

**Files:**
- Modify: `apps/desktop/src/main/ai/ui-creation-task-service.ts`
- Modify: `apps/desktop/src/main/ai/ui-creation-service.ts`
- Test: `apps/desktop/src/main/ai/ui-creation-task-service.test.ts`
- Test: `apps/desktop/src/main/ai/ui-creation-service.test.ts`

**Interfaces:**
- Generation service publishes stages through `base_candidate_ready`.
- `createCandidate` resolves after authoritative staged `uic`, before preview.

- [ ] Write a test with a never-resolving preview promise and assert base candidate resolves first.
- [ ] Write a test proving base commit succeeds while preview status is running.
- [ ] Split current `validate()` into `validateBase()` and preview scheduling.
- [ ] Keep candidate source immutable after `base_candidate_ready`; preview only updates preview metadata.
- [ ] Run desktop tests and commit:

```bash
git add apps/desktop/src/main/ai/ui-creation-*.ts
git commit -m "feat: return UI candidates before preview completes"
```

### Task 3: Background Preview Task Service

**Files:**
- Create: `apps/desktop/src/main/preview/ui-preview-task-service.ts`
- Modify: `apps/desktop/src/main/preview/preview-session-service.ts`
- Modify: `packages/preview-client/src/preview-host-builder.ts`
- Test: `apps/desktop/src/main/preview/ui-preview-task-service.test.ts`
- Test: `packages/preview-client/test/preview-host-builder.test.ts`

**Interfaces:**
- Produces `start(taskId, input)`, `cancel(taskId)`, `retry(taskId)`, `get(taskId)`.
- Emits cache/build/start/resource/render/image stages to the event store.

- [ ] Write tests for first build, cache reuse, cancellation and retry.
- [ ] Add PreviewHostBuilder instrumentation callbacks for cache lookup/configure/build without exposing commands or secrets.
- [ ] Coalesce concurrent builds by cache key.
- [ ] Implement preview timeout and process cancellation while retaining base candidate.
- [ ] Run preview-client and desktop preview tests and commit:

```bash
git add apps/desktop/src/main/preview packages/preview-client
git commit -m "feat: run PreviewHost as a background task"
```

### Task 4: Async IPC, Recovery and Compatibility Wrapper

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`

**Interfaces:**

```ts
startUiCreation(input): Promise<{ taskId: string }>;
getUiCreationTask(taskId): Promise<UiCreationTaskSnapshot>;
onUiCreationEvent(listener): () => void;
cancelUiPreview(taskId): Promise<void>;
retryUiPreview(taskId): Promise<void>;
```

- [ ] Write IPC tests for immediate task ID, ordered event delivery, snapshot recovery, cancel preview and retry preview.
- [ ] Register strict schemas and preload methods.
- [ ] Keep `createUiCandidate` as a wrapper that waits for base candidate only.
- [ ] Remove IPC listeners and abort preview tasks on lifecycle disposal.
- [ ] Run desktop IPC and preload boundary tests and commit:

```bash
git add apps/desktop/src/main/ipc/register-v3-ipc* apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: stream recoverable UI creation tasks over IPC"
```

### Task 5: Single-Column Streaming Timeline

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/UiCreationEventTimeline.tsx`
- Test: `apps/desktop/src/renderer/v3/assistant/UiCreationEventTimeline.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/assistant/CreateUiForm.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Consumes snapshot and ordered events.
- Produces cancel preview, retry preview, save base and discard actions.

- [ ] Write renderer tests for current expanded event, completed collapsed events, warning/error colors and event deduplication.
- [ ] Write scroll tests: follow bottom when already at bottom; preserve position after user scrolls upward.
- [ ] Fold submitted form into task summary while running.
- [ ] Render base candidate actions immediately at `base_candidate_ready`.
- [ ] Replace two-column checklist and synthetic timers with real events.
- [ ] Add detail log expansion limited to 200 events.
- [ ] Run desktop renderer/accessibility tests and commit:

```bash
git add apps/desktop/src/renderer/v3/assistant apps/desktop/src/renderer/v3/styles/v3.css
git commit -m "feat: show streaming UI creation timeline"
```

### Task 6: Qualification and Documentation

**Files:**
- Modify: `tests/e2e/v3-ide.spec.ts`
- Modify: `tests/e2e/v3-runtime.spec.ts`
- Modify: `docs/v3-user-guide.md`

**Interfaces:**
- No runtime interfaces; proves the feature end to end.

- [ ] Add E2E assertion that base candidate appears before delayed preview.
- [ ] Add cancellation test proving base save remains available.
- [ ] Add cache-reuse test for the second preview on the same Qt Kit.
- [ ] Run:

```powershell
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e
```

- [ ] Update user guide with Generation/Preview lanes, base save, cancellation, retry and cache reuse.
- [ ] Commit:

```bash
git add tests/e2e docs/v3-user-guide.md
git commit -m "test: qualify streaming asynchronous preview"
```
