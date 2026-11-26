import React from 'react';

export interface ZebraRowsIconProps {
  size?: number;
  active?: boolean;
}

/**
 * Custom Lucide rows-4 based icon for Alternating Row Colors (Zebra Striping).
 * 1st & 3rd rows are transparent/white; 2nd & 4th rows are filled with subtle gray.
 */
export const ZebraRowsIcon: React.FC<ZebraRowsIconProps> = ({
  size = 14,
  active = false,
}) => {
  const fillOpacity = active ? 0.24 : 0.16;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 2nd row & 4th row fill */}
      <rect
        x="3"
        y="7.5"
        width="18"
        height="4.5"
        fill="currentColor"
        fillOpacity={fillOpacity}
        stroke="none"
      />
      <rect
        x="3"
        y="16.5"
        width="18"
        height="4.5"
        rx="1.2"
        fill="currentColor"
        fillOpacity={fillOpacity}
        stroke="none"
      />
      {/* Thin inner dividers so all 4 rows stay crisp at 14px */}
      <path d="M3 7.5H21" strokeWidth={1.15} strokeOpacity={0.7} />
      <path d="M3 12H21" strokeWidth={1.15} strokeOpacity={0.7} />
      <path d="M3 16.5H21" strokeWidth={1.15} strokeOpacity={0.7} />
      {/* Outer frame matching Lucide icons */}
      <rect x="2.5" y="2.5" width="19" height="19" rx="2" strokeWidth={1.85} />
    </svg>
  );
};
