export type NewFileFormat = 'csv' | 'tsv' | 'jsonl' | 'log';

export interface NewFileFormatOption {
  format: NewFileFormat;
  label: string;
  extension: string;
  description: string;
}

export const NEW_FILE_FORMAT_OPTIONS: readonly NewFileFormatOption[] = [
  { format: 'csv', label: 'CSV', extension: '.csv', description: 'Comma-separated (100×100)' },
  { format: 'tsv', label: 'TSV', extension: '.tsv', description: 'Tab-separated (100×100)' },
  { format: 'jsonl', label: 'JSONL', extension: '.jsonl', description: 'JSON Lines' },
  { format: 'log', label: 'Log / Text', extension: '.log', description: 'Plain log / text' },
] as const;

export interface NewFileTemplate {
  fileName: string;
  content: string;
  metaText: string;
}

export function createNewFileTemplate(format: NewFileFormat = 'csv'): NewFileTemplate {
  switch (format) {
    case 'tsv':
      return {
        fileName: 'untitled.tsv',
        content: Array.from({ length: 100 }, () => '\t'.repeat(99)).join('\r\n'),
        metaText: `{
  "version": "0.1",
  "format": "tsv",
  "csv": {
    "hasHeader": false,
    "delimiter": "\\t"
  }
}
`,
      };
    case 'jsonl':
      return {
        fileName: 'untitled.jsonl',
        content: '{"column_1":"","column_2":"","column_3":""}\r\n',
        metaText: `{
  "version": "0.1",
  "format": "jsonl",
  "readOnly": false
}
`,
      };
    case 'log':
      return {
        fileName: 'untitled.log',
        content: '\r\n',
        metaText: `{
  "version": "0.1",
  "format": "log",
  "readOnly": false
}
`,
      };
    case 'csv':
    default:
      return {
        fileName: 'untitled.csv',
        content: Array.from({ length: 100 }, () => ','.repeat(99)).join('\r\n'),
        metaText: `{
  "version": "0.1",
  "format": "csv",
  "csv": {
    "hasHeader": false
  }
}
`,
      };
  }
}
