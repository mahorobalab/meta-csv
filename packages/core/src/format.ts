import { format as numfmtFormat, getFormatInfo, isValidFormat } from 'numfmt';

export interface NumberFormatPreset {
  label: string;
  pattern: string;
  description: string;
  category: 'number' | 'date';
}

export const NUMBER_FORMAT_PRESETS: readonly NumberFormatPreset[] = [
  { label: 'General', pattern: '', description: 'No formatting (raw value)', category: 'number' },
  { label: '1,234', pattern: '#,##0', description: 'Integer with thousands separator', category: 'number' },
  { label: '0,000', pattern: '0,000', description: '4-digit zero-padded with comma', category: 'number' },
  { label: '1,234.56', pattern: '#,##0.00', description: '2 decimal places with comma', category: 'number' },
  { label: '0000', pattern: '0000', description: '4-digit zero-padded integer', category: 'number' },
  { label: '12.3%', pattern: '0.0%', description: 'Percentage with 1 decimal', category: 'number' },
  { label: '¥1,234', pattern: '¥#,##0', description: 'JPY currency', category: 'number' },
  { label: '$1,234.56', pattern: '$#,##0.00', description: 'USD currency', category: 'number' },
];

export const DATE_FORMAT_PRESETS: readonly NumberFormatPreset[] = [
  { label: 'yyyy-mm-dd', pattern: 'yyyy-mm-dd', description: 'ISO 8601 date (2026-06-10)', category: 'date' },
  { label: 'yyyy/mm/dd', pattern: 'yyyy/mm/dd', description: 'Slash date (2026/06/10)', category: 'date' },
  { label: 'mm/dd/yyyy', pattern: 'mm/dd/yyyy', description: 'US date (06/10/2026)', category: 'date' },
  { label: 'Jun 10, 2026', pattern: 'mmm d, yyyy', description: 'English short month date', category: 'date' },
  { label: '2026年6月10日', pattern: 'yyyy年m月d日', description: 'Japanese date format', category: 'date' },
  { label: 'yyyy-mm-dd hh:mm', pattern: 'yyyy-mm-dd hh:mm', description: 'Date and time', category: 'date' },
  { label: 'hh:mm:ss', pattern: 'hh:mm:ss', description: 'Time only (24h)', category: 'date' },
];

const STRICT_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
// Matches YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD with optional time & timezone
const YMD_RE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// Matches Japanese YYYY年M月D日 with optional time
const JP_YMD_RE =
  /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
// Matches US MM/DD/YYYY with optional time
const US_MDY_RE =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
// Matches time-only HH:MM or HH:MM:SS(.sss)
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const DATE_PATTERN_CACHE = new Map<string, boolean>();

function isDatePattern(pattern: string): boolean {
  const cached = DATE_PATTERN_CACHE.get(pattern);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    result = Boolean(getFormatInfo(pattern).isDate);
  } catch {
    result = false;
  }
  if (DATE_PATTERN_CACHE.size >= 200) {
    DATE_PATTERN_CACHE.clear();
  }
  DATE_PATTERN_CACHE.set(pattern, result);
  return result;
}

function buildValidLocalDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute, second, ms);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

function parseDateValue(trimmed: string): Date | null {
  const ymd = YMD_RE.exec(trimmed);
  if (ymd) {
    if (ymd[8]) {
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return buildValidLocalDate(
      Number(ymd[1]),
      Number(ymd[2]),
      Number(ymd[3]),
      ymd[4] ? Number(ymd[4]) : 0,
      ymd[5] ? Number(ymd[5]) : 0,
      ymd[6] ? Number(ymd[6]) : 0,
      ymd[7] ? Number(ymd[7].padEnd(3, '0')) : 0,
    );
  }

  const jp = JP_YMD_RE.exec(trimmed);
  if (jp) {
    return buildValidLocalDate(
      Number(jp[1]),
      Number(jp[2]),
      Number(jp[3]),
      jp[4] ? Number(jp[4]) : 0,
      jp[5] ? Number(jp[5]) : 0,
      jp[6] ? Number(jp[6]) : 0,
    );
  }

  const us = US_MDY_RE.exec(trimmed);
  if (us) {
    return buildValidLocalDate(
      Number(us[3]),
      Number(us[1]),
      Number(us[2]),
      us[4] ? Number(us[4]) : 0,
      us[5] ? Number(us[5]) : 0,
      us[6] ? Number(us[6]) : 0,
    );
  }

  const time = TIME_ONLY_RE.exec(trimmed);
  if (time) {
    return buildValidLocalDate(
      2000,
      1,
      1,
      Number(time[1]),
      Number(time[2]),
      time[3] ? Number(time[3]) : 0,
      time[4] ? Number(time[4].padEnd(3, '0')) : 0,
    );
  }

  return null;
}

export function isValidNumberFormat(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return true;
  try {
    return isValidFormat(trimmed);
  } catch {
    return false;
  }
}

/**
 * Format a raw cell string for display using an Excel-compatible numfmt pattern
 * (supports both numeric and date/time patterns).
 * Non-matching values and invalid patterns fall back safely to the original string.
 */
export function formatCellValue(rawValue: string, numberFormat?: string): string {
  if (!numberFormat || !rawValue) return rawValue;
  const trimmed = rawValue.trim();
  if (!trimmed) return rawValue;

  if (isDatePattern(numberFormat)) {
    const dateVal = parseDateValue(trimmed);
    if (!dateVal) return rawValue;
    try {
      return numfmtFormat(numberFormat, dateVal);
    } catch {
      return rawValue;
    }
  }

  if (!STRICT_NUMBER_RE.test(trimmed)) return rawValue;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return rawValue;
  try {
    return numfmtFormat(numberFormat, num);
  } catch {
    return rawValue;
  }
}
