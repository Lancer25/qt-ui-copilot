# PreviewHost Source-Aware Cache Design

## Problem

The PreviewHost cache key only identifies the Qt kit. After PreviewHost rendering code changes, existing projects continue using the old binary. The old binary forces the requested preview profile size (for example `900x640`) even when the `.ui` root geometry is `520x360`, so “原始大小” is not original.

## Design

- Calculate a deterministic SHA-256 fingerprint from the PreviewHost source tree.
- Combine that fingerprint with the existing Qt-kit cache key.
- Rebuild automatically whenever any host source or CMake file changes.
- Keep the renderer’s actual-size mode based on the host-reported root widget width and height.

## Verification

- A cache-key test proves identical sources reuse the cache and changed sources produce a different key.
- Native PreviewHost tests prove root geometry is returned.
- Renderer tests prove actual-size mode applies the returned dimensions without invoking another render.
