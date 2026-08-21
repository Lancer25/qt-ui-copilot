# Qt UI Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a packaged Electron application that safely edits Qt Widgets `.ui` files, previews them with project resources, validates them in a real Qt application through QtUiProbe, reuses indexed UI components, and optionally uses UI-TARS for guided navigation.

**Architecture:** Electron Main owns an explicit persisted workflow and launches two isolated native/Node workers: a per-Qt-Kit PreviewHost and an optional UI-TARS worker. Target Qt applications link a C++11 QtUiProbe in test builds and expose a token-protected local JSON-lines protocol. AI calls are restricted to structured planning and visual review; deterministic code owns XML patches, builds, routes, validation, acceptance, and rollback.

**Tech Stack:** Node.js 24, pnpm, Electron Forge/Vite/React/TypeScript, Zod, SQLite/Drizzle, Monaco, Vercel AI SDK, Vitest, Playwright, CMake 3.10+, qmake, C++11, Qt 5.9.6 and Qt 6.x, Qt Test, `@ui-tars/sdk@1.2.3`, `@ui-tars/operator-nut-js@1.2.3`, `uuid@11`.

**Spec:** `docs/superpowers/specs/2026-08-21-qt-ui-copilot-design.md`

## Global Constraints

- The minimum supported Qt version is exactly Qt 5.9.6; every native source file must compile as C++11.
- Preview and validation always use the target project's own `uic`, `rcc`, Qt libraries, compiler ABI, architecture, and Debug/Release configuration.
- The MVP supports Qt Widgets `.ui`; QML and C++-only dynamic UI creation are out of scope.
- Models never write XML or execute shell strings directly; they emit Zod-validated plans and deterministic services perform mutations.
- Candidate changes remain reversible until explicit acceptance; no failed validation may overwrite the accepted baseline.
- Cloud vector search is not an MVP dependency; local SQLite FTS and structural ranking must work offline.
- QtUiProbe exists only in opt-in test builds, uses a random session token, and exposes a fixed method allowlist.
- UI-TARS is an optional, isolated Windows navigation aid and cannot determine whether a page or test passed.
- Electron Renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and a sandboxed preload allowlist.
- Every task ends with focused automated tests and a commit; unrelated refactors are excluded.

---

## Planned File Structure

```text
apps/desktop/
  forge.config.ts
  package.json
  src/main/main.ts
  src/main/ipc/register-ipc.ts
  src/preload/index.ts
  src/renderer/App.tsx
  src/renderer/features/projects/ProjectSidebar.tsx
  src/renderer/features/workflow/WorkflowTimeline.tsx
  src/renderer/features/preview/PreviewComparison.tsx
  src/renderer/features/components/ComponentCandidates.tsx
  src/renderer/features/diff/UiDiffPanel.tsx
  src/renderer/lib/api.ts
packages/contracts/
  src/index.ts
  src/project.ts
  src/ui-document.ts
  src/workflow.ts
  src/probe.ts
  src/preview.ts
  src/component.ts
packages/task-store/
  src/database.ts
  src/schema.ts
  src/task-repository.ts
packages/project-core/
  src/project-profile.ts
  src/project-scan.ts
  src/toolchain-probe.ts
  src/process-runner.ts
  src/artifact-store.ts
packages/ui-document/
  src/parse-ui.ts
  src/ui-index.ts
  src/apply-operations.ts
  src/text-patch.ts
  src/candidate-file.ts
  src/validate-ui.ts
packages/preview-client/
  src/preview-host-builder.ts
  src/preview-client.ts
packages/probe-client/
  src/probe-client.ts
  src/page-matcher.ts
  src/route-runner.ts
packages/component-library/
  src/catalog.ts
  src/search.ts
  src/insert-component.ts
packages/agent-workflow/
  src/model-provider.ts
  src/planner.ts
  src/visual-critic.ts
  src/workflow-machine.ts
packages/ui-tars-worker/
  src/worker.ts
  src/window-scoped-operator.ts
native/qt-ui-preview-host/
  CMakeLists.txt
  src/main.cpp
  src/PreviewRequest.cpp
  src/ResourceLoader.cpp
  src/FormLoader.cpp
  tests/tst_previewhost.cpp
  tests/fixtures/resource-form.ui
  tests/fixtures/common.qrc
  tests/fixtures/preview.qss
  tests/fixtures/icon.png
native/qt-ui-probe/
  CMakeLists.txt
  qt-ui-probe.pri
  include/QtUiProbe/QtUiProbe.h
  src/QtUiProbe.cpp
  src/ProbeServer.cpp
  src/ObjectInspector.cpp
  src/WidgetCapture.cpp
  src/RouteRecorder.cpp
  src/SemanticExecutor.cpp
  tests/tst_qtuiprobe.cpp
  tests/TestClient.h
  tests/TestClient.cpp
fixtures/qt59-app/
  resources/common.qrc
  resources/dark.qss
fixtures/qt6-app/
fixtures/component-library/
tests/e2e/
  desktop.spec.ts
```

### Task 1: Secure Electron Workspace and Shared Contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/forge.config.ts`
- Create: `apps/desktop/src/main/main.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/project.ts`
- Create: `packages/contracts/src/ui-document.ts`
- Create: `packages/contracts/src/workflow.ts`
- Create: `packages/contracts/src/probe.ts`
- Create: `packages/contracts/src/preview.ts`
- Create: `packages/contracts/src/component.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: None.
- Produces: `ProjectProfileSchema`, `UiOperationSchema`, `UiPlanSchema`, `VisualReviewSchema`, `WorkflowEventSchema`, `ProbeRequestSchema`, `ProbeResponseSchema`, `PreviewRequestSchema`, `PreviewResultSchema`, `ComponentRecordSchema`, and inferred TypeScript types exported by `@qt-ui-copilot/contracts`.

- [ ] **Step 1: Create the workspace manifests and a failing contracts test**

Pin the application baseline to Node 24, Electron `40.0.0`, Electron Forge `7.11.1`, React `19.2.4`, TypeScript `5.8.3`, Vite `5.4.17`, Vitest `3.1.1`, Zod `4.3.6`, and pnpm `10.15.0`. Declare root scripts `typecheck`, `test`, `test:native:qt59`, `test:native:qt6`, `test:e2e`, and `make` in the root manifest.

```ts
import { describe, expect, it } from 'vitest';
import { ProjectProfileSchema, UiOperationSchema } from '../src/index';

