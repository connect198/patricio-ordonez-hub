/** Black-and-gold "light ribbon" backdrop: dotted mesh wave, flowing line wave, lens arcs and gold dust. Decorative only. */
const lines = (n: number, y: (i: number, x: number) => number, w = 1200, steps = 40) =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: steps + 1 }, (_, k) => { const x = (k / steps) * w; return `${k ? 'L' : 'M'}${x.toFixed(1)} ${y(i, x).toFixed(1)}`; }).join(' '));

const dust = Array.from({ length: 90 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1) * 100, y: r(2) * 100, s: 0.6 + r(3) * 2.2, d: r(4) * 4, o: 0.3 + r(5) * 0.7 };
});

export function GalaBackdrop() {
  const mesh = lines(26, (i, x) => 120 + i * 5 + Math.sin(x / 150 + i * 0.07) * 70 + x * 0.12);
  const flow = lines(30, (i, x) => 470 + Math.sin(x / 190 + i * 0.09) * 60 - x * 0.05 + i * 4);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(46,36,12,.55),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(60,44,10,.45),transparent_50%)]" />
      <svg className="absolute -right-[15%] -top-[2%] h-[46%] w-[85%] opacity-80" viewBox="0 0 1200 500" preserveAspectRatio="none">
        <defs><linearGradient id="gm" x1="0" x2="1"><stop offset="0" stopColor="#8a6a1f" stopOpacity="0" /><stop offset=".5" stopColor="#d9b45a" /><stop offset="1" stopColor="#f3dc9a" /></linearGradient></defs>
        {mesh.map((d, i) => <path key={i} d={d} fill="none" stroke="url(#gm)" strokeWidth="1.1" strokeDasharray="1.2 5" strokeLinecap="round" />)}
      </svg>
      <svg className="absolute -left-[10%] bottom-[-4%] h-[40%] w-[120%] opacity-90" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <defs><linearGradient id="gf" x1="0" x2="1"><stop offset="0" stopColor="#f3dc9a" /><stop offset=".6" stopColor="#c9a24a" stopOpacity=".8" /><stop offset="1" stopColor="#8a6a1f" stopOpacity="0" /></linearGradient></defs>
        {flow.map((d, i) => <path key={i} d={d} fill="none" stroke="url(#gf)" strokeWidth=".9" />)}
      </svg>
      {/* lens arcs & flares */}
      <div className="absolute -left-[22%] top-[40%] h-[34vmax] w-[34vmax] rounded-full border-r-[3px] border-[#f3dc9a]/70 shadow-[inset_-30px_0_60px_-20px_rgba(243,220,154,.5),12px_0_80px_-10px_rgba(243,220,154,.35)]" />
      <div className="absolute -right-[10vmax] top-[38%] h-[22vmax] w-[22vmax] rounded-full border border-[#d9b45a]/40 shadow-[inset_0_0_60px_rgba(212,175,55,.18)]" />
      <div className="fx absolute left-0 top-[60%] h-40 w-40 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,236,170,.9),rgba(255,214,120,.25)_35%,transparent_70%)] blur-[2px] animate-glow" />
      {/* gold dust */}
      <svg className="absolute inset-0 h-full w-full">
        {dust.map((p, i) => <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r={p.s} fill="#f3dc9a" opacity={p.o} className={i % 3 === 0 ? 'twinkle fx' : ''} style={{ animationDelay: `${p.d}s` }} />)}
      </svg>
    </div>
  );
}
