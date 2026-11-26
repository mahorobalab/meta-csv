import React from 'react';
import { FolderOpen, Menu, Palette } from 'lucide-react';
import type { GridSelection } from '@glideapps/glide-data-grid';
import type {
  CellStyle,
  ConditionalRule,
  MarkerColor,
  MetaTextDocument,
  MetaTextFormat,
  RowMarker,
} from '@metatext-editor/schema';
import type { ParsedCsvData, resolveCellStyle } from '@metatext-editor/core';
import type { EditorHostMode } from '../../SettingsAboutDialogs';
import { MarkerControls } from '../../MarkerControls';
import { EditorSearchBox } from './EditorSearchBox';
import { EditorToolbarRight } from './EditorToolbarRight';
import { FileMenuPopover } from './FileMenuPopover';
import { StylePopover } from './StylePopover';

export interface EditorToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement>;
  hostMode: EditorHostMode;
  themeMode: 'light' | 'dark';
  isDark: boolean;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  menuItemStyle: React.CSSProperties;
  openMenu: 'none' | 'file' | 'edit' | 'unlock';
  setOpenMenu: React.Dispatch<React.SetStateAction<'none' | 'file' | 'edit' | 'unlock'>>;
  activeFormat: MetaTextFormat;
  isReadOnly: boolean;
  dirtyCsv: boolean;
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
  rows: string[][];
  canUndo: boolean;
  canRedo: boolean;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveAs?: () => void;
  onCloseFile?: () => void;
  onSaveCsv: () => void;
  onUndo: () => void;
  onRedo: () => void;
  fileMenuItems?: React.ReactNode;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  matchCount: number;
  activeMatchIdx: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  searchHistoryItems: string[];
  onPushSearchHistory: (q: string) => void;
  onRemoveSearchHistory: (q: string) => void;
  onClearSearchHistory: () => void;
  markers: RowMarker[];
  visibleMarkerCount: number;
  visibleMarkerRowSet: Set<number>;
  selectedDataRow: number | undefined;
  selectedMarker: RowMarker | undefined;
  activeMarkerColor: MarkerColor;
  onActiveMarkerColorChange: (color: MarkerColor) => void;
  onlyMarked: boolean;
  onOnlyMarkedChange: (next: boolean) => void;
  onToggleSelectedMarker: () => void;
  onJumpPrevMarker: () => void;
  onJumpNextMarker: () => void;
  onJumpToDataRow: (dataRow: number) => void;
  onUpdateMarkerNote: (dataRow: number, note: string) => void;
  onCycleMarkerColor: (dataRow: number) => void;
  onRemoveMarker: (dataRow: number) => void;
  onClearAllMarkers: () => void;
  getRowPreview: (dataRow: number) => string;
  zoomScale: number;
  zebraEnabled: boolean;
  showCellInspector: boolean;
  onLockReadOnly: () => void;
  onUnlockEditing: () => void;
  onResetZoom: () => void;
  onToggleZebra: () => void;
  onToggleCellInspector: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  isColumnSelectionMode: boolean;
  isRowSelectionMode: boolean;
  selection: GridSelection;
  selectedColumnKeys: string[];
  selectedRowDataIndices: number[];
  selectedCellWrap: boolean;
  visibleColIndices: number[];
  viewRowIndices: Int32Array;
  styleCtx: Parameters<typeof resolveCellStyle>[0] | null;
  defaultHighlightRules: ConditionalRule[];
  customNumFmt: string;
  onCustomNumFmtChange: (next: string) => void;
  onApplyStyle: (updater: (prev: CellStyle) => CellStyle, clearAll?: boolean) => void;
  onAutoFitRows: (
    targetRows: number[],
    forceWrapCols?: Set<number>,
    forceNoWrapCols?: Set<number>,
  ) => void;
  onOpenRulesModal: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = (p) => (
  <div
    ref={p.toolbarRef}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      background: p.toolbarBg,
      borderBottom: `1px solid ${p.toolbarBorder}`,
      color: p.toolbarFg,
      fontSize: 12,
      flexWrap: 'wrap',
      position: 'relative',
    }}
  >
    {p.hostMode !== 'vscode' && (
      <>
        <button
          type="button"
          aria-label="Menu"
          title="File & Edit Menu"
          style={{
            ...p.btnStyle,
            padding: '3px 6px',
            borderColor: p.openMenu === 'file' ? '#3b82f6' : p.toolbarBorder,
          }}
          onClick={() => p.setOpenMenu((m) => (m === 'file' ? 'none' : 'file'))}
        >
          <Menu size={15} />
        </button>
        {p.onOpenFile && (
          <button
            type="button"
            aria-label="Open File"
            title="Open File..."
            style={{ ...p.btnStyle, padding: '3px 6px' }}
            onClick={p.onOpenFile}
          >
            <FolderOpen size={14} />
          </button>
        )}
      </>
    )}

    <button
      type="button"
      title="Cell styles & row actions"
      aria-label="Cell styles & row actions"
      style={{
        ...p.btnStyle,
        borderColor: p.openMenu === 'edit' ? '#3b82f6' : p.toolbarBorder,
      }}
      onClick={() => p.setOpenMenu((m) => (m === 'edit' ? 'none' : 'edit'))}
    >
      <Palette size={13} />
      <span>Style</span>
    </button>

    <span style={{ opacity: 0.35 }}>|</span>

    {p.csvData && (
      <>
        <MarkerControls
          markers={p.markers}
          visibleMarkerCount={p.visibleMarkerCount}
          visibleMarkerRowSet={p.visibleMarkerRowSet}
          selectedDataRow={p.selectedDataRow}
          selectedMarker={p.selectedMarker}
          activeColor={p.activeMarkerColor}
          onActiveColorChange={p.onActiveMarkerColorChange}
          onlyMarked={p.onlyMarked}
          onOnlyMarkedChange={p.onOnlyMarkedChange}
          onToggleSelectedMarker={p.onToggleSelectedMarker}
          onJumpPrev={p.onJumpPrevMarker}
          onJumpNext={p.onJumpNextMarker}
          onJumpToRow={p.onJumpToDataRow}
          onUpdateMarkerNote={p.onUpdateMarkerNote}
          onCycleMarkerColor={p.onCycleMarkerColor}
          onRemoveMarker={p.onRemoveMarker}
          onClearAll={p.onClearAllMarkers}
          getRowPreview={p.getRowPreview}
          themeMode={p.themeMode}
        />
        <span style={{ opacity: 0.35 }}>|</span>
      </>
    )}

    <EditorSearchBox
      isDark={p.isDark}
      toolbarBorder={p.toolbarBorder}
      toolbarFg={p.toolbarFg}
      btnStyle={p.btnStyle}
      searchQuery={p.searchQuery}
      onSearchQueryChange={p.onSearchQueryChange}
      matchCount={p.matchCount}
      activeMatchIdx={p.activeMatchIdx}
      onPrevMatch={p.onPrevMatch}
      onNextMatch={p.onNextMatch}
      historyItems={p.searchHistoryItems}
      onPushHistory={p.onPushSearchHistory}
      onRemoveHistory={p.onRemoveSearchHistory}
      onClearHistory={p.onClearSearchHistory}
    />

    <EditorToolbarRight
      isDark={p.isDark}
      toolbarBorder={p.toolbarBorder}
      btnStyle={p.btnStyle}
      isReadOnly={p.isReadOnly}
      activeFormat={p.activeFormat}
      openMenu={p.openMenu}
      zoomScale={p.zoomScale}
      zebraEnabled={p.zebraEnabled}
      showCellInspector={p.showCellInspector}
      onToggleUnlockPopover={() => p.setOpenMenu((m) => (m === 'unlock' ? 'none' : 'unlock'))}
      onLockReadOnly={p.onLockReadOnly}
      onUnlockEditing={p.onUnlockEditing}
      onCloseMenu={() => p.setOpenMenu('none')}
      onResetZoom={p.onResetZoom}
      onToggleZebra={p.onToggleZebra}
      onToggleCellInspector={p.onToggleCellInspector}
      onOpenSettings={p.onOpenSettings}
      onOpenAbout={p.onOpenAbout}
    />

    {p.openMenu === 'file' && p.hostMode !== 'vscode' && (
      <FileMenuPopover
        hostMode={p.hostMode}
        isDark={p.isDark}
        toolbarBorder={p.toolbarBorder}
        menuItemStyle={p.menuItemStyle}
        activeFormat={p.activeFormat}
        isReadOnly={p.isReadOnly}
        dirtyCsv={p.dirtyCsv}
        hasCsvData={Boolean(p.csvData)}
        canUndo={p.canUndo}
        canRedo={p.canRedo}
        onNewFile={p.onNewFile}
        onOpenFile={p.onOpenFile}
        onSaveAs={p.onSaveAs}
        onCloseFile={p.onCloseFile}
        onSaveCsv={p.onSaveCsv}
        onUndo={p.onUndo}
        onRedo={p.onRedo}
        onCloseMenu={() => p.setOpenMenu('none')}
        fileMenuItems={p.fileMenuItems}
      />
    )}

    {p.openMenu === 'edit' && (
      <StylePopover
        hostMode={p.hostMode}
        isDark={p.isDark}
        toolbarBorder={p.toolbarBorder}
        toolbarFg={p.toolbarFg}
        btnStyle={p.btnStyle}
        isColumnSelectionMode={p.isColumnSelectionMode}
        isRowSelectionMode={p.isRowSelectionMode}
        selection={p.selection}
        selectedColumnKeys={p.selectedColumnKeys}
        selectedRowDataIndices={p.selectedRowDataIndices}
        selectedCellWrap={p.selectedCellWrap}
        visibleColIndices={p.visibleColIndices}
        viewRowIndices={p.viewRowIndices}
        rows={p.rows}
        csvData={p.csvData}
        meta={p.meta}
        styleCtx={p.styleCtx}
        defaultHighlightRules={p.defaultHighlightRules}
        customNumFmt={p.customNumFmt}
        onCustomNumFmtChange={p.onCustomNumFmtChange}
        onApplyStyle={p.onApplyStyle}
        onAutoFitRows={p.onAutoFitRows}
        onOpenRulesModal={p.onOpenRulesModal}
      />
    )}
  </div>
);
