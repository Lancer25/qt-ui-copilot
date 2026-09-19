# GTRONICK QSS Component Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GTRONICK/QSS as a separately identifiable protected component source with seven Qt 5.9.6-compatible standard-widget modules and packaged MaterialDark styling.

**Architecture:** Upstream MIT assets and original Qt UI wrappers live under `resources/external-component-libraries/gtronick-qss`. `ComponentSourceService` receives a list of protected source definitions and synchronizes each independently. Main-process path resolution and packaging expose the same source in development and portable builds.

**Tech Stack:** TypeScript, Qt Designer XML, QSS, SQLite repository, Vitest, Electron packaging

**Spec:** `docs/superpowers/specs/2026-09-19-gtronick-qss-component-source-design.md`

## Global Constraints

- Upstream `MaterialDark.qss` and MIT `LICENSE` remain unmodified.
- Every wrapper uses only standard Qt Widgets and declares `>=5.9.6 <7.0.0`.
- The source appears as `GTRONICK/QSS 基础控件`, separate from `内置组件库`.
- A failed external source must not make the existing bundled source unavailable.
- Portable builds contain the license, QSS, and all seven component manifests.

---

### Task 1: Vendor Upstream Assets and Create Seven UI Wrappers

**Files:**
- Create: `resources/external-component-libraries/gtronick-qss/LICENSE`
- Create: `resources/external-component-libraries/gtronick-qss/UPSTREAM.md`
- Create: `resources/external-component-libraries/gtronick-qss/styles/MaterialDark.qss`
- Create: seven `component.json` and seven `.ui` files under `resources/external-component-libraries/gtronick-qss/components/*`
- Test: `packages/component-library/test/gtronick-source.test.ts`

**Interfaces:**
- Produces: a valid local component source root accepted by `LocalComponentSourceAdapter.discover({ sourceId: 'gtronick-qss', discovery: 'manifest' })`.
- Consumes: upstream MIT files from `https://github.com/GTRONICK/QSS`.

- [ ] Download the upstream `LICENSE` and `MaterialDark.qss` from the official repository and verify the license includes “MIT License” and the QSS includes `QPushButton`, `QLabel`, and `QLineEdit` selectors.
- [ ] Write a failing adapter test expecting seven items, MIT SPDX metadata, Qt range `>=5.9.6 <7.0.0`, and one QSS asset containing `QPushButton`.
- [ ] Create valid `.ui` wrappers for buttons, labels, text inputs, selection controls, numeric/date inputs, progress/slider, and tabs.
- [ ] Create manifests with unique `gtronick-*` IDs, Chinese names/descriptions/tags, the matching `.ui`, and `../../styles/MaterialDark.qss` normalized from each component directory.
- [ ] Run `pnpm --filter @qt-ui-copilot/component-library test` and require the new adapter test to pass.

### Task 2: Generalize Protected Component Sources

**Files:**
- Modify: `apps/desktop/src/main/components/component-source-service.ts`
- Modify: `apps/desktop/src/main/components/component-source-service.test.ts`

**Interfaces:**
- Produces: `ProtectedComponentSourceDefinition { id; name; rootDir; licenseName? }` and `protectedSources?: ProtectedComponentSourceDefinition[]` in service options.
- Consumes: `LocalComponentSourceAdapter.discover` for each protected source.

- [ ] Add a failing service test with `bundled` and `gtronick-qss` definitions; assert two protected records, independent item counts, preserved MIT license for GTRONICK, and searchable results filtered by source ID.
- [ ] Replace the single-source bootstrap with one promise that iterates protected definitions and saves each record as `kind: bundled`, `protected: true`.
- [ ] Keep the existing bundled definition as a backwards-compatible default when `protectedSources` is omitted.
- [ ] Apply `licenseName` only when the definition supplies it; otherwise preserve adapter license metadata.
- [ ] Catch failures per definition, update only that source health, continue bootstrapping remaining definitions, and reject only if every protected source fails.
- [ ] Update protected-source test/sync behavior so a protected source refreshes through the shared bootstrap rather than accepting user edits.
- [ ] Run the component source service tests and desktop typecheck.

### Task 3: Resolve and Package the External Source

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`
- Modify: `apps/desktop/scripts/prepare-packaging-assets.mjs`
- Modify: `apps/desktop/src/main/runtime-assets.test.ts`

**Interfaces:**
- Produces: `resolveExternalComponentLibraryRoot('gtronick-qss')` and a `protectedSources` array passed to `ComponentSourceService`.
- Consumes: repository resource root and packaged `qt-ui-copilot-assets/component-libraries/gtronick-qss`.

- [ ] Add a failing path-resolution test covering development resources and portable `process.resourcesPath` fallback.
- [ ] Add a failing runtime-assets test requiring GTRONICK LICENSE, MaterialDark QSS, and seven manifests.
- [ ] Implement candidate path resolution beside the existing bundled resolver.
- [ ] Pass two source definitions to `ComponentSourceService`: bundled with the existing license override, and GTRONICK without an override.
- [ ] Extend packaging preparation to copy the external source into `component-libraries/gtronick-qss` and include it in checksummed runtime assets.
- [ ] Run register IPC and runtime asset tests.

### Task 4: Verify Search, Preview, Materialization, and Portable Build

**Files:**
- Modify if coverage requires: `apps/desktop/src/main/components/component-preview-service.test.ts`
- Modify if coverage requires: `apps/desktop/src/main/ai/component-materializer.test.ts`

**Interfaces:**
- Consumes: registered source items and their QSS assets.
- Produces: verified search, preview, stylesheet materialization, and portable output.

- [ ] Add or extend tests to confirm a GTRONICK item stages MaterialDark QSS for enhanced preview and `getStylesheetsByCapabilityId` returns its text.
- [ ] Run `pnpm --filter @qt-ui-copilot/component-library test`.
- [ ] Run `pnpm --filter @qt-ui-copilot/desktop test` and desktop typecheck.
- [ ] Run `git diff --check`.
- [ ] Build into a versioned `PORTABLE_OUTPUT` and verify the executable plus packaged GTRONICK license, QSS, and seven manifests exist.
