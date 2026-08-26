# Two-Stage Qt UI Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile one-shot Qt UI blueprint generation with a validated base UI stage followed by independently recoverable visual enhancements.

**Architecture:** The model first produces a small `CanonicalUiIntent`; the application normalizes it and deterministically generates a Qt 5.9.6-compatible base `.ui`. A second model request produces allow-listed enhancement operations that are applied one at a time while preserving the last `uic`-valid snapshot.

**Tech Stack:** TypeScript, Zod, Electron IPC, React, Vitest, Qt `uic`, existing `@qt-ui-copilot/contracts`, `ui-document`, `project-core`, and desktop V3 services.

**Spec:** `docs/superpowers/specs/2026-08-26-two-stage-ui-generation-design.md`

## Global Constraints

- Minimum supported Qt version is Qt 5.9.6.
- Only Qt Widgets and Qt Designer `.ui` files are supported.
- The model never writes raw XML, scripts, C++, or arbitrary paths.
- A failed enhancement must not invalidate a `uic`-valid base candidate.
- New projects require only a bound Qt Kit for base generation and `uic` validation.
- Provider 429 handling remains five automatic retries plus manual continuation.

---

### Task 1: Canonical UI Intent Contract

**Files:**
- Create: `packages/contracts/src/v3-ui-intent.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/v3-ui-intent.test.ts`

**Interfaces:**
- Produces: `CanonicalUiIntentSchema`, `CanonicalUiNodeSchema`, `CanonicalUiIntent`, `CanonicalUiNode`.
- Consumed by: `UiIntentPlanner`, `UiIntentNormalizer`, and `BaseUiGenerator`.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(CanonicalUiIntentSchema.parse({
  fileName: 'Login.ui', rootType: 'QWidget', rootObjectName: 'login',
  windowTitle: '登录', size: { width: 520, height: 360 },
  tree: { kind: 'layout', role: 'main', layout: 'vertical', children: [] },
  expectedResults: ['可以输入账号和密码'],
})).toMatchObject({ rootType: 'QWidget' });

expect(() => CanonicalUiIntentSchema.parse({ rawXml: '<ui/>' })).toThrow();
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts exec vitest run test/v3-ui-intent.test.ts`

Expected: FAIL because `CanonicalUiIntentSchema` is not exported.

- [ ] **Step 3: Implement the restricted intent schema**

```ts
export const CanonicalUiNodeSchema: z.ZodType<CanonicalUiNode> = z.lazy(() => z.object({
  kind: z.enum(['widget', 'layout', 'spacer']),
  role: z.string().min(1).max(64),
  widget: z.enum(['container', 'label', 'button', 'lineEdit', 'textEdit', 'checkBox', 'comboBox', 'list', 'table']).optional(),
  layout: z.enum(['vertical', 'horizontal', 'grid', 'form']).optional(),
  text: z.string().max(2048).optional(),
  placeholder: z.string().max(2048).optional(),
  objectName: z.string().max(128).optional(),
  stretch: z.number().int().min(0).max(100).optional(),
  children: z.array(CanonicalUiNodeSchema).max(256).default([]),
}).strict());
```

- [ ] **Step 4: Run contract tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test`

