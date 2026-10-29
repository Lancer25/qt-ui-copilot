# V3 Task History Persistence Design

## Goal

Make task history represent the current V3 AI sessions: completed tasks reopen with their persisted conversation, progress, candidate, and preview; tasks left running by an application exit are shown as interrupted instead of running forever.

## Design

- Persist every `V3TaskSnapshot` in a dedicated `v3_task_snapshots` table together with `workspaceId`, target path, and display title.
- Use `V3TaskEventService` as the single read/write boundary. It lazily restores snapshots, persists every mutation, lists workspace-scoped history, and reconciles persisted `pending`/`running` snapshots to `cancelled` at application startup.
- Expose `v3.ai.listTaskSnapshots` through IPC and preload. The V3 history panel stops reading legacy `tasks:list` rows, so old fixture tasks remain stored but are not mixed into the current UI.
- Clicking a history row opens the existing V3 task tab with its real task ID. `getTaskSnapshot` then restores the persisted state into the renderer store.

## Status and error behavior

- `completed`, `warning`, `failed`, and `cancelled` are terminal history states.
- A persisted `pending` or `running` task found at startup receives one cancellation event titled `应用上次退出时任务已中断`.
- Database or IPC failures are shown by the history panel without falling back to incompatible legacy task data.

## Verification

- Repository round-trip, workspace filtering, and interrupted-task reconciliation tests.
- Event-service persistence and reload tests.
- IPC registration/list/get tests.
- Renderer history test proving V3 history is used and the selected V3 task ID is opened.
