# Automatic Component Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically render a component when selected, cache the result for the session, never auto-open the large preview, and open it only through an explicit enlarge action.

**Architecture:** `ComponentLibraryPanel` owns a preview cache keyed by capability and the current preview environment. Selection starts one render only when the cache has no result; `ComponentPreviewSurface` continues to display state and supplies explicit open, refresh, and retry callbacks.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Electron Forge

**Spec:** `docs/superpowers/specs/2026-09-19-auto-component-preview-design.md`

## Global Constraints

- Selection automatically renders only previewable components.
- Successful rendering never calls `preview.openWindow`.
- Screenshot click is the only normal enlarge action.
- Refresh and retry render again without opening the large preview.
- Cached results must not survive a workspace, Qt Profile, or source environment change.
- Stale requests must not write results or errors.

---

### Task 1: Specify Automatic Rendering and Explicit Enlargement

**Files:**
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.test.tsx`

**Interfaces:**
- Consumes: existing `ComponentLibraryPanel` public props.
- Produces: test requirements for automatic selection rendering, no automatic window, explicit enlargement, cache reuse, refresh, environment invalidation, and stale request protection.

- [ ] Replace the manual “生成组件预览” click in integration tests with selection-only expectations.
- [ ] Assert the first selection calls `componentSources.preview` exactly once and `preview.openWindow` zero times after success.
- [ ] Assert clicking the screenshot calls `preview.openWindow` without another render.
- [ ] Assert revisiting a successfully previewed component uses its cache.
- [ ] Assert refresh calls render again but does not open the window.
- [ ] Assert a workspace or Qt Profile change invalidates cache and rerenders the focused component.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- ComponentLibraryPanel.test.tsx` and confirm the new tests fail against the manual behavior.

### Task 2: Implement Session Cache and Automatic Selection Preview

**Files:**
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`

**Interfaces:**
- Produces: `previewResults: Record<string, V3PreviewResult>`, `previewEnvironmentKey`, and a selection handler that calls `renderPreview(candidate)` only when no cached result exists.
- Consumes: unchanged `ComponentPreviewSurface` props and `componentSources.preview` API.

- [ ] Replace the single preview state with a result map keyed by `${previewEnvironmentKey}::${capabilityId}`.
- [ ] Remove `openWindow` from the successful `renderPreview` path; success only writes the validated result into the cache.
- [ ] Add an active capability ref so repeated selection while rendering does not create duplicate requests.
- [ ] Add `selectCandidate(candidate)` that invalidates the prior request, updates focus, clears errors, and starts one automatic render for a previewable uncached candidate.
- [ ] Add environment invalidation for workspace ID, Qt Profile identity, and source filter; clear cache and automatically rerender a focused previewable candidate.
- [ ] Pass the focused cached result into `ComponentPreviewSurface`; keep its `onOpen` callback as the explicit `openWindow` path.
- [ ] Run panel, surface, and candidate tests and confirm they pass.

### Task 3: Full Verification and Portable Build

**Files:**
- Verify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`
- Verify: `apps/desktop/src/renderer/v3/components/ComponentPreviewSurface.tsx`

**Interfaces:**
- Consumes: behavior from Tasks 1–2.
- Produces: tested and packaged portable application.

- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test` and require all suites to pass.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop typecheck` and `git diff --check`.
- [ ] Build with a versioned `PORTABLE_OUTPUT` if the running prior build locks the standard output directory.
- [ ] Verify the executable exists and the packaged renderer contains the automatic preview implementation.
