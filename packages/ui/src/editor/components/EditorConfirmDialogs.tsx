import React from 'react';
import { EyeOff, Trash2 } from 'lucide-react';
import type {
  PendingDeleteColState,
  PendingDeleteRowsState,
  PendingHideColState,
} from '../types';

export interface EditorConfirmDialogsProps {
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  pendingDeleteRows: PendingDeleteRowsState | null;
  onCancelDeleteRows: () => void;
  onConfirmDeleteRows: (target: PendingDeleteRowsState) => void;
  pendingDeleteCol: PendingDeleteColState | null;
  onCancelDeleteCol: () => void;
  onConfirmDeleteCol: (target: PendingDeleteColState) => void;
  pendingHideCol: PendingHideColState | null;
  onChangeHideColDontShow: (checked: boolean) => void;
  onCancelHideCol: () => void;
  onConfirmHideCol: (target: PendingHideColState) => void;
}

export const EditorConfirmDialogs: React.FC<EditorConfirmDialogsProps> = ({
  isDark,
  toolbarBorder,
  toolbarFg,
  btnStyle,
  pendingDeleteRows,
  onCancelDeleteRows,
  onConfirmDeleteRows,
  pendingDeleteCol,
  onCancelDeleteCol,
  onConfirmDeleteCol,
  pendingHideCol,
  onChangeHideColDontShow,
  onCancelHideCol,
  onConfirmHideCol,
}) => {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 110,
    background: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  const cardStyle = (maxWidth: number): React.CSSProperties => ({
    width: '100%',
    maxWidth,
    borderRadius: 10,
    background: isDark ? '#1f1f23' : '#ffffff',
    color: toolbarFg,
    border: `1px solid ${toolbarBorder}`,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontSize: 13,
  });

  const dangerBtnStyle: React.CSSProperties = {
    ...btnStyle,
    padding: '4px 12px',
    height: 28,
    background: '#dc2626',
    borderColor: '#ef4444',
    color: '#ffffff',
    fontWeight: 600,
  };

  return (
    <>
      {pendingDeleteRows && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCancelDeleteRows();
          }}
          style={overlayStyle}
        >
          <div role="dialog" aria-modal="true" aria-label="行の削除" style={cardStyle(380)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Trash2 size={15} style={{ color: '#ef4444' }} />
              <span>行の削除</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
              <strong>{pendingDeleteRows.label}</strong>を削除しますか？
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                autoFocus
                style={{ ...btnStyle, padding: '4px 12px', height: 28 }}
                onClick={onCancelDeleteRows}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={dangerBtnStyle}
                onClick={() => onConfirmDeleteRows(pendingDeleteRows)}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteCol && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCancelDeleteCol();
          }}
          style={overlayStyle}
        >
          <div role="dialog" aria-modal="true" aria-label="列の削除" style={cardStyle(380)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Trash2 size={15} style={{ color: '#ef4444' }} />
              <span>列の削除</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
              <strong>{pendingDeleteCol.label}</strong>を削除しますか？
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                autoFocus
                style={{ ...btnStyle, padding: '4px 12px', height: 28 }}
                onClick={onCancelDeleteCol}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={dangerBtnStyle}
                onClick={() => onConfirmDeleteCol(pendingDeleteCol)}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingHideCol && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCancelHideCol();
          }}
          style={overlayStyle}
        >
          <div role="dialog" aria-modal="true" aria-label="列の非表示" style={cardStyle(400)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <EyeOff size={15} />
              <span>列の非表示</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
              <strong>{pendingHideCol.label}</strong>を非表示にします。
              <br />
              再表示は設定画面（Settings → File → Columns）から行ってください。
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={pendingHideCol.dontShowAgain}
                onChange={(e) => onChangeHideColDontShow(e.target.checked)}
              />
              <span>次回から表示しない</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                style={{ ...btnStyle, padding: '4px 12px', height: 28 }}
                onClick={onCancelHideCol}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={{
                  ...btnStyle,
                  padding: '4px 12px',
                  height: 28,
                  background: '#2563eb',
                  borderColor: '#3b82f6',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
                onClick={() => onConfirmHideCol(pendingHideCol)}
              >
                非表示にする
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
