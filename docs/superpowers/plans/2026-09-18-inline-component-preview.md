# Inline Component Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move component details, preview controls, preview feedback, and the task-selection action into the currently focused component card.

**Architecture:** `ComponentLibraryPanel` remains the owner of focus, preview, loading, and error state. `CapabilityCandidates` becomes responsible for rendering a structurally valid candidate row plus an optional details sibling inside the same card container, so no interactive control is nested inside another button.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Electron Forge portable packaging

**Spec:** `docs/superpowers/specs/2026-09-18-inline-component-preview-design.md`

## Global Constraints

- Only one component card may be expanded at a time.
- “正在查看” and “已加入任务” remain independent states.
- Preview loading and errors must appear inside the focused card.
- The existing standalone preview window behavior remains unchanged.
- Candidate row actions must not create nested buttons.

---

### Task 1: Add a Valid Inline Details Slot to Candidate Cards

**Files:**
- Modify: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.tsx`
- Test: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.test.tsx`

**Interfaces:**
- Consumes: `UiCapabilityCandidate`, `focusedId`, `selectedIds`, and `onSelect`.
- Produces: `renderDetails?: (candidate: UiCapabilityCandidate) => ReactNode`; the callback result is rendered only for the focused candidate.

- [ ] **Step 1: Write the failing inline-details test**

Add a test that renders two candidates with `focusedId="second"` and:

```tsx
renderDetails={(candidate) => <div data-testid={`details-${candidate.capabilityId}`}>详情</div>}
```

Assert `details-second` exists, `details-first` does not exist, and the focused card container includes class `is-expanded`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- CapabilityCandidates.test.tsx
```

Expected: FAIL because `renderDetails` is not a recognized prop and no inline detail node is rendered.

- [ ] **Step 3: Implement the card container and inline slot**

Define the prop as:

```tsx
renderDetails?: (candidate: UiCapabilityCandidate) => ReactNode;
```

Import `ReactNode` as a type. Render each item as:

```tsx
<article className={["v3-capability-card", selected ? "is-selected" : "", focused ? "is-focused is-expanded" : ""].filter(Boolean).join(" ")}>
  <button type="button" className="v3-capability-card__trigger" ...>...</button>
  {focused ? renderDetails?.(candidate) : null}
</article>
```

Keep `aria-pressed` on the trigger for task membership and `aria-current="true"` for focus. Do not render action buttons inside `v3-capability-card__trigger`.

- [ ] **Step 4: Run the candidate tests**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- CapabilityCandidates.test.tsx
```

Expected: all candidate tests PASS.

### Task 2: Move Component Details and Preview State Into the Focused Card

**Files:**
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`
- Test: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.test.tsx`

**Interfaces:**
- Consumes: `CapabilityCandidates.renderDetails` from Task 1.
- Produces: an inline `v3-component-detail` for the focused candidate; no detail node is rendered after the list.

- [ ] **Step 1: Write failing integration tests**

Add assertions that after clicking a candidate:

```tsx
const card = screen.getByRole('button', { name: /登录表单卡片/ }).closest('.v3-capability-card');
expect(within(card!).getByRole('button', { name: '预览组件' })).toBeTruthy();
expect(card?.querySelector('.v3-component-detail')).toBeTruthy();
```

Add a second candidate, switch focus, and assert the first card no longer contains `.v3-component-detail` while the second card does.

- [ ] **Step 2: Run the panel tests and verify they fail**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- ComponentLibraryPanel.test.tsx
```

Expected: FAIL because details are still rendered after the complete list.

- [ ] **Step 3: Extract the inline details renderer**

In `ComponentLibraryPanel`, define:

```tsx
const renderDetails = (candidate: UiCapabilityCandidate) => (
  <aside className="v3-component-detail" aria-label={`${candidate.displayName} 组件详情`}>
    ...
  </aside>
);
```

Pass it to `CapabilityCandidates` as `renderDetails={renderDetails}` and delete the bottom-level `{focused ? <aside ... /> : null}` block.

Keep these behaviors in the renderer:

- Source name, license, description, and inferred marker use the focused candidate data.
- Preview image uses `preview.imageDataUrl`.
- Preview calls `componentSources.preview` and then `preview.openWindow`.
- Join/remove calls `onToggle(candidate)`.
- Preview error is rendered as `<p className="v3-component-detail__error" role="alert">` inside the card.

- [ ] **Step 4: Clear stale preview state when focus changes**

Replace the direct `onSelect={setFocused}` handler with:

```tsx
onSelect={(candidate) => {
  setFocused(candidate);
  setPreview(undefined);
  setError(undefined);
}}
```

When search/source results refresh, clear `focused`, `preview`, and `error` if the focused capability is absent from the new results.

- [ ] **Step 5: Run the panel and candidate tests**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- ComponentLibraryPanel.test.tsx CapabilityCandidates.test.tsx
```

Expected: all tests PASS, including standalone preview window invocation.

### Task 3: Polish the Expanded Card and Verify the Portable Build

**Files:**
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Test: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.test.tsx`

**Interfaces:**
- Consumes: `.v3-capability-card`, `.v3-capability-card__trigger`, `.v3-component-detail`, and `.v3-component-detail__error` from Tasks 1–2.
- Produces: a compact inline accordion layout suitable for the current narrow sidebar.

- [ ] **Step 1: Update card styling**

Move border, background, focus, selected, and hover styling from the old direct list button selectors onto `.v3-capability-card`. Give the trigger a transparent background and no border. Use `.is-expanded` to remove the trigger’s bottom border radius and visually connect the details panel.

Apply these layout constraints:

```css
.v3-capability-card { overflow: hidden; border: 1px solid var(--border-default); border-radius: 7px; background: var(--surface-2); }
.v3-capability-card__trigger { width: 100%; padding: 9px; border: 0; background: transparent; }
.v3-component-detail { margin: 0; padding: 0 10px 10px; border: 0; border-top: 1px solid var(--border-subtle); border-radius: 0; }
.v3-component-detail__error { margin: 0; color: var(--danger-text); font-size: 10px; line-height: 1.4; }
```

Keep the two action buttons in a two-column grid and retain a maximum preview image height of 190px.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test
pnpm --filter @qt-ui-copilot/desktop typecheck
git diff --check
```

Expected: all desktop tests PASS, TypeScript exits successfully, and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Build the portable application**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop package:portable
```

Expected executable:

```text
apps/desktop/out/qt-ui-copilot-portable-win32-x64/qt-ui-copilot.exe
```
