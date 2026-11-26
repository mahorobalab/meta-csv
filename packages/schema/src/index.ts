export const METATEXT_SIDECAR_SUFFIX = '.metatext.jsonc' as const;

export type MetaTextFormat = 'csv' | 'tsv' | 'log' | 'jsonl' | 'text';

export type CsvDelimiter = ',' | '\t' | ';' | '|';
export type CsvEncoding = 'utf-8' | 'utf-8-bom' | 'shift-jis';
export type CsvLineEnding = 'lf' | 'crlf';

export interface CsvDialectConfig {
  hasHeader?: boolean;
  delimiter?: CsvDelimiter;
  encoding?: CsvEncoding;
  lineEnding?: CsvLineEnding;
}

export type JsonlArrayMode = 'json' | 'join';

export interface JsonlParserConfig {
  flattenDepth?: number;
  arrayMode?: JsonlArrayMode;
  encoding?: CsvEncoding;
  lineEnding?: CsvLineEnding;
}

export interface LogParserConfig {
  linePattern?: string;
  columnNames?: string[];
  timestampColumn?: string;
  levelColumn?: string;
  multilinePattern?: string;
  wordWrap?: boolean;
  encoding?: CsvEncoding;
}

export interface TableConfig {
  fontFamily?: string;
  fontSize?: number;
  defaultRowHeight?: number;
  headerHeight?: number;
  freezeColumns?: number;
  zebraStriping?: boolean;
}

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  column: string;
  direction: SortDirection;
}

export interface FilterPreset {
  name: string;
  query: string;
  contextRows?: number;
  collapseColumn?: string;
}

export type MarkerColor = 'amber' | 'rose' | 'emerald' | 'sky' | 'violet';

export interface RowMarker {
  /** 0-based raw data row index (stable across sort & filter) */
  row: number;
  color?: MarkerColor;
  note?: string;
}

export interface ViewConfig {
  sort?: SortSpec[];
  activeFilter?: string;
  filterContextRows?: number;
  filterPresets?: FilterPreset[];
  markers?: RowMarker[];
}

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  wrap?: boolean;
  align?: ColumnAlign;
  numberFormat?: string;
}

export type StyleRef = string | CellStyle;

export type ColumnAlign = 'left' | 'center' | 'right';
export type ColumnDataType = 'text' | 'number' | 'boolean' | 'enum' | 'date';

export interface ColumnConfig {
  label?: string;
  width?: number;
  visible?: boolean;
  align?: ColumnAlign;
  wrap?: boolean;
  readonly?: boolean;
  type?: ColumnDataType;
  options?: string[];
  numberFormat?: string;
  style?: StyleRef;
}

export type RuleOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'regex'
  | 'empty'
  | 'notEmpty';

export interface ConditionalRule {
  name?: string;
  target?: 'cell' | 'row';
  when: {
    column: string;
    operator: RuleOperator;
    value?: string;
  };
  style: StyleRef;
}

export interface RangeStyleRule {
  /** 0-based inclusive range: '<startRow>:<startCol>..<endRow>:<endCol>' */
  ref: string;
  style: StyleRef;
}

export interface RowConfig {
  height?: number;
  style?: StyleRef;
}

export interface MetaTextDocument {
  $schema?: string;
  version?: '0.1';
  format?: MetaTextFormat;
  readOnly?: boolean;
  csv?: CsvDialectConfig;
  jsonl?: JsonlParserConfig;
  log?: LogParserConfig;
  table?: TableConfig;
  view?: ViewConfig;
  styles?: Record<string, CellStyle>;
  columns?: Record<string, ColumnConfig>;
  rules?: ConditionalRule[];
  ranges?: RangeStyleRule[];
  rows?: Record<string, RowConfig>;
  cells?: Record<string, StyleRef>;
  extensions?: Record<string, unknown>;
  [key: `x-${string}`]: unknown;
}

/** Backward-compatible alias for CSV-focused callers */
export type MetaCsvDocument = MetaTextDocument;

export const DEFAULT_META_VERSION = '0.1' as const;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_HEADER_HEIGHT = 32;
export const DEFAULT_FONT_SIZE = 13;
