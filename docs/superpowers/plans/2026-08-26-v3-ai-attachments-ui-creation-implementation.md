# Qt UI Copilot V3 AI Attachments and UI Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resizable AI Assistant that accepts reference attachments and creates new, validated Qt Widgets `.ui` files from structured multimodal blueprints.

**Architecture:** Renderer owns interaction-only state such as panel width, drag/drop and attachment cards. Electron Main validates attachments, calls the multimodal model, creates a deterministic candidate through `UiBlueprintGenerator`, runs XML/semantic/`uic`/PreviewHost validation, and atomically commits only an approved non-conflicting file. Existing `.ui` modification continues to use `UiOperation`; empty-project creation uses `UiCreationBlueprint`.

**Tech Stack:** Electron 40, React 19, TypeScript 5.8, Vite 5, Zod 4, Vitest, Testing Library, Playwright Electron, Qt 5.9.6, Qt 6.10.2, C++11 PreviewHost.

**Spec:** `docs/superpowers/specs/2026-08-26-v3-ai-attachments-ui-creation-design.md`

## Global Constraints

- Qt Widgets `.ui` only; QML is out of scope.
- Minimum Qt version is 5.9.6.
- The model never returns or writes unrestricted complete XML.
- Existing files are never overwritten by the create workflow.
- Images: PNG/JPEG/WEBP/SVG, at most 4, at most 10MB each.
- All attachments together are at most 24MB; text attachments are at most 2MB each.
- API keys remain in Electron Main and never reach Renderer.
- Candidate files live under `.qt-ui-copilot/v3/candidates/` until commit.
- Creation and modification share XML, semantic, `uic`, PreviewHost and revision evidence.

---

## File Map

```text
packages/contracts/src/v3-ui-creation.ts
packages/contracts/test/v3-ui-creation.test.ts
packages/ui-document/src/ui-blueprint-generator.ts
packages/ui-document/test/ui-blueprint-generator.test.ts

apps/desktop/src/main/ai/attachment-service.ts
apps/desktop/src/main/ai/ui-creation-service.ts
apps/desktop/src/main/ai/ui-creation-service.test.ts
apps/desktop/src/main/ipc/register-v3-ipc.ts
apps/desktop/src/preload/index.ts
apps/desktop/src/renderer/lib/api.ts

apps/desktop/src/renderer/v3/assistant/AiAssistant.tsx
apps/desktop/src/renderer/v3/assistant/AttachmentDropZone.tsx
apps/desktop/src/renderer/v3/assistant/AttachmentList.tsx
apps/desktop/src/renderer/v3/assistant/CreateUiForm.tsx
apps/desktop/src/renderer/v3/assistant/AssistantResizeHandle.tsx
apps/desktop/src/renderer/v3/assistant/*.test.tsx
apps/desktop/src/renderer/v3/state/v3-state.tsx
apps/desktop/src/renderer/v3/V3App.tsx
apps/desktop/src/renderer/v3/styles/v3.css

tests/e2e/v3-ui-creation.spec.ts
docs/v3-user-guide.md
```

---

### Task 1: Define attachment and UI creation contracts

**Files:**
- Create: `packages/contracts/src/v3-ui-creation.ts`
- Create: `packages/contracts/test/v3-ui-creation.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces `AiAttachmentSchema`, `UiCreationBlueprintSchema`, `UiCreationRequestSchema`, `UiCreationCandidateSchema`, and inferred TypeScript types.
- Consumed by Renderer API, Main attachment validation, model response parsing and generator.

- [ ] **Step 1: Write failing strict-schema tests**

```ts
it('rejects unsafe attachments and unsupported roots', () => {
  expect(() => AiAttachmentSchema.parse({ id: 'a', name: 'x.exe', kind: 'image', mimeType: 'application/x-msdownload', size: 12, contentHash: 'a'.repeat(64), dataUrl: 'data:application/x-msdownload;base64,AA==' })).toThrow();
  expect(() => UiCreationBlueprintSchema.parse({ ...validBlueprint, rootType: 'QQuickView' })).toThrow();
});

