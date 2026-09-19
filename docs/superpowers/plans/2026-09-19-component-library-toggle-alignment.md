# Component Library Toggle Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the component-library icon, label, and state badge on one visual centerline without changing behavior or overall button dimensions.

**Architecture:** Reuse the existing vector-based `WorkspaceIcon` component in `TaskComposer` instead of rendering a font glyph. Keep the scoped flex layout for the icon, label, and state badge, then verify semantic behavior and packaged desktop rendering at multiple viewport widths and DPI scales.

**Tech Stack:** React, TypeScript, CSS, Vitest, Electron packaging

**Spec:** `docs/superpowers/specs/2026-09-19-component-library-toggle-alignment-design.md`

## Global Constraints

- Preserve existing button dimensions, colors, and interaction.
- Keep enabled and disabled states free from layout movement.
- Verify at regular desktop, 1366 px, and 1100 px widths, including Windows 100% and 125% DPI.

---

### Task 1: Replace the font glyph with the shared SVG icon

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Test: `apps/desktop/src/renderer/v3/tasks/TaskComposer.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceIcon({ name: 'components' })` from `apps/desktop/src/renderer/v3/shell/WorkspaceIcon.tsx`.
- Produces: `.v3-task-composer__library-icon` containing a fixed-size SVG independent of font metrics.

- [ ] **Step 1: Record the existing behavior test baseline**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- TaskComposer.test.tsx
```

Expected: the existing component-library toggle behavior tests pass before the visual-only change.

- [ ] **Step 2: Assert the vector icon is rendered**

Add this assertion to the existing component-library toggle test:

```tsx
expect(screen.getByRole('button', { name: '引用组件库：已开启' }).querySelector('svg')).toBeTruthy();
```

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- TaskComposer.test.tsx
```

Expected: FAIL because the toggle still renders the `⊞` text character.

- [ ] **Step 3: Replace the glyph and remove font compensation**

Import and render the shared icon:

```tsx
import { WorkspaceIcon } from '../shell/WorkspaceIcon';

<span className="v3-task-composer__library-icon" aria-hidden="true">
  <WorkspaceIcon name="components" />
</span>
```

Use a fixed icon box and explicitly size the SVG; do not use font-family, glyph padding, or transforms:

```css
.v3-task-composer__library-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}
.v3-task-composer__library-icon svg {
  width: 14px;
  height: 14px;
}
```

- [ ] **Step 4: Run focused tests and type checking**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- TaskComposer.test.tsx
pnpm --filter @qt-ui-copilot/desktop typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 5: Package and visually verify**

Run:

```powershell
$env:PORTABLE_OUTPUT='E:\workspace\AI\apps\desktop\out\qt-ui-copilot-svg-alignment-win32-x64'
pnpm --filter @qt-ui-copilot/desktop package:portable
node test-results/ui-audit/run-audit.mjs
```

Expected: the SVG remains geometrically centered at regular desktop, 1366 px, and 1100 px widths and at 100%/125% DPI, with no clipping or state jump.
