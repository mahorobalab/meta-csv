import React from 'react';
import { ClipboardPaste, Copy, Palette, Plus, Trash2 } from 'lucide-react';
import type { RowContextMenuState } from '../types';

export interface RowContextMenuProps {
  menuRef: React.RefObject<HTMLDivElement>;
  menu: RowContextMenuState;
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  menuItemStyle: React.CSSProperties;
  isReadOnly: boolean;
  onOpenStyle: (viewRows: number[]) => void;
  onCopy: (dataRows: number[]) => void;
  onPaste: (firstViewRow: number, withStyle: boolean) => void;
  onDelete: (dataRows: number[]) => void;
  onDuplicate: (viewRows: number[], dataRows: number[], side: 'above' | 'below') => void;
  onInsertBlank: (viewRows: number[], dataRows: number[], side: 'above' | 'below') => void;
  onClose: () => void;
}

export const RowContextMenu: React.FC<RowContextMenuProps> = ({
  menuRef,
  menu,
  isDark,
  toolbarBorder,
  toolbarFg,
  menuItemStyle,
  isReadOnly,
  onOpenStyle,
  onCopy,
  onPaste,
  onDelete,
  onDuplicate,
  onInsertBlank,
  onClose,
}) => {
  const { viewRows, dataRows, x, y } = menu;
  const isMulti = dataRows.length > 1;
  const firstViewRow = viewRows[0]!;

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
        style={ctxItemStyle(false)}
        onClick={() => {
          onClose();
          onOpenStyle(viewRows);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Palette size={13} />
          <span>スタイル</span>
        </span>
      </button>

      <button
        type="button"
        style={ctxItemStyle(false)}
        onClick={() => {
          onClose();
          onCopy(dataRows);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Copy size={13} />
          <span>コピー</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+C</span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onPaste(firstViewRow, true);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={13} />
          <span>貼り付け (スタイルあり)</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+V</span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onPaste(firstViewRow, false);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={13} />
          <span>値のみ貼り付け</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+V</span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onDelete(dataRows);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Trash2 size={13} />
          <span>{isMulti ? `削除 (${dataRows.length}行)` : '削除'}</span>
        </span>
      </button>

      {sep}

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onDuplicate(viewRows, dataRows, 'above');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Copy size={13} />
          <span>{isMulti ? `${dataRows.length}行を上に複製` : '行を上に複製'}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onDuplicate(viewRows, dataRows, 'below');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Copy size={13} />
          <span>{isMulti ? `${dataRows.length}行を下に複製` : '行を下に複製'}</span>
        </span>
      </button>

      {sep}

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onInsertBlank(viewRows, dataRows, 'above');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Plus size={13} />
          <span>{isMulti ? `上に空白行挿入 (${dataRows.length}行)` : '上に空白行挿入'}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={isReadOnly}
        style={ctxItemStyle(isReadOnly)}
        onClick={() => {
          onClose();
          onInsertBlank(viewRows, dataRows, 'below');
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Plus size={13} />
          <span>{isMulti ? `下に空白行挿入 (${dataRows.length}行)` : '下に空白行挿入'}</span>
        </span>
      </button>
    </div>
  );
};
