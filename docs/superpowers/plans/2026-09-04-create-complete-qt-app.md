# Create Complete Qt App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make creation mode generate, build, preview, and approve a complete Qt Widgets application in the currently opened folder, with selectable QMake or MSBuild backends.

**Architecture:** Extend the existing UI-candidate pipeline with an application candidate containing a staged file map and build plan. A dedicated build orchestration layer executes QMake or MSBuild after generation; IPC streams generation/build stages and approval commits the complete file set atomically where possible. Modification mode remains UI-only.

**Tech Stack:** TypeScript, Zod contracts, Electron IPC, Node `child_process`, Qt QMake/MSBuild, Vitest, existing PreviewHost.

**Spec:** `docs/superpowers/specs/2026-09-04-create-complete-qt-app-design.md`

## Global Constraints

- Creation mode writes candidates under `.qt-ui-copilot/candidates/<task-id>` and never overwrites project files before approval.
- Creation mode targets the currently opened workspace root; it does not create a project subdirectory.
- Build backend is `qmake`, `msbuild`, or `auto`; `auto` must not silently switch when detection is ambiguous.
- Modification mode continues to operate on an existing `.ui` file without generating project scaffolding.
- Existing build files and entrypoints require conflict-aware diff/approval handling.

---

### Task 1: Add application-candidate contracts and project build configuration

**Files:**
- Modify: `packages/contracts/src/v3-ui-creation.ts`
- Modify: `packages/contracts/src/v3-task-conversation.ts`
- Modify: `packages/contracts/src/project.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Test: `packages/contracts/test/v3-ui-creation.test.ts`

**Interfaces:**
- Produce `UiCreationRequest.createProject?: boolean` and `buildBackend?: 'qmake' | 'msbuild' | 'auto'`.
- Produce `UiProjectFile { relativePath: string; content: string; existing: boolean; conflict: boolean }` and application candidate metadata containing `files`, `buildBackend`, `buildDirectory`, and `executable`.
- Preserve parsing of existing UI-only requests when `createProject` is absent/false.

- [ ] **Step 1: Write failing schema tests** for a project request with `createProject: true`, each backend value, and an application candidate file map; assert a UI-only request remains valid.
- [ ] **Step 2: Run** `pnpm --filter @qt-ui-copilot/contracts exec vitest run test/v3-ui-creation.test.ts` and verify the new cases fail before implementation.
- [ ] **Step 3: Implement schemas and exported types** with strict path validation (relative paths only, no `..`, no absolute paths), bounded file content, and backend enum.
- [ ] **Step 4: Add project profile parsing/defaults** so `build.backend` defaults to `auto` without breaking existing `.qt-ui-copilot/project.json` files.
- [ ] **Step 5: Run** `pnpm --filter @qt-ui-copilot/contracts exec vitest run test/v3-ui-creation.test.ts` and `pnpm --filter @qt-ui-copilot/desktop typecheck`; both must pass.
- [ ] **Step 6: Commit** `feat: add complete qt app candidate contracts`.

### Task 2: Generate a complete staged Qt application

**Files:**
- Modify: `apps/desktop/src/main/ai/ui-creation-service.ts`
- Create: `apps/desktop/src/main/ai/qt-project-scaffolder.ts`
- Test: `apps/desktop/src/main/ai/ui-creation-service.test.ts`
- Test: `apps/desktop/src/main/ai/qt-project-scaffolder.test.ts`

**Interfaces:**
- `createQtProjectScaffold(input: { appName: string; uiRelativePath: string; uiSource: string; rootType: 'QWidget' | 'QDialog' | 'QMainWindow'; backend: 'qmake' | 'msbuild' }): Record<string, string>` returns `main.cpp`, the selected build project file(s), and the requested `.ui` source.
- `UiCreationService.createCandidate()` returns the existing UI candidate shape for UI-only requests and the application candidate shape for `createProject: true`.

- [ ] **Step 1: Write scaffolder tests** asserting QMake output contains a `.pro` with `QT += widgets`, `SOURCES += main.cpp`, and `FORMS += ui/<name>.ui`; asserting MSBuild output contains the same `.pro` and marks it for `qmake -tp vc` conversion before MSBuild; assert `main.cpp` calls `QApplication` and loads the generated UI.
- [ ] **Step 2: Run** the focused scaffolder tests and verify they fail.
- [ ] **Step 3: Implement the scaffolder** with deterministic UTF-8 content, normalized relative paths, and no user-controlled shell fragments.
- [ ] **Step 4: Extend `UiCreationService`** to stage the scaffold beside the generated UI, inspect target paths with `WorkspaceService`, mark existing-file conflicts, and keep all files under the candidate directory.
- [ ] **Step 5: Add service tests** for empty workspace generation, collision naming (`NewWidget_2.ui`), existing `main.cpp`/build-file conflict detection, and cleanup on cancellation.
- [ ] **Step 6: Run** `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/ui-creation-service.test.ts src/main/ai/qt-project-scaffolder.test.ts`; commit `feat: stage complete qt app projects`.

### Task 3: Implement QMake/MSBuild build orchestration

**Files:**
- Create: `apps/desktop/src/main/build/qt-build-service.ts`
- Create: `apps/desktop/src/main/build/qt-build-service.test.ts`
- Modify: `apps/desktop/src/main/preview/preview-session-service.ts`
- Modify: `apps/desktop/src/main/settings/project-binding-service.ts`

**Interfaces:**
- `QtBuildService.build(input: { projectRoot: string; stagedRoot: string; backend: 'qmake' | 'msbuild' | 'auto'; qt: ProjectProfile['qt']; buildDirectory: string; signal?: AbortSignal; onProgress?: (event: { stage: 'detecting' | 'configuring' | 'compiling' | 'completed'; command: string; detail?: string }) => void }): Promise<{ executable: string; buildDirectory: string; backend: 'qmake' | 'msbuild' }>`.
- Detection returns an explicit ambiguity error when both/none of `.pro`, `.sln`, and `.vcxproj` can determine a backend.

- [ ] **Step 1: Write command-planning tests** for explicit QMake, explicit MSBuild, automatic detection, ambiguous detection, missing executable, non-zero exit, and AbortSignal cancellation; mock process spawning so tests do not require Qt.
- [ ] **Step 2: Run** the focused build tests and verify they fail.
- [ ] **Step 3: Implement safe command execution** using `spawn` with argument arrays, streamed stdout/stderr, timeout/cancellation propagation, exit-code reporting, and no shell interpolation.
- [ ] **Step 4: Implement QMake flow**: invoke the configured qmake with the staged `.pro`, write build files to the configured build directory, then invoke the available `jom`/`nmake`/`make` command.
- [ ] **Step 5: Implement MSBuild flow**: resolve configured `msbuild`, select the staged `.sln`/`.vcxproj`, and invoke it with the configured build directory/platform arguments.
- [ ] **Step 6: Feed the resulting executable and build directory into PreviewHost** so preview uses the actual staged application rather than assuming a root `CMakeLists.txt`.
- [ ] **Step 7: Run** `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/main/build/qt-build-service.test.ts`; commit `feat: support qmake and msbuild builds`.

### Task 4: Connect application creation to IPC, task streaming, and approval

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskArtifactCard.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.tsx`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Extend `V3StartTaskInput` create request with `createProject` and `buildBackend`.
- Add `commitUiCandidate` response support for a file manifest, while preserving `{ uiFile }` for UI-only candidates.
- Stream ordered stages: `generating_project`, `configuring_build`, `compiling`, `preview_ready`, `waiting_approval`.

