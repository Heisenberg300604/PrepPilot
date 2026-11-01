import { useId } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

/**
 * The PrepPilot mark: a "P" whose counter is a play button, on the brand tile. Same artwork as /favicon.svg.
 * The tile keeps the brand gradient in both themes, so the mark reads the same on light and dark backgrounds.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="brand-mark">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <mask id={`${id}m`}>
          <path fill="#fff" d="M19 18a3 3 0 0 1 3-3h12a11 11 0 0 1 0 22h-7v9a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" />
          <path fill="#000" stroke="#000" strokeWidth="2" strokeLinejoin="round" d="M30 22.2v7.6l6.6-3.8z" />
        </mask>
      </defs>
      <rect className="brand-mark-tile" width="64" height="64" rx="15" fill={`url(#${id}g)`} />
      <rect width="64" height="64" fill="#fff" mask={`url(#${id}m)`} />
    </svg>
  );
}

export function Brand({ compact = false, to = '/' }: { compact?: boolean; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label={`${brand.name} home`}>
      <BrandMark />
      {!compact && <span className="brand-word">{brand.name}</span>}
    </Link>
  );
}
