import type { TableDesignation } from '../../shared/types';

export interface PlanTable { number: number; label?: string | null; designation: TableDesignation; x?: number | null; y?: number | null }

/** Ballroom layout. Uses saved coordinates when every table has them; otherwise lays tables out in an even grid. */
export function FloorPlan({ tables, highlight, className = '' }: { tables: PlanTable[]; highlight?: number | null; className?: string }) {
  const sorted = [...tables].sort((a, b) => a.number - b.number);
  const n = sorted.length;
  const placed = n > 0 && sorted.every((t) => t.x != null && t.y != null);
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.5)));
  const rows = Math.ceil(n / cols);
  const cell = 100;
  const W = placed ? 1000 : cols * cell + 40;
  const H = placed ? 700 : rows * cell + 150;
  const pos = (t: PlanTable, i: number) =>
    placed ? { x: (t.x! / 100) * (W - 80) + 40, y: (t.y! / 100) * (H - 200) + 150 } : { x: 20 + (i % cols) * cell + cell / 2, y: 130 + Math.floor(i / cols) * cell + cell / 2 };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} role="img"
      aria-label={highlight ? `Ballroom layout with table ${highlight} highlighted` : 'Ballroom layout'}>
      <defs>
        <radialGradient id="hl" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F3DE95" /><stop offset="1" stopColor="#D4AF37" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="22" fill="#0B0B0D" stroke="rgba(247,231,206,.18)" />
      <rect x={W / 2 - 130} y="22" width="260" height="56" rx="12" fill="#163047" stroke="rgba(212,175,55,.6)" />
      <text x={W / 2} y="57" textAnchor="middle" fontSize="20" fill="#F7E7CE" letterSpacing="4" style={{ fontFamily: 'Cormorant Garamond, serif' }}>STAGE</text>
      {sorted.map((t, i) => {
        const { x, y } = pos(t, i);
        const on = highlight === t.number;
        return (
          <g key={t.number}>
            {on && <circle cx={x} cy={y} r="46" fill="rgba(212,175,55,.2)" className="animate-glow" />}
            <circle cx={x} cy={y} r={on ? 36 : 30} fill={on ? 'url(#hl)' : '#1B1B20'} stroke={on ? '#F3DE95' : t.designation === 'general' ? 'rgba(247,231,206,.28)' : 'rgba(212,175,55,.7)'} strokeWidth={on ? 3 : 2} />
            <text x={x} y={y + (on ? 11 : 8)} textAnchor="middle" fontSize={on ? 32 : 24} fontWeight="700" fill={on ? '#0B0B0D' : '#F7E7CE'} style={{ fontFamily: 'Cormorant Garamond, serif' }}>{t.number}</text>
          </g>
        );
      })}
    </svg>
  );
}