Expected: all contract tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/v3-ui-intent.ts packages/contracts/src/index.ts packages/contracts/test/v3-ui-intent.test.ts
git commit -m "feat: add canonical Qt UI intent contract"
```

### Task 2: Intent Normalizer and Deterministic Degradation

**Files:**
- Create: `packages/ui-document/src/ui-intent-normalizer.ts`
- Modify: `packages/ui-document/src/index.ts`
- Test: `packages/ui-document/test/ui-intent-normalizer.test.ts`

**Interfaces:**
- Consumes: `CanonicalUiIntent`.
- Produces: `normalizeUiIntent(input): { intent: CanonicalUiIntent; warnings: IntentWarning[] }`.

- [ ] **Step 1: Write failing normalization tests**

```ts
const result = normalizeUiIntent(intentWithDuplicateAndInvalidNames);
expect(result.intent.rootObjectName).toBe('login_widget');
expect(collectNames(result.intent)).toEqual(['login_widget', 'titleLabel', 'titleLabel_2']);
expect(result.warnings.map((item) => item.code)).toContain('object_name_repaired');
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document exec vitest run test/ui-intent-normalizer.test.ts`

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Implement normalization**

Implement these exact rules:

```ts
export interface IntentWarning { code: 'object_name_repaired' | 'duplicate_name_repaired' | 'node_degraded' | 'default_size_applied'; path: string; message: string; }
export function normalizeUiIntent(input: CanonicalUiIntent): { intent: CanonicalUiIntent; warnings: IntentWarning[] };
```

- Sanitize object names to `[A-Za-z_][A-Za-z0-9_]*`.
- Deduplicate in depth-first order with `_2`, `_3` suffixes.
- Fill root size with `900x640` when absent.
- Degrade an invalid widget semantic supplied through untrusted parsing to `container`.
- Degrade an invalid layout semantic to `vertical`.
- Keep warnings bounded to 128 entries.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: all UI document tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-document/src/ui-intent-normalizer.ts packages/ui-document/src/index.ts packages/ui-document/test/ui-intent-normalizer.test.ts
git commit -m "feat: normalize and degrade canonical UI intents"
```

### Task 3: Base UI Generator

**Files:**
- Create: `packages/ui-document/src/base-ui-generator.ts`
- Modify: `packages/ui-document/src/index.ts`
- Test: `packages/ui-document/test/base-ui-generator.test.ts`

**Interfaces:**
- Consumes: normalized `CanonicalUiIntent`.
- Produces: `generateBaseUi(intent): GeneratedUi` using the existing `GeneratedUi` shape.

- [ ] **Step 1: Write failing deterministic snapshot tests**

```ts
const first = generateBaseUi(loginIntent);
const second = generateBaseUi(loginIntent);
expect(first.source).toBe(second.source);
expect(first.source).toContain('<layout class="QVBoxLayout"');
expect(() => parseUi(first.source, 'Login.ui')).not.toThrow();
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document exec vitest run test/base-ui-generator.test.ts`

Expected: FAIL because `generateBaseUi` does not exist.

- [ ] **Step 3: Implement the semantic maps**

```ts
const widgetMap = { container: 'QWidget', label: 'QLabel', button: 'QPushButton', lineEdit: 'QLineEdit', textEdit: 'QTextEdit', checkBox: 'QCheckBox', comboBox: 'QComboBox', list: 'QListWidget', table: 'QTableWidget' } as const;
const layoutMap = { vertical: 'QVBoxLayout', horizontal: 'QHBoxLayout', grid: 'QGridLayout', form: 'QFormLayout' } as const;
```

Generate only text, placeholderText, windowTitle, geometry, objectName, and stretch information. Reuse XML escaping and `parseUi` validation.

- [ ] **Step 4: Run UI document tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-document/src/base-ui-generator.ts packages/ui-document/src/index.ts packages/ui-document/test/base-ui-generator.test.ts
git commit -m "feat: generate deterministic base UI documents"
```

### Task 4: Visual Enhancement Contract and Applier

**Files:**
- Create: `packages/contracts/src/v3-ui-enhancement.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/ui-document/src/ui-enhancement-applier.ts`
- Modify: `packages/ui-document/src/index.ts`
- Test: `packages/contracts/test/v3-ui-enhancement.test.ts`
- Test: `packages/ui-document/test/ui-enhancement-applier.test.ts`

**Interfaces:**
- Produces: `VisualEnhancementPlanSchema`, `VisualEnhancementOperationSchema`.
- Produces: `applyEnhancement(source, operation): { source: string; applied: boolean; warning?: EnhancementWarning }`.

- [ ] **Step 1: Write failing schema and applier tests**

```ts
const operation = VisualEnhancementOperationSchema.parse({ op: 'setFont', target: 'titleLabel', value: { family: 'Microsoft YaHei', pointSize: 18, bold: true } });
expect(applyEnhancement(source, operation).source).toContain('<font>');
expect(applyEnhancement(source, { op: 'setFont', target: 'missing', value: {} }).applied).toBe(false);
```

- [ ] **Step 2: Verify failures**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: FAIL because the enhancement modules do not exist.

- [ ] **Step 3: Implement the allow-listed operations**

Support exactly:

```ts
type VisualEnhancementOperation =
  | { op: 'setFont'; target: string; value: { family?: string; pointSize?: number; bold?: boolean; italic?: boolean; underline?: boolean } }
  | { op: 'setSizeBounds'; target: string; minimum?: { width: number; height: number }; maximum?: { width: number; height: number } }
  | { op: 'setLayoutMetrics'; target: string; spacing?: number; margins?: [number, number, number, number]; stretch?: string }
  | { op: 'setAlignment'; target: string; value: string }
  | { op: 'setStyleToken'; target: string; token: 'primary' | 'secondary' | 'danger' | 'title' | 'muted' | 'panel' }
  | { op: 'setResource'; target: string; resourcePath: string };
