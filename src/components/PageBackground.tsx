import React from 'react';
import { PageBackground as PageBackgroundData } from '../types/board';

interface PageBackgroundProps {
  id: string;
  width: number;
  height: number;
  background?: PageBackgroundData;
  patternVisible: boolean;
}

export const PageBackground: React.FC<PageBackgroundProps> = ({
  id,
  width,
  height,
  background,
  patternVisible,
}) => {
  const paper = background ?? { color: '#ffffff', pattern: 'grid' as const };
  const patternId = `paper-pattern-${id}`;
  const gradientId = `paper-gradient-${id}`;
  const patternColor = paper.color.toLowerCase() === '#1a1e27' ? '#526079' : '#cbd5e1';
  const patternOpacity = paper.color.toLowerCase() === '#1a1e27' ? 0.3 : 0.75;

  const pattern = (() => {
    switch (paper.pattern) {
      case 'lined':
        return (
          <pattern id={patternId} width="48" height="32" patternUnits="userSpaceOnUse">
            <path d="M0 31.5H48" stroke={patternColor} strokeOpacity={patternOpacity} strokeWidth="1" />
          </pattern>
        );
      case 'grid':
      case 'graph':
        return (
          <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke={patternColor} strokeOpacity={patternOpacity} strokeWidth="1" />
            {paper.pattern === 'graph' && (
              <path d="M24 0V48M0 24H48" fill="none" stroke={patternColor} strokeOpacity={patternOpacity * 0.45} strokeWidth="0.6" />
            )}
          </pattern>
        );
      case 'small-grid':
        return (
          <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke={patternColor} strokeOpacity={patternOpacity} strokeWidth="0.8" />
          </pattern>
        );
      case 'dots':
        return (
          <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill={patternColor} fillOpacity={patternOpacity} />
          </pattern>
        );
      case 'staff':
        return (
          <pattern id={patternId} width="720" height="120" patternUnits="userSpaceOnUse">
            <path d="M0 20H720M0 40H720M0 60H720M0 80H720M0 100H720" stroke={patternColor} strokeOpacity={patternOpacity} strokeWidth="1" />
          </pattern>
        );
      case 'isometric':
        return (
          <pattern id={patternId} width="48" height="42" patternUnits="userSpaceOnUse">
            <path d="M0 21 24 7 48 21 24 35Z M24 7V35" fill="none" stroke={patternColor} strokeOpacity={patternOpacity} strokeWidth="0.8" />
          </pattern>
        );
      default:
        return null;
    }
  })();

  return (
    <g>
      <defs>
        {paper.gradientColor && (
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={paper.color} />
            <stop offset="100%" stopColor={paper.gradientColor} />
          </linearGradient>
        )}
        {pattern}
      </defs>
      <rect
        width={width}
        height={height}
        fill={paper.gradientColor ? `url(#${gradientId})` : paper.color}
      />
      {paper.imageData && (
        <image
          href={paper.imageData}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
          pointerEvents="none"
        />
      )}
      {patternVisible && paper.pattern !== 'blank' && (
        <rect width={width} height={height} fill={`url(#${patternId})`} pointerEvents="none" />
      )}
    </g>
  );
};
