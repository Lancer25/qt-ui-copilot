# Complete Qt Control Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index every discoverable Qt visual control in a dynamic component library without silent 256/100/512 truncation.

**Architecture:** The binary scanner produces up to 2,048 control candidates and reports whether its file or component bound was reached. Source synchronization persists that complete safe snapshot. Search is paged, so settings renders a bounded page while retaining access to the entire snapshot.

**Tech Stack:** TypeScript, Electron IPC, React, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-complete-qt-control-indexing-design.md`

## Global Constraints

- Index every class whose inheritance resolves to the Qt Widgets visual hierarchy; retain unresolved `Q_OBJECT` candidates for mapping.
- Safe scan and persisted mapping caps are exactly 2,048.
- A page contains at most 100 rows; rendering a page must not reduce the persisted item count.
- A true bound must be visible to the user through sync health text.

---

### Task 1: Scanner snapshot capacity

**Files:**
- Modify: `packages/component-library/src/qt-binary-source-adapter.ts`
- Modify: `packages/component-library/test/qt-binary-source-adapter.test.ts`

**Interfaces:** Produces scanner results up to 2,048 candidates.

- [ ] Write a test that creates 300 headers such as `class Button1 : public QWidget { Q_OBJECT };` and expects 300 discoveries when the requested limit is 2,048.
- [ ] Verify the focused scanner test fails at the legacy 256 cap.
- [ ] Replace the scanner cap with `MAX_COMPONENTS = 2_048` and cap requested limits against that constant.
- [ ] Run `pnpm --filter @qt-ui-copilot/component-library test -- qt-binary-source-adapter.test.ts`.

### Task 2: Persist and search the full safe snapshot

**Files:**
- Modify: `packages/contracts/src/component-source.ts`
- Modify: `apps/desktop/src/main/components/component-source-service.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/components/component-source-service.test.ts`

**Interfaces:** Search accepts `offset` and returns `{ items, total }`; Qt-binary mappings accept up to 2,048 records.

- [ ] Write a service test that syncs 300 controls and requests `limit: 100, offset: 100`, expecting `total: 300` and the second page.
- [ ] Verify the test exposes the legacy 100-item service ceiling.
- [ ] Update all Qt-binary synchronization calls to request 2,048 candidates; permit 2,048 mappings and page search results by offset.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- component-source-service.test.ts register-v3-ipc.test.ts`.

### Task 3: Page mapping UI without concealing source totals

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.tsx`
- Modify: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.test.tsx`

**Interfaces:** Renderer loads 100 candidates initially, appends a subsequent page, and reports indexed versus displayed counts.

- [ ] Write a test asserting `已索引 300 个控件，当前显示 100 个`, then click `加载更多控件` and assert 200 are displayed.
- [ ] Update the renderer to request a first 100-item page and append later pages using the returned `total`.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- ComponentSourcesPanel.test.tsx` and `pnpm --filter @qt-ui-copilot/desktop typecheck`.

### Task 4: Regression verification

**Files:** Tests from Tasks 1–3.

- [ ] Run `pnpm --filter @qt-ui-copilot/component-library test` and `pnpm --filter @qt-ui-copilot/contracts test`.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- component-source-service.test.ts register-v3-ipc.test.ts ComponentSourcesPanel.test.tsx`.
- [ ] Commit only files owned by this feature.