```

Unknown targets and unsupported values return `applied: false` with a warning; they never throw after schema parsing.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/ui-document test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/ui-document
git commit -m "feat: add recoverable UI enhancement operations"
```

### Task 5: Split Model Planning into Intent and Enhancement Stages

**Files:**
- Create: `apps/desktop/src/main/ai/ui-intent-planner.ts`
- Create: `apps/desktop/src/main/ai/ui-enhancement-planner.ts`
- Test: `apps/desktop/src/main/ai/ui-intent-planner.test.ts`
- Test: `apps/desktop/src/main/ai/ui-enhancement-planner.test.ts`
- Modify: `packages/agent-workflow/src/model-provider.ts`

**Interfaces:**
- Produces: `UiIntentPlanner.plan(input): Promise<CanonicalUiIntent>`.
- Produces: `UiEnhancementPlanner.plan(input): Promise<VisualEnhancementPlan>`.
- Extends `ModelRequest.kind` with `ui_intent` and `ui_enhancement`.

- [ ] **Step 1: Write failing planner tests**

```ts
expect(provider.requests[0].kind).toBe('ui_intent');
expect(provider.requests[0].input).not.toHaveProperty('rawXml');
expect(await enhancementPlanner.plan(input)).toMatchObject({ operations: expect.any(Array) });
```

- [ ] **Step 2: Verify failures**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/ui-intent-planner.test.ts src/main/ai/ui-enhancement-planner.test.ts`

Expected: FAIL because the planners and request kinds do not exist.

- [ ] **Step 3: Implement strict prompts and bounded repair**

- Intent prompt contains only the canonical schema and semantic roles.
- Enhancement prompt receives object names, base preview, expected results, and allow-listed operations.
- Schema-invalid responses receive at most one format repair request.
- Provider 408/429/5xx errors bypass format repair.
- Image data is included only in the first intent request; enhancement receives the staged preview plus the original reference image when available.

- [ ] **Step 4: Run planner tests and typecheck**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck && corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec vitest run src/main/ai`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ai packages/agent-workflow/src/model-provider.ts
git commit -m "feat: split UI intent and enhancement planning"
```

### Task 6: Two-Stage Creation Task Service

**Files:**
- Create: `apps/desktop/src/main/ai/ui-creation-task-service.ts`
- Test: `apps/desktop/src/main/ai/ui-creation-task-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Produces: `UiCreationTaskService.start(request): Promise<UiCreationTaskSnapshot>`.
- Produces events: `v3.ai.onUiCreationProgress` with `{ taskId, stage, warnings, candidate? }`.
- Produces commands: `continue`, `cancel`, `commitBase`, `commitEnhanced`.

- [ ] **Step 1: Write failing state-machine tests**

```ts
expect(events.map((event) => event.stage)).toEqual(expect.arrayContaining(['generating_intent', 'validating_base_ui', 'applying_enhancements', 'waiting_approval']));
expect(result.baseCandidate.validation.uic).toBe(true);
expect(result.enhancementWarnings).toContainEqual(expect.objectContaining({ code: 'enhancement_skipped' }));
```

- [ ] **Step 2: Verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/ui-creation-task-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement staged snapshots and rollback**