describe('shared contracts', () => {
  it('rejects shell-string build commands and accepts argv arrays', () => {
    expect(() => ProjectProfileSchema.parse({
      id: 'demo', rootDir: 'D:/demo', qt: { version: '5.9.6', uic: 'D:/Qt/bin/uic.exe', rcc: 'D:/Qt/bin/rcc.exe' },
      build: { command: 'cmake --build build' }, run: { executable: 'D:/demo/build/demo.exe' }
    })).toThrow();
  });

  it('accepts a constrained property operation', () => {
    expect(UiOperationSchema.parse({ op: 'setProperty', target: 'saveButton', name: 'text', value: '保存' }).op)
      .toBe('setProperty');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing exports fail**

Run: `pnpm install && pnpm --filter @qt-ui-copilot/contracts test`

Expected: FAIL because `ProjectProfileSchema` and `UiOperationSchema` do not exist.

- [ ] **Step 3: Implement Zod contracts and the secure Electron window**

```ts
export const CommandSchema = z.object({ executable: z.string().min(1), args: z.array(z.string()).default([]) });
export const ProjectProfileSchema = z.object({
  id: z.string().min(1), rootDir: z.string().min(1),
  qt: z.object({ version: z.string().min(1), uic: z.string().min(1), rcc: z.string().min(1) }),
  build: z.object({ command: CommandSchema }),
  run: z.object({ executable: z.string().min(1), args: z.array(z.string()).default([]), environment: z.record(z.string()).default({}) })
});
```

Use this exact discriminated union throughout the workspace:

```ts
type SizePolicy = 'Fixed' | 'Minimum' | 'Maximum' | 'Preferred' | 'Expanding' | 'MinimumExpanding' | 'Ignored';
type UiValue = string | number | boolean
  | { kind: 'enum'; value: string }
  | { kind: 'size'; width: number; height: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'stringList'; values: string[] }
  | { kind: 'icon'; resourcePath: string };

type UiOperation =
  | { op: 'addWidget'; parentLayout: string; widgetClass: string; objectName: string; before?: string; properties?: Record<string, UiValue> }
  | { op: 'removeWidget'; target: string }
  | { op: 'moveWidget'; target: string; parentLayout: string; before?: string }
  | { op: 'setProperty'; target: string; name: string; value: UiValue }
  | { op: 'createLayout'; parentWidget: string; layoutClass: 'QHBoxLayout' | 'QVBoxLayout' | 'QGridLayout' | 'QFormLayout'; objectName: string }
  | { op: 'wrapInLayout'; targets: string[]; layoutClass: 'QHBoxLayout' | 'QVBoxLayout' | 'QGridLayout' | 'QFormLayout'; objectName: string }
  | { op: 'setLayoutProperty'; target: string; name: 'spacing' | 'leftMargin' | 'topMargin' | 'rightMargin' | 'bottomMargin' | 'stretch'; value: number | string }
  | { op: 'addSpacer'; parentLayout: string; objectName: string; orientation: 'Horizontal' | 'Vertical'; sizeType: 'Minimum' | 'Expanding' }
  | { op: 'setSizePolicy'; target: string; horizontal: SizePolicy; vertical: SizePolicy; horizontalStretch?: number; verticalStretch?: number }
  | { op: 'setTabOrder'; order: string[] }
  | { op: 'setBuddy'; label: string; buddy: string }
  | { op: 'addExistingConnection'; sender: string; signal: string; receiver: string; slot: string }
  | { op: 'insertComponent'; componentId: string; parentLayout: string; objectPrefix: string; before?: string };
```

Create the BrowserWindow with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and expose only typed request methods from preload.

- [ ] **Step 4: Run contract, type, and Electron smoke tests**

Run: `pnpm --filter @qt-ui-copilot/contracts test && pnpm typecheck && pnpm --filter @qt-ui-copilot/desktop package`

Expected: PASS; packaged Electron shell opens without Node globals in Renderer.

- [ ] **Step 5: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json apps/desktop packages/contracts
git commit -m "feat: scaffold secure Electron workspace and contracts"
```

### Task 2: Persisted Project Profiles, Tasks, and Artifacts

**Files:**
- Create: `packages/task-store/package.json`
- Create: `packages/task-store/src/schema.ts`
- Create: `packages/task-store/src/database.ts`
- Create: `packages/task-store/src/task-repository.ts`
- Create: `packages/project-core/package.json`
- Create: `packages/project-core/src/project-profile.ts`
- Create: `packages/project-core/src/project-scan.ts`
- Create: `packages/project-core/src/artifact-store.ts`
- Test: `packages/task-store/test/task-repository.test.ts`
- Test: `packages/project-core/test/project-profile.test.ts`
- Test: `packages/project-core/test/project-scan.test.ts`

**Interfaces:**
- Consumes: `ProjectProfile` and `WorkflowEvent` from `@qt-ui-copilot/contracts`.
- Produces: `openDatabase(path: string): Database`, `TaskRepository.createTask()`, `TaskRepository.appendEvent()`, `TaskRepository.resumePoint()`, `loadProjectProfile(path: string)`, `scanProject(rootDir: string): ProjectInventory`, and `ArtifactStore`.

- [ ] **Step 1: Write failing repository and profile security tests**

```ts
it('resumes from the last completed safe node', () => {
  const database = openDatabase(':memory:');
  const repo = new TaskRepository(database);
  const id = repo.createTask('demo', 'Settings.ui');
  repo.appendEvent(id, { node: 'UIC_VALIDATE', status: 'completed', at: 10 });
  repo.appendEvent(id, { node: 'APPLY_CANDIDATE_PATCH', status: 'started', at: 11 });
  expect(repo.resumePoint(id)).toBe('UIC_VALIDATE');
});

it('rejects artifact paths outside the project task directory', () => {
  expect(() => new ArtifactStore('D:/work/.qt-ui-copilot/tasks/t1').resolve('../../secret.txt')).toThrow();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/task-store test && pnpm --filter @qt-ui-copilot/project-core test`

Expected: FAIL because repositories and path containment do not exist.

- [ ] **Step 3: Implement SQLite schema and path-contained artifact storage**

Use tables `projects`, `tasks`, `workflow_events`, `artifacts`, `ui_bindings`, and `routes`. Persist event payloads as validated JSON and compute resume points only from nodes declared safe in `workflow.ts`.

```ts
resolve(relativePath: string): string {
  const absolute = path.resolve(this.root, relativePath);
  if (!absolute.startsWith(this.root + path.sep)) throw new Error('Artifact path escapes task root');
  return absolute;
}
```

Implement `scanProject` with workspace-contained traversal that returns `.ui`, `.qrc`, `.qss`, font, CMake Preset, qmake project, and executable-candidate paths while ignoring `.git`, configured build directories, symlinks escaping the root, and files larger than 16 MiB.

- [ ] **Step 4: Run tests including reopen persistence**

Run: `pnpm --filter @qt-ui-copilot/task-store test -- --run && pnpm --filter @qt-ui-copilot/project-core test -- --run`

Expected: PASS, including closing and reopening a temporary SQLite file.

- [ ] **Step 5: Commit persistence**

```bash
git add packages/task-store packages/project-core
git commit -m "feat: persist projects tasks and workflow artifacts"
```

### Task 3: Loss-Minimizing `.ui` Parser and Semantic Index

**Files:**
- Create: `packages/ui-document/package.json`
- Create: `packages/ui-document/src/parse-ui.ts`
- Create: `packages/ui-document/src/ui-index.ts`
- Create: `packages/ui-document/src/text-patch.ts`
- Create: `packages/ui-document/src/index.ts`
- Create: `packages/ui-document/test/fixtures/qt59-settings.ui`
- Create: `packages/ui-document/test/fixtures/qt6-settings.ui`
- Test: `packages/ui-document/test/parse-ui.test.ts`

**Interfaces:**
- Consumes: `UiDocument`, `WidgetNode`, and `LayoutNode` contracts.
- Produces: `parseUi(source: string, filePath: string): ParsedUiDocument`, `buildUiFingerprint(document): UiFingerprint`, and source-range data used by patches.

- [ ] **Step 1: Add Qt 5.9.6 and Qt 6 fixture tests**

```ts
for (const fixture of ['qt59-settings.ui', 'qt6-settings.ui']) {
  it(`round-trips ${fixture} byte-for-byte when unchanged`, () => {
    const source = readFileSync(path.join(__dirname, 'fixtures', fixture), 'utf8');
    const document = parseUi(source, fixture);
    expect(document.source).toBe(source);
    expect(document.index.widgetsByName.get('saveButton')?.className).toBe('QPushButton');
  });
}
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/ui-document test -- parse-ui.test.ts`

Expected: FAIL because `parseUi` is missing.

- [ ] **Step 3: Implement an XML concrete-syntax tree and Qt semantic index**

Add `@xml-tools/parser@1.0.11` and `@xml-tools/ast@5.0.5`. Retain token start/end offsets and original source slices for every node. Index widgets, layouts, properties, items, connections, tab stops, resources, and custom widget declarations without normalizing untouched XML.

```ts
export interface ParsedUiDocument {
  source: string;
  filePath: string;
  root: XmlElement;
  index: UiIndex;
}
```

- [ ] **Step 4: Add malformed XML, duplicate name, unknown node, and legacy enum tests**

Run: `pnpm --filter @qt-ui-copilot/ui-document test -- --run`

Expected: PASS; malformed XML reports line/column, and unknown nodes remain unmodified.

- [ ] **Step 5: Commit the parser**

```bash
git add packages/ui-document
git commit -m "feat: parse legacy and modern Qt ui files without normalization"
```

### Task 4: Deterministic `UiOperation` Patches and `uic` Validation

**Files:**
- Create: `packages/ui-document/src/apply-operations.ts`
- Create: `packages/ui-document/src/validate-ui.ts`
- Create: `packages/ui-document/src/candidate-file.ts`
- Create: `packages/project-core/src/process-runner.ts`
- Create: `packages/project-core/src/toolchain-probe.ts`
- Test: `packages/ui-document/test/apply-operations.test.ts`
- Test: `packages/ui-document/test/candidate-file.test.ts`
- Test: `packages/project-core/test/toolchain-probe.test.ts`

**Interfaces:**
- Consumes: `ParsedUiDocument`, `UiOperation[]`, and `ProjectProfile`.
- Produces: `applyOperations(document, operations): UiPatchResult`, `CandidateFile.stage()/accept()/rollback()`, `validateUiWithUic(profile, uiPath): Promise<ValidationResult>`, and `probeQtToolchain(profile): Promise<ToolchainReport>`.

- [ ] **Step 1: Write failing minimal-patch and command-safety tests**

```ts
it('changes only the text property source range', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'qt59-settings.ui');
  const original = readFileSync(fixturePath, 'utf8');
  const result = applyOperations(parseUi(original, fixturePath), [
    { op: 'setProperty', target: 'saveButton', name: 'text', value: '应用' }
  ]);
  expect(result.changedRanges).toHaveLength(1);
  expect(result.source.replace('应用', '保存')).toBe(original);
});

it('spawns uic without a shell', async () => {
  await validateUiWithUic(profile, 'D:/demo/Settings.ui');
  expect(spawnMock).toHaveBeenCalledWith(profile.qt.uic, ['-o', expect.any(String), 'D:/demo/Settings.ui'], { shell: false, expect: expect.anything() });
});

it('restores the accepted bytes after candidate rollback', async () => {
  const file = await CandidateFile.open(tempUiPath);
  await file.stage(modifiedSource);
  await file.rollback();
  expect(readFileSync(tempUiPath)).toEqual(originalBytes);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/ui-document test -- apply-operations.test.ts && pnpm --filter @qt-ui-copilot/project-core test -- toolchain-probe.test.ts`

Expected: FAIL because patching and toolchain probing are missing.

- [ ] **Step 3: Implement property, layout, spacer, tab, buddy, connection, and component operations**

Reject unresolved targets, duplicate names, invalid parent layouts, unknown operation types, and connection references to missing objects. Return a candidate source string plus exact changed ranges; do not write files in this function.

- [ ] **Step 4: Implement exact-kit `uic/rcc` probing and bounded process execution**

Capture version output, timeout, stdout, stderr, exit code, and executable path. Never enable a shell. Verify `uic` and `rcc` report the same Qt major/minor as the configured profile.

Implement `CandidateFile` with an artifact-backed original-byte snapshot, atomic same-directory candidate replacement, explicit `accept`, idempotent `rollback`, and recovery metadata. A staged candidate cannot become accepted without the workflow's persisted user approval event.

- [ ] **Step 5: Run all document and project-core tests**

Run: `pnpm --filter @qt-ui-copilot/ui-document test -- --run && pnpm --filter @qt-ui-copilot/project-core test -- --run`

Expected: PASS with Qt 5.9.6 fixture coverage for every operation.

- [ ] **Step 6: Commit deterministic editing**

```bash
git add packages/ui-document packages/project-core
git commit -m "feat: apply constrained ui patches and validate with target uic"
```

### Task 5: Per-Kit QtUiPreviewHost with QSS/QRC/Font Support

**Files:**
- Create: `native/qt-ui-preview-host/CMakeLists.txt`
- Create: `native/qt-ui-preview-host/src/main.cpp`
- Create: `native/qt-ui-preview-host/src/PreviewRequest.h`
- Create: `native/qt-ui-preview-host/src/PreviewRequest.cpp`
- Create: `native/qt-ui-preview-host/src/ResourceLoader.h`
- Create: `native/qt-ui-preview-host/src/ResourceLoader.cpp`
- Create: `native/qt-ui-preview-host/src/FormLoader.h`
- Create: `native/qt-ui-preview-host/src/FormLoader.cpp`
- Create: `native/qt-ui-preview-host/tests/tst_previewhost.cpp`
- Create: `native/qt-ui-preview-host/tests/fixtures/resource-form.ui`
- Create: `native/qt-ui-preview-host/tests/fixtures/common.qrc`
- Create: `native/qt-ui-preview-host/tests/fixtures/preview.qss`
- Create: `native/qt-ui-preview-host/tests/fixtures/icon.png`
- Create: `packages/preview-client/src/preview-host-builder.ts`
- Create: `packages/preview-client/src/preview-client.ts`
- Test: `packages/preview-client/test/preview-client.test.ts`

**Interfaces:**
- Consumes: `PreviewRequest`, `PreviewResult`, and `ProjectProfile` contracts.
- Produces: `qt-ui-preview-host` JSON-lines executable, `PreviewHostBuilder.ensureBuilt(kit): Promise<string>`, and `PreviewClient.render(request): Promise<PreviewResult>`.

- [ ] **Step 1: Write failing Qt tests for resource-backed icons and QSS**

```cpp
void PreviewHostTest::loadsResourceAndStyleSheet()
{
    PreviewRequest request;
    request.uiFile = QFINDTESTDATA("fixtures/resource-form.ui");
    request.rccExecutable = QString::fromLocal8Bit(PREVIEW_TEST_RCC_PATH);
    request.qrcFiles << QFINDTESTDATA("fixtures/common.qrc");
    request.qssFiles << QFINDTESTDATA("fixtures/preview.qss");
    request.outputImage = QDir(QDir::tempPath()).filePath("preview-host-test.png");
    PreviewResult result = renderPreview(request);
    QVERIFY2(result.success, qPrintable(result.error));
    QVERIFY(result.loadedResources.contains("common.qrc"));
    QCOMPARE(result.widget("saveButton").styleSheetMatched, true);
    QVERIFY(QFileInfo(result.imagePath).size() > 1000);
}
```

- [ ] **Step 2: Configure with a Qt 5.9.6 Kit and verify the test fails**

Run in PowerShell:

```powershell
cmake -S native/qt-ui-preview-host -B build/preview-qt59 -DQT_MAJOR_VERSION=5 -DCMAKE_PREFIX_PATH=$env:QT59_ROOT
cmake --build build/preview-qt59 --config Release
ctest --test-dir build/preview-qt59 -C Release --output-on-failure
```

Expected: FAIL because preview implementation is absent. On Linux use the configured Qt 5.9.6 prefix path and the same CMake arguments.

- [ ] **Step 3: Implement C++11 JSON-lines request parsing and exact-kit resource loading**

Require `PreviewRequest.rccExecutable` and invoke it through `QProcess` with four arguments: `-binary`, the source `.qrc` path, `-o`, and the task-cache `.rcc` path; do not use a shell. Register each resulting `.rcc`, add fonts, set High DPI attributes before `QApplication` for Qt 5, apply style/palette/QSS, configure `QUiLoader` working and plugin paths, load the form, process queued events, and capture the root widget. The CMake test target defines `PREVIEW_TEST_RCC_PATH` from the selected Qt Kit.

- [ ] **Step 4: Implement custom-widget degradation reporting**

Subclass `QUiLoader::createWidget`; if a promoted class cannot load, create its declared base class and append `{ className, fallbackClass, objectName }` to `degradedWidgets`.

- [ ] **Step 5: Add Node client timeout, crash, cache-key, and malformed-response tests**

Run: `pnpm --filter @qt-ui-copilot/preview-client test -- --run`

Expected: PASS; cache keys differ across Qt version, ABI, architecture, build type, and OS.

- [ ] **Step 6: Run the native matrix**

Run both configured suites: `ctest --test-dir build/preview-qt59 -C Release --output-on-failure` and `ctest --test-dir build/preview-qt6 -C Release --output-on-failure`. Before the Qt 6 command, configure `build/preview-qt6` with `-DQT_MAJOR_VERSION=6 -DCMAKE_PREFIX_PATH=$env:QT6_ROOT`.

Expected: PASS for Qt 5.9.6 and the selected Qt 6.x Kit.

- [ ] **Step 7: Commit enhanced preview**

```bash
git add native/qt-ui-preview-host packages/preview-client
git commit -m "feat: preview ui files with exact-kit styles and resources"
```

### Task 6: Qt 5.9.6-Compatible QtUiProbe

**Files:**
- Create: `native/qt-ui-probe/CMakeLists.txt`
- Create: `native/qt-ui-probe/qt-ui-probe.pri`
- Create: `native/qt-ui-probe/include/QtUiProbe/QtUiProbe.h`
- Create: `native/qt-ui-probe/src/QtUiProbe.cpp`
- Create: `native/qt-ui-probe/src/ProbeServer.cpp`
- Create: `native/qt-ui-probe/src/ObjectInspector.cpp`
- Create: `native/qt-ui-probe/src/WidgetCapture.cpp`
- Create: `native/qt-ui-probe/src/RouteRecorder.cpp`
- Create: `native/qt-ui-probe/src/SemanticExecutor.cpp`
- Create: `native/qt-ui-probe/tests/tst_qtuiprobe.cpp`
- Create: `native/qt-ui-probe/tests/TestClient.h`
- Create: `native/qt-ui-probe/tests/TestClient.cpp`
- Create: `packages/probe-client/src/probe-client.ts`
- Test: `packages/probe-client/test/probe-client.test.ts`

**Interfaces:**
- Consumes: `ProbeRequest` and `ProbeResponse` contracts.
- Produces: `QtUiProbe::install()`, token-protected QLocalServer methods, and `ProbeClient.connect()/request()/close()`.

- [ ] **Step 1: Write failing allowlist and widget-tree Qt tests**

Implement `TestClient::sendRequest(token, method, params)` and `TestClient::validToken()` in the listed test support files, plus a recursive `findNode(tree, objectName)` helper used by these tests.

```cpp
void ProbeTest::requiresTokenAndRejectsUnknownMethod()
{
    QCOMPARE(sendRequest("wrong", "listWindows").errorCode, QString("AUTH_FAILED"));
    QCOMPARE(sendRequest(validToken(), "deleteFile").errorCode, QString("METHOD_NOT_ALLOWED"));
}

void ProbeTest::reportsNamedWidgetTree()
{
    QPushButton button("Save", &window);
    button.setObjectName("saveButton");
    QJsonObject tree = inspector.dumpWidgetTree(&window);
    QCOMPARE(findNode(tree, "saveButton").value("className").toString(), QString("QPushButton"));
}
```

- [ ] **Step 2: Build against Qt 5.9.6 and verify failure**

Run in PowerShell:

```powershell
cmake -S native/qt-ui-probe -B build/probe-qt59 -DQT_MAJOR_VERSION=5 -DCMAKE_PREFIX_PATH=$env:QT59_ROOT
cmake --build build/probe-qt59 --config Release
ctest --test-dir build/probe-qt59 -C Release --output-on-failure
```

Expected: FAIL because server and inspector are missing.

- [ ] **Step 3: Implement the read-only protocol using Qt 5.9 APIs only**

Implement `listWindows`, `dumpWidgetTree`, `findWidget`, `hitTest`, `identifyVisibleUi`, `captureWindow`, `captureWidget`, `getActiveModal`, and `getFocusWidget`. Cap message size at 1 MiB, tree depth at 64, and screenshot dimension at 8192 pixels.

- [ ] **Step 4: Implement typed semantic actions**

Implement only `activateWindow`, `resizeWindow`, `invokeButton`, `triggerAction`, `selectTab`, `selectComboItem`, `setLineEditText`, `setCheckState`, `waitForWidget`, and `waitForUi`; dispatch on the GUI thread with queued connections and reject class/action mismatches.

- [ ] **Step 5: Implement non-blocking semantic route recording**

Install an application-level event filter that observes but never consumes mouse releases, action triggers, tab changes, combo changes, and modal-window creation. Emit stable object paths and typed values; redact text-entry contents by default and record them only when the user explicitly marks a field as test data.

- [ ] **Step 6: Implement the Node client and disconnect behavior**

```ts
const response = await client.request({ id: crypto.randomUUID(), token, method: 'findWidget', params: { objectName: 'saveButton' } }, 3000);
if (!response.ok) throw new ProbeError(response.error.code, response.error.message);
```

- [ ] **Step 7: Run Qt 5.9.6, Qt 6.x, and Node client tests**

Run: `ctest --test-dir build/probe-qt59 -C Release --output-on-failure`, `ctest --test-dir build/probe-qt6 -C Release --output-on-failure`, and `pnpm --filter @qt-ui-copilot/probe-client test -- --run`. Configure `build/probe-qt6` first with `-DQT_MAJOR_VERSION=6 -DCMAKE_PREFIX_PATH=$env:QT6_ROOT`.

Expected: PASS in both Qt matrices; public headers contain no post-Qt-5.9 API.

- [ ] **Step 8: Commit QtUiProbe**

```bash
git add native/qt-ui-probe packages/probe-client
git commit -m "feat: add token-protected Qt 5.9 runtime probe"
```

### Task 7: Real Application Sessions, Page Matching, and Guided Routes

**Files:**
- Create: `fixtures/qt59-app/CMakeLists.txt`
- Create: `fixtures/qt59-app/app.pro`
- Create: `fixtures/qt59-app/src/main.cpp`
- Create: `fixtures/qt59-app/src/MainWindow.cpp`
- Create: `fixtures/qt59-app/ui/MainWindow.ui`
- Create: `fixtures/qt59-app/ui/NetworkSettings.ui`
- Create: `fixtures/qt59-app/resources/common.qrc`
- Create: `fixtures/qt59-app/resources/dark.qss`
- Create: `fixtures/qt6-app/CMakeLists.txt`
- Create: `packages/project-core/src/runtime-session.ts`
- Create: `packages/probe-client/src/page-matcher.ts`
- Create: `packages/probe-client/src/route-runner.ts`
- Test: `packages/probe-client/test/page-matcher.test.ts`
- Test: `packages/probe-client/test/route-runner.test.ts`

**Interfaces:**
- Consumes: `ProjectProfile`, `ProbeClient`, `UiFingerprint`, and `SemanticRoute`.
- Produces: `RuntimeSession.launch()/stop()`, `matchVisiblePage()`, and `RouteRunner.run(route): Promise<RouteResult>`.

- [ ] **Step 1: Write failing page-score and route-verification tests**

```ts
it('auto-binds only at or above 0.90', () => {
  expect(matchVisiblePage(uiFingerprint, runtimeTree).decision).toEqual({ kind: 'auto', score: 0.94 });
  expect(matchVisiblePage(uiFingerprint, ambiguousTree).decision.kind).toBe('confirm');
});

it('does not blame a ui patch when navigation fails', async () => {
  const result = await runner.run(routeWithMissingDialog);
  expect(result).toMatchObject({ status: 'navigation_failed', uiValidationStarted: false });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/probe-client test -- page-matcher.test.ts route-runner.test.ts`

Expected: FAIL because matching and route execution are missing.

- [ ] **Step 3: Build fixture apps with RCC, QSS, stacked pages, and Probe**

The Qt 5.9.6 fixture must support both CMake and qmake, load an icon from `common.qrc`, apply `dark.qss`, and open `NetworkSettings.ui` through two navigation actions.

- [ ] **Step 4: Implement weighted page matching and persisted confirmation**

Use weights from the spec: root name 0.35, child-name set 0.30, hierarchy 0.15, layouts 0.10, class 0.05, text 0.05. Return `auto`, `confirm`, or `reject` at 0.90 and 0.70 thresholds.

- [ ] **Step 5: Implement isolated launch and semantic route execution**

Create a per-task config directory, pass the Probe token through environment, launch with `shell: false`, wait for Probe, execute typed steps, and stop gracefully before forced termination. Route success requires `waitForUi` confirmation.

- [ ] **Step 6: Run an end-to-end fixture route on both Qt Kits**

Run: `pnpm test:fixture:qt59` and `pnpm test:fixture:qt6`.

Expected: Both launch, navigate to `NetworkSettings.ui`, capture the RCC/QSS-rendered widget, and exit with code 0.

- [ ] **Step 7: Commit real runtime sessions**

```bash
git add fixtures packages/project-core packages/probe-client
git commit -m "feat: validate ui changes in real Qt application sessions"
```

### Task 8: Offline Component Catalog and Safe Component Insertion

**Files:**
- Create: `packages/component-library/package.json`
- Create: `packages/component-library/src/catalog.ts`
- Create: `packages/component-library/src/search.ts`
- Create: `packages/component-library/src/insert-component.ts`
- Create: `packages/component-library/src/vector-adapter.ts`
- Create: `fixtures/component-library/network-connection-panel.ui`
- Create: `fixtures/component-library/component.json`
- Test: `packages/component-library/test/catalog.test.ts`
- Test: `packages/component-library/test/insert-component.test.ts`

**Interfaces:**
- Consumes: `ParsedUiDocument`, `UiFingerprint`, `UiOperation`, `ArtifactStore`, and PreviewClient.
- Produces: `ComponentCatalog.indexLibrary()`, `searchComponents(query)`, `buildInsertComponentOperation()`, and an unconfigured `VectorSearchAdapter` interface.

- [ ] **Step 1: Write failing offline search and dependency tests**

```ts
it('finds a connection panel without a vector service', async () => {
  await catalog.indexLibrary('fixtures/component-library');
  const [first] = await catalog.search({ text: '连接测试区域', requiredWidgets: ['QPushButton'] });
  expect(first.componentId).toBe('network-connection-panel');
});

it('blocks insertion when a promoted widget dependency is absent', () => {
  expect(() => buildInsertComponentOperation(customCandidate, targetWithoutPlugin)).toThrow('Missing custom widget NetworkGraphWidget');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/component-library test -- --run`

Expected: FAIL because the catalog does not exist.

- [ ] **Step 3: Implement SQLite FTS, metadata filters, and structural ranking**

Rank by FTS score, required widget/layout overlap, dependency availability, Qt version range, and style tag overlap. Keep `VectorSearchAdapter.search()` behind configuration and return no results when it is not configured.

- [ ] **Step 4: Implement screenshot indexing and safe subtree insertion**

Use PreviewClient to create catalog screenshots. On insertion, clone the source subtree, deterministically rename conflicting objects with a component prefix, rewrite buddy/tab/connection references, and return missing QSS/QRC/custom-widget dependencies before patch creation.

- [ ] **Step 5: Run catalog tests without network access**

Run: `pnpm --offline --filter @qt-ui-copilot/component-library test -- --run`

Expected: PASS; no test attempts a network connection.

- [ ] **Step 6: Commit component reuse**

```bash
git add packages/component-library fixtures/component-library
git commit -m "feat: index and safely reuse Qt ui components offline"
```

### Task 9: Structured AI Planner, Visual Critic, and Persisted Workflow

**Files:**
- Create: `packages/agent-workflow/package.json`
- Create: `packages/agent-workflow/src/model-provider.ts`
- Create: `packages/agent-workflow/src/planner.ts`
- Create: `packages/agent-workflow/src/visual-critic.ts`
- Create: `packages/agent-workflow/src/workflow-machine.ts`
- Create: `packages/agent-workflow/src/prompts/qt-ui-planner.md`
- Create: `packages/agent-workflow/src/prompts/visual-critic.md`
- Create: `packages/agent-workflow/test/FakeModel.ts`
- Test: `packages/agent-workflow/test/planner.test.ts`
- Test: `packages/agent-workflow/test/workflow-machine.test.ts`

**Interfaces:**
- Consumes: all deterministic services from Tasks 2–8.
- Produces: `UiPlanner.plan()`, `VisualCritic.review()`, and `WorkflowMachine.start()/approve()/resume()/cancel()`.

- [ ] **Step 1: Write failing schema-repair and evidence-gate tests**

Implement `FakeModel.replyWith(value)` and `FakeModel.generate(request)` in `test/FakeModel.ts`; each queued reply is returned once and every request is retained for context assertions.

```ts
it('rejects raw xml from the planner', async () => {
  model.replyWith({ xml: '<ui version="4.0"><class>Injected</class></ui>' });
  await expect(planner.plan(context)).rejects.toThrow('UiPlan schema');
});

it('cannot reach ACCEPT without real-runtime evidence for medium risk', async () => {
  const state = await machine.start(mediumRiskRequest);
  expect(state.node).not.toBe('ACCEPT');
  expect(state.requiredEvidence).toContain('real_application_capture');
});
```

- [ ] **Step 2: Run workflow tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/agent-workflow test -- --run`

Expected: FAIL because planner and workflow are missing.

- [ ] **Step 3: Implement provider-neutral structured planning**

Send only requirement, target semantic tree, runtime facts, up to three component candidates, allowed operation schema, and previous findings. Validate the response with `UiPlanSchema`; one format-repair call is allowed, after which the task stops with `model_output_invalid`.

- [ ] **Step 4: Implement independent visual review**

The critic receives before/after images, expected results, and deterministic findings, but not the planner's hidden rationale. It returns blocking issues, suggestions, confidence, and score; deterministic failures always override its pass result.

- [ ] **Step 5: Implement the explicit persisted workflow with two repair attempts**

Use the node sequence from the spec. Require user approval before applying the candidate to disk and before accepting. Persist every transition; retries never repeat an already committed file write.

- [ ] **Step 6: Run mocked end-to-end workflow tests**

Run: `pnpm --filter @qt-ui-copilot/agent-workflow test -- --run`

Expected: PASS for success, invalid model output, `uic` failure, preview failure, route failure, visual ambiguity, cancellation, and crash-resume cases.

- [ ] **Step 7: Commit AI workflow**

```bash
git add packages/agent-workflow
git commit -m "feat: orchestrate evidence-gated Qt ui planning and review"
```

### Task 10: Isolated UI-TARS Guided Navigation

**Files:**
- Create: `packages/ui-tars-worker/package.json`
- Create: `packages/ui-tars-worker/src/worker.ts`
- Create: `packages/ui-tars-worker/src/window-scoped-operator.ts`
- Create: `packages/ui-tars-worker/src/route-compiler.ts`
- Test: `packages/ui-tars-worker/test/window-scoped-operator.test.ts`
- Test: `packages/ui-tars-worker/test/route-compiler.test.ts`
- Modify: `apps/desktop/src/main/main.ts`

**Interfaces:**
- Consumes: UI-TARS SDK 1.2.3, ProbeClient `hitTest`, target-window bounds, and user-guided route descriptions/images.
- Produces: Utility Process message protocol `start`, `pause`, `resume`, `stop`, `action`, `finished`, and `failed`; `compileVisualTraceToRoute()`.

- [ ] **Step 1: Write failing coordinate and boundary tests**

```ts
it('translates crop-relative physical coordinates into desktop logical coordinates', () => {
  const point = translatePoint({ x: 400, y: 200 }, { left: 100, top: 50, width: 800, height: 600 }, 1.25);
  expect(point).toEqual({ x: 420, y: 210 });
});

it('blocks an action outside the target window', async () => {
  await expect(operator.execute({
    prediction: "click(start_box='(900,700)')",
    parsedPrediction: { action_type: 'click', action_inputs: { start_box: '(900,700)' }, reflection: null, thought: '' },
    screenWidth: 800, screenHeight: 600, scaleFactor: 1, factors: [1, 1]
  })).rejects.toThrow('outside target window');
});
```

- [ ] **Step 2: Install pinned dependencies and verify tests fail**

Run: `pnpm --filter @qt-ui-copilot/ui-tars-worker add @ui-tars/sdk@1.2.3 @ui-tars/operator-nut-js@1.2.3 uuid@11 && pnpm --filter @qt-ui-copilot/ui-tars-worker test -- --run`

Expected: FAIL because scoped operator and compiler are missing.

- [ ] **Step 3: Implement WindowScopedOperator and process controls**

Crop screenshots to the target window, preserve scale factor, translate predicted coordinates, block actions outside bounds, reject dangerous system hotkeys, cap loops at 20, cap each step at 30 seconds, and honor AbortSignal immediately.

- [ ] **Step 4: Compile successful visual traces into semantic routes**

After each visual action call Probe `hitTest` and record the object path. Convert known widgets to `invoke`, `selectTab`, `selectComboItem`, or `setCheckState`; retain an image-guided step only when no stable semantic target exists.

- [ ] **Step 5: Run 10 deterministic fixture navigation trials**

Run: `pnpm test:ui-tars:fixture -- --runs=10`

Expected: At least 8 successful arrivals verified by `waitForUi`; failures return control without changing UI validation state. If the threshold is not met, mark UI-TARS experimental and keep semantic/manual navigation as the demo core.

- [ ] **Step 6: Commit UI-TARS integration**

```bash
git add packages/ui-tars-worker apps/desktop/src/main/main.ts
git commit -m "feat: add isolated and bounded UI-TARS navigation"
```

### Task 11: Product UI, Approval, Takeover, Diff, and Evidence Report

**Files:**
- Create: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/features/projects/ProjectSidebar.tsx`
- Create: `apps/desktop/src/renderer/features/workflow/WorkflowTimeline.tsx`
- Create: `apps/desktop/src/renderer/features/preview/PreviewComparison.tsx`
- Create: `apps/desktop/src/renderer/features/components/ComponentCandidates.tsx`
- Create: `apps/desktop/src/renderer/features/diff/UiDiffPanel.tsx`
- Create: `apps/desktop/src/renderer/features/report/EvidenceReport.tsx`
- Create: `apps/desktop/src/renderer/lib/api.ts`
- Create: `apps/desktop/src/renderer/test/FakeDesktopApi.ts`
- Test: `apps/desktop/src/renderer/App.test.tsx`

**Interfaces:**
- Consumes: WorkflowMachine, repositories, PreviewClient, RuntimeSession, component search, and UI-TARS process messages.
- Produces: the complete user-facing workflow with import, plan approval, component choice, manual takeover, accept, rollback, and report export.

- [ ] **Step 1: Write failing renderer interaction tests**

```tsx
it('keeps apply disabled until the user approves the structured plan', async () => {
  const candidatePlan = { summary: '增加测试按钮', operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] };
  const fakeApi = new FakeDesktopApi().withPlan(candidatePlan);
  render(<App api={fakeApi} />);
  expect(screen.getByRole('button', { name: '应用候选修改' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '批准计划' }));
  expect(screen.getByRole('button', { name: '应用候选修改' })).toBeEnabled();
});
```

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `pnpm --filter @qt-ui-copilot/desktop test -- App.test.tsx`

Expected: FAIL because product UI is missing.

- [ ] **Step 3: Implement typed preload IPC and reject arbitrary channels**

Expose `projects.import`, `tasks.start`, `tasks.approve`, `tasks.cancel`, `tasks.takeOver`, `tasks.accept`, `tasks.rollback`, `components.search`, and event subscription. Validate inputs in Main with shared Zod contracts.

- [ ] **Step 4: Implement the four-region application layout**

Build project/UI tree and component candidates on the left, before/after quick/real preview in the center, workflow timeline and approval/takeover controls on the right, and Monaco Diff/checks/logs/routes/report tabs at the bottom.

- [ ] **Step 5: Implement evidence report export**

Export a self-contained HTML report with requirement, selected component source, operation plan, XML diff, before/after images, deterministic findings, visual findings, build command argv and exit status, route evidence, Qt Kit identity, and final user decision.

- [ ] **Step 6: Run renderer and IPC tests**

Run: `pnpm --filter @qt-ui-copilot/desktop test -- --run && pnpm typecheck`

Expected: PASS; Renderer cannot access filesystem or send an unregistered IPC channel.

- [ ] **Step 7: Commit product UI**

```bash
git add apps/desktop
git commit -m "feat: deliver approval-driven Qt UI Copilot interface"
```

### Task 12: End-to-End Qualification, Packaging, and Demo Gate

**Files:**
- Create: `tests/e2e/desktop.spec.ts`
- Create: `tests/e2e/helpers.ts`
- Create: `scripts/verify-qt-matrix.mjs`
- Create: `scripts/run-demo-reliability.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `docs/demo-script.md`
- Create: `docs/compatibility.md`
- Modify: `apps/desktop/forge.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the complete application.
- Produces: Windows installer, Linux package/CI artifact, compatibility report, repeatable demo, and enforced release gates.

- [ ] **Step 1: Write the failing Electron E2E scenario**

In `tests/e2e/helpers.ts`, define `fixturePath(name: string): string`, `importProject(window, root: string): Promise<void>`, `requestChange(window, request: string): Promise<void>`, `chooseComponent(window, componentId: string): Promise<void>`, and `approvePlan(window): Promise<void>` using role-based Playwright locators.

```ts
test('reuses a component and validates it in the real Qt 5.9.6 app', async ({ electronApp }) => {
  const window = await electronApp.firstWindow();
  await importProject(window, fixturePath('qt59-app'));
  await requestChange(window, '复用连接测试组件，并确保英文小窗口不截断');
  await chooseComponent(window, 'network-connection-panel');
  await approvePlan(window);
  await expect(window.getByText('uic 校验通过')).toBeVisible();
  await expect(window.getByText('真实应用验证通过')).toBeVisible();
  await expect(window.getByRole('img', { name: '修改后真实截图' })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E and verify failure before release wiring**

Run: `pnpm test:e2e`

Expected: FAIL because fixture paths, packaging resources, or release commands are not wired.

- [ ] **Step 3: Wire native assets and worker packaging**

Package PreviewHost builders/sources, Probe sources/`.pri`, UI-TARS worker, migrations, and report assets outside ASAR where native loading requires it. Generate checksums and verify them at application start.

- [ ] **Step 4: Add CI and compatibility gates**

CI must run TypeScript unit tests, Electron tests, document fixtures, Qt 5.9.6 native tests using the configured legacy Kit, Qt 6.x native tests, Windows packaging, Linux packaging or build verification, and `git diff --check`.

- [ ] **Step 5: Run the full local release suite**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:native:qt59 && pnpm test:native:qt6 && pnpm test:e2e && pnpm make`.

Expected: All commands PASS and produce a signed-or-local-development Windows installer plus checksummed artifacts.

- [ ] **Step 6: Run the demo reliability gate**

Run: `node scripts/run-demo-reliability.mjs --runs 10 --fixture qt59-app`.

Expected: At least 9 complete core runs; UI-TARS must independently reach at least 8 verified arrivals or be labeled experimental in the UI and demo script.

- [ ] **Step 7: Verify failure recovery manually once**

Start a task, terminate Electron after `UIC_VALIDATE`, reopen the application, resume, and confirm it starts at enhanced preview without repeating the file write. Cancel before acceptance and confirm the accepted source is restored byte-for-byte.

- [ ] **Step 8: Commit release qualification**

```bash
git add tests scripts .github docs apps/desktop/forge.config.ts package.json
git commit -m "test: qualify packaged Qt UI Copilot demo"
```

## Final Acceptance Checklist

- [ ] Qt 5.9.6 and selected Qt 6.x fixtures compile PreviewHost and QtUiProbe with their own Kits.
- [ ] Unchanged `.ui` files remain byte-for-byte unchanged.
- [ ] Every candidate modification passes shared schema, XML rules, and target `uic` before preview.
- [ ] Enhanced preview renders QSS, QRC, font, DPI, and custom-widget degradation evidence.
- [ ] Real EXE validation uses an isolated profile and Probe-confirmed target page.
- [ ] Offline component search and insertion work with cloud vector access disabled.
- [ ] Medium/high-risk tasks cannot pass without real-runtime evidence or explicit user override.
- [ ] Navigation failure is reported separately from UI validation failure.
- [ ] Renderer has no Node integration and cannot invoke arbitrary shell or IPC operations.
- [ ] UI-TARS can be disabled without breaking the core demo.
- [ ] Ten core demo runs achieve at least nine successful completions.
- [ ] Windows package installs and runs on a clean test machine; Linux core build is verified.
