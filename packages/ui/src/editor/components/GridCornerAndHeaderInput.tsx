import React from 'react';
import type { Theme } from '@glideapps/glide-data-grid';
import type { EditingHeaderColState } from '../types';

export interface GridCornerAndHeaderInputProps {
  showRowNums: boolean;
  cornerLabel: string;
  isAllSelected: boolean;
  rowMarkerWidth: number;
  scaledHeaderHeight: number;
  scaledFontSize: number;
  zoomScale: number;
  isDark: boolean;
  gridTheme: Partial<Theme>;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  onToggleSelectAll: () => void;
  editingHeaderCol: EditingHeaderColState | null;
  onChangeEditingHeaderValue: (value: string) => void;
  onCommitHeaderTitleEdit: () => void;
  onCancelHeaderTitleEdit: () => void;
}

export const GridCornerAndHeaderInput: React.FC<GridCornerAndHeaderInputProps> = ({
  showRowNums,
  cornerLabel,
  isAllSelected,
  rowMarkerWidth,
  scaledHeaderHeight,
  scaledFontSize,
  zoomScale,
  isDark,
  gridTheme,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  onToggleSelectAll,
  editingHeaderCol,
  onChangeEditingHeaderValue,
  onCommitHeaderTitleEdit,
  onCancelHeaderTitleEdit,
}) => (
  <>
    {showRowNums && (
      <button
        type="button"
        aria-label={`Select all (${cornerLabel})`}
        title={`Select all (${cornerLabel} reference style)`}
        onClick={onToggleSelectAll}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: rowMarkerWidth,
          height: scaledHeaderHeight,
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          border: 'none',
          borderRight: `1px solid ${gridTheme.borderColor ?? toolbarBorder}`,
          borderBottom: `1px solid ${gridTheme.borderColor ?? toolbarBorder}`,
          background: gridTheme.bgHeader ?? toolbarBg,
          color: gridTheme.textHeader ?? toolbarFg,
          fontSize: Math.max(10, Math.round(11 * zoomScale)),
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ opacity: 0.78 }}>{cornerLabel}</span>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 3,
            bottom: 3,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderBottom: `6px solid ${
              isAllSelected
                ? '#3b82f6'
                : isDark
                  ? 'rgba(148, 163, 184, 0.55)'
                  : 'rgba(100, 116, 139, 0.55)'
            }`,
            pointerEvents: 'none',
          }}
        />
      </button>
    )}

    {editingHeaderCol && (
      <input
        type="text"
        autoFocus
        value={editingHeaderCol.value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChangeEditingHeaderValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommitHeaderTitleEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelHeaderTitleEdit();
          }
        }}
        onBlur={onCommitHeaderTitleEdit}
        style={{
          position: 'absolute',
          left: editingHeaderCol.left,
          top: editingHeaderCol.top,
          width: Math.max(80, editingHeaderCol.width),
          height: editingHeaderCol.height,
          zIndex: 45,
          padding: '0 8px',
          fontSize: scaledFontSize,
          fontWeight: 600,
          fontFamily: 'inherit',
          border: '2px solid #3b82f6',
          borderRadius: 2,
          background: isDark ? '#18181b' : '#ffffff',
          color: toolbarFg,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    )}
  </>
);
