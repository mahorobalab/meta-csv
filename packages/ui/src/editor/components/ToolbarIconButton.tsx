import React, { useState } from 'react';
import type { ToolbarIconSize } from '../../dialogs/types';

export interface ToolbarIconButtonProps {
  isDark: boolean;
  toolbarBorder: string;
  fgColor?: string;
  iconSize: ToolbarIconSize;
  active?: boolean;
  accent?: 'blue' | 'emerald' | 'amber';
  title?: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}

export const ToolbarIconButton: React.FC<ToolbarIconButtonProps> = ({
  isDark,
  toolbarBorder,
  fgColor,
  iconSize,
  active = false,
  accent = 'blue',
  title,
  ariaLabel,
  onClick,
  children,
}) => {
  const [hovered, setHovered] = useState(false);

  const activeStyles: Record<'blue' | 'emerald' | 'amber', { border: string; bg: string; color?: string }> = {
    blue: {
      border: '#3b82f6',
      bg: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.14)',
    },
    emerald: {
      border: '#10b981',
      bg: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.14)',
      color: isDark ? '#6ee7b7' : '#047857',
    },
    amber: {
      border: '#f59e0b',
      bg: isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.16)',
      color: isDark ? '#fbbf24' : '#d97706',
    },
  };

  const accentStyle = activeStyles[accent];
  const hoverBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: iconSize === 'large' ? 32 : 26,
        minWidth: iconSize === 'large' ? 32 : 26,
        padding: iconSize === 'large' ? '0 6px' : '0 5px',
        boxSizing: 'border-box',
        borderRadius: 5,
        border: active
          ? `1px solid ${accentStyle.border}`
          : hovered
            ? `1px solid ${toolbarBorder}`
            : '1px solid transparent',
        background: active ? accentStyle.bg : hovered ? hoverBg : 'transparent',
        color: active && accentStyle.color ? accentStyle.color : fgColor ?? 'inherit',
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
    >
      {children}
    </button>
  );
};
