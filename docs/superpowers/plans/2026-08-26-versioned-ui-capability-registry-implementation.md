# Versioned UI Capability Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one version-aware registry for Qt 5/6 widgets, local `.ui` fragments, and existing Promoted Widgets, then expose safe capability IDs to the two-stage UI generator.

**Architecture:** Capability sources produce validated `UiCapability` records. A registry merges and filters them for the bound Qt Kit, while a resolver checks project dependencies and chooses deterministic fallbacks. Existing component-library indexing and insertion remain authoritative for `.ui` fragments.

**Tech Stack:** TypeScript, Zod, existing `@qt-ui-copilot/component-library`, `ui-document`, Electron IPC, React, Vitest, Qt 5.9.6 and Qt 6.10.2 `uic`.

**Spec:** `docs/superpowers/specs/2026-08-26-versioned-ui-capability-registry-design.md`

## Global Constraints

- Minimum supported Qt version is Qt 5.9.6.
- First phase supports Qt Widgets, `.ui` fragments, and existing Promoted Widgets only.
- Do not copy or generate C++ implementations.
- Do not modify CMake/qmake or install Qt modules/plugins.
- Remote vector search remains optional and cannot block local generation.
- AI selects capability IDs; application code owns class names, headers, paths, XML, dependencies, and fallbacks.

---

### Task 1: Capability Contracts

**Files:**
- Create: `packages/contracts/src/ui-capability.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/ui-capability.test.ts`

**Interfaces:**
- Produces: `UiCapabilitySchema`, `UiCapabilityCandidateSchema`, `UiCapability`, `UiCapabilityCandidate`, `UiCapabilityKind`.
- Consumed by: all registry sources, resolver, IPC, and renderer.

- [ ] **Step 1: Write failing contract tests**

```ts
const capability = UiCapabilitySchema.parse({
  id: 'qt.widgets.QPushButton', kind: 'qt_widget', displayName: 'Push Button', description: 'Command button', tags: ['button'],
  qt: { minVersion: '5.9.6', modules: ['Widgets'], verifiedKitIds: [] },
  designer: { className: 'QPushButton', container: false },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
  source: { type: 'builtin' },
});
expect(capability.id).toBe('qt.widgets.QPushButton');
expect(() => UiCapabilitySchema.parse({ ...capability, designer: { className: '../bad', container: false } })).toThrow();
```

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts exec vitest run test/ui-capability.test.ts`

Expected: FAIL because capability schemas are not exported.

- [ ] **Step 3: Implement strict schemas**

Use `z.enum(['qt_widget', 'ui_fragment', 'promoted_widget'])`, semantic version strings matching `/^\d+\.\d+(?:\.\d+)?$/`, Qt class names matching `/^[A-Za-z_][A-Za-z0-9_:]*$/`, bounded dependency arrays, and source types `builtin|local_library|project|remote`.

- [ ] **Step 4: Run contracts tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ui-capability.ts packages/contracts/src/index.ts packages/contracts/test/ui-capability.test.ts
git commit -m "feat: add UI capability contracts"
```

### Task 2: Versioned Qt Widget Source

**Files:**
- Create: `packages/ui-document/src/qt-widget-capability-source.ts`
- Modify: `packages/ui-document/src/qt-widget-catalog.ts`
- Modify: `packages/ui-document/src/index.ts`
- Test: `packages/ui-document/test/qt-widget-capability-source.test.ts`

**Interfaces:**
- Consumes: existing `QT_WIDGET_CLASSES`.
- Produces: `QtWidgetCapabilitySource.list(): UiCapability[]` and `QtWidgetCapabilitySource.forKit(input): UiCapability[]`.

- [ ] **Step 1: Write failing version-filter tests**

```ts
const source = new QtWidgetCapabilitySource();
expect(source.forKit({ version: '5.9.6', modules: ['Widgets'] }).some((item) => item.designer.className === 'QStatusBar')).toBe(true);
expect(source.forKit({ version: '5.9.6', modules: ['Widgets'] }).some((item) => item.qt.minVersion === '6.0.0')).toBe(false);
expect(source.forKit({ version: '6.10.2', modules: ['Widgets'] }).every((item) => item.qt.modules.every((module) => ['Widgets'].includes(module)))).toBe(true);
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document exec vitest run test/qt-widget-capability-source.test.ts`

Expected: FAIL because the source does not exist.

- [ ] **Step 3: Implement semantic version and module filtering**

```ts
export interface QtCapabilityKit { id?: string; version: string; modules: string[]; }
export class QtWidgetCapabilitySource {
  list(): UiCapability[];
  forKit(kit: QtCapabilityKit): UiCapability[];
}
```

Populate concrete Designer-safe Qt 5.9.6 widgets from the centralized catalog. Keep optional module controls out of the default Widgets source. Add explicit metadata for main-window containers and fallback classes.

