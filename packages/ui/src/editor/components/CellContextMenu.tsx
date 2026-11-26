import React from 'react';
import { ClipboardPaste, Copy, Palette } from 'lucide-react';
import type { CellContextMenuState, CellRangeRect } from '../types';

export interface CellContextMenuProps {
  menuRef: React.RefObject<HTMLDivElement>;
  menu: CellContextMenuState;
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  menuItemStyle: React.CSSProperties;
  isReadOnly: boolean;
  onOpenStyle: (range: CellRangeRect) => void;
  onCopy: (range: CellRangeRect) => void;
  onPaste: (range: CellRangeRect, withStyle: boolean) => void;
  onClose: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
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
  onClose,
}) => {
  const { range, x, y } = menu;
  const ctxItemStyle = (disabled = false): React.CSSProperties => ({
    ...menuItemStyle,
    padding: '5px 8px',
    opacity: disabled ? 0.42 : 1,
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 80,
        width: 248,
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
          onOpenStyle(range);
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
          onCopy(range);
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
          onPaste(range, true);
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
          onPaste(range, false);
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={13} />
          <span>値のみ貼り付け</span>
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>Ctrl+Shift+V</span>
      </button>
    </div>
  );
};
