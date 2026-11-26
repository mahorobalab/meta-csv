# AGENTS.md — MetaText Editor Project Guide

## Overview
**MetaText Editor** is a high-performance CSV editor & viewer (targeting 100k+ rows at 60fps) that keeps CSV files clean and Git-friendly while persisting layout, styling, view sort order, and column metadata in an adjacent JSONC sidecar file (`<filename>.metatext.jsonc`).

See [docs/SPEC.md](docs/SPEC.md) for the full design specification and [docs/schema/metatext.schema.json](docs/schema/metatext.schema.json) for the JSON Schema.

## Monorepo Structure

```text
packages/
  schema/      # TypeScript types matching metatext.schema.json
  core/        # CSV dialect detection/parsing/serialization, comment-preserving JSONC patching (jsonc-parser), 5-layer style resolver, view sort, search, command-based Undo/Redo, FileSystemAdapter interface
  ui/          # Shared React + Glide Data Grid (Canvas) editor component
apps/
  playground/  # Vite dev playground & 100k-row benchmark (also serves as future Web build base)
  vscode/      # VS Code / Antigravity Custom Editor extension (+ JSONC schema completion)
  desktop/     # Tauri v2 desktop app (Windows / macOS)
docs/
  SPEC.md
  schema/metatext.schema.json
  examples/spec_setting.csv.metatext.jsonc
```

## Architectural Rules (Must Follow)
1. **Strict I/O abstraction**: `packages/core` and `packages/ui` MUST NOT import `vscode` or `@tauri-apps/*`. All file I/O goes through `FileSystemAdapter`.
2. **Comment-preserving JSONC updates**: Always mutate `.metatext.jsonc` via `patchMetaJsonc()` (`jsonc-parser`'s `modify` / `applyEdits`) so user comments and formatting are never destroyed.
3. **Non-destructive view sort**: `view.sort` sorts via `Int32Array` row index mapping without mutating underlying CSV row order.
4. **CSV dialect preservation**: Preserve detected encoding (`utf-8`, `utf-8-bom`, `shift-jis`), line endings (`lf`, `crlf`), and delimiter on save.
5. **5-layer style cascade**: `table` -> `columns` -> `rules` -> `ranges` -> `rows` / `cells` (supporting named `styles` palette and inline `CellStyle`).

## File & Responsibility Splitting Guidelines (Must Follow)
Keep source files modular, cohesive, and easy to test. Do not let components or modules grow monolithic as features are added:
1. **File size thresholds**:
   - Target **300–400 lines** per file.
   - Above **500 lines**: consider splitting by responsibility when touching the file.
   - Above **800 lines** (hard ceiling: **1,000 lines**): MUST split before adding new features.
2. **Separation of concerns**:
   - **Pure logic & utilities** (`utils/*.ts`, `packages/core`): Extract React-free data transformations, parsers, clipboard helpers, and index/range calculations into `.ts` modules and cover them with unit tests.
   - **State & interaction handlers** (`hooks/use*.ts`): Group cohesive state, `useMemo`, `useCallback`, and domain operations (e.g. column ops, row ops, markers, file save/undo) into dedicated custom hooks.
   - **Presentational UI** (`components/*.tsx`, `dialogs/*.tsx`): Extract toolbars, popovers, context menus, modals, drawers, and status bars into focused components.
   - **Container / orchestrator components** (`MetaTextEditor.tsx`, `App.tsx`): Keep them focused on wiring hooks, layout, and child components together.
3. **Ongoing metrics check**:
   - Run `pnpm.cmd run metrics` after substantial feature additions or refactors to verify no production file exceeds the size limits.

## Common Commands (Windows PowerShell)
Note: On Windows where PowerShell execution policy restricts `.ps1`, use `pnpm.cmd`.

- Install dependencies: `pnpm.cmd install`
- Typecheck all packages: `pnpm.cmd typecheck`
- Run unit tests: `pnpm.cmd test`
- Run unit tests with coverage: `pnpm.cmd run test:coverage`
- Run codebase metrics report: `pnpm.cmd run metrics`
- Build all packages (Playground + VS Code + Desktop frontend): `pnpm.cmd build`
- Run Playground (port 15173): `pnpm.cmd dev`
- Run Tauri Desktop app (port 15174): `pnpm.cmd dev:desktop`
- Debug VS Code extension: Press `F5` in VS Code / Antigravity IDE (`.vscode/launch.json`)
- Rust check only: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Sync JSON Schema from sibling `../metatext-spec`: `pnpm.cmd run sync:schema`

## Completion Criteria (Definition of Completion)
- All reported findings must include reliable "relative file paths" and "line numbers."
- If tests or type checks have been performed, the commands used and their results must be provided.
- Do not include speculative figures that have not been measured or verified (if a value has not been verified, label it as "not measured").
