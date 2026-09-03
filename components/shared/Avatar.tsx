import React, { useEffect, useState } from 'react';
import {
  renderUrlForSize,
  nearestRenderSize,
  rosterDefaultUrl,
} from '../../services/avatarCore';

/**
 * The ONE avatar renderer for every surface (board, leaderboard, roster,
 * parent app, profile). Resolves in order: explicit src (render URL) →
 * deterministic roster default → initial-letter fallback. Deterministic
 * render paths let it pick the right resolution variant.
 */
interface AvatarProps {
  src?: string | null;
  name?: string;
  rosterId?: string | null;
  size?: number;
  /** One-shot pop (win banners, point popups). */
  celebrate?: boolean;
  /** Continuous subtle motion (profile, whose-turn pill). */
  idle?: boolean;
  rounded?: string;
  className?: string;
}

const INITIAL_GRADIENTS = [
  'linear-gradient(135deg,#60a5fa,#a78bfa)',
  'linear-gradient(135deg,#f472b6,#fb923c)',
  'linear-gradient(135deg,#34d399,#22d3ee)',
  'linear-gradient(135deg,#fbbf24,#f87171)',
  'linear-gradient(135deg,#818cf8,#e879f9)',
];

const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  rosterId,
  size = 40,
  celebrate,
  idle,
  rounded = 'rounded-full',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src, rosterId]);

  const px = Math.round(size);
  const variantUrl = src
    ? renderUrlForSize(src, px)
    : rosterId
      ? rosterDefaultUrl(rosterId, px)
      : null;

  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const gradient = INITIAL_GRADIENTS[(name || rosterId || '?').length % INITIAL_GRADIENTS.length];
  const motion = celebrate ? 'animate-scale-in' : idle ? 'animate-bounce-subtle' : '';

  if (variantUrl && !failed) {
    return (
      <img
        src={variantUrl}
        alt={name ? `${name}'s avatar` : 'avatar'}
        width={px}
        height={px}
        onError={() => setFailed(true)}
        className={`${rounded} object-cover bg-slate-100 shrink-0 ${motion} ${className}`}
        style={{ width: px, height: px }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      aria-label={name ? `${name}'s avatar` : 'avatar'}
      className={`${rounded} flex items-center justify-center font-bold text-white select-none shrink-0 ${motion} ${className}`}
      style={{ width: px, height: px, background: gradient, fontSize: Math.max(11, Math.round(px * 0.42)) }}
    >
      {initial}
    </div>
  );
};

export default Avatar;
