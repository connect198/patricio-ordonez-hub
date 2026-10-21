import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/utils';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ivory/80">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </span>
  );
}

export function PageLoader({ label = 'Preparing your experience' }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-8">
      <Spinner label={label} />
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' | 'danger'; size?: 'md' | 'lg' | 'xl'; busy?: boolean };
export function Button({ variant = 'ghost', size = 'md', busy, className, children, disabled, ...p }: BtnProps) {
  return (
    <button {...p} disabled={disabled || busy} className={cx(`btn-${variant}`, size !== 'md' && `btn-${size}`, className)}>
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ className, children, gold }: { className?: string; children: ReactNode; gold?: boolean }) {
  return <div className={cx(gold ? 'card-gold' : 'card', className)}>{children}</div>;
}

export function Badge({ tone = 'mute', children, title }: { tone?: 'gold' | 'mute' | 'ok' | 'warn' | 'bad' | 'blue'; children: ReactNode; title?: string }) {
  return <span title={title} className={`badge-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ivory/55">{hint}</p>}
    </div>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx('input', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('input pr-8', p.className)} />;

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cx('card-gold max-h-[92dvh] w-full animate-rise overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl sm:p-7', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold text-ivory">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-xl text-ivory/70 hover:bg-white/10">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'gold' | 'warn' }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ivory/60">{label}</div>
      <div className={cx('mt-1 font-serif text-4xl font-bold tabular-nums sm:text-5xl', tone === 'gold' ? 'gold-text' : tone === 'warn' ? 'text-amber-300' : 'text-ivory')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ivory/55">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-1 rounded-2xl border border-dashed border-ivory/15 p-8 text-center">
      <div className="serif text-xl text-ivory">{title}</div>
      {children && <div className="max-w-md text-sm text-ivory/60">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold-soft transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-ivory/10 p-3.5">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-xs text-ivory/60">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold-soft after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ivory after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-royal" />
    </label>
  );
}
