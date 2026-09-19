# Component Library Toggle Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the component-library icon, label, and state badge on one visual centerline without changing behavior or overall button dimensions.

**Architecture:** Keep the existing `TaskComposer` markup and correct the inline layout in its scoped stylesheet. Verify the semantic toggle behavior with the existing component test and verify the glyph alignment in the packaged desktop UI at multiple viewport widths.

**Tech Stack:** React, TypeScript, CSS, Vitest, Electron packaging

**Spec:** `docs/superpowers/specs/2026-09-19-component-library-toggle-alignment-design.md`

## Global Constraints

- Preserve existing button structure, dimensions, colors, and interaction.
- Keep enabled and disabled states free from layout movement.
- Verify at regular desktop, 1366 px, and 1100 px widths.

---

### Task 1: Correct the inline alignment

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Test: `apps/desktop/src/renderer/v3/tasks/TaskComposer.test.tsx`

**Interfaces:**
- Consumes: `.v3-task-composer__library-toggle` markup already rendered by `TaskComposer`.
- Produces: stable vertical centering for the direct `span`, `b`, and `em` children.

- [ ] **Step 1: Record the existing behavior test baseline**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- TaskComposer.test.tsx
```

Expected: the existing component-library toggle behavior tests pass before the visual-only change.

- [ ] **Step 2: Apply the minimal CSS correction**

Update the icon container to `inline-flex`, set a zero glyph line box, center the glyph, and give the text and badge explicit centered line boxes:

```css
.v3-task-composer__library-toggle > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  line-height: 1;
  padding-bottom: 1px;
}
.v3-task-composer__library-toggle b,
.v3-task-composer__library-toggle em {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  line-height: 1;
}
```

Use the browser screenshot to tune a sub-pixel `translateY` only if the glyph remains optically off-center.

- [ ] **Step 3: Run focused tests and type checking**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- TaskComposer.test.tsx
pnpm --filter @qt-ui-copilot/desktop typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 4: Package and visually verify**

Run:

```powershell
$env:PORTABLE_OUTPUT='E:\workspace\AI\apps\desktop\out\qt-ui-copilot-component-alignment-win32-x64'
pnpm --filter @qt-ui-copilot/desktop package:portable
node test-results/ui-audit/run-audit.mjs
```

Expected: the toggle stays aligned at regular desktop, 1366 px, and 1100 px widths, with no clipping or state jump.
