import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Sparkles,
  WrapText,
  X,
} from 'lucide-react';
import type { GridSelection } from '@glideapps/glide-data-grid';
import type { CellStyle, ColumnAlign, ConditionalRule, MetaTextDocument } from '@metatext-editor/schema';
import {
  DATE_FORMAT_PRESETS,
  NUMBER_FORMAT_PRESETS,
  isValidNumberFormat,
  resolveCellStyle,
  type ParsedCsvData,
} from '@metatext-editor/core';
import { BG_SWATCH_COLORS, TEXT_SWATCH_COLORS } from '../../ConditionalRulesModal';
import type { EditorHostMode } from '../../SettingsAboutDialogs';
import { useI18n } from '../../i18n';

export interface StylePopoverProps {
  hostMode: EditorHostMode;
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  isColumnSelectionMode: boolean;
  isRowSelectionMode: boolean;
  selection: GridSelection;
  selectedColumnKeys: string[];
  selectedRowDataIndices: number[];
  selectedCellWrap: boolean;
  visibleColIndices: number[];
  viewRowIndices: Int32Array | number[];
  rows: string[][];
  csvData: ParsedCsvData | null;
  meta: MetaTextDocument;
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

export const StylePopover: React.FC<StylePopoverProps> = ({
  hostMode,
  isDark,
  toolbarBorder,
  toolbarFg,
  btnStyle,
  isColumnSelectionMode,
  isRowSelectionMode,
  selection,
  selectedColumnKeys,
  selectedRowDataIndices,
  selectedCellWrap,
  visibleColIndices,
  viewRowIndices,
  rows,
  csvData,
  meta,
  styleCtx,
  defaultHighlightRules,
  customNumFmt,
  onCustomNumFmtChange,
  onApplyStyle,
  onAutoFitRows,
  onOpenRulesModal,
}) => {
  const { t } = useI18n();
  const hasStyleTarget =
    isColumnSelectionMode || isRowSelectionMode || Boolean(selection.current);
  const firstColKey = selectedColumnKeys[0];
  const firstColCfg = firstColKey ? meta.columns?.[firstColKey] : undefined;
  const firstRowDataIdx = selectedRowDataIndices[0];
  const firstRowStyleRef =
    firstRowDataIdx !== undefined ? meta.rows?.[String(firstRowDataIdx)]?.style : undefined;
  const firstRowStyle: CellStyle | undefined =
    typeof firstRowStyleRef === 'string' ? meta.styles?.[firstRowStyleRef] : firstRowStyleRef;

  const activeCellColIdx = selection.current
    ? visibleColIndices[selection.current.cell[0]]
    : undefined;
  const activeCellDataRow = selection.current
    ? viewRowIndices[selection.current.cell[1]]
    : undefined;
  const activeCellResolved =
    !isColumnSelectionMode &&
    !isRowSelectionMode &&
    styleCtx &&
    activeCellColIdx !== undefined &&
    activeCellDataRow !== undefined &&
    rows[activeCellDataRow]
      ? resolveCellStyle(styleCtx, activeCellDataRow, activeCellColIdx, rows[activeCellDataRow]!)
      : undefined;
  const activeCellColMeta =
    activeCellColIdx !== undefined && csvData
      ? meta.columns?.[csvData.columnKeys[activeCellColIdx] ?? String(activeCellColIdx)]
      : undefined;

  const activeWrap = isColumnSelectionMode
    ? Boolean(firstColCfg?.wrap)
    : isRowSelectionMode
      ? Boolean(firstRowStyle?.wrap)
      : selectedCellWrap;
  const activeAlign: ColumnAlign | undefined = isColumnSelectionMode
    ? firstColCfg?.align
    : isRowSelectionMode
      ? firstRowStyle?.align
      : (activeCellResolved?.align ?? activeCellColMeta?.align);
  const activeNumFmt: string = isColumnSelectionMode
    ? (firstColCfg?.numberFormat ?? '')
    : (activeCellResolved?.numberFormat ?? activeCellColMeta?.numberFormat ?? '');
  const isCustomFmtValid = isValidNumberFormat(customNumFmt);

  const applyNumFmt = (pattern: string) => {
    const trimmed = pattern.trim();
    if (!isValidNumberFormat(trimmed)) return;
    onApplyStyle((s) => ({
      ...s,
      numberFormat: trimmed.length > 0 ? trimmed : undefined,
    }));
  };

  const toggleWrap = () => {
    if (!hasStyleTarget) return;
    const nextWrap = !activeWrap;
    onApplyStyle((s) => ({ ...s, wrap: nextWrap ? true : undefined }));
    if (!isColumnSelectionMode && selection.current) {
      const { range, cell } = selection.current;
      const startY = range.height > 1 ? range.y : cell[1];
      const endY = range.height > 1 ? range.y + range.height - 1 : cell[1];
      const startX = range.width > 1 ? range.x : cell[0];
      const endX = range.width > 1 ? range.x + range.width - 1 : cell[0];
      const targetRows: number[] = [];
      for (let vr = startY; vr <= endY && targetRows.length < 50; vr++) {
        const dr = viewRowIndices[vr];
        if (dr !== undefined) targetRows.push(dr);
      }
      const targetCols = new Set<number>();
      for (let vc = startX; vc <= endX; vc++) {
        const ac = visibleColIndices[vc];
        if (ac !== undefined) targetCols.add(ac);
      }
      if (nextWrap) {
        onAutoFitRows(targetRows, targetCols);
      } else {
        onAutoFitRows(targetRows, undefined, targetCols);
      }
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 2px)',
        left: hostMode === 'vscode' ? 10 : 72,
        zIndex: 60,
        width: 304,
        padding: 12,
        borderRadius: 6,
        background: isDark ? '#1f1f23' : '#ffffff',
        border: `1px solid ${toolbarBorder}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {isColumnSelectionMode
            ? t('style.columnsTitle')
            : isRowSelectionMode
              ? t('style.rowsTitle')
              : t('style.cellTitle')}
        </div>
        <button
          type="button"
          disabled={!hasStyleTarget}
          style={{
            ...btnStyle,
            height: 22,
            padding: '2px 6px',
            fontSize: 11,
            opacity: hasStyleTarget ? 1 : 0.45,
          }}
          title={t('style.clearTooltip')}
          onClick={() => {
            onApplyStyle(() => ({}), true);
            onCustomNumFmtChange('');
          }}
        >
          <X size={11} />
          <span>{t('common.clear')}</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          disabled={!hasStyleTarget}
          style={{ ...btnStyle, padding: '3px 8px', opacity: hasStyleTarget ? 1 : 0.45 }}
          title={t('style.boldTooltip')}
          onClick={() => onApplyStyle((s) => ({ ...s, bold: !s.bold }))}
        >
          <Bold size={13} />
          <span>{t('common.bold')}</span>
        </button>
        <button
          type="button"
          disabled={!hasStyleTarget}
          style={{ ...btnStyle, padding: '3px 8px', opacity: hasStyleTarget ? 1 : 0.45 }}
          title={t('style.italicTooltip')}
          onClick={() => onApplyStyle((s) => ({ ...s, italic: !s.italic }))}
        >
          <Italic size={13} />
          <span>{t('common.italic')}</span>
        </button>
        <button
          type="button"
          disabled={!hasStyleTarget}
          style={{
            ...btnStyle,
            padding: '3px 8px',
            borderColor: activeWrap ? '#3b82f6' : toolbarBorder,
            background: activeWrap
              ? isDark
                ? '#1e3a8a'
                : '#dbeafe'
              : btnStyle.background,
            opacity: hasStyleTarget ? 1 : 0.45,
          }}
          title={
            isColumnSelectionMode ? t('style.wrapColumnsTooltip') : t('style.wrapCellsTooltip')
          }
          onClick={toggleWrap}
        >
          <WrapText size={13} />
          <span>{t('common.wrap')}</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{t('style.alignment')}</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {[
            { value: 'left' as const, label: t('style.alignLeft'), Icon: AlignLeft },
            { value: 'center' as const, label: t('style.alignCenter'), Icon: AlignCenter },
            { value: 'right' as const, label: t('style.alignRight'), Icon: AlignRight },
          ].map(({ value, label, Icon }) => {
            const isSelected = activeAlign === value;
            return (
              <button
                key={value}
                type="button"
                disabled={!hasStyleTarget}
                title={label}
                aria-label={label}
                style={{
                  ...btnStyle,
                  width: 28,
                  height: 24,
                  padding: 0,
                  borderColor: isSelected ? '#3b82f6' : toolbarBorder,
                  background: isSelected
                    ? isDark
                      ? '#1e3a8a'
                      : '#dbeafe'
                    : btnStyle.background,
                  opacity: hasStyleTarget ? 1 : 0.45,
                }}
                onClick={() =>
                  onApplyStyle((s) => ({
                    ...s,
                    align: activeAlign === value ? undefined : value,
                  }))
                }
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{t('style.backgroundColor')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {BG_SWATCH_COLORS.map((sw) => (
            <button
              key={sw.label}
              type="button"
              disabled={!hasStyleTarget}
              title={t('style.backgroundTooltip', { color: sw.label })}
              style={{
                ...btnStyle,
                width: 22,
                height: 22,
                padding: 0,
                opacity: hasStyleTarget ? 1 : 0.45,
                background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
              }}
              onClick={() => onApplyStyle((s) => ({ ...s, backgroundColor: sw.value }))}
            >
              {sw.value === undefined ? <X size={11} /> : ' '}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{t('style.textColor')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {TEXT_SWATCH_COLORS.map((sw) => (
            <button
              key={sw.label}
              type="button"
              disabled={!hasStyleTarget}
              title={t('style.textColorTooltip', { color: sw.label })}
              style={{
                ...btnStyle,
                width: 22,
                height: 22,
                padding: 0,
                borderRadius: '50%',
                opacity: hasStyleTarget ? 1 : 0.45,
                background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
              }}
              onClick={() => onApplyStyle((s) => ({ ...s, color: sw.value }))}
            >
              {sw.value === undefined ? <X size={11} /> : ' '}
            </button>
          ))}
        </div>
      </div>

      {!isRowSelectionMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, opacity: 0.75 }}>{t('style.formatTitle')}</span>
            {activeNumFmt && <code style={{ fontSize: 10.5, opacity: 0.8 }}>{activeNumFmt}</code>}
          </div>
          {[NUMBER_FORMAT_PRESETS, DATE_FORMAT_PRESETS].map((group, idx) => (
            <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {group.map((preset) => {
                const isCurrent = activeNumFmt === preset.pattern;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={!hasStyleTarget}
                    title={`${preset.description}${preset.pattern ? ` (${preset.pattern})` : ''}`}
                    style={{
                      ...btnStyle,
                      height: 22,
                      padding: '1px 6px',
                      fontSize: 11,
                      borderColor: isCurrent ? '#3b82f6' : toolbarBorder,
                      background: isCurrent
                        ? isDark
                          ? '#1e3a8a'
                          : '#dbeafe'
                        : btnStyle.background,
                      opacity: hasStyleTarget ? 1 : 0.45,
                    }}
                    onClick={() => {
                      onCustomNumFmtChange(preset.pattern);
                      applyNumFmt(preset.pattern);
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              disabled={!hasStyleTarget}
              value={customNumFmt}
              placeholder={activeNumFmt || t('style.customFormatPlaceholder')}
              onChange={(e) => onCustomNumFmtChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isCustomFmtValid) {
                  applyNumFmt(customNumFmt);
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 24,
                padding: '2px 7px',
                fontSize: 11.5,
                borderRadius: 4,
                border: `1px solid ${isCustomFmtValid ? toolbarBorder : '#ef4444'}`,
                background: isDark ? '#141416' : '#ffffff',
                color: toolbarFg,
                outline: 'none',
              }}
            />
            <button
              type="button"
              disabled={!hasStyleTarget || !isCustomFmtValid}
              style={{
                ...btnStyle,
                height: 24,
                padding: '2px 8px',
                fontSize: 11,
                opacity: hasStyleTarget && isCustomFmtValid ? 1 : 0.45,
              }}
              onClick={() => applyNumFmt(customNumFmt)}
            >
              {t('common.apply')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        style={{ ...btnStyle, width: '100%', justifyContent: 'space-between' }}
        onClick={onOpenRulesModal}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} />
          <span>{t('style.conditionalRules')}</span>
        </span>
        <span style={{ opacity: 0.7 }}>
          {meta.rules !== undefined
            ? meta.rules.length
            : defaultHighlightRules.length > 0
              ? t('style.autoCount', { count: defaultHighlightRules.length })
              : 0}
        </span>
      </button>
    </div>
  );
};
