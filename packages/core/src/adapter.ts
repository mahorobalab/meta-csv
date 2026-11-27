export interface CsvFilePayload {
  /** File name (e.g. "spec_setting.csv") */
  fileName: string;
  /** Raw CSV bytes so dialect/encoding detection stays in core */
  csvBytes: Uint8Array;
  /** Adjacent .metatext.jsonc raw text, or null if not yet created */
  metaText: string | null;
}

export interface FileAppendResult {
  /** Newly appended raw bytes starting at the requested byte offset */
  bytes: Uint8Array;
  /** New EOF byte offset after reading */
  nextOffset: number;
  /** True when the file shrank or was rotated and should be reloaded from 0 */
  truncated: boolean;
}

export interface FileSystemAdapter {
  /** Load the active CSV file and its adjacent metadata file */
  load(): Promise<CsvFilePayload>;
  /** Optional incremental byte-offset tail reader for Live Tail monitoring */
  readAppend?(fromOffset: number): Promise<FileAppendResult>;
  /** Persist CSV bytes (already encoded in the target encoding) */
  saveCsv(bytes: Uint8Array): Promise<void>;
  /** Optional low-memory streaming save (preferred by Desktop Tauri for large files) */
  saveCsvStream?(
    chunks: Iterable<Uint8Array>,
    onProgress?: (percent: number) => void,
  ): Promise<void>;
  /** Persist .metatext.jsonc text (creating it if it does not exist) */
  saveMeta(jsoncText: string): Promise<void>;
  /** Optional subscription to external file updates */
  onExternalChange?(callback: (target: 'csv' | 'meta') => void): () => void;
  /** Optional subscription to host theme changes (e.g. VS Code theme switch) */
  onThemeChange?(callback: () => void): () => void;
}
