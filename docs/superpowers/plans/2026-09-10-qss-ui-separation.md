# QSS/UI Separation Implementation Plan

**Goal:** Generate separate UI, QSS and QRC files for new Qt applications while preserving existing project structure.

**Spec:** `docs/superpowers/specs/2026-09-10-qss-ui-separation-design.md`

- [ ] Extend `qt-project-scaffolder.ts` to strip inline styles and generate `styles/app.qss`, `resources/app.qrc`, QSS-loading `main.cpp`, and `.pro` resources.
- [ ] Detect existing Qt project entrypoints in `UiCreationService`; scaffold the full resource set only for a new application.
- [ ] Pass staged QSS/QRC files to PreviewHost and persist their paths after approval.
- [ ] Add focused tests for scaffolding, existing-project preservation and preview resource loading.
- [ ] Run desktop/project tests, typecheck, and package the portable application.
