import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { CellStyle, ConditionalRule, RuleOperator } from '@metatext-editor/schema';
import { resolveStyleRef } from '@metatext-editor/core';

export interface StyleSwatch {
  label: string;
  value: string | undefined;
}

export const BG_SWATCH_COLORS: readonly StyleSwatch[] = [
  { label: 'Clear', value: undefined },
  { label: 'Slate', value: 'rgba(100, 116, 139, 0.22)' },
  { label: 'Blue', value: 'rgba(59, 130, 246, 0.20)' },
  { label: 'Sky', value: 'rgba(14, 165, 233, 0.20)' },
  { label: 'Emerald', value: 'rgba(16, 185, 129, 0.20)' },
  { label: 'Lime', value: 'rgba(132, 204, 22, 0.20)' },
  { label: 'Amber', value: 'rgba(245, 158, 11, 0.22)' },
  { label: 'Orange', value: 'rgba(249, 115, 22, 0.22)' },
  { label: 'Rose', value: 'rgba(244, 63, 94, 0.20)' },
  { label: 'Violet', value: 'rgba(139, 92, 246, 0.20)' },
];

export const TEXT_SWATCH_COLORS: readonly StyleSwatch[] = [
  { label: 'Default', value: undefined },
  { label: 'Muted', value: '#94a3b8' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
];

const OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: 'equals', label: 'Equals (=)' },
  { value: 'notEquals', label: 'Not Equals (!=)' },
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'regex', label: 'Regex (/.../)' },
  { value: 'empty', label: 'Is Empty' },
  { value: 'notEmpty', label: 'Is Not Empty' },
];

export interface ConditionalRulesModalProps {
  open: boolean;
  onClose: () => void;
  themeMode: 'light' | 'dark';
  columns: Array<{ key: string; label: string }>;
  rules: ConditionalRule[];
  defaultRules?: ConditionalRule[];
  usingDefaultRules?: boolean;
  styles?: Record<string, CellStyle>;
  onChangeRules: (next: ConditionalRule[]) => void;
}