- [ ] **Step 4: Run UI document tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-document/src packages/ui-document/test/qt-widget-capability-source.test.ts
git commit -m "feat: add versioned Qt widget capabilities"
```

### Task 3: Registry and Dependency Resolver

**Files:**
- Create: `packages/component-library/src/capability-registry.ts`
- Create: `packages/component-library/src/capability-resolver.ts`
- Modify: `packages/component-library/src/index.ts`
- Test: `packages/component-library/test/capability-registry.test.ts`
- Test: `packages/component-library/test/capability-resolver.test.ts`

**Interfaces:**
- Produces: `UiCapabilityRegistry.registerSource(source)`, `listForKit(kit)`, `search(query)`.
- Produces: `UiCapabilityResolver.resolve(capability, project): CapabilityResolution`.

- [ ] **Step 1: Write failing merge/filter tests**

```ts
const registry = new UiCapabilityRegistry([builtinSource, localSource]);
expect(registry.listForKit({ id: 'qt59', version: '5.9.6', modules: ['Widgets'] }).map((item) => item.id)).toEqual(['local.login-panel', 'qt.widgets.QPushButton']);
expect(registry.get('qt.widgets.QPushButton')?.source.type).toBe('builtin');
```

- [ ] **Step 2: Write failing resolver tests**

```ts
const result = resolver.resolve(promotedCapability, { qtVersion: '5.9.6', modules: ['Widgets'], files: [], qss: [], qrc: [], fonts: [] });
expect(result.status).toBe('degraded');
expect(result.selectedCapabilityId).toBe(promotedCapability.fallback!.capabilityId);
expect(result.findings[0].code).toBe('promoted_header_missing');
```

- [ ] **Step 3: Implement registry determinism**

Deduplicate by capability ID, reject conflicting records, sort by source priority `project > local_library > builtin > remote`, then stable-sort by ID. Remote source failures return no candidates and an informational finding.

- [ ] **Step 4: Implement resolution statuses**

```ts
type CapabilityResolution = { status: 'ready' | 'degraded' | 'blocked'; requestedCapabilityId: string; selectedCapabilityId?: string; findings: CapabilityFinding[] };
```

Check Qt version, modules, header path, QSS/QRC/font files, promoted dependencies, and fallback cycles. Limit fallback depth to 8.

- [ ] **Step 5: Run component-library tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/component-library test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/component-library/src packages/component-library/test/capability-*.test.ts
git commit -m "feat: resolve versioned UI capabilities"
```

### Task 4: Existing Component Library Adapter

**Files:**
- Create: `packages/component-library/src/local-component-capability-adapter.ts`
- Test: `packages/component-library/test/local-component-capability-adapter.test.ts`
- Modify: `packages/component-library/src/index.ts`

**Interfaces:**
- Consumes: existing `ComponentRecord` and `ComponentCandidate`.
- Produces: `LocalComponentCapabilityAdapter.fromRecord(record): UiCapability` and `toCandidate(candidate): UiCapabilityCandidate`.

- [ ] **Step 1: Write failing adapter tests**

```ts
const capability = adapter.fromRecord(componentRecord);
expect(capability.kind).toBe('ui_fragment');
expect(capability.dependencies.qrc).toEqual(componentRecord.qrcDependencies);
expect(capability.source).toMatchObject({ type: 'local_library', path: componentRecord.sourceUiFile });
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/component-library exec vitest run test/local-component-capability-adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement lossless mapping**

Map widget classes, layout types, tags, QSS/QRC dependencies, customWidgets, screenshot paths, source UI path, and structure summary. Do not duplicate FTS/vector indexing; adapter calls the existing catalog search and maps results.

- [ ] **Step 4: Run component tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/component-library test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/component-library/src/local-component-capability-adapter.ts packages/component-library/src/index.ts packages/component-library/test/local-component-capability-adapter.test.ts
git commit -m "feat: adapt local components into UI capabilities"
```

### Task 5: Project Promoted Widget Scanner and XML Generator

**Files:**
- Create: `packages/component-library/src/promoted-widget-scanner.ts`
- Create: `packages/ui-document/src/promoted-widget-generator.ts`
- Modify: `packages/component-library/src/index.ts`
- Modify: `packages/ui-document/src/index.ts`
- Test: `packages/component-library/test/promoted-widget-scanner.test.ts`
- Test: `packages/ui-document/test/promoted-widget-generator.test.ts`

**Interfaces:**
- Produces: `scanPromotedWidgets(projectFiles): UiCapability[]`.
- Produces: `ensurePromotedWidget(source, capability): { source: string; inserted: boolean }`.

- [ ] **Step 1: Write failing scanner tests**

