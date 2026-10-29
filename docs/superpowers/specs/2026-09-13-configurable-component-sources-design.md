# Configurable Component Sources Design

## Goal

Turn the component library into a configurable source system. Users can add local Qt code directories or MCP servers, synchronize them into a unified catalogue, preview components with the current Qt Kit, and explicitly add compatible components to an AI task.

## Chosen architecture

Use a unified, persisted component snapshot cache. Source adapters only discover and fetch data; the catalogue, preview, compatibility checks, and AI materializer consume validated snapshots and never depend directly on a live source.

This was selected over direct per-source rendering, which duplicates validation and fails offline, and a general plugin runtime, which is unnecessarily broad for component discovery.

## Source types

### Local source

- Configuration: name, root directory, enabled state, discovery mode.
- Discovery mode `hybrid` first indexes `component.json` manifests. Directories without manifests are recursively scanned for `.ui` files.
- Automatic records infer widget/layout fingerprints, adjacent `.qss`/`.qrc` files, Qt version compatibility, and source paths.
- Discovery never modifies the selected directory. Inferred metadata is stored only in the application database/cache and is marked `inferred` for UI review.

### MCP stdio source

- Configuration: executable, arguments, optional working directory, enabled state.
- The client owns the child process and always closes it after synchronization or preview fetch.

### MCP Streamable HTTP source

- Configuration: HTTPS URL and enabled state.
- Initial implementation supports unauthenticated endpoints and optional bearer credentials encrypted with Electron `safeStorage`.
- Plain HTTP is accepted only for loopback development endpoints.

## MCP component contract

The server must expose two read-only tools:

- `qt_components_list`: accepts optional `query`, `cursor`, and `limit`; returns `structuredContent.components` plus optional `nextCursor`.
- `qt_component_get`: accepts `componentId`; returns one strict component bundle with manifest metadata, `.ui` text, optional QSS/QRC text assets, optional preview image data URL, and license metadata.

The app rejects missing tools, unstructured or oversized payloads, absolute output paths, unsafe relative paths, more than 256 components per sync, UI text over 2 MB, individual text assets over 2 MB, and image data over 14 MB.

## Persistence

- `component_sources`: source configuration, encrypted credential, health, timestamps.
- `component_source_items`: normalized component metadata and content snapshot keyed by source and component ID.
- Deleting a source removes its cached items after explicit UI confirmation.
- Disabling a source keeps the cache but excludes it from search.

## Main-process services

- `ComponentSourceService`: CRUD, connection test, synchronization, health and cache lifecycle.
- `LocalComponentSourceAdapter`: manifest-first/hybrid discovery and safe filesystem reads.
- `McpComponentSourceAdapter`: official MCP TypeScript client over stdio or Streamable HTTP.
- `ComponentPreviewService`: materializes one cached bundle in an isolated cache directory and calls PreviewHost with the selected workspace Qt profile.
- The existing bundled source is represented as a protected, always-enabled local source.

## Renderer

### Settings → Component Sources

- List source cards with type, status, item count, last sync, test, sync, enable/disable and remove actions.
- Add-source form changes fields by source type.
- Credentials are write-only: the renderer only sees `hasCredential`.

### Component library

- Search across enabled source snapshots.
- Filter by source and compatibility state.
- Selecting a row opens an inline preview/details pane showing real PreviewHost output, source, license, dependencies, Qt range and sync time.
- `加入当前任务` is enabled only for compatible components whose required assets are available.

## Error and trust model

- All source I/O runs in Electron Main.
- Renderer inputs cross strict Zod IPC schemas.
- MCP tools are never handed to the model; the app calls only the two fixed read-only tool names.
- Remote content is data, never instructions.
- Sync is atomic per source: validation failure leaves the last successful snapshot available and records an actionable health error.
- Preview runs only from the application cache and never from a remote path.

## Testing

- Repository CRUD, encrypted-secret preservation, atomic snapshot replacement.
- Local manifest and inferred discovery, traversal rejection and size bounds.
- MCP adapter against fake clients for stdio/HTTP contract validation and pagination.
- IPC validation and renderer source-management flows.
- Preview staging with QSS/QRC and Qt 5.9 uic/PreviewHost.
- End-to-end search, preview and add-to-task behavior.
