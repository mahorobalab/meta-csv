<div align="center">

# MetaText Editor

**A high-performance CSV editor & viewer powered by JSONC sidecar metadata (`.metatext.jsonc`).**  
*Keep your CSV files plain and Git-friendly — get Excel-like layout, styling, and memory across VS Code, Windows, and macOS.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white&cacheSeconds=86400)](https://v2.tauri.app/)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge)](https://code.visualstudio.com/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-Monorepo-F69220?style=for-the-badge&logo=pnpm&logoColor=white&cacheSeconds=86400)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

**English** | [日本語 (Japanese)](README_ja.md)

</div>

---

## Why MetaText Editor?

Working with CSV files in engineering and operations usually forces a painful trade-off:
- **Excel** corrupts leading zeros (`001` → `1`), rewrites dates (`1-2` → `Jan 2`), breaks UTF-8/LF encodings, and freezes on large files.
- **Plain CSV editors** forget your column widths, hidden columns, and sort order every time you close the tab.

**MetaText Editor** solves this by separating **data** (`data.csv`) from **presentation & view metadata** (`data.csv.metatext.jsonc`):
- **Zero-Config & No Amnesia**: Opens any CSV immediately with auto-fitted column widths; the moment you resize a column, sort, or style a cell, `.metatext.jsonc` is created and updated automatically.
- **Comment-Preserving JSONC**: Uses Microsoft's `jsonc-parser` (`modify` / `applyEdits`) so GUI updates never destroy hand-written comments or formatting.
- **Git-Friendly**: Preserves original CSV encoding (`UTF-8` / `UTF-8 BOM` / `Shift-JIS`), line endings (`LF` / `CRLF`), and delimiter. View sorting never mutates the underlying CSV rows.
- **Shared Across Environments**: Resize columns in VS Code, then open the same file in the native desktop app — your exact layout, styles, and sort order follow you automatically.

---

## Performance Benchmark (Real Measurement)

Tested on Windows 11 with a **1,000,000 rows × 10 columns (181.27 MB)** UTF-8 CSV containing Japanese text and quoted fields:

| Metric | Measured Result |
| --- | --- |
| **Rows × Columns** | `1,000,000 × 10` (10,000,000 cells) |
| **File Size** | `181.27 MB` |
| **Load & Parse Time** | `~1.1 s` (1,108 ms) |
| **Memory Footprint (Tauri Desktop)** | `~519 MB` (CPU 0% idle) |
| **1M-Row View Sort** | `< 2 s` |
| **Scrolling** | Smooth 60fps all the way to row `1,000,000` |

---

## Engineering Highlights

1. **Canvas Grid Virtualization (`@glideapps/glide-data-grid`)**
   - Renders only visible viewport cells on a single `<canvas>`, maintaining 60fps even at 1,000,000 rows without DOM bloat or browser CSS height limits.
2. **Zero-Base64 Raw Binary IPC (Tauri v2)**
   - Uses `tauri::ipc::Response` and `tauri::ipc::Request` to stream raw `Uint8Array` / `ArrayBuffer` payloads directly between Rust and JS — eliminating Base64 inflation and main-thread freeze.
3. **Inline Web Worker Parsing + Smart Progress Overlay**
   - Offloads decoding and chunked CSV parsing to an inline Web Worker with zero-copy `ArrayBuffer` transfer, showing a smooth progress bar only when loading exceeds 150 ms.
4. **Adaptive Fast View Sorting**
   - Uses `Int32Array` row-index mapping (non-destructive) with automatic numeric column detection (`Float64Array`) and primitive fast-paths for datasets over 50k rows, while keeping natural `Intl.Collator` sorting for smaller files.
5. **5-Layer Excel-Inspired Style Cascade**
   - Supports a reusable named `styles` palette (inspired by Excel `styles.xml`) and compact rectangular `ranges` (`startRow:startCol..endRow:endCol`), resolved in order:  
     `table` → `columns` → `rules` (conditional formatting) → `ranges` → `rows` / `cells`.
6. **Command-Pattern Diff Undo/Redo**
   - Records only cell/row diffs rather than full snapshots, keeping Undo/Redo instant and memory-safe even on 1M-row files.
7. **Strict I/O Abstraction (`FileSystemAdapter`)**
   - `packages/core` and `packages/ui` have zero dependency on `vscode` or `@tauri-apps/*`, allowing 100% UI/core reuse across VS Code, Tauri (Windows/macOS), and Web.

---

## Tech Stack

| Layer | Technology | Role |
| --- | --- | --- |
| **Monorepo** | `pnpm workspaces` + TypeScript 5 | Shared packages across all targets |
| **UI & Grid** | React 18 + Vite 6 + `@glideapps/glide-data-grid` | High-speed Canvas spreadsheet UI |
| **CSV Engine** | `PapaParse` + Web Worker | Dialect detection, streaming parse & dialect-preserving save |
| **Metadata** | `jsonc-parser` + JSON Schema | Comment-preserving JSONC read/patch + IDE auto-completion |
| **Desktop** | Tauri v2 (Rust + WebView2 / WKWebView) | Native Windows / macOS app with raw binary file I/O |
| **IDE** | VS Code Custom Editor API (`Webview`) | Native IDE integration with automatic theme color sync |
| **Testing** | Vitest | Core unit tests (JSONC patch, dialect, 5-layer styles, sort, Undo/Redo) |

---

## Monorepo Structure

```text
metatext-editor/
├── packages/
│   ├── schema/      # TypeScript types matching metatext.schema.json
│   ├── core/        # CSV parser/serializer, JSONC patcher, style resolver, sort/search, Undo/Redo, FileSystemAdapter
│   └── ui/          # Shared React + Glide Data Grid editor & Web Worker pipeline
├── apps/
│   ├── playground/  # Vite dev playground & 100k-row benchmark (future Web base)
│   ├── vscode/      # VS Code / Antigravity Custom Editor extension (+ .metatext.jsonc schema)
│   └── desktop/     # Tauri v2 desktop app (Windows / macOS)
└── docs/
    ├── SPEC.md
    ├── schema/metatext.schema.json
    └── examples/spec_setting.csv.metatext.jsonc
```

---

## Quick Start

> On Windows PowerShell where execution policy restricts `.ps1`, use `pnpm.cmd`.

```powershell
# Install dependencies
pnpm.cmd install

# Typecheck, unit tests, and build all targets
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build

# Start Vite dev playground (http://127.0.0.1:15173)
pnpm.cmd dev

# Start Tauri v2 desktop app
pnpm.cmd dev:desktop
```

### Debugging the VS Code Extension
Open this repository in VS Code (or Antigravity IDE) and press **`F5`** to launch the Extension Development Host. Right-click any `.csv` file → **Open With... → MetaText Editor**.

---

## Documentation

- Specification: [docs/SPEC.md](docs/SPEC.md)
- JSON Schema: [docs/schema/metatext.schema.json](docs/schema/metatext.schema.json)
- Example Metadata: [docs/examples/spec_setting.csv.metatext.jsonc](docs/examples/spec_setting.csv.metatext.jsonc)
- Agent / Contributor Guide: [AGENTS.md](AGENTS.md)

---

## Download & Official Builds

- **Official signed desktop builds (Windows / macOS)** will be distributed via **Microsoft Store** and **BOOTH** *(Coming Soon)*.
- **GitHub Releases does not distribute prebuilt binaries.** This repository provides the full open-source code, `.metatext.jsonc` specification, and build instructions.
- Developers who prefer to build from source can compile the desktop executable locally:

```powershell
pnpm.cmd install
pnpm.cmd build:desktop
```

---

## License & Trademarks

- **Source Code & Specification**: Licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 MahorobaLab`).
- **Trademarks & Brand Assets**: The name **"MetaText Editor"** and the official application icons/logos are the property of MahorobaLab and are not covered by the MIT License. If you distribute your own builds or forks, please use a different name and icon to avoid confusion with the official builds.
