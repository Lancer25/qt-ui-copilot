# Preview Adjust Button Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the preview adjustment submit button from “发送给 AI” to “调整” while preserving its loading state.

**Architecture:** Update the existing `UiPreviewTab` copy and its focused renderer test. No API or state-flow changes are required.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Electron Forge

**Spec:** `docs/superpowers/specs/2026-09-19-preview-adjust-button-copy-design.md`

## Global Constraints

- Idle text is exactly “调整”.
- Loading text remains exactly “调整中…”.
- Main AI task composer copy is unchanged.

---

### Task 1: Update and Verify the Copy

**Files:**
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.tsx`
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.test.tsx`

**Interfaces:**
- Consumes: existing `onAdjust` submission flow.
- Produces: the idle submit label “调整”.

- [ ] Change the test expectation to query the submit button by the exact name “调整”.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- UiPreviewTab.test.tsx` and confirm the expectation fails.
- [ ] Replace only the idle label `发送给 AI` with `调整`; preserve `调整中…`.
- [ ] Run the focused test, desktop typecheck, and full desktop test suite.
- [ ] Build a versioned portable package and verify the executable exists.
