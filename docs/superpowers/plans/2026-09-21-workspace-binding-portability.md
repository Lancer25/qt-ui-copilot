# Workspace Binding Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make folder opening read-only, make current-device Qt bindings immediately usable, and make project-profile synchronization explicit, portable, and failure-tolerant.

**Architecture:** Keep `WorkspaceService.open` as a non-mutating discovery operation. Store full Kit paths only in the local settings binding; add an explicit profile-sync operation that atomically creates and writes a portable project descriptor without local executable paths. The renderer separates “保存本机绑定” from “同步到项目”.

**Tech Stack:** TypeScript, Node filesystem APIs, React, Vitest, existing WorkspaceService and SettingsRepository

**Spec:** `docs/superpowers/specs/2026-09-21-workspace-binding-portability-design.md`

## Global Constraints

- Opening a folder never creates `.qt-ui-copilot`.
- Local binding success must not depend on project-directory write access.
- Project sync writes only portable Kit requirements, never absolute Qt tool paths.
- Synchronization uses parent-directory creation, temporary file and atomic rename.
- Failure to sync returns a friendly status while preserving the local binding.

---

### Task 1: Add atomic project-profile synchronization to WorkspaceService

**Files:**
- Modify: `apps/desktop/src/main/workspace/workspace-service.ts`
- Modify: `apps/desktop/src/main/workspace/workspace-service.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Produces `workspace.syncProjectProfile(workspaceId, profile)`.
- Consumes a JSON-safe portable profile descriptor.

- [ ] **Step 1: Add failing workspace tests**

Test that opening a fresh project leaves `.qt-ui-copilot` absent. Test that `syncProjectProfile` creates the parent directory and writes `project.json`. Test that the stored JSON excludes `uic`, `rcc`, `binDirectory`, `cmake`, and absolute Qt roots.

- [ ] **Step 2: Implement atomic profile sync**

Validate the workspace id, create `<root>/.qt-ui-copilot`, write `project.json.tmp-<random>`, then rename it to `project.json`. Serialize only `id`, logical Qt fingerprint, build backend, relative build directory, relative executable, and preview preferences.

- [ ] **Step 3: Expose typed IPC**

Add a dedicated `v3.workspace.syncProjectProfile` handler and preload/API method. Do not reuse generic `writeText` for profile initialization.

- [ ] **Step 4: Run focused tests**

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- workspace-service.test.ts register-v3-ipc.test.ts
pnpm --filter @qt-ui-copilot/desktop typecheck
```

---

### Task 2: Separate local binding save from optional project sync

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.tsx`
- Modify: `apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.test.tsx`
- Modify: `apps/desktop/src/main/settings/project-binding-service.ts`

**Interfaces:**
- Produces a saved local `ProjectBinding` even when profile sync is not requested or fails.
- Consumes the selected workspace, local Kit and optional sync choice.

- [ ] **Step 1: Add failing UI tests**

Test that an opened workspace is auto-selected. Test “保存本机绑定” calls only `saveProjectBinding`. Test “同步到项目” calls the new workspace sync API after local save. Test sync failure leaves a success/degraded message rather than replacing local-save success with a raw stack.

- [ ] **Step 2: Refactor panel actions**

Replace the implicit write in `save()` with two actions: “保存本机绑定” and “同步到项目”. Make the project selector default to the project whose root matches the open workspace. Change copy to explain that Qt paths stay local.

- [ ] **Step 3: Generate portable descriptor**

Use selected Kit version/major/ABI/architecture and normalized relative build/executable paths. Exclude absolute tool executables.

- [ ] **Step 4: Run renderer tests**

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- ProjectBindingPanel.test.tsx SettingsPage.test.tsx
```

---

### Task 3: Match portable project requirements to local Kits

**Files:**
- Modify: `apps/desktop/src/main/workspace/workspace-service.ts`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Test: workspace/V3 app tests

**Interfaces:**
- Produces a workspace profile with only logical Kit fingerprint.
- Consumes local Kit list through existing settings APIs when binding is opened.

- [ ] **Step 1: Add matching tests**

Test a profile containing Qt 5 + `msvc2015_64` matches only a local Kit with the same version-major/ABI. Test missing match leaves the workspace usable and presents a binding-required state.

- [ ] **Step 2: Implement non-destructive matching**

Never hydrate old absolute paths into the live workspace profile. Preserve browse/AI mode, and show the local binding prompt only for preview/build operations requiring tools.

- [ ] **Step 3: Package and verify**

Open a new directory without `.qt-ui-copilot`, save a local binding, then explicitly sync. Verify the profile exists, has no absolute Qt paths, and a copied project on a second profile requires local Kit selection rather than failing with `ENOENT`.
