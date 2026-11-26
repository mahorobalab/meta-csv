import React from 'react';
import { Copy, FileText, X } from 'lucide-react';
import type { MetaTextFormat } from '@metatext-editor/schema';

export interface CellInspectorDrawerProps {
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  activeFormat: MetaTextFormat;
  selectedDataRow: number | undefined;
  selectedColLabel: string | undefined;
  selectedCellValue: string;
  selectedCellLineCount: number;
  onCopy: () => void;
  onClose: () => void;
}

export const CellInspectorDrawer: React.FC<CellInspectorDrawerProps> = ({
  isDark,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  btnStyle,
  activeFormat,
  selectedDataRow,
  selectedColLabel,
  selectedCellValue,
  selectedCellLineCount,
  onCopy,
  onClose,
}) => (
  <div
    style={{
      height: 132,
      display: 'flex',
      flexDirection: 'column',
      borderTop: `1px solid ${toolbarBorder}`,
      background: isDark ? '#18181b' : '#f8fafc',
      color: toolbarFg,
      flexShrink: 0,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        borderBottom: `1px solid ${toolbarBorder}`,
        fontSize: 11.5,
        background: toolbarBg,
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <FileText size={12} />
        <strong>
          {selectedDataRow !== undefined && selectedColLabel
            ? `Row #${selectedDataRow + 1} · ${selectedColLabel}`
            : 'Cell Inspector (select a cell)'}
        </strong>
        {selectedCellLineCount > 1 && (
          <span style={{ opacity: 0.7 }}>({selectedCellLineCount} lines)</span>
        )}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {selectedCellValue.length > 0 && (
          <button
            type="button"
            style={{ ...btnStyle, height: 20, padding: '1px 7px', fontSize: 11 }}
            onClick={onCopy}
          >
            <Copy size={11} />
            <span>Copy</span>
          </button>
        )}
        <button
          type="button"
          aria-label="Close cell inspector"
          style={{ ...btnStyle, height: 20, padding: '1px 5px' }}
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>
    </div>
    <textarea
      readOnly
      value={selectedCellValue}
      placeholder="Select any cell in the grid to inspect full multiline content or stack traces..."
      style={{
        flex: 1,
        resize: 'none',
        border: 'none',
        outline: 'none',
        padding: '6px 10px',
        background: isDark ? '#141416' : '#ffffff',
        color: toolbarFg,
        fontFamily:
          activeFormat === 'log' || activeFormat === 'jsonl'
            ? "'Consolas', 'Courier New', monospace"
            : 'inherit',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
      }}
    />
  </div>
);
