import React, { useState } from 'react';
import {
  ChevronUp,
  Code2,
  ExternalLink,
  FileCode2,
  Monitor,
  X,
} from 'lucide-react';

export interface FloatingInfoCardsProps {
  isDark: boolean;
}

interface FloatingCardProps {
  isDark: boolean;
  accentColor: string;
  accentSoftBg: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const FloatingCard: React.FC<FloatingCardProps> = ({
  isDark,
  accentColor,
  accentSoftBg,
  icon,
  title,
  children,
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 210,
        padding: '11px 13px',
        borderRadius: 12,
        background: isDark ? 'rgba(24, 24, 27, 0.84)' : 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${
          hovered
            ? accentColor
            : isDark
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(15, 23, 42, 0.12)'
        }`,
        boxShadow: hovered
          ? isDark
            ? '0 16px 36px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 16px 34px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.08)'
          : isDark
            ? '0 10px 26px rgba(0, 0, 0, 0.42)'
            : '0 10px 24px rgba(15, 23, 42, 0.11), 0 2px 6px rgba(15, 23, 42, 0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
        color: isDark ? '#f4f4f5' : '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 7,
            background: accentSoftBg,
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5 }}>
        {children}
      </div>
    </div>
  );
};

interface CardLinkProps {
  href: string;
  isDark: boolean;
  children: React.ReactNode;
}

const CardLink: React.FC<CardLinkProps> = ({ href, isDark, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: hovered
          ? isDark
            ? '#93c5fd'
            : '#1d4ed8'
          : isDark
            ? '#60a5fa'
            : '#2563eb',
        textDecoration: hovered ? 'underline' : 'none',
        fontWeight: 500,
        lineHeight: 1.35,
      }}
    >
      <span>{children}</span>
      <ExternalLink size={10.5} style={{ opacity: 0.7, flexShrink: 0 }} />
    </a>
  );
};

// Placeholder URLs for upcoming store / marketplace listings
const LINKS = {
  specHome: 'https://mahorobalab.github.io/metatext-spec/',
  bundleManifestSchema:
    'https://mahorobalab.github.io/metatext-spec/schemas/v0.1/metatext-bundle.schema.json',
  vscodeExtension: 'https://marketplace.visualstudio.com/', // TODO: Replace with published extension URL
  microsoftStore: 'https://apps.microsoft.com/', // TODO: Replace with published Microsoft Store URL
  booth: 'https://booth.pm/', // TODO: Replace with published BOOTH URL
} as const;

export const FloatingInfoCards: React.FC<FloatingInfoCardsProps> = ({ isDark }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 34,
          zIndex: 80,
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Show MetaText Links"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            borderRadius: 999,
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)'}`,
            background: isDark ? 'rgba(24, 24, 27, 0.86)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: isDark ? '#f4f4f5' : '#0f172a',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: isDark
              ? '0 8px 20px rgba(0,0,0,0.45)'
              : '0 8px 20px rgba(15,23,42,0.12)',
          }}
        >
          <ChevronUp size={13} />
          <span>MetaText Links</span>
        </button>
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 600,
    opacity: 0.65,
    marginRight: 4,
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 34,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="Hide floating cards"
        title="Hide cards"
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          padding: 0,
          borderRadius: '50%',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)'}`,
          background: isDark ? 'rgba(24, 24, 27, 0.82)' : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: isDark ? '#d4d4d8' : '#475569',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.14)',
        }}
      >
        <X size={12} />
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          pointerEvents: 'auto',
        }}
      >
        {/* Card 1: MetaText Spec */}
        <FloatingCard
          isDark={isDark}
          accentColor={isDark ? '#60a5fa' : '#2563eb'}
          accentSoftBg={isDark ? 'rgba(59, 130, 246, 0.18)' : 'rgba(37, 99, 235, 0.1)'}
          icon={<FileCode2 size={14} />}
          title="MetaText Spec"
        >
          <CardLink href={LINKS.specHome} isDark={isDark}>
            Schema
          </CardLink>
          <CardLink href={LINKS.bundleManifestSchema} isDark={isDark}>
            manifest.json
          </CardLink>
        </FloatingCard>

        {/* Card 2: Development */}
        <FloatingCard
          isDark={isDark}
          accentColor={isDark ? '#c084fc' : '#7c3aed'}
          accentSoftBg={isDark ? 'rgba(168, 85, 247, 0.18)' : 'rgba(124, 58, 237, 0.1)'}
          icon={<Code2 size={14} />}
          title="Development"
        >
          <CardLink href={LINKS.vscodeExtension} isDark={isDark}>
            Visual Studio Code Extension
          </CardLink>
        </FloatingCard>

        {/* Card 3: Desktop App */}
        <FloatingCard
          isDark={isDark}
          accentColor={isDark ? '#fb923c' : '#ea580c'}
          accentSoftBg={isDark ? 'rgba(249, 115, 22, 0.18)' : 'rgba(234, 88, 12, 0.1)'}
          icon={<Monitor size={14} />}
          title="Desktop App"
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span style={labelStyle}>Windows</span>
            <CardLink href={LINKS.microsoftStore} isDark={isDark}>
              Microsoft Store
            </CardLink>
            <CardLink href={LINKS.booth} isDark={isDark}>
              BOOTH
            </CardLink>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={labelStyle}>Mac</span>
            <span style={{ fontSize: 11, opacity: 0.62, fontStyle: 'italic' }}>
              Coming soon...
            </span>
          </div>
        </FloatingCard>
      </div>
    </div>
  );
};
