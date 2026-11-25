# AGENTS.md — MetaCSV Project Guide

## Overview
**MetaCSV** is a high-performance CSV editor & viewer (targeting 100k+ rows at 60fps) that keeps CSV files clean and Git-friendly while persisting layout, styling, view sort order, and column metadata in an adjacent JSONC sidecar file (`<filename>.meta.jsonc`).

See [docs/SPEC.md](docs/SPEC.md) for the full design specification and [docs/schema/metacsv.schema.json](docs/schema/metacsv.schema.json) for the JSON Schema.

## Monorepo Structure

```text
packages/
  schema/      # TypeScript types matching metacsv.schema.json
  core/        # CSV dialect detection/parsing/serialization, comment-preserving JSONC patching (jsonc-parser), 5-layer style resolver, view sort, search, command-based Undo/Redo, FileSystemAdapter interface
  ui/          # Shared React + Glide Data Grid (Canvas) editor component
apps/
  playground/  # Vite dev playground & 100k-row benchmark (also serves as future Web build base)
  vscode/      # VS Code / Antigravity Custom Editor extension (+ JSONC schema completion)
  desktop/     # Tauri v2 desktop app (Windows / macOS)
docs/
  SPEC.md
  schema/metacsv.schema.json
  examples/spec_setting.csv.meta.jsonc
```

## Architectural Rules (Must Follow)
1. **Strict I/O abstraction**: `packages/core` and `packages/ui` MUST NOT import `vscode` or `@tauri-apps/*`. All file I/O goes through `FileSystemAdapter`.
2. **Comment-preserving JSONC updates**: Always mutate `.meta.jsonc` via `patchMetaJsonc()` (`jsonc-parser`'s `modify` / `applyEdits`) so user comments and formatting are never destroyed.
3. **Non-destructive view sort**: `view.sort` sorts via `Int32Array` row index mapping without mutating underlying CSV row order.
4. **CSV dialect preservation**: Preserve detected encoding (`utf-8`, `utf-8-bom`, `shift-jis`), line endings (`lf`, `crlf`), and delimiter on save.
5. **5-layer style cascade**: `table` -> `columns` -> `rules` -> `ranges` -> `rows` / `cells` (supporting named `styles` palette and inline `CellStyle`).

## Common Commands (Windows PowerShell)
Note: On Windows where PowerShell execution policy restricts `.ps1`, use `pnpm.cmd`.

- Install dependencies: `pnpm.cmd install`
- Typecheck all packages: `pnpm.cmd typecheck`
- Run unit tests: `pnpm.cmd test`
- Build all packages (Playground + VS Code + Desktop frontend): `pnpm.cmd build`
- Run Playground (port 15173): `pnpm.cmd dev`
- Run Tauri Desktop app (port 15174): `pnpm.cmd dev:desktop`
- Debug VS Code extension: Press `F5` in VS Code / Antigravity IDE (`.vscode/launch.json`)
- Rust check only: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
