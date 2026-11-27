import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useI18n } from '@metatext-editor/ui';

export interface MetaJsoncSidePanelProps {
  fileName: string;
  metaText: string;
  isDark: boolean;
  barFg: string;
  border: string;
  onChangeMetaText: (nextText: string) => void;
  onClose: () => void;
}

export const MetaJsoncSidePanel: React.FC<MetaJsoncSidePanelProps> = ({
  fileName,
  metaText,
  isDark,
  barFg,
  border,
  onChangeMetaText,
  onClose,
}) => {
  const { t } = useI18n();
  const [metaCopied, setMetaCopied] = useState(false);

  return (
    <aside
      style={{
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${border}`,
        background: isDark ? '#18181b' : '#f8fafc',
        color: barFg,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          borderBottom: `1px solid ${border}`,
          background: isDark ? '#252526' : '#f1f5f9',
        }}
      >
        <span
          title={`${fileName}.metatext.jsonc`}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {fileName}.metatext.jsonc
        </span>
        <button
          type="button"
          title={t('desktop.copyJsonc')}
          onClick={() => {
            void navigator.clipboard?.writeText(metaText);
            setMetaCopied(true);
            window.setTimeout(() => setMetaCopied(false), 1200);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            fontSize: 11,
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: 'transparent',
            color: barFg,
            cursor: 'pointer',
          }}
        >
          {metaCopied ? <Check size={11} /> : <Copy size={11} />}
          <span>{metaCopied ? t('common.copied') : t('common.copy')}</span>
        </button>
        <button
          type="button"
          aria-label={t('desktop.closePanel')}
          title={t('desktop.closePanel')}
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            color: barFg,
            opacity: 0.75,
            cursor: 'pointer',
          }}
        >
          <X size={13} />
        </button>
      </div>
      <textarea
        value={metaText}
        onChange={(e) => onChangeMetaText(e.target.value)}
        spellCheck={false}
        placeholder={t('desktop.metaPlaceholder')}
        style={{
          flex: 1,
          resize: 'none',
          border: 'none',
          outline: 'none',
          padding: 10,
          background: isDark ? '#141416' : '#ffffff',
          color: barFg,
          fontFamily: "'Consolas', 'Courier New', monospace",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      />
    </aside>
  );
};