- [ ] **Step 1: Add failing IPC tests** that submit a create-project request, assert the service receives the new fields, and assert progress events are ordered and include build failures.
- [ ] **Step 2: Add failing renderer tests** for the create-mode project toggle/backend selector, application artifact file list, build status, and approval action.
- [ ] **Step 3: Implement IPC orchestration** to call the scaffolder, build service, and PreviewHost in sequence; retain candidate files when build or preview fails.
- [ ] **Step 4: Implement approval commit** with conflict checks per file and a clear response listing committed and blocked files.
- [ ] **Step 5: Update renderer** so create mode sends `createProject: true`, exposes QMake/MSBuild/Auto selection, renders ordered live stages, and shows actionable retry/log/conflict controls.
- [ ] **Step 6: Keep modify mode UI-only** and verify its request payload is unchanged except for omitted project fields.
- [ ] **Step 7: Run** the focused IPC and renderer tests plus `pnpm --filter @qt-ui-copilot/desktop typecheck`; commit `feat: wire complete app creation flow`.

### Task 5: End-to-end verification and packaging

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/SettingsDetailPanel.tsx`
- Modify: `apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Modify: `README.md` or the existing user-facing setup documentation
- Test: `packages/project-core/test/fixture-projects.test.ts`

- [ ] **Step 1: Add settings tests** for build backend persistence and display of QMake/MSBuild tool paths.
- [ ] **Step 2: Add UI styling** for the backend selector, file manifest, conflict rows, and ordered build progress without compressing narrow layouts.
- [ ] **Step 3: Run the full relevant suite:** `pnpm --filter @qt-ui-copilot/desktop typecheck`, `pnpm test`, and both Qt PreviewHost CTest builds.
- [ ] **Step 4: Manually verify** in an empty folder with a configured Qt Kit: create a project using QMake, build/preview it, reject it, then repeat with MSBuild; verify an existing project shows conflicts instead of overwriting files.
- [ ] **Step 5: Package** with `pnpm --filter @qt-ui-copilot/desktop package:portable` and verify the generated launcher starts with the packaged PreviewHost assets.
- [ ] **Step 6: Commit** `test: verify complete qt app creation backends` and report the portable executable path.
