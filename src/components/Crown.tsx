/** Original crown emblem (not derived from any third-party mark). */
export function Crown({ className = 'h-20 w-20', glow = true }: { className?: string; glow?: boolean }) {
  return (
    <svg viewBox="0 0 120 100" className={className} role="img" aria-label="Royal crown emblem">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3DE95" />
          <stop offset=".55" stopColor="#D4AF37" />
          <stop offset="1" stopColor="#9A7B1E" />
        </linearGradient>
        <filter id="cglow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter={glow ? 'url(#cglow)' : undefined}>
        <path d="M14 78 L8 30 L38 54 L60 14 L82 54 L112 30 L106 78 Z" fill="url(#cg)" />
        <rect x="14" y="82" width="92" height="9" rx="3" fill="url(#cg)" />
        <circle cx="8" cy="26" r="6" fill="#F3DE95" />
        <circle cx="60" cy="10" r="7" fill="#F3DE95" />
        <circle cx="112" cy="26" r="6" fill="#F3DE95" />
        <path d="M30 70 L60 40 L90 70" stroke="#0B0B0D" strokeOpacity=".28" strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}

/** Soft rising gold sparks. Purely decorative; hidden in low-bandwidth / reduced-motion modes via .fx */
export function Sparkles({ count = 18 }: { count?: number }) {
  return (
    <div className="fx pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 53) % 100;
        const delay = ((i * 37) % 30) / 10;
        const size = 2 + ((i * 7) % 4);
        return (
          <span key={i} className="absolute bottom-0 animate-spark rounded-full bg-gold-soft" style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, opacity: 0 }} />
        );
      })}
    </div>
  );
}
