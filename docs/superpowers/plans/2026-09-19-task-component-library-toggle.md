# Task Component Library Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional per-task component-library toggle and reorganize the composer footer into a clear responsive two-level settings area.

**Architecture:** `TaskComposer` owns the temporary toggle state and submits it through `TaskComposerInput`. The selected component list remains owned by `V3Content`; the create-request adapter conditionally includes candidates according to the composer toggle. Display-only component count flows through the existing artifact/task component chain.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright Electron

**Spec:** `docs/superpowers/specs/2026-09-19-task-component-library-toggle-design.md`

## Global Constraints

- Component-library use defaults to enabled.
- Disabling affects only the submitted request and never clears sidebar selection.
- Modify-existing-UI mode does not show the toggle.
- Existing context, apply, creation type, build backend, queue, stop, and send behavior remains intact.
- The composer must not clip or overlap at 1100px and 1366px.

---

### Task 1: Extend Composer State and Submission Contract

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.test.tsx`

**Interfaces:**
- Produces: `TaskComposerInput.useComponentLibrary: boolean` and `TaskComposer.componentCount?: number`.
- Consumes: existing submission callback.

- [ ] Add failing tests asserting the default submission contains `useComponentLibrary: true`, the toggle exposes `aria-pressed=true`, clicking it submits `false`, and `componentCount=3` renders “组件库 · 3”.
- [ ] Add a failing test asserting `creationMode=false` hides the toggle.
- [ ] Add `useComponentLibrary` state defaulting to true and include it in submitted input.
- [ ] Render one accessible toggle button in creation mode with enabled/disabled visual state, count, title, and `aria-pressed`.
- [ ] Run TaskComposer tests and typecheck.

### Task 2: Connect Selected Components to the Request

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Produces: `TaskConversationView.componentCount?: number` and conditional create request fields.
- Consumes: `TaskComposerInput.useComponentLibrary` and `selectedCapabilities`.

- [ ] Extend the existing reusable-component V3App test: enabled sends selected candidates; toggle-off sends `useComponentLibrary:false` and an empty candidate array while sidebar selection remains visible.
- [ ] Pass `capabilityCandidates.length` through ArtifactContent and TaskConversationView into TaskComposer.
- [ ] Set create request `useComponentLibrary` from composer input and use `input.useComponentLibrary ? capabilityCandidates : []`.
- [ ] Leave modify and adjust request shapes unchanged.
- [ ] Run V3App, conversation, and task-stream tests.

### Task 3: Implement the Two-level Responsive Footer and Visual Audit

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Modify: `apps/desktop/src/renderer/v3/styles/workspace-polish.css`
- Modify: `test-results/ui-audit/run-audit.mjs`

**Interfaces:**
- Produces: `.v3-task-composer__behavior-row`, `.v3-task-composer__output-row`, and `.v3-task-composer__library-toggle`.
- Consumes: existing segmented-control classes and send actions.

- [ ] Split footer markup into a behavior row and output row; keep send/stop/queue actions at the end of the output row.
- [ ] Style the component-library toggle as a compact pill with a link/library glyph, state label, count, and visible focus.
- [ ] Use grid/flex wrapping so groups retain intrinsic width at 1366px and wrap without clipping at 1100px.
- [ ] Run desktop full tests, component-library tests, typecheck, and `git diff --check`.
- [ ] Build a versioned portable package and capture updated 1366px and 1100px AI-task screenshots.
