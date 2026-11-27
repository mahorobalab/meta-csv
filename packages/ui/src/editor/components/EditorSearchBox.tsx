import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useI18n } from '../../i18n';

export interface EditorSearchBoxProps {
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  matchCount: number;
  activeMatchIdx: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  historyItems: string[];
  onPushHistory: (q: string) => void;
  onRemoveHistory: (q: string) => void;
  onClearHistory: () => void;
}

export const EditorSearchBox: React.FC<EditorSearchBoxProps> = ({
  isDark,
  toolbarBorder,
  toolbarFg,
  btnStyle,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  activeMatchIdx,
  onPrevMatch,
  onNextMatch,
  historyItems,
  onPushHistory,
  onRemoveHistory,
  onClearHistory,
}) => {
  const { t } = useI18n();
  const [showHistory, setShowHistory] = useState(false);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return historyItems;
    return historyItems.filter((item) => item.toLowerCase().includes(q));
  }, [historyItems, searchQuery]);

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <Search
          size={13}
          style={{
            position: 'absolute',
            left: 7,
            opacity: 0.55,
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onFocus={() => {
            if (historyItems.length > 0) setShowHistory(true);
          }}
          onBlur={() => setShowHistory(false)}
          onChange={(e) => {
            onSearchQueryChange(e.target.value);
            if (historyItems.length > 0) setShowHistory(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowHistory(false);
            } else if (e.key === 'Enter' && searchQuery.trim()) {
              onPushHistory(searchQuery);
              setShowHistory(false);
              if (matchCount > 0) {
                onNextMatch();
              }
            }
          }}
          placeholder={t('search.placeholder')}
          style={{
            padding: '3px 38px 3px 24px',
            height: 26,
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${toolbarBorder}`,
            background: isDark ? '#1e1e1e' : '#ffffff',
            color: toolbarFg,
            width: 165,
            boxSizing: 'border-box',
          }}
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            aria-label={t('search.clearAria')}
            onClick={() => onSearchQueryChange('')}
            style={{
              position: 'absolute',
              right: 19,
              border: 'none',
              background: 'transparent',
              color: toolbarFg,
              opacity: 0.6,
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 2,
            }}
          >
            <X size={12} />
          </button>
        )}
        <button
          type="button"
          title={t('search.historyTooltip')}
          onClick={() => setShowHistory((s) => !s)}
          style={{
            position: 'absolute',
            right: 2,
            border: 'none',
            background: 'transparent',
            color: toolbarFg,
            opacity: historyItems.length > 0 ? 0.75 : 0.35,
            cursor: 'pointer',
            display: 'inline-flex',
            padding: 3,
          }}
        >
          <ChevronDown size={11} />
        </button>

        {showHistory && (filteredHistory.length > 0 || searchQuery.trim().length === 0) && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              top: 'calc(100% + 2px)',
              left: 0,
              width: 240,
              zIndex: 55,
              maxHeight: 240,
              overflowY: 'auto',
              padding: 8,
              borderRadius: 6,
              background: isDark ? '#1f1f23' : '#ffffff',
              border: `1px solid ${toolbarBorder}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 2,
              }}
            >
              <strong style={{ fontSize: 11 }}>
                {t('search.historyTitle', {
                  filtered: filteredHistory.length,
                  total: historyItems.length,
                })}
              </strong>
              {historyItems.length > 0 && (
                <button
                  type="button"
                  style={{ ...btnStyle, height: 20, padding: '1px 6px', fontSize: 11 }}
                  onClick={onClearHistory}
                >
                  {t('search.clearHistory')}
                </button>
              )}
            </div>
            {filteredHistory.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.65 }}>{t('search.noHistory')}</div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: isDark ? '#27272a' : '#f8fafc',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item}
                    onClick={() => {
                      onSearchQueryChange(item);
                      setShowHistory(false);
                    }}
                  >
                    {item}
                  </span>
                  <button
                    type="button"
                    title={t('common.remove')}
                    onClick={() => onRemoveHistory(item)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: toolbarFg,
                      opacity: 0.55,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      padding: 2,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {searchQuery.trim() && (
        <>
          <span style={{ fontSize: 11, opacity: 0.85 }}>
            {matchCount > 0 ? `${activeMatchIdx + 1}/${matchCount}` : '0'}
          </span>
          <button
            type="button"
            style={{ ...btnStyle, padding: '3px 4px' }}
            disabled={matchCount === 0}
            onClick={onPrevMatch}
            title={t('search.prevMatch')}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            style={{ ...btnStyle, padding: '3px 4px' }}
            disabled={matchCount === 0}
            onClick={onNextMatch}
            title={t('search.nextMatch')}
          >
            <ChevronDown size={13} />
          </button>
        </>
      )}
    </>
  );
};