it('accepts a Qt 5-compatible dialog blueprint', () => {
  expect(UiCreationBlueprintSchema.parse(validBlueprint).rootType).toBe('QDialog');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test -- v3-ui-creation.test.ts`

Expected: FAIL because the contracts do not exist.

- [ ] **Step 3: Implement the strict contracts**

```ts
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const validateAttachmentKindAndPayload = (attachment: { kind: string; mimeType: string; dataUrl?: string; text?: string }, context: z.RefinementCtx) => {
  if (attachment.kind === 'image' && (!IMAGE_MIME.has(attachment.mimeType) || !attachment.dataUrl?.startsWith(`data:${attachment.mimeType};base64,`))) context.addIssue({ code: 'custom', message: 'invalid image attachment' });
  if (attachment.kind !== 'image' && typeof attachment.text !== 'string') context.addIssue({ code: 'custom', message: 'text attachment content is required' });
};

export const AiAttachmentSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(255),
  kind: z.enum(['image', 'ui', 'qss', 'qrc', 'source']),
  mimeType: z.string().min(1).max(128), size: z.number().int().positive().max(10 * 1024 * 1024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), dataUrl: z.string().max(14_000_000).optional(), text: z.string().max(2_000_000).optional(),
}).strict().superRefine(validateAttachmentKindAndPayload);

export interface UiBlueprintNode {
  kind: 'widget' | 'layout' | 'spacer'; className: string; objectName: string;
  properties: Record<string, UiValue>; children: UiBlueprintNode[];
}

export const UiBlueprintNodeSchema: z.ZodType<UiBlueprintNode> = z.lazy(() => z.object({
  kind: z.enum(['widget', 'layout', 'spacer']), className: z.string().min(1), objectName: z.string().min(1),
  properties: z.record(z.string(), UiValueSchema).default({}), children: z.array(UiBlueprintNodeSchema).default([]),
}).strict());

export const UiConnectionSchema = z.object({
  sender: z.string().min(1), signal: z.string().min(1), receiver: z.string().min(1), slot: z.string().min(1),
}).strict();

