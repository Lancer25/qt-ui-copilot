# Component Preview Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense component detail block with a preview-first card surface that generates, displays, opens, refreshes, retries, and explains component previews in place.

**Architecture:** A new presentational `ComponentPreviewSurface` owns the four visual states without calling desktop APIs. `ComponentLibraryPanel` keeps request sequencing and backend calls, passes state into the surface, and retains one full-width task action below it.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Electron Forge

**Spec:** `docs/superpowers/specs/2026-09-19-component-preview-visual-polish-design.md`

## Global Constraints

- The preview surface remains inside the focused component card.
- Existing preview request sequencing must continue to reject stale results.
- Screenshot click opens the existing image without triggering another render.
- Refresh and retry are explicit render actions.
- Interactive controls must never be nested.
- The task action remains available when preview is unavailable or failed.

---

### Task 1: Build the Preview State Surface

**Files:**
- Create: `apps/desktop/src/renderer/v3/components/ComponentPreviewSurface.tsx`
- Create: `apps/desktop/src/renderer/v3/components/ComponentPreviewSurface.test.tsx`

**Interfaces:**
- Produces: `ComponentPreviewSurface(props)` with `title`, `canPreview`, `rendering`, optional `imageDataUrl`, optional `error`, `onGenerate`, and `onOpen`.
- Consumes: no desktop API; callbacks are provided by the parent.

- [ ] Write tests for unavailable, empty, loading, failed, and success states. In the success test click the screenshot and assert only `onOpen`; click “重新生成预览” and assert `onGenerate`.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- ComponentPreviewSurface.test.tsx` and confirm failure because the component does not exist.
- [ ] Implement semantic sibling controls: empty and retry call `onGenerate`; loading exposes `role="status"`; failure exposes `role="alert"`; success provides one screenshot button and one refresh button.
- [ ] Run the new test and confirm all states pass.

### Task 2: Integrate the Surface Into the Expanded Card

**Files:**
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.test.tsx`

**Interfaces:**
- Consumes: `ComponentPreviewSurface` from Task 1.
- Produces: compact details with description, metadata, preview surface, and one full-width task button.

- [ ] Update integration tests to assert the duplicate detail title is absent, the initial preview surface generates a preview, the completed screenshot opens without a second render, and refresh renders again.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test -- ComponentLibraryPanel.test.tsx` and confirm the new expectations fail.
- [ ] Replace inline preview image/error/buttons with `ComponentPreviewSurface`. Add `openPreview(candidate)` that calls `api.preview.openWindow` only when the current result contains an image. Keep `renderPreview(candidate)` and its request sequence unchanged.
- [ ] Remove the duplicate `<b>{candidate.displayName}</b>`. Apply `v3-component-detail__description`, `v3-component-detail__meta`, and `v3-component-detail__task-action` classes.
- [ ] Run panel and surface tests and confirm they pass.

### Task 3: Apply Preview-First Styling and Verify Packaging

**Files:**
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Consumes: the class names emitted by Tasks 1–2.
- Produces: a 16:10 preview-first expanded card with compact text and a full-width task action.

- [ ] Add styles for `.v3-component-preview`, its empty/loading/error/success states, screenshot, overlay, spinner, and 28px refresh control. Use `aspect-ratio:16/10`, `min-height:138px`, `max-height:166px`, and `object-fit:contain`.
- [ ] Clamp the description to two lines; truncate metadata to one line; remove the old two-column action grid; make `.v3-component-detail__task-action` 32px high and full width.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test`, `pnpm --filter @qt-ui-copilot/desktop typecheck`, and `git diff --check`.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop package:portable` and verify `apps/desktop/out/qt-ui-copilot-portable-win32-x64/qt-ui-copilot.exe` exists.