Use a fixture `.ui` containing one `<customwidget>` and a matching header file. Verify class, extends, header, container, Qt metadata, and project source path.

- [ ] **Step 2: Write failing generator tests**

```ts
const first = ensurePromotedWidget(source, capability);
const second = ensurePromotedWidget(first.source, capability);
expect(first.inserted).toBe(true);
expect(second.inserted).toBe(false);
expect((second.source.match(/<class>NetworkSettingsPanel<\/class>/g) ?? []).length).toBe(1);
```

- [ ] **Step 3: Implement bounded scanning**

Scan existing `.ui` customwidgets plus explicitly declared project header paths. Do not infer class names from arbitrary C++ parsing. Reject paths outside the workspace.

- [ ] **Step 4: Implement deterministic customwidgets insertion**

Append or merge `<customwidgets>` before `<resources>`/`<connections>`/`</ui>`, preserve formatting, validate with `parseUi`, and deduplicate by class.

- [ ] **Step 5: Run package tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/component-library test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/component-library packages/ui-document
git commit -m "feat: support existing promoted widgets"
```

### Task 6: Capability-Aware Two-Stage Generation

**Files:**
- Modify: `packages/contracts/src/v3-ui-intent.ts`
- Modify: `apps/desktop/src/main/ai/ui-intent-planner.ts`
- Modify: `apps/desktop/src/main/ai/ui-creation-task-service.ts`
- Modify: `apps/desktop/src/main/ai/ui-creation-service.ts`
- Test: `apps/desktop/src/main/ai/ui-capability-generation.test.ts`

**Interfaces:**
- Extends Canonical node with optional `capabilityId`.
- Consumes `UiCapabilityRegistry` candidates and resolver results.
- Produces candidate findings for used, degraded, skipped, and blocked capabilities.

- [ ] **Step 1: Write failing generation tests**

```ts
expect(intent.tree.children[0].capabilityId).toBe('local.network-panel');
expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'capability_degraded' }));
expect(result.enhancedSource).toContain('<customwidget>');
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/ui-capability-generation.test.ts`

Expected: FAIL because planners do not accept capability candidates.

- [ ] **Step 3: Expose bounded candidates to AI**

Send at most 20 `UiCapabilityCandidate` records. AI may return only capability IDs present in this request. Unknown IDs are ignored with `capability_unknown` warning and semantic widget fallback.

- [ ] **Step 4: Resolve and insert deterministically**

Official widget capability maps to className; `.ui` fragments use existing safe insertion; promoted widget uses base widget plus customwidgets declaration. Validate after each insert and restore `lastValidCandidate` on failure.

- [ ] **Step 5: Run desktop tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/v3-ui-intent.ts apps/desktop/src/main/ai
git commit -m "feat: generate UIs from registered capabilities"
```

### Task 7: V3 Capability UI and Qualification

**Files:**
- Create: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.tsx`
- Test: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `tests/e2e/v3-ide.spec.ts`
- Modify: `docs/v3-user-guide.md`

**Interfaces:**
- IPC: `v3.capabilities.search({ workspaceId, requirement, qtKitId }): Promise<UiCapabilityCandidate[]>`.
- Renderer displays candidates and final resolution status.

- [ ] **Step 1: Write failing renderer tests**

```tsx
expect(screen.getByText('Network Settings Panel')).toBeTruthy();
expect(screen.getByText('Qt 5.9.6+')).toBeTruthy();
expect(screen.getByText('Promoted Widget')).toBeTruthy();
expect(screen.getByText('缺少 QRC，将降级')).toBeTruthy();
```

- [ ] **Step 2: Implement IPC boundary**

Validate workspace ID, requirement length, Qt Kit ID, result count, and schema. Renderer never receives raw component XML or source contents through this endpoint.

- [ ] **Step 3: Implement V3 component candidates**

Display name, source, type, Qt version, match reasons, dependency status, and fallback. Selection remains optional; AI may choose automatically from the same bounded candidate list.

- [ ] **Step 4: Add Qt 5/6 and E2E gates**

Cover Qt 5.9.6 exclusion of Qt 6-only capabilities, Qt 6 acceptance, `.ui` fragment insertion, promoted widget generation, missing header fallback, Explorer refresh, and Problems findings.

- [ ] **Step 5: Run complete qualification**

```powershell
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e
```

Expected: all workspace tests pass; V3 Qt 5.9.6 and Qt 6.10.2 E2E gates pass; legacy qualified desktop tests may remain explicitly skipped when their external fixtures are unavailable.

- [ ] **Step 6: Update documentation and commit**

```bash
git add apps/desktop/src/renderer/v3 apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts tests/e2e/v3-ide.spec.ts docs/v3-user-guide.md
git commit -m "feat: expose versioned UI capabilities in V3"
```
