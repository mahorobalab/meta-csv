import React, { useEffect, useState } from 'react';
import { Check, Code2, Copy, History, RefreshCw, X } from 'lucide-react';
import { HistorySidePanel, type HistorySidePanelProps } from './HistorySidePanel';
import { useI18n } from '../../i18n';

export interface RightSidePanelProps {
  activeTab: 'history' | 'meta';
  onSelectTab: (tab: 'history' | 'meta') => void;
  onClose: () => void;
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  fileName: string;
  metaText: string;
  onChangeMetaText: (nextText: string) => void;
  historyProps: Omit<
    HistorySidePanelProps,
    'isDark' | 'toolbarBg' | 'toolbarBorder' | 'toolbarFg' | 'onClose' | 'embedded'
  >;
}

export const RightSidePanel: React.FC<RightSidePanelProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  isDark,
  toolbarBg,
  toolbarBorder,
  toolbarFg,
  fileName,
  metaText,
  onChangeMetaText,
  historyProps,
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [draftMeta, setDraftMeta] = useState(metaText);

  useEffect(() => {
    setDraftMeta(metaText);
  }, [metaText]);

  const panelBg = isDark ? '#18181b' : '#f8fafc';
  const mutedFg = isDark ? '#a1a1aa' : '#64748b';

  const topTabStyle = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: selected ? 600 : 500,
    border: 'none',
    borderBottom: selected ? '2px solid #3b82f6' : '2px solid transparent',
    background: 'transparent',
    color: selected ? toolbarFg : mutedFg,
    cursor: 'pointer',
  });

  const handleCopyMeta = async () => {
    try {
      await navigator.clipboard.writeText(metaText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <aside
      style={{
        width: 350,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${toolbarBorder}`,
        background: panelBg,
        color: toolbarFg,
        flexShrink: 0,
      }}
    >
      {/* Unified Panel Tab Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          paddingRight: 8,
          borderBottom: `1px solid ${toolbarBorder}`,
          background: toolbarBg,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
          <button
            type="button"
            style={topTabStyle(activeTab === 'history')}
            onClick={() => onSelectTab('history')}
          >
            <History size={13} />
            <span>History</span>
            {historyProps.savingSnapshot && (
              <span style={{ fontSize: 10, fontWeight: 400, color: '#f59e0b' }}>saving...</span>
            )}
          </button>
          <button
            type="button"
            style={topTabStyle(activeTab === 'meta')}
            onClick={() => onSelectTab('meta')}
          >
            <Code2 size={13} />
            <span>Metadata</span>
          </button>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {activeTab === 'history' && historyProps.hasSnapshotBackend && (
            <button
              type="button"
              title="Refresh snapshots"
              onClick={historyProps.onRefreshSnapshots}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: toolbarFg,
                opacity: 0.75,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
          {activeTab === 'meta' && (
            <button
              type="button"
              title={t('common.copy')}
              onClick={() => void handleCopyMeta()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                fontSize: 11,
                borderRadius: 4,
                border: `1px solid ${toolbarBorder}`,
                background: isDark ? '#27272a' : '#ffffff',
                color: toolbarFg,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              <span>{copied ? t('common.copied') : t('common.copy')}</span>
            </button>
          )}
          <button
            type="button"
            title={t('common.close')}
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: toolbarFg,
              opacity: 0.75,
              cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'history' ? (
        <HistorySidePanel
          {...historyProps}
          isDark={isDark}
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          toolbarFg={toolbarFg}
          onClose={onClose}
          embedded={true}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '5px 10px',
              fontSize: 11,
              color: mutedFg,
              borderBottom: `1px solid ${toolbarBorder}`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`${fileName}.metatext.jsonc`}
          >
            {fileName}.metatext.jsonc
          </div>
          <textarea
            value={draftMeta}
            onChange={(e) => {
              const next = e.target.value;
              setDraftMeta(next);
              onChangeMetaText(next);
            }}
            spellCheck={false}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              padding: 10,
              fontFamily: "'Consolas', 'Courier New', monospace",
              fontSize: 12,
              lineHeight: 1.5,
              background: isDark ? '#141416' : '#ffffff',
              color: isDark ? '#d4d4d8' : '#1e293b',
            }}
          />
        </div>
      )}
    </aside>
  );
};
