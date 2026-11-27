import React, { useEffect, useState } from 'react';
import { Package, X } from 'lucide-react';
import { defaultBundleFileName } from '@metatext-editor/core';

export interface ExportBundleModalProps {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  border: string;
  fg: string;
  fileName: string;
  dataBytes: number;
  metaBytes: number;
  historyBytes: number | null;
  hasUnsavedChanges: boolean;
  onConfirmExport: (options: { includeHistory: boolean }) => Promise<boolean | string | void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExportBundleModal: React.FC<ExportBundleModalProps> = ({
  open,
  onClose,
  isDark,
  border,
  fg,
  fileName,
  dataBytes,
  metaBytes,
  historyBytes,
  hasUnsavedChanges,
  onConfirmExport,
}) => {
  // Privacy-first default: OFF
  const [includeHistory, setIncludeHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIncludeHistory(false);
      setExporting(false);
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const hasHistory = historyBytes !== null && historyBytes > 0;
  const bundleName = defaultBundleFileName(fileName);
  const monoFont = "'Consolas', 'Courier New', monospace";
  const mutedFg = isDark ? '#a1a1aa' : '#64748b';
  const totalRaw = dataBytes + metaBytes + (includeHistory && hasHistory ? historyBytes : 0);

  const handleExport = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const res = await onConfirmExport({ includeHistory: includeHistory && hasHistory });
      if (res !== false) {
        onClose();
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
      }}
    >
      <div
        style={{
          width: 440,
          maxWidth: '92vw',
          borderRadius: 10,
          background: isDark ? '#1e1e22' : '#ffffff',
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: `1px solid ${border}`,
            background: isDark ? '#252526' : '#f8fafc',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Package size={15} />
            <span>Export as .metatext.zip</span>
          </span>
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: fg,
              cursor: exporting ? 'default' : 'pointer',
              opacity: 0.75,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11.5, color: mutedFg }}>Package archive</div>
            <div
              style={{
                fontFamily: monoFont,
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 5,
                background: isDark ? '#141416' : '#f1f5f9',
                border: `1px solid ${border}`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {bundleName}
            </div>
          </div>

          {hasUnsavedChanges && (
            <div
              style={{
                padding: '6px 8px',
                borderRadius: 5,
                background: isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                color: isDark ? '#fcd34d' : '#92400e',
                fontSize: 11.5,
              }}
            >
              Unsaved changes exist. Export packages the latest saved file on disk (press Ctrl+S first to include recent edits).
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${border}`,
              background: isDark ? '#18181b' : '#f8fafc',
              fontFamily: monoFont,
              fontSize: 11.5,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>manifest.json</span>
              <span style={{ color: mutedFg }}>required</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>data/{fileName}</span>
              <span style={{ color: mutedFg }}>{formatBytes(dataBytes)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>data/{fileName}.metatext.jsonc</span>
              <span style={{ color: mutedFg }}>{formatBytes(metaBytes)}</span>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${border}`,
              cursor: hasHistory ? 'pointer' : 'default',
              opacity: hasHistory ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>
                Include history/ ({hasHistory ? formatBytes(historyBytes) : 'none'})
              </span>
              <span style={{ fontSize: 11, color: mutedFg }}>
                Default OFF to avoid accidentally sharing intermediate edits or notes.
              </span>
            </div>
            <input
              type="checkbox"
              disabled={!hasHistory || exporting}
              checked={includeHistory && hasHistory}
              onChange={(e) => setIncludeHistory(e.target.checked)}
              style={{ marginTop: 3 }}
            />
          </label>

          {errorMsg && (
            <div style={{ color: '#ef4444', fontSize: 11.5, wordBreak: 'break-word' }}>{errorMsg}</div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderTop: `1px solid ${border}`,
            background: isDark ? '#252526' : '#f8fafc',
          }}
        >
          <span style={{ fontSize: 11, fontFamily: monoFont, color: mutedFg }}>
            Raw total: ~{formatBytes(totalRaw)}
          </span>
          <div style={{ display: 'inline-flex', gap: 8 }}>
            <button
              type="button"
              disabled={exporting}
              onClick={onClose}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                borderRadius: 5,
                border: `1px solid ${border}`,
                background: 'transparent',
                color: fg,
                cursor: exporting ? 'default' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExport()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 5,
                border: '1px solid #3b82f6',
                background: '#2563eb',
                color: '#ffffff',
                cursor: exporting ? 'wait' : 'pointer',
                opacity: exporting ? 0.75 : 1,
              }}
            >
              <Package size={13} />
              <span>{exporting ? 'Exporting...' : 'Export'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
