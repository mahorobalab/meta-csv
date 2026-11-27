import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Moon, Package, Plus, X } from 'lucide-react';
import { isMetaTextZipFileName } from '@metatext-editor/core';
import { NEW_FILE_FORMAT_OPTIONS, useI18n, type NewFileFormat } from '@metatext-editor/ui';
import type { DesktopTab } from '../hooks/useDesktopTabs';
import { formatBytesShort } from '../utils/pathUtils';

export interface DesktopTabBarProps {
  tabs: DesktopTab[];
  activeTabId: string | null;
  isDark: boolean;
  tabBarBg: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  barFg: string;
  border: string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (format?: NewFileFormat) => void;
}

export const DesktopTabBar: React.FC<DesktopTabBarProps> = ({
  tabs,
  activeTabId,
  isDark,
  tabBarBg,
  tabActiveBg,
  tabInactiveBg,
  barFg,
  border,
  onActivateTab,
  onCloseTab,
  onNewTab,
}) => {
  const { t } = useI18n();
  const [newMenuPos, setNewMenuPos] = useState<{ left: number; top: number } | null>(null);
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!newMenuPos) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        newMenuRef.current &&
        !newMenuRef.current.contains(target) &&
        plusBtnRef.current &&
        !plusBtnRef.current.contains(target)
      ) {
        setNewMenuPos(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setNewMenuPos(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [newMenuPos]);

  const toggleNewMenu = () => {
    if (newMenuPos) {
      setNewMenuPos(null);
      return;
    }
    const rect = plusBtnRef.current?.getBoundingClientRect();
    if (!rect) {
      onNewTab('csv');
      return;
    }
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - 188));
    setNewMenuPos({ left, top: rect.bottom + 2 });
  };

  return (
  <div
    role="tablist"
    aria-label={t('desktop.openFilesAria')}
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
      const isBundle = isMetaTextZipFileName(tab.fileName);
      const sizeLabel = formatBytesShort(tab.fileBytes);
      const tabTooltip = [
        tab.filePath ?? tab.fileName,
        sizeLabel ? `(${sizeLabel})` : '',
        tab.sleeping ? t('desktop.tabSleeping') : '',
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
            maxWidth: 240,
            minWidth: 100,
            fontSize: 12,
            fontWeight: isTabActive ? 600 : 400,
            background: isBundle
              ? isDark
                ? isTabActive
                  ? 'rgba(249, 115, 22, 0.28)'
                  : 'rgba(249, 115, 22, 0.14)'
                : isTabActive
                  ? '#fed7aa'
                  : '#ffedd5'
              : isTabActive
                ? tabActiveBg
                : tabInactiveBg,
            color: barFg,
            opacity: isTabActive ? 1 : tab.sleeping ? 0.56 : 0.86,
            borderRight: `1px solid ${border}`,
            borderTop: isBundle
              ? isDark
                ? isTabActive
                  ? '2px solid #f97316'
                  : '2px solid rgba(249, 115, 22, 0.55)'
                : isTabActive
                  ? '2px solid #ea580c'
                  : '2px solid #fb923c'
              : isTabActive
                ? '2px solid #3b82f6'
                : '2px solid transparent',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {tab.sleeping ? (
            <Moon size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
          ) : isBundle ? (
            <Package size={12} style={{ color: isDark ? '#fb923c' : '#ea580c', flexShrink: 0 }} />
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
              title={t('desktop.unsavedChanges')}
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
            aria-label={`${t('common.close')} ${tab.fileName}`}
            title={t('desktop.closeTabTooltip')}
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
      ref={plusBtnRef}
      type="button"
      aria-label={t('desktop.newTabAria')}
      title={t('desktop.newTabTooltip')}
      onClick={toggleNewMenu}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: barFg,
        opacity: newMenuPos ? 1 : 0.75,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Plus size={14} />
    </button>

    {newMenuPos && (
      <div
        ref={newMenuRef}
        style={{
          position: 'fixed',
          left: newMenuPos.left,
          top: newMenuPos.top,
          zIndex: 120,
          width: 180,
          padding: 4,
          borderRadius: 6,
          background: tabActiveBg,
          color: barFg,
          border: `1px solid ${border}`,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {NEW_FILE_FORMAT_OPTIONS.map((opt) => (
          <button
            key={opt.format}
            type="button"
            onClick={() => {
              setNewMenuPos(null);
              onNewTab(opt.format);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 8px',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: barFg,
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 500 }}>{opt.label}</span>
            <span style={{ fontSize: 10.5, opacity: 0.6 }}>{opt.extension}</span>
          </button>
        ))}
      </div>
    )}
  </div>
  );
};
