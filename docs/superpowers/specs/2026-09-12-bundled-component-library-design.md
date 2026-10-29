# Bundled Qt Component Library Design

## Goal

Provide a useful offline component library whose modules can be searched, selected, deterministically inserted into generated Qt Widgets `.ui` files, and styled through a separate application QSS.

## Architecture

- Bundle manifest-driven standard-widget modules under `resources/component-library`.
- Index them with `ComponentCatalog` beside built-in Qt widget capabilities.
- Expose the merged catalogue through `v3.capabilities.search` with Qt-kit filtering.
- Let the V3 component sidebar select reusable modules and pass only those selections to the AI task.
- Materialize selected fragments in Main after semantic generation. A selected component is inserted even when the model omits its capability ID.
- Keep component forms free of inline styles. New applications use `styles/app.qss`; existing projects retain their current resource organization.

## Initial modules

Login card, filter toolbar, metric summary, settings section, empty state, status banner, pagination bar, action toolbar, and data table panel. All use only standard Qt Widgets and layouts compatible with Qt 5.9.6.

## Safety and licensing

- No network access at runtime.
- No unverified promoted widget is inserted into a Qt 5.9 project.
- The bundled modules are original normalized templates informed by the MIT/BSD projects evaluated during research; repository links and license notes are retained in the bundled notice.

## Verification

- Catalogue indexing and lookup tests.
- Deterministic materialization test proving the placeholder is replaced.
- IPC search test proving bundled fragments and Qt built-ins are both returned.
- Renderer selection test proving selected candidates reach task creation.
- Qt 5.9 `uic` validation for every bundled `.ui` file.
