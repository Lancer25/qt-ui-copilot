# Qt Binary Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import local Qt component libraries containing headers, QSS/QRC, DLL and LIB files; map incomplete libraries safely; integrate compatible components into generated or maintained Qt projects; preview them outside the main process.

**Architecture:** Add a `qt_binary` component-source contract and a dedicated scanner that returns conservative discovery records rather than pretending headers are safely loadable components. Persist user-approved mappings as source configuration, expose them through the existing component-source service and settings UI, then materialize only compatible mappings into QMake/project assets. Preview requests run in an isolated helper process and never load unknown DLLs in Electron's main process.

**Tech Stack:** TypeScript, Zod, Node filesystem/process APIs, React, Qt Widgets/QMake, existing PreviewHost and component-source services

**Spec:** `docs/superpowers/specs/2026-09-20-qt-binary-component-library-design.md`

## Global Constraints

- Never load an unknown third-party DLL inside Electron main or renderer processes.
- Store only source-root-relative paths; reject symlinks and paths outside the imported directory.
- A mapping is usable only after class, header, binary mapping, Qt version and ABI compatibility are known.
- Preserve existing `local`, `mcp_stdio`, `mcp_http`, and `bundled` source behavior.
- New-project QMake integration is additive; existing projects receive minimal patches only.

---

### Task 1: Contracts and conservative binary-library scanner

**Files:**
- Modify: `packages/contracts/src/component-source.ts`
- Create: `packages/component-library/src/qt-binary-source-adapter.ts`
- Modify: `packages/component-library/src/index.ts`
- Create: `packages/component-library/test/qt-binary-source-adapter.test.ts`

**Interfaces:**
- Produces `QtBinarySourceConfig`, `QtBinaryComponentMapping`, and `QtBinaryDiscoveryItem`.
- Consumes a local root directory containing headers/resources/binaries.

- [ ] **Step 1: Add failing contract and scanner tests**

Cover a fixture with `FancyCard.hpp`, `FancyCard.lib`, `FancyCard.dll`, `styles/fancy.qss`, and `resources/fancy.qrc`. Assert scanner identifies `class FancyCard : public QWidget`, keeps every path relative, associates matching resources, and returns `status: 'needs_mapping'` if ABI or Qt version is absent. Add a symlink/`../` negative test.

- [ ] **Step 2: Add contract schemas**

Add a `qt_binary` discriminated source input with:

```ts
config: {
  rootDir: string;
  discovery: 'manifest' | 'scan' | 'hybrid';
  qtKitId?: string;
  mappings?: QtBinaryComponentMapping[];
}
```

Each mapping has a component id, class name, base class, header, optional dll/lib/qss/qrc paths, Qt modules, optional Qt major/ABI/architecture, designer-plugin flag, default size, and `approved` boolean.

- [ ] **Step 3: Implement lexical discovery**

Walk bounded source files, skip symlinks, parse headers with anchored class/base and `Q_OBJECT` patterns, associate same-stem binaries/resources, and compute content hashes. Do not mark a header-only discovery as ready.

- [ ] **Step 4: Run tests**

```powershell
pnpm --filter @qt-ui-copilot/component-library test -- qt-binary-source-adapter.test.ts
pnpm --filter @qt-ui-copilot/contracts test -- component-source.test.ts
```

Expected: discovered records are schema-valid and no path escapes the source root.

---

### Task 2: Source persistence, compatibility and service integration

**Files:**
- Modify: `apps/desktop/src/main/components/component-source-service.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Test: `apps/desktop/src/main/components/component-source-service.test.ts`

**Interfaces:**
- Produces save/sync/search records for `qt_binary` sources.
- Consumes `QtBinarySourceConfig` and the selected workspace Qt Kit.

- [ ] **Step 1: Add failing service tests**

Test saving a binary source, syncing a pending mapping, then approving a compatible mapping. Assert ready items are searchable while pending/incompatible items include a reason and cannot be selected for materialization.

- [ ] **Step 2: Register the source adapter**

Route `qt_binary` through the new adapter. Validate all saved mapping paths against the source root. Store mappings in the existing source config JSON and retain health/item count behavior.

- [ ] **Step 3: Add ABI gate**

Compare mapping Qt major/compiler ABI/architecture with the selected Kit. Return `incompatible` or `needs_mapping` with explicit Chinese reason; never infer compatibility from a DLL filename alone.

- [ ] **Step 4: Expose IPC and renderer API**

Add typed save/list/sync operations without widening unrelated IPC payloads.

- [ ] **Step 5: Run focused validation**

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- component-source-service.test.ts register-v3-ipc.test.ts
pnpm --filter @qt-ui-copilot/desktop typecheck
```

