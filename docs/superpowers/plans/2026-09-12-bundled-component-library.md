# Bundled Qt Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, searchable, selectable, and deterministically reusable Qt 5.9 component library.

**Architecture:** Package manifest-based `.ui` modules as runtime assets, index them through the existing component catalogue, merge them into V3 capability search, and materialize selected fragments in the Main-process generation pipeline.

**Tech Stack:** TypeScript, Electron IPC, React, Qt Designer UI XML, QSS, Vitest, Qt 5.9 uic

**Spec:** `docs/superpowers/specs/2026-09-12-bundled-component-library-design.md`

## Global Constraints

- Bundled modules use only Qt 5.9.6 standard Widgets.
- Component `.ui` files contain no inline stylesheet properties.
- New applications keep `.ui` and `styles/app.qss` separate.
- Existing projects keep their current resource structure.
- Unsupported promoted widgets fail closed.

---

### Task 1: Catalogue assets and lookup

- [ ] Add nine manifest-driven `.ui` modules and attribution notice.
- [ ] Add synchronous record lookup to `ComponentCatalog` with tests.
- [ ] Include the library in packaged runtime assets.
- [ ] Validate every module with Qt 5.9 `uic`.

### Task 2: Deterministic materialization

- [ ] Write a failing materializer test.
- [ ] Replace capability placeholders or append selected components.
- [ ] Record applied component IDs and warnings.
- [ ] Connect materialization to `UiCreationTaskService`.

### Task 3: V3 search and selection

- [ ] Merge bundled components into `v3.capabilities.search`.
- [ ] Build the component-library sidebar with search and multi-selection.
- [ ] Pass selected candidates into create/modify task inputs.
- [ ] Add IPC and renderer tests.

### Task 4: Verification and packaging

- [ ] Run component-library, desktop, contracts, and type checks.
- [ ] Build the portable application.
- [ ] Launch the packaged Qt UI Copilot for user validation.
