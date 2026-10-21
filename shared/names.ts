// Forgiving name matching: accents, case, punctuation, partial names and small spelling differences.

export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'rev', 'pastor', 'bishop', 'apostle', 'prophet', 'minister', 'sir', 'jr', 'sr', 'ii', 'iii', 'phd', 'md']);

export function nameTokens(s: string | null | undefined): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !HONORIFICS.has(t));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Does one typed token plausibly refer to a name token? */
export function tokenMatches(q: string, t: string): boolean {
  if (q === t) return true;
  if (q.length >= 2 && t.startsWith(q)) return true; // partial names while typing
  const allowed = q.length >= 5 ? 2 : q.length >= 4 ? 1 : 0;
  return allowed > 0 && levenshtein(q, t) <= allowed;
}

/** 0..1 — fraction of typed tokens that match a token of the best candidate name. */
export function nameScore(query: string, candidates: (string | null | undefined)[]): number {
  const q = nameTokens(query);
  if (!q.length) return 0;
  let best = 0;
  for (const c of candidates) {
    const t = nameTokens(c);
    if (!t.length) continue;
    const used = new Set<number>();
    let hit = 0;
    for (const qt of q) {
      const idx = t.findIndex((tt, i) => !used.has(i) && tokenMatches(qt, tt));
      if (idx >= 0) {
        used.add(idx);
        hit++;
      }
    }
    best = Math.max(best, hit / q.length);
  }
  return best;
}

/** Verification rule: every typed token must match (so a partial or slightly misspelled name still works). */
export const nameMatchesAll = (query: string, candidates: (string | null | undefined)[]) => nameScore(query, candidates) === 1;

/** Admin search: rank guests by name closeness; empty query returns everything. */
export function rankByName<T>(items: T[], query: string, pick: (x: T) => (string | null | undefined)[]): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((x) => ({ x, s: nameScore(q, pick(x)) }))
    .filter((r) => r.s > 0.5)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.x);
}

/** Pretty-print private codes as XXXX-XXXX; strip decoration when reading input. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = (s: string) => (s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s);
export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
