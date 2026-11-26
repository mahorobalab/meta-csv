import React from 'react';
import { FileSpreadsheet, Moon, Plus, X } from 'lucide-react';
import type { DesktopTab } from '../hooks/useDesktopTabs';
import { formatBytesShort } from '../utils/pathUtils';

export interface DesktopTabBarProps {
  tabs: DesktopTab[];
  activeTabId: string | null;
  tabBarBg: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  barFg: string;
  border: string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export const DesktopTabBar: React.FC<DesktopTabBarProps> = ({
  tabs,
  activeTabId,
  tabBarBg,
  tabActiveBg,
  tabInactiveBg,
  barFg,
  border,
  onActivateTab,
  onCloseTab,
  onNewTab,
}) => (
  <div
    role="tablist"
    aria-label="Open Files"
    style={{
      display: 'flex',
      alignItems: 'stretch',
      height: 32,
      background: tabBarBg,
      borderBottom: `1px solid ${border}`,
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
      userSelect: 'none',
    }}
  >
    {tabs.map((tab) => {
      const isTabActive = tab.id === activeTabId;
      const sizeLabel = formatBytesShort(tab.fileBytes);
      const tabTooltip = [
        tab.filePath ?? tab.fileName,
        sizeLabel ? `(${sizeLabel})` : '',
        tab.sleeping ? '— Sleeping (memory freed; click to reload)' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <div
          key={tab.id}
          role="tab"
          aria-selected={isTabActive}
          title={tabTooltip}
          onClick={() => onActivateTab(tab.id)}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onCloseTab(tab.id);
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px 0 11px',
            maxWidth: 220,
            minWidth: 100,
            fontSize: 12,
            fontWeight: isTabActive ? 600 : 400,
            background: isTabActive ? tabActiveBg : tabInactiveBg,
            color: barFg,
            opacity: isTabActive ? 1 : tab.sleeping ? 0.56 : 0.78,
            borderRight: `1px solid ${border}`,
            borderTop: isTabActive ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {tab.sleeping ? (
            <Moon size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
          ) : (
            <FileSpreadsheet size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              fontStyle: tab.sleeping ? 'italic' : 'normal',
            }}
          >
            {tab.fileName}
          </span>
          {tab.dirty && (
            <span
              title="Unsaved changes"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#f59e0b',
                flexShrink: 0,
              }}
            />
          )}
          <button
            type="button"
            aria-label={`Close ${tab.fileName}`}
            title="Close tab (Ctrl+W)"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: barFg,
              opacity: isTabActive ? 0.75 : 0.45,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      );
    })}

    <button
      type="button"
      aria-label="New File Tab"
      title="New File (Ctrl+N)"
      onClick={onNewTab}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: barFg,
        opacity: 0.75,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Plus size={14} />
    </button>
  </div>
);