Maintain:

```ts
interface CandidateSnapshots { baseCandidate: string; lastValidCandidate: string; workingCandidate: string; }
```

For each enhancement: apply to `workingCandidate`, run document validation and `uic`, promote to `lastValidCandidate` only on success, otherwise restore from `lastValidCandidate` and append an `enhancement_skipped` warning.

- [ ] **Step 4: Register IPC and preload boundaries**

Use strict Zod schemas for every command and event. Preserve existing `createUiCandidate`, `commitUiCandidate`, and `cancelUiCreation` methods as compatibility wrappers until renderer migration is complete.

- [ ] **Step 5: Run service and IPC tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test`

Expected: all desktop tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/ai/ui-creation-task-service.ts apps/desktop/src/main/ai/ui-creation-task-service.test.ts apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: orchestrate two-stage UI creation tasks"
```

### Task 7: Renderer Progress, Candidate Choice, and Problems Integration

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/UiCreationProgressCard.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/UiCreationErrorCard.tsx`
- Test: `apps/desktop/src/renderer/v3/assistant/UiCreationProgressCard.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/assistant/CreateUiForm.tsx`
- Modify: `apps/desktop/src/renderer/v3/bottom-panel/BottomPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Consumes `UiCreationTaskSnapshot` and progress events.
- Produces user actions: cancel, continue, save base, save enhanced, view details, copy diagnostic.

- [ ] **Step 1: Write failing renderer tests**

```tsx
expect(screen.getByText('正在生成基础界面')).toBeTruthy();
expect(screen.getByRole('button', { name: '先保存基础版本' })).toBeTruthy();
expect(screen.getByText('2 项视觉增强已跳过')).toBeTruthy();
```

- [ ] **Step 2: Verify failures**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/assistant`

Expected: FAIL because staged task UI is absent.

- [ ] **Step 3: Implement IDE-style status cards**

- Blue progress card for active stages, with completed-step checkmarks and cancel.
- Yellow warning card for retryable provider errors and skipped enhancements.
- Red error card only for blocked base generation or invalid configuration.
- Green candidate card with separate base and enhanced choices.
- Detailed diagnostics remain collapsed by default and are copied without secrets.
- Toast remains only for short success confirmations.

- [ ] **Step 4: Feed warnings into Problems**

Map intent repairs and enhancement skips into BottomPanel Problems entries with severity, stage, target objectName, and message. Clicking an entry expands the matching creation card detail.

- [ ] **Step 5: Run renderer tests and accessibility checks**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test`

Expected: all desktop tests PASS with no duplicate accessible labels.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/v3
git commit -m "feat: present staged UI generation and recoverable errors"
```

### Task 8: Qt Validation Gates and End-to-End Qualification

**Files:**
- Modify: `tests/e2e/v3.spec.ts`
- Create: `apps/desktop/src/main/ai/two-stage-qt-gate.test.ts`
- Modify: `docs/v3-user-guide.md`

**Interfaces:**
- Verifies the complete feature; produces no new runtime interface.

- [ ] **Step 1: Add Qt 5.9.6 and Qt 6.10.2 native gate tests**

Cover base UI generation, one successful font enhancement, one rejected unsupported enhancement, `uic` validation, and preserved `lastValidCandidate`.

- [ ] **Step 2: Add E2E image creation flow**

The test must open a fixture workspace, attach an image, generate a base candidate, observe stage updates, save the enhanced candidate, and confirm that the new `.ui` appears in Explorer without restarting.

- [ ] **Step 3: Run the complete qualification suite**

Run:

```bash
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e
```

Expected: all workspace tests and V3 E2E tests PASS. Qt 5.9.6 and Qt 6.10.2 native gates must both report successful `uic` validation.

- [ ] **Step 4: Update user documentation**

Document the base/enhanced distinction, warning behavior, manual continuation, Qt Kit-only quick start, and how skipped enhancements appear in Problems.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/v3.spec.ts apps/desktop/src/main/ai/two-stage-qt-gate.test.ts docs/v3-user-guide.md
git commit -m "test: qualify two-stage Qt UI generation"
```
