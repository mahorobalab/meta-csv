import React from 'react';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUpNarrowWide,
  ClipboardPaste,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  Palette,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import type { HeaderContextMenuState } from '../types';

export interface ColumnContextMenuProps {
  menuRef: React.RefObject<HTMLDivElement>;
  menu: HeaderContextMenuState;
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  menuItemStyle: React.CSSProperties;
  isReadOnly: boolean;
  totalColCount: number;
  visibleColCount: number;
  adjacentHidden: string[];
  hasActiveSort: boolean;
  onStartTitleEdit: (firstActual: number, firstKey: string, bounds: HeaderContextMenuState['headerBounds']) => void;
  onOpenStyle: (visCols: number[]) => void;
  onCopy: (actualCols: number[], colKeys: string[]) => void;
  onPaste: (firstActual: number, withStyle: boolean) => void;
  onDelete: (actualCols: number[], colKeys: string[]) => void;
  onHide: (actualCols: number[], colKeys: string[]) => void;
  onUnhide: (colKeys: string[]) => void;
  onDuplicate: (actualCols: number[], colKeys: string[], side: 'left' | 'right') => void;
  onInsertBlank: (actualCols: number[], side: 'left' | 'right') => void;
  onShift: (visCols: number[], actualCols: number[], delta: -1 | 1) => void;
  onSort: (colKey: string, dir: 'asc' | 'desc' | null) => void;
  onClose: () => void;
}

export const ColumnContextMenu: React.FC<ColumnContextMenuProps> = ({
  menuRef,
  menu,
  isDark,
  toolbarBorder,
  toolbarFg,
  menuItemStyle,
  isReadOnly,
  totalColCount,
  visibleColCount,
  adjacentHidden,
  hasActiveSort,
  onStartTitleEdit,
  onOpenStyle,
  onCopy,
  onPaste,
  onDelete,
  onHide,
  onUnhide,
  onDuplicate,
  onInsertBlank,
  onShift,
  onSort,
  onClose,
}) => {
  const { t } = useI18n();
  const { visCols, actualCols, colKeys, x, y, headerBounds } = menu;
  const isMulti = actualCols.length > 1;
  const firstActual = actualCols[0]!;
  const lastActual = actualCols[actualCols.length - 1]!;
  const firstKey = colKeys[0]!;
  const canShiftLeft = !isReadOnly && firstActual > 0;
  const canShiftRight = !isReadOnly && lastActual < totalColCount - 1;
  const canDelete = !isReadOnly && actualCols.length < totalColCount;
  const canHide = visibleColCount - colKeys.length >= 1;

  const ctxItemStyle = (disabled = false): React.CSSProperties => ({
    ...menuItemStyle,
    padding: '5px 8px',
    opacity: disabled ? 0.42 : 1,
    cursor: disabled ? 'default' : 'pointer',
  });

  const sep = (
    <hr
      style={{
        border: 'none',
        borderTop: `1px solid ${toolbarBorder}`,
        margin: '3px 0',
      }}
    />
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 80,
        width: 262,
        padding: 5,
        borderRadius: 6,
        background: isDark ? '#1f1f23' : '#ffffff',
        border: `1px solid ${toolbarBorder}`,
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.34)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        color: toolbarFg,
      }}
    >
      <button
        type="button"
        disabled={isMulti}
        style={ctxItemStyle(isMulti)}
        onClick={() => {
          if (isMulti) return;
          onClose();
          onStartTitleEdit(firstActual, firstKey, headerBounds);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Pencil size={13} />
          <span>{t('ctx.editTitle')}</span>
        </span>
      </button>

      <button
        type="button"
        style={ctxItemStyle(false)}
        onClick={() => {
          onClose();
          onOpenStyle(visCols);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Palette size={13} />
          <span>{t('ctx.style')}</span>
        </span>
      </button>

      <button
        type="button"
        style={ctxItemStyle(false)}
        onClick={() => {
          onClose();
          onCopy(actualCols, colKeys);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Copy size={13} />
          <span>{t('ctx.copy')}</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+C</span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onPaste(firstActual, true);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={13} />
          <span>{t('ctx.pasteWithStyle')}</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+V</span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onPaste(firstActual, false);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={13} />
          <span>{t('ctx.pasteValuesOnly')}</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+V</span>
      </button>

      <button
        type="button"
        disabled={!canDelete}
        style={ctxItemStyle(!canDelete)}
        onClick={() => {
          onClose();
          onDelete(actualCols, colKeys);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Trash2 size={13} />
          <span>{isMulti ? t('ctx.deleteCols', { count: actualCols.length }) : t('ctx.delete')}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={!canHide}
        style={ctxItemStyle(!canHide)}
        onClick={() => {
          onClose();
          onHide(actualCols, colKeys);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <EyeOff size={13} />
          <span>{isMulti ? t('ctx.hideCols', { count: actualCols.length }) : t('ctx.hideCol')}</span>
        </span>
      </button>

      {adjacentHidden.length > 0 && (
        <button
          type="button"
          style={ctxItemStyle(false)}
          onClick={() => {
            onClose();
            onUnhide(adjacentHidden);
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Eye size={13} />
            <span>{t('ctx.unhideCols', { count: adjacentHidden.length })}</span>
          </span>
        </button>
      )}

      {sep}

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onDuplicate(actualCols, colKeys, 'left');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Columns2 size={13} />
          <span>{isMulti ? t('ctx.dupColsLeft', { count: actualCols.length }) : t('ctx.dupColLeft')}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onDuplicate(actualCols, colKeys, 'right');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Columns2 size={13} />
          <span>{isMulti ? t('ctx.dupColsRight', { count: actualCols.length }) : t('ctx.dupColRight')}</span>
        </span>
      </button>

      {sep}

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onInsertBlank(actualCols, 'left');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Plus size={13} />
          <span>{isMulti ? t('ctx.insertColsLeft', { count: actualCols.length }) : t('ctx.insertColLeft')}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onInsertBlank(actualCols, 'right');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Plus size={13} />
          <span>{isMulti ? t('ctx.insertColsRight', { count: actualCols.length }) : t('ctx.insertColRight')}</span>
        </span>
      </button>

      {sep}

      <button
        type="button"
        disabled={!canShiftLeft}
        style={ctxItemStyle(!canShiftLeft)}
        onClick={() => {
          onClose();
          onShift(visCols, actualCols, -1);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ArrowLeft size={13} />
          <span>{t('ctx.shiftColLeft')}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={!canShiftRight}
        style={ctxItemStyle(!canShiftRight)}
        onClick={() => {
          onClose();
          onShift(visCols, actualCols, 1);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ArrowRight size={13} />
          <span>{t('ctx.shiftColRight')}</span>
        </span>
      </button>

      {sep}

      <button
        type="button"
        disabled={isMulti}
        style={ctxItemStyle(isMulti)}
        onClick={() => {
          if (isMulti) return;
          onClose();
          onSort(firstKey, 'asc');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ArrowUpNarrowWide size={13} />
          <span>{t('ctx.sortAsc')}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={isMulti}
        style={ctxItemStyle(isMulti)}
        onClick={() => {
          if (isMulti) return;
          onClose();
          onSort(firstKey, 'desc');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ArrowDownWideNarrow size={13} />
          <span>{t('ctx.sortDesc')}</span>
        </span>
      </button>

      {hasActiveSort && (
        <button
          type="button"
          style={ctxItemStyle(false)}
          onClick={() => {
            onClose();
            onSort(firstKey, null);
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <X size={13} />
            <span>{t('ctx.clearSort')}</span>
          </span>
        </button>
      )}
    </div>
  );
};