export const UiCreationBlueprintSchema = z.object({
  fileName: z.string().regex(/^[^\\/:*?"<>|]+\.ui$/i), rootType: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  rootObjectName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), windowTitle: z.string().max(256),
  size: z.object({ width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096) }).strict(),
  layoutTree: UiBlueprintNodeSchema, tabOrder: z.array(z.string()), connections: z.array(UiConnectionSchema),
  resourceRefs: z.array(z.string()), componentIds: z.array(z.string()), expectedResults: z.array(z.string()).min(1),
}).strict();
```

- [ ] **Step 4: Run contract tests and typecheck**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: add V3 UI creation contracts"
```

### Task 2: Implement deterministic blueprint-to-UI generation

**Files:**
- Create: `packages/ui-document/src/ui-blueprint-generator.ts`
- Create: `packages/ui-document/test/ui-blueprint-generator.test.ts`
- Modify: `packages/ui-document/src/index.ts`

**Interfaces:**
- Consumes: `UiCreationBlueprint` from Task 1.
- Produces: `generateUiFromBlueprint(blueprint: UiCreationBlueprint): { source: string; objectNames: string[] }`.

- [ ] **Step 1: Write failing determinism and safety tests**

```ts
it('generates byte-identical Qt Designer XML for the same blueprint', () => {
  expect(generateUiFromBlueprint(loginBlueprint).source).toBe(generateUiFromBlueprint(loginBlueprint).source);
});

it('rejects duplicate objects, cycles and non-whitelisted Qt classes', () => {
  expect(() => generateUiFromBlueprint(duplicateObjectBlueprint)).toThrow('duplicate objectName');
  expect(() => generateUiFromBlueprint(unknownWidgetBlueprint)).toThrow('unsupported Qt class');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test -- ui-blueprint-generator.test.ts`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement class/property allowlists and stable XML emission**

```ts
const QT59_WIDGETS = new Set(['QWidget', 'QDialog', 'QMainWindow', 'QFrame', 'QLabel', 'QPushButton', 'QToolButton', 'QLineEdit', 'QTextEdit', 'QPlainTextEdit', 'QCheckBox', 'QRadioButton', 'QComboBox', 'QSpinBox', 'QDoubleSpinBox', 'QSlider', 'QProgressBar', 'QGroupBox', 'QTabWidget', 'QStackedWidget', 'QScrollArea', 'QTableWidget', 'QTreeWidget', 'QListWidget']);
const QT59_LAYOUTS = new Set(['QVBoxLayout', 'QHBoxLayout', 'QGridLayout', 'QFormLayout']);

export function generateUiFromBlueprint(input: UiCreationBlueprint): GeneratedUi {
  const blueprint = UiCreationBlueprintSchema.parse(input);
  validateUniqueObjectsAndClasses(blueprint);
  const source = emitDesignerDocument(blueprint, { indent: ' ', xmlVersion: '4.0' });
  parseUi(source, blueprint.fileName);
  return { source, objectNames: collectObjectNames(blueprint.layoutTree) };
}
```

- [ ] **Step 4: Run generator, parser and operation regression tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-document
git commit -m "feat: generate deterministic UI XML from blueprints"
```

### Task 3: Add resizable AI Assistant shell

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/AssistantResizeHandle.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/AssistantResizeHandle.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Produces `AssistantResizeHandle({ width, onWidthChange, onReset })`.
- V3 root stores `qt-ui-copilot:v3:assistant-width` as an integer in `[300, 640]`.

- [ ] **Step 1: Write failing pointer and persistence tests**

```tsx
it('clamps drag width and restores the default on double click', async () => {
  render(<ResizeHarness initialWidth={360} />);
  fireEvent.pointerDown(screen.getByRole('separator'), { clientX: 900, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 });
  expect(screen.getByTestId('assistant-width')).toHaveTextContent('640');
  await user.dblClick(screen.getByRole('separator'));
  expect(screen.getByTestId('assistant-width')).toHaveTextContent('360');
});
```

- [ ] **Step 2: Verify test failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AssistantResizeHandle`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement pointer capture and CSS variable sizing**

```tsx
const clamp = (width: number) => Math.min(640, Math.max(300, width));
<div role="separator" aria-orientation="vertical" className="v3-assistant-resizer"
  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start.current = { x: event.clientX, width }; }}
  onPointerMove={(event) => start.current && onWidthChange(clamp(start.current.width + start.current.x - event.clientX))}
  onPointerUp={() => { start.current = undefined; }} onDoubleClick={onReset} />
```

Set `.v3-ide { grid-template-columns: 46px 230px minmax(420px, 1fr) var(--assistant-width); }` and persist only on drag completion.

- [ ] **Step 4: Run tests at 100%, 150% and minimum window width**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AssistantResizeHandle V3App && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with no outer document scroll.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/v3
git commit -m "feat: make V3 AI assistant resizable"
```

### Task 4: Add attachment ingestion and cards

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/attachment-reader.ts`
- Create: `apps/desktop/src/renderer/v3/assistant/attachment-reader.test.ts`
- Create: `apps/desktop/src/renderer/v3/assistant/AttachmentDropZone.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/AttachmentList.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/AttachmentDropZone.test.tsx`

**Interfaces:**
- Produces `readAttachment(file: File): Promise<AiAttachment>` and `validateAttachmentSet(attachments): AttachmentValidationResult`.
- Produces controlled UI events `onAdd(attachments)` and `onRemove(id)`.

- [ ] **Step 1: Write failing file validation tests**

```ts
it('accepts a PNG and rejects executables, oversized files and a fifth image', async () => {
  await expect(readAttachment(file('screen.png', 'image/png', pngBytes))).resolves.toMatchObject({ kind: 'image' });
  await expect(readAttachment(file('bad.exe', 'application/x-msdownload', bytes))).rejects.toThrow('unsupported');
  expect(validateAttachmentSet(fiveImages)).toMatchObject({ ok: false, code: 'too_many_images' });
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- attachment-reader AttachmentDropZone`

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Implement file reading and drop UI**

Use `File.arrayBuffer()`, `crypto.subtle.digest('SHA-256', bytes)`, `FileReader.readAsDataURL()` for images and `TextDecoder('utf-8', { fatal: true })` for text. Reject before reading when declared size exceeds the limit; recheck byte length after reading.

```tsx
<div onDragEnter={activate} onDragOver={allowDrop} onDragLeave={deactivate} onDrop={handleDrop} className={active ? 'attachment-drop is-active' : 'attachment-drop'}>
  <input ref={inputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/svg+xml,.ui,.qss,.qrc,.h,.hpp,.cpp" />
  {children}
</div>
```

- [ ] **Step 4: Run attachment and accessibility tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- attachment-reader AttachmentDropZone AttachmentList && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with keyboard-accessible remove and choose-file buttons.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/v3/assistant
git commit -m "feat: add V3 AI attachments"
```

### Task 5: Extend the provider for multimodal UI creation

**Files:**
- Modify: `packages/agent-workflow/src/model-provider.ts`
- Create: `apps/desktop/src/main/ai/ui-creation-planner.ts`
- Create: `apps/desktop/src/main/ai/ui-creation-planner.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.test.ts`

**Interfaces:**
- Extends `ModelRequest.kind` with `'ui_creation'`.
- Produces `UiCreationPlanner.plan(input): Promise<UiCreationBlueprint>`.

- [ ] **Step 1: Write failing multimodal request tests**

```ts
it('sends image attachments as image_url and parses a strict blueprint', async () => {
  const blueprint = await planner.plan({ requirement: 'Create login dialog', attachments: [imageAttachment], targetQtVersion: '5.9.6' });
  expect(provider.requests[0].kind).toBe('ui_creation');
  expect(provider.requests[0].input.attachments).not.toContain(imageAttachment.dataUrl);
  expect(blueprint.rootType).toBe('QDialog');
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- ui-creation-planner register-ipc`

Expected: FAIL because `ui_creation` and the planner do not exist.

- [ ] **Step 3: Implement prompt, schema and provider content conversion**

`UiCreationPlanner` gives the model the Qt 5.9.6 widget/property allowlist and requests JSON matching `UiCreationBlueprintSchema`. The concrete OpenAI-compatible provider converts only `ui_creation` image attachments to `image_url`; logs contain attachment name, size and hash, never `dataUrl` or text content.

```ts
const content = [{ type: 'text', text: JSON.stringify(redactedInput) },
  ...imageAttachments.map((attachment) => ({ type: 'image_url', image_url: { url: attachment.dataUrl! } }))];
```

- [ ] **Step 4: Run provider, Qwen and redaction tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/agent-workflow test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- ui-creation-planner register-ipc`

Expected: PASS; test output and traces contain no base64 payload or API key.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-workflow apps/desktop/src/main/ai apps/desktop/src/main/ipc
git commit -m "feat: add multimodal UI creation planning"
```

### Task 6: Implement Main attachment validation and candidate creation

**Files:**
- Create: `apps/desktop/src/main/ai/attachment-service.ts`
- Create: `apps/desktop/src/main/ai/attachment-service.test.ts`
- Create: `apps/desktop/src/main/ai/ui-creation-service.ts`
- Create: `apps/desktop/src/main/ai/ui-creation-service.test.ts`

**Interfaces:**
- Produces `AttachmentService.validate(input: AiAttachment[]): ValidatedAttachment[]`.
- Produces `UiCreationService.createCandidate(request): Promise<UiCreationCandidate>` and `commit(candidateId): Promise<{ uiFile: string }>`.

- [ ] **Step 1: Write failing security and transaction tests**

```ts
it('does not write the target file when blueprint or uic validation fails', async () => {
  await expect(service.createCandidate(invalidRequest)).rejects.toThrow('uic');
  await expect(access(targetUi)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('refuses a target that exists or escapes the workspace', async () => {
  await expect(service.commit(existingTargetCandidate.id)).rejects.toThrow('already exists');
  await expect(service.createCandidate({ ...request, directory: '../outside' })).rejects.toThrow('workspace');
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- attachment-service ui-creation-service`

Expected: FAIL because the services do not exist.

- [ ] **Step 3: Implement validation, candidate staging and evidence**

`createCandidate` resolves workspace/profile through `WorkspaceService`, validates attachments again, plans the blueprint, calls `generateUiFromBlueprint`, writes only the candidate directory, calls the target `uic`, then `PreviewSessionService.render`. Store `{ blueprint, source, targetPath, preview, validation, sourceHash }` in an in-memory transaction map.

`commit` uses `open(targetPath, 'wx')` or an equivalent atomic no-overwrite operation, writes the validated source, closes the handle, and removes the candidate directory. On failure it removes a newly-created partial target and retains candidate diagnostics.

- [ ] **Step 4: Run service and native validation tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- attachment-service ui-creation-service revision-service`

Run: `$env:QT59_CMAKE_PREFIX_PATH='D:\Qt5.9.6\5.9.6\msvc2017_64'; corepack pnpm@10.15.0 test:native:qt59`

Run: `$env:QT6_CMAKE_PREFIX_PATH='D:\Qt6.10.2\6.10.2\msvc2022_64'; corepack pnpm@10.15.0 test:native:qt6`

Expected: PASS for JS services and both Qt matrices.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ai
git commit -m "feat: add validated UI creation candidates"
```

### Task 7: Add typed creation IPC and cancellation

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Adds `ai.createUiCandidate(request)`, `ai.commitUiCandidate(candidateId)`, `ai.rejectUiCandidate(candidateId)`, and `ai.cancelUiCreation(taskId)`.

- [ ] **Step 1: Write failing IPC boundary tests**

```ts
it('rejects malformed attachments and exposes no arbitrary write primitive', async () => {
  await expect(createHandler({}, { workspaceId: 'w', attachments: [{ name: 'x.exe' }] })).rejects.toThrow();
  expect(window.qtUiCopilot.ai).not.toHaveProperty('writeFile');
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- register-v3-ipc preload-boundary`

Expected: FAIL before new handlers and API types exist.

- [ ] **Step 3: Register strict IPC handlers and preload methods**

Use `UiCreationRequestSchema.parse`, bounded IDs, `AbortController` per creation task and metadata-only progress events. Reject and cancel remove candidate directories; dispose aborts all running creation tasks.

- [ ] **Step 4: Run IPC, preload and type tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- register-v3-ipc preload-boundary && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc apps/desktop/src/preload apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: expose V3 UI creation IPC"
```

### Task 8: Build the Assistant creation workflow UI

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/AiAssistant.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/CreateUiForm.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/PlanApproval.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/AiAssistant.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Consumes Task 4 attachment components and Task 7 APIs.
- Produces explicit `modify` and `create` modes and creation candidate approval UI.

- [ ] **Step 1: Write failing workflow tests**

```tsx
it('switches to create mode after dropping an image with no active editor', async () => {
  render(<AssistantHarness activeEditor={undefined} />);
  await drop(screen.getByLabelText('AI 助手'), pngFile);
  expect(screen.getByRole('button', { name: '创建新界面' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('新 UI 文件名')).toHaveValue('NewWidget.ui');
});

it('previews a candidate and opens its committed file as a permanent tab', async () => {
  await user.click(screen.getByRole('button', { name: '生成界面草稿' }));
  expect(await screen.findByRole('img', { name: '新界面草稿预览' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '审批并保存' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'open', permanent: true }));
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AiAssistant CreateUiForm`

Expected: FAIL because creation UI does not exist.

- [ ] **Step 3: Implement the mode-specific UI and state machine**

Creation form fields are controlled and default to `NewWidget.ui`, `QWidget`, `ui/`, project resources enabled and component search enabled. Disable generation while attachments are invalid or neither requirement nor image exists. Candidate cards show blueprint summary, object count, `uic`/preview status and preview image. Reject removes the candidate but retains user input.

Split the monolithic Assistant JSX out of `V3App.tsx`; keep `V3App` responsible only for shell composition and editor state.

- [ ] **Step 4: Run interaction, keyboard and accessibility tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AiAssistant CreateUiForm AttachmentDropZone V3App && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS; creation is usable without a mouse except drag/drop, which has an equivalent choose-file button.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/v3
git commit -m "feat: add image-driven UI creation assistant"
```

### Task 9: Integrate workspace refresh, tabs and conflict handling

**Files:**
- Modify: `apps/desktop/src/main/workspace/workspace-service.ts`
- Modify: `apps/desktop/src/main/workspace/workspace-watcher.ts`
- Modify: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Consumes committed `{ uiFile }` from Task 7.
- Produces one normalized permanent editor Tab and refreshed Explorer metadata.

- [ ] **Step 1: Write failing integration tests**

```ts
it('adds a committed UI once and never replaces an existing editor', () => {
  const state = openUiFile(initialState, committedFile, true);
  expect(openUiFile(state, committedFile, true).editors).toHaveLength(1);
});

it('publishes a created workspace event with the committed hash', async () => {
  expect(await watcher.next()).toMatchObject({ type: 'created', file: { kind: 'ui', relativePath: 'ui/LoginDialog.ui' } });
});
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- workspace-watcher V3App v3-state`

Expected: FAIL at the missing creation integration.

- [ ] **Step 3: Implement refresh and tab activation**

Commit returns the complete `WorkspaceFile`; Renderer dispatches `{ type: 'open', file, permanent: true }`, activates it and clears the temporary creation candidate. If WorkspaceWatcher delivers the same file event later, reducer normalization prevents a duplicate Tab.

- [ ] **Step 4: Run workspace and editor tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- workspace-watcher workspace-service V3App v3-state`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/workspace apps/desktop/src/renderer/v3
git commit -m "feat: open newly created UI files in V3"
```

### Task 10: Qualify image-driven creation end to end

**Files:**
- Create: `tests/e2e/v3-ui-creation.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `scripts/run-e2e.mjs`
- Modify: `docs/v3-user-guide.md`

**Interfaces:**
- Produces repeatable evidence for resizing, image attachment, blueprint generation, preview, approval, file creation and Tab opening.

- [ ] **Step 1: Add a deterministic E2E model fixture and failing flow**

```ts
test('creates a new Qt UI from an image without overwriting project files', async () => {
  await openV3Workspace(window, fixture);
  await window.getByRole('button', { name: '创建新界面' }).click();
  await attachFile(window, 'tests/e2e/assets/login-reference.png');
  await window.getByLabel('新 UI 文件名').fill('GeneratedLogin.ui');
  await window.getByRole('button', { name: '生成界面草稿' }).click();
  await expect(window.getByRole('img', { name: '新界面草稿预览' })).toBeVisible();
  await window.getByRole('button', { name: '审批并保存' }).click();
  await expect(window.getByRole('tab', { name: 'GeneratedLogin.ui' })).toBeVisible();
  expect(await readFile(join(fixture, 'ui', 'GeneratedLogin.ui'), 'utf8')).toContain('<ui version="4.0">');
});
```

- [ ] **Step 2: Run E2E and verify the first incomplete boundary**

Run: `$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 exec playwright test tests/e2e/v3-ui-creation.spec.ts`

Expected: FAIL before all integration tasks are complete.

- [ ] **Step 3: Complete E2E-only wiring and document usage**

Use isolated fixture copies, a deterministic injected blueprint provider and a 256×256 reference image. Document mode selection, attachment limits, filename conflict behavior, approval, Qt Kit requirements and unsupported-model diagnostics.

- [ ] **Step 4: Run the final qualification matrix**

Run: `corepack pnpm@10.15.0 typecheck`

Run: `corepack pnpm@10.15.0 test`

Run: `$env:QT59_CMAKE_PREFIX_PATH='D:\Qt5.9.6\5.9.6\msvc2017_64'; corepack pnpm@10.15.0 test:native:qt59`

Run: `$env:QT6_CMAKE_PREFIX_PATH='D:\Qt6.10.2\6.10.2\msvc2022_64'; corepack pnpm@10.15.0 test:native:qt6`

Run: `$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop package:portable`

Expected: all tests and native gates pass; the portable launcher renders V3; the E2E fixture contains exactly one newly-created UI and no modified original source.

- [ ] **Step 5: Commit qualification and documentation**

```bash
git add tests/e2e scripts/run-e2e.mjs docs/v3-user-guide.md
git commit -m "test: qualify V3 image-driven UI creation"
```

---

## Completion Gate

- AI Assistant width is adjustable from 300–640px, persisted and resettable.
- Drag/drop and file picker enforce every attachment limit in Renderer and Main.
- Empty-editor image drop enters explicit create mode without auto-submitting.
- Visual attachments use a model that passed the vision capability check.
- The model returns a strict `UiCreationBlueprint`, never raw XML.
- The deterministic generator supports Qt 5.9.6-compatible standard widgets and layouts.
- Candidate failures never create or modify a project file.
- Existing target paths are rejected without an overwrite option.
- Candidate preview uses the selected target Qt Kit and project resources.
- Approval creates the file atomically and opens one permanent V3 Tab.
- Qt5/Qt6 native gates, full test suite, V3 creation E2E and portable launcher all pass.
