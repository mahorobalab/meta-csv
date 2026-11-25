export interface CsvFilePayload {
  /** File name (e.g. "spec_setting.csv") */
  fileName: string;
  /** Raw CSV bytes so dialect/encoding detection stays in core */
  csvBytes: Uint8Array;
  /** Adjacent .meta.jsonc raw text, or null if not yet created */
  metaText: string | null;
}

export interface FileSystemAdapter {
  /** Load the active CSV file and its adjacent metadata file */
  load(): Promise<CsvFilePayload>;
  /** Persist CSV bytes (already encoded in the target encoding) */
  saveCsv(bytes: Uint8Array): Promise<void>;
  /** Persist .meta.jsonc text (creating it if it does not exist) */
  saveMeta(jsoncText: string): Promise<void>;
  /** Optional subscription to external file updates */
  onExternalChange?(callback: (target: 'csv' | 'meta') => void): () => void;
  /** Optional subscription to host theme changes (e.g. VS Code theme switch) */
  onThemeChange?(callback: () => void): () => void;
}
