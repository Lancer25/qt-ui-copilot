# PreviewHost Source-Aware Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure preview rendering changes invalidate old PreviewHost binaries so actual-size previews use the `.ui` root geometry.

**Architecture:** Hash the native host source tree before selecting a build directory, then combine that source fingerprint with the Qt-kit identity. Existing renderer sizing remains unchanged because it already consumes host-reported logical dimensions.

**Tech Stack:** TypeScript, Node.js crypto/fs, CMake, Qt Widgets, Vitest

**Spec:** `docs/superpowers/specs/2026-09-12-preview-host-source-cache-design.md`

## Global Constraints

- Cache reuse must remain deterministic for unchanged source and Qt kit.
- A source change must select a new cache directory.
- Do not delete existing cache directories.

---

### Task 1: Source-aware cache key

**Files:**
- Modify: `packages/preview-client/src/preview-host-builder.ts`
- Create: `packages/preview-client/test/preview-host-builder.test.ts`

- [ ] Test stable and changed source fingerprints.
- [ ] Add deterministic recursive source hashing.
- [ ] Use the combined key in `ensureBuilt`.
- [ ] Run preview-client tests and typecheck.

### Task 2: Package and runtime verification

- [ ] Run native Qt 5.9 and Qt 6 PreviewHost tests.
- [ ] Rebuild the portable desktop package.
- [ ] Refresh the affected preview and confirm the output geometry matches the `.ui` root geometry.