export const ConditionalRulesModal: React.FC<ConditionalRulesModalProps> = ({
  open,
  onClose,
  themeMode,
  columns,
  rules,
  defaultRules,
  usingDefaultRules = false,
  styles,
  onChangeRules,
}) => {
  const [name, setName] = useState('');
  const [target, setTarget] = useState<'row' | 'cell'>('row');
  const [column, setColumn] = useState(columns[0]?.key ?? '');
  const [operator, setOperator] = useState<RuleOperator>('equals');
  const [value, setValue] = useState('');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(
    BG_SWATCH_COLORS[8]?.value,
  );
  const [color, setColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (columns.length > 0 && !columns.some((c) => c.key === column)) {
      setColumn(columns[0]!.key);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, columns, column]);

  if (!open) return null;

  const isDark = themeMode === 'dark';
  const bg = isDark ? '#1f1f23' : '#ffffff';
  const border = isDark ? '#3c3c42' : '#cbd5e1';
  const fg = isDark ? '#f1f5f9' : '#0f172a';
  const inputBg = isDark ? '#141416' : '#f8fafc';
  const mutedBg = isDark ? '#27272d' : '#f1f5f9';

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${border}`,
    background: inputBg,
    color: fg,
  };

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${border}`,
    background: mutedBg,
    color: fg,
    cursor: 'pointer',
  };

  const needsValue = operator !== 'empty' && operator !== 'notEmpty';
  const hasStyle = bold || italic || Boolean(backgroundColor) || Boolean(color);
  const canAdd = Boolean(column) && (!needsValue || value.length > 0) && hasStyle;

  const handleAdd = () => {
    if (!canAdd) return;
    const style: CellStyle = {};
    if (bold) style.bold = true;
    if (italic) style.italic = true;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (color) style.color = color;

    const newRule: ConditionalRule = {
      ...(name.trim() ? { name: name.trim() } : {}),
      target,
      when: {
        column,
        operator,
        ...(needsValue ? { value } : {}),
      },
      style,
    };
    onChangeRules([...rules, newRule]);
    setName('');
    setValue('');
  };

  const moveRule = (idx: number, delta: -1 | 1) => {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= rules.length) return;
    const copy = [...rules];
    const tmp = copy[idx]!;
    copy[idx] = copy[nextIdx]!;
    copy[nextIdx] = tmp;
    onChangeRules(copy);
  };

  const deleteRule = (idx: number) => {
    onChangeRules(rules.filter((_, i) => i !== idx));
  };

  const colLabelByKey = new Map(columns.map((c) => [c.key, c.label]));

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conditional Formatting Rules"
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          overflowY: 'auto',
          borderRadius: 10,
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Sparkles size={16} />
            <span>Conditional Formatting Rules (.metatext.jsonc)</span>
          </div>
          <button
            type="button"
            aria-label="Close conditional rules"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: fg,
              opacity: 0.7,
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Existing rules list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              Active Rules ({usingDefaultRules && defaultRules ? `${defaultRules.length} built-in` : rules.length})
            </div>
            {usingDefaultRules && defaultRules && defaultRules.length > 0 && (
              <div style={{ display: 'inline-flex', gap: 6 }}>
                <button
                  type="button"
                  style={{ ...btnStyle, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => onChangeRules(defaultRules)}
                >
                  Copy Defaults to .metatext.jsonc
                </button>
                <button
                  type="button"
                  style={{ ...btnStyle, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => onChangeRules([])}
                >
                  Disable Defaults
                </button>
              </div>
            )}
          </div>
          {usingDefaultRules && defaultRules && defaultRules.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              <div style={{ fontSize: 11.5, opacity: 0.78 }}>
                Zero-Config built-in highlight rules are active automatically for this file (not yet written to <code>.metatext.jsonc</code>).
              </div>
              {defaultRules.map((rule, idx) => {
                const resolved = resolveStyleRef(rule.style, styles);
                const colLabel = colLabelByKey.get(rule.when.column) ?? rule.when.column;
                return (
                  <div
                    key={`default-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: inputBg,
                      border: `1px dashed ${border}`,
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: `1px solid ${border}`,
                        background: resolved?.backgroundColor ?? 'transparent',
                        color: resolved?.color ?? fg,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      Abc
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rule.name ?? `${colLabel} ${rule.when.operator}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : rules.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                background: inputBg,
                border: `1px dashed ${border}`,
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              No conditional formatting rules yet. Add a rule below to highlight rows or cells automatically.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {rules.map((rule, idx) => {
                const resolved = resolveStyleRef(rule.style, styles);
                const colLabel = colLabelByKey.get(rule.when.column) ?? rule.when.column;
                return (
                  <div
                    key={`${rule.when.column}-${rule.when.operator}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: inputBg,
                      border: `1px solid ${border}`,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          border: `1px solid ${border}`,
                          background: resolved?.backgroundColor ?? 'transparent',
                          color: resolved?.color ?? fg,
                          fontWeight: resolved?.bold ? 700 : 400,
                          fontStyle: resolved?.italic ? 'italic' : 'normal',
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                        title={typeof rule.style === 'string' ? `Style: ${rule.style}` : 'Inline style'}
                      >
                        Abc
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rule.name ? `${rule.name} · ` : ''}
                          <span style={{ opacity: 0.75, fontWeight: 500 }}>
                            [{(rule.target ?? 'cell').toUpperCase()}]
                          </span>{' '}
                          <code>{colLabel}</code> {rule.when.operator}{' '}
                          {rule.when.value !== undefined ? <code>{rule.when.value}</code> : null}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button
                        type="button"
                        title="Move up"
                        disabled={idx === 0}
                        onClick={() => moveRule(idx, -1)}
                        style={{ ...btnStyle, padding: 4, opacity: idx === 0 ? 0.35 : 1 }}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={idx === rules.length - 1}
                        onClick={() => moveRule(idx, 1)}
                        style={{ ...btnStyle, padding: 4, opacity: idx === rules.length - 1 ? 0.35 : 1 }}
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        title="Delete rule"
                        onClick={() => deleteRule(idx)}
                        style={{ ...btnStyle, padding: 4, color: '#f43f5e' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '2px 0' }} />

        {/* Add new rule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>Add New Rule</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule name (optional, e.g. Highlight Errors)"
              style={inputStyle}
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'row' | 'cell')}
              style={inputStyle}
            >
              <option value="row">Entire Row</option>
              <option value="cell">Matched Cell</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', gap: 8 }}>
            <select
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              style={inputStyle}
            >
              {columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as RuleOperator)}
              style={inputStyle}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={value}
              disabled={!needsValue}
              onChange={(e) => setValue(e.target.value)}
              placeholder={needsValue ? 'Match value...' : '(not needed)'}
              style={{ ...inputStyle, opacity: needsValue ? 1 : 0.45 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 6, background: inputBg, border: `1px solid ${border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setBold((b) => !b)}
                  style={{
                    ...btnStyle,
                    fontWeight: 700,
                    borderColor: bold ? '#3b82f6' : border,
                    background: bold ? (isDark ? '#1e3a8a' : '#dbeafe') : mutedBg,
                  }}
                >
                  Bold
                </button>
                <button
                  type="button"
                  onClick={() => setItalic((it) => !it)}
                  style={{
                    ...btnStyle,
                    fontStyle: 'italic',
                    borderColor: italic ? '#3b82f6' : border,
                    background: italic ? (isDark ? '#1e3a8a' : '#dbeafe') : mutedBg,
                  }}
                >
                  Italic
                </button>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Preview:</span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 4,
                    border: `1px solid ${border}`,
                    background: backgroundColor ?? 'transparent',
                    color: color ?? fg,
                    fontWeight: bold ? 700 : 400,
                    fontStyle: italic ? 'italic' : 'normal',
                  }}
                >
                  Sample Cell
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, opacity: 0.75, width: 72 }}>Background</span>
              {BG_SWATCH_COLORS.map((sw) => {
                const active = backgroundColor === sw.value;
                return (
                  <button
                    key={sw.label}
                    type="button"
                    title={`Background: ${sw.label}`}
                    onClick={() => setBackgroundColor(sw.value)}
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      borderRadius: 4,
                      border: active
                        ? `2px solid ${isDark ? '#ffffff' : '#0f172a'}`
                        : `1px solid ${border}`,
                      background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
                      color: fg,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {sw.value === undefined ? <X size={11} /> : null}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, opacity: 0.75, width: 72 }}>Text Color</span>
              {TEXT_SWATCH_COLORS.map((sw) => {
                const active = color === sw.value;
                return (
                  <button
                    key={sw.label}
                    type="button"
                    title={`Text: ${sw.label}`}
                    onClick={() => setColor(sw.value)}
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      borderRadius: '50%',
                      border: active
                        ? `2px solid ${isDark ? '#ffffff' : '#0f172a'}`
                        : `1px solid ${border}`,
                      background: sw.value ?? (isDark ? '#1e1e1e' : '#ffffff'),
                      color: fg,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {sw.value === undefined ? <X size={11} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              disabled={!canAdd}
              onClick={handleAdd}
              style={{
                ...btnStyle,
                padding: '6px 14px',
                background: '#2563eb',
                borderColor: '#3b82f6',
                color: '#ffffff',
                fontWeight: 600,
                opacity: canAdd ? 1 : 0.45,
                cursor: canAdd ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus size={13} />
              <span>Add Rule</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
