import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden className="brand-mark">
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path d="M20 46V18h13.5c6.400 0 10.500 3.700 10.500 9.300S39.900 36.600 33.500 36.600H27V46z" fill="#fff" />
      <path d="M44 38l8-4-8-4z" fill="#c7d2fe" />
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
