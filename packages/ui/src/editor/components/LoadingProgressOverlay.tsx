import React from 'react';
import type { MetaTextFormat } from '@meta-csv/schema';
import type { ParseProgress } from '@meta-csv/core';

export interface LoadingProgressOverlayProps {
  loadingProgress: ParseProgress;
  activeFormat: MetaTextFormat;
  isDark: boolean;
  toolbarFg: string;
}

export const LoadingProgressOverlay: React.FC<LoadingProgressOverlayProps> = ({
  loadingProgress,
  activeFormat,
  isDark,
  toolbarFg,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      background: isDark ? 'rgba(24, 24, 27, 0.82)' : 'rgba(248, 250, 252, 0.85)',
      backdropFilter: 'blur(2px)',
      color: toolbarFg,
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600 }}>
      {loadingProgress.phase === 'decoding'
        ? 'Reading file...'
        : loadingProgress.phase === 'parsing'
          ? `Parsing ${activeFormat.toUpperCase()}... (${loadingProgress.rowsParsed.toLocaleString()} rows)`
          : 'Finalizing grid...'}
    </div>
    <div
      style={{
        width: 280,
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        background: isDark ? '#333338' : '#cbd5e1',
      }}
    >
      <div
        style={{
          width: `${Math.max(4, loadingProgress.percent)}%`,
          height: '100%',
          background: '#3b82f6',
          transition: 'width 80ms linear',
        }}
      />
    </div>
    <div style={{ fontSize: 12, opacity: 0.75 }}>{loadingProgress.percent}%</div>
  </div>
);
