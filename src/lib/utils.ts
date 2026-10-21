import Papa from 'papaparse';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  // Prefix risky leading characters so spreadsheet apps never execute guest-supplied text as formulas.
  const safe = rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v])),
  );
  const blob = new Blob(['﻿' + Papa.unparse(safe)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function formatDate(d: string | null | undefined) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return '';
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export const clock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

export const maskEmail = (e: string | null | undefined) => {
  if (!e) return '';
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d ?? ''}`;
};

export function isLowBandwidth() {
  try {
    const stored = localStorage.getItem('kc-lowbw');
    if (stored !== null) return stored === '1';
    const c = (navigator as any).connection;
    return !!c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType ?? ''));
  } catch {
    return false;
  }
}
export function setLowBandwidth(on: boolean) {
  try { localStorage.setItem('kc-lowbw', on ? '1' : '0'); } catch { /* storage unavailable */ }
  document.documentElement.toggleAttribute('data-lowbw', on);
}