---

### Task 3: Mapping editor and component-library presentation

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`
- Modify: related CSS and tests

**Interfaces:**
- Produces an editable mapping for every `needs_mapping` binary discovery.
- Consumes source discovery status and selected Qt Kit.

- [ ] **Step 1: Add UI tests**

Test selecting “Qt 动态组件库”, choosing a directory, rendering a pending row, editing class/header/DLL/LIB/ABI fields, and saving an approved mapping. Test unavailable entries cannot be added to the current task.

- [ ] **Step 2: Add source form and mapping table**

Show type, root directory, discovery mode, Kit selector, and a compact mapping editor. Mark incomplete fields inline; preserve user data when changing tabs.

- [ ] **Step 3: Add library cards**

Show source type, class name, ABI status, resource badges, and preview state. Provide “配置映射” for pending entries rather than a misleading add button.

- [ ] **Step 4: Run renderer tests and inspect desktop layout**

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- ComponentSourcesPanel.test.tsx ComponentLibraryPanel.test.tsx
```

---

### Task 4: UI-document and project materialization

**Files:**
- Modify: `packages/component-library/src/catalog.ts`
- Modify: `apps/desktop/src/main/ai/component-materializer.ts`
- Modify: `apps/desktop/src/main/ai/qt-project-scaffolder.ts`
- Modify: project build profile/materialization tests

**Interfaces:**
- Produces promoted-widget XML, QMake include/link directives, resource references, and runtime DLL copy instructions.
- Consumes approved compatible binary mappings only.

- [ ] **Step 1: Add failing materialization tests**

Assert `FancyCard` creates a `<customwidget>` declaration with header, emits QMake `INCLUDEPATH`, `LIBS`, `PRE_TARGETDEPS`, QSS/QRC references, and a runtime DLL copy instruction. Assert incompatible/pending mappings make no document or build changes.

- [ ] **Step 2: Implement catalog records for binary widgets**

Represent class/header/resources/build requirements separately from `.ui` fragments so existing insertion logic remains unchanged.

- [ ] **Step 3: Generate minimal QMake integration**

For new apps append deterministic relative paths. For existing projects create a reviewable patch and never overwrite user `LIBS`/`INCLUDEPATH` entries.

- [ ] **Step 4: Run integration tests**

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- component-materializer.test.ts qt-project-scaffolder.test.ts
```

---

### Task 5: Isolated discovery and preview

**Files:**
- Create: `apps/desktop/src/main/components/qt-binary-probe-service.ts`
- Modify: `apps/desktop/src/main/components/component-preview-service.ts`
- Modify: `native/qt-ui-preview-host/` only if a dedicated probe mode is needed
- Test: probe and preview service tests

**Interfaces:**
- Produces bounded probe/preview results with `ready`, `timeout`, `crashed`, or `incompatible` status.
- Consumes an approved mapping and explicit user trust confirmation keyed by source hash.

- [ ] **Step 1: Add failure-mode tests**

Test denied first load, ABI mismatch, process timeout, and child-process crash. Assert the main process remains alive and errors are user-facing.

- [ ] **Step 2: Implement isolated probe launch**

Start a child process with a temporary working directory, selected Kit paths, timeout, bounded stdout/stderr, and no inherited arbitrary environment. Designer plugins use plugin paths; ordinary widgets compile/link a temporary preview harness and copy mapped DLLs.

- [ ] **Step 3: Wire trust confirmation and preview UI**

Require explicit confirmation before first DLL probe. Cache only successful results by content hash and Kit identity.

- [ ] **Step 4: Package and visual verification**

Run all desktop/component tests, typecheck, create a portable package, then import a fixture binary library, finish mapping, add it to a task, and verify preview failure/success states without crashing the app.
