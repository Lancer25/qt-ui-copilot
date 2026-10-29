# Preview Sizing Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide fit and actual-size preview modes with clear controls.

**Architecture:** `UiPreviewTab` owns one display-mode state and renders a reusable SVG icon for each toolbar action. CSS classes control image sizing and overflow without regenerating the preview.

**Tech Stack:** React, TypeScript, CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-preview-sizing-controls-design.md`

## Global Constraints

- Fit mode is the default.
- Actual mode displays 100% image pixels and allows scrolling.
- Switching sizes must not invoke PreviewHost.

### Task 1: Controls and behavior

- [ ] Replace the old fit/100%-window controls with a three-button sizing group and separate new-window action.
- [ ] Add display-mode CSS for fit, actual and zoom.
- [ ] Test mutually exclusive selection, CSS state, no rerender request, and independent-window behavior.
- [ ] Run renderer tests, typecheck and portable packaging.
