# 图片请求格式配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to choose whether image attachments are sent as Base64 Data URLs or remote URLs, defaulting to Base64 Data URLs.

**Architecture:** Persist an `imagePayloadMode` field with model settings. The provider converts local image attachments according to that mode before constructing OpenAI-compatible multimodal message content. The settings panel exposes a select control and the existing vision capability test uses the same conversion path.

**Tech Stack:** TypeScript, Electron IPC, React, Zod, Vitest.

**Spec:** User approved option A: a dropdown with Base64 Data URL and remote image URL, default Base64 Data URL.

---

### Task 1: Extend model settings contract and persistence

**Files:** `apps/desktop/src/main/ipc/register-ipc.ts`, `apps/desktop/src/main/settings/model-capabilities.ts`, `apps/desktop/src/renderer/lib/api.ts`, `packages/task-store/src/task-repository.ts`

- Add the enum `base64_data_url | remote_url`, defaulting to `base64_data_url`.
- Read/write the value through settings IPC and repository migrations without exposing API keys.
- Keep backward compatibility for existing settings by applying the default when missing.

### Task 2: Apply the configured mode to image requests

**Files:** `apps/desktop/src/main/ipc/register-ipc.ts`, `apps/desktop/src/main/settings/model-capabilities.ts`

- Use Base64 Data URLs unchanged in the default mode.
- In remote URL mode, reject local-only attachments with a clear configuration error unless a usable HTTP(S) URL is present.
- Ensure vision capability probes and normal planning requests use the same payload conversion.

### Task 3: Add settings UI and tests

**Files:** `apps/desktop/src/renderer/pages/settings/ModelSettingsPanel.tsx`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/test/FakeDesktopApi.ts`, relevant Vitest tests.

- Add a labeled select control with Chinese descriptions.
- Persist the selection when saving model settings.
- Add tests for default behavior, selecting remote mode, and Base64 image request bodies.

### Task 4: Verify and commit

- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `git diff --check` and commit the completed change.
