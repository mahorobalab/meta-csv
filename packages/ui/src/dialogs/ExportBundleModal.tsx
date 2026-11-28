import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { defaultBundleFileName } from '@metatext-editor/core';
import { useI18n } from '../i18n';
import { DialogButton, DialogShell, DialogSwitchRow } from './ui/DialogPrimitives';

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
  const { t } = useI18n();
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
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next && !exporting) onClose();
      }}
      isDark={isDark}
      title={t('export.title')}
      icon={<Package size={16} />}
      maxWidth={460}
      preventClose={exporting}
      borderedHeader
      paddedBody
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 11.5, fontFamily: monoFont, color: mutedFg }}>
            {t('export.rawTotal', { size: formatBytes(totalRaw) })}
          </span>
          <div style={{ display: 'inline-flex', gap: 8 }}>
            <DialogButton variant="outline" disabled={exporting} onClick={onClose}>
              {t('common.cancel')}
            </DialogButton>
            <DialogButton
              variant="primary"
              disabled={exporting}
              onClick={() => void handleExport()}
              style={{ cursor: exporting ? 'wait' : 'pointer' }}
            >
              <Package size={13} />
              <span>{exporting ? t('export.exportingBtn') : t('export.exportBtn')}</span>
            </DialogButton>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: mutedFg }}>
          {t('export.packageArchive')}
        </div>
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 12,
            padding: '7px 10px',
            borderRadius: 7,
            background: isDark ? '#141417' : '#f4f4f5',
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
            padding: '8px 10px',
            borderRadius: 7,
            background: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: isDark ? '#fcd34d' : '#92400e',
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {t('export.unsavedWarning')}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${border}`,
          background: isDark ? '#141417' : '#fafafa',
          fontFamily: monoFont,
          fontSize: 11.5,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>manifest.json</span>
          <span style={{ color: mutedFg }}>{t('export.required')}</span>
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

      <DialogSwitchRow
        label={t('export.includeHistory', {
          size: hasHistory ? formatBytes(historyBytes) : t('export.none'),
        })}
        description={t('export.includeHistoryDesc')}
        bold
        checked={includeHistory && hasHistory}
        disabled={!hasHistory || exporting}
        onCheckedChange={setIncludeHistory}
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${border}`,
        }}
      />

      {errorMsg && (
        <div style={{ color: '#ef4444', fontSize: 12, wordBreak: 'break-word' }}>{errorMsg}</div>
      )}
    </DialogShell>
  );
};
