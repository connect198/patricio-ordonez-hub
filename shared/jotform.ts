// Jotform → guest normalisation and import classification (used by Netlify Functions; unit-tested).
import { nameTokens, normalizeName } from './names';

export interface NormalizedGuest {
  submissionId: string | null;
  submittedAt: string | null;
  fullName: string;
  displayName: string;
  credentials: string;
  email: string;
  phone: string;
  state: string;
  country: string;
  bookTitle: string;
  additionalTitles: string[];
  bookCoverUrl: string;
  headshotUrl: string;
  marketingPermission: boolean;
  attendanceIntent: string;
  ticketInterest: string;
  companionIntent: string;
  additionalGuestDetails: string;
  dietary: string;
  accessibility: string;
}

type Key =
  | 'fullName' | 'displayName' | 'credentials' | 'bookTitle' | 'secondBook' | 'thirdBook' | 'email' | 'phone'
  | 'state' | 'country' | 'headshot' | 'cover' | 'attendance' | 'ticket' | 'companionIntent' | 'companionDetails'
  | 'dietary' | 'accessibility' | 'marketing' | 'submissionId' | 'submittedAt' | 'firstName' | 'lastName';

/** Field rules matched against the question label (case-insensitive). Order matters: first match wins. */
const RULES: [Key, (l: string) => boolean][] = [
  ['submissionId', (l) => l === 'submission id'],
  ['submittedAt', (l) => l === 'submission date'],
  ['marketing', (l) => l.includes('permission to use submitted photos')],
  ['displayName', (l) => l.includes('name to be printed') || l.includes('certificate')],
  ['fullName', (l) => l.startsWith('full name')],
  ['firstName', (l) => l === 'first name'],
  ['lastName', (l) => l === 'last name'],
  ['credentials', (l) => l.startsWith('credentials to include')],
  ['secondBook', (l) => l.includes('second book')],
  ['thirdBook', (l) => l.includes('third book')],
  ['bookTitle', (l) => l.startsWith('exact book title')],
  ['email', (l) => l.startsWith('email address') || l === 'email'],
  ['phone', (l) => l.includes('phone number')],
  ['state', (l) => l.startsWith('state')],
  ['country', (l) => l.startsWith('country')],
  ['headshot', (l) => l.includes('headshot')],
  ['cover', (l) => l.includes('book cover')],
  ['attendance', (l) => l.includes('planning to attend')],
  ['ticket', (l) => l.includes('ticket option')],
  ['companionIntent', (l) => l.includes('anyone be attending')],
  ['companionDetails', (l) => l.includes('who will attend with you')],
  ['dietary', (l) => l.includes('dietary')],
  ['accessibility', (l) => l.includes('accessibility')],
];

export function keyForLabel(label: string): Key | null {
  const l = label.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [k, test] of RULES) if (test(l)) return k;
  return null;
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Flatten any Jotform answer shape (string, name object, array, file list) to text. */
export function answerToText(a: unknown): string {
  if (a == null) return '';
  if (typeof a === 'string' || typeof a === 'number') return clean(a);
  if (Array.isArray(a)) return a.map(answerToText).filter(Boolean).join('\n');
  if (typeof a === 'object') {
    const o = a as Record<string, unknown>;
    if ('first' in o || 'last' in o) return clean([o.prefix, o.first, o.middle, o.last, o.suffix].filter(Boolean).join(' '));
    if ('other' in o && !('answer' in o)) return clean(Object.values(o).filter(Boolean).join(', '));
    return clean(Object.values(o).filter((v) => typeof v === 'string').join(' '));
  }
  return '';
}

export function firstHttpUrl(s: string): string {
  const m = s.match(/https?:\/\/[^\s,"'<>]+/i);
  if (!m) return '';
  return m[0].replace(/^http:\/\//i, 'https://');
}

export function titleCaseIfShouting(s: string): string {
  if (!s) return s;
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters) return s;
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }
  return s;
}

export function parsePermission(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return !/^(no\b|n\/a|decline|do not|don't|i do not|i don't)/.test(t);
}

function build(fields: Partial<Record<Key, string[]>>): NormalizedGuest {
  const one = (k: Key) => (fields[k] ?? []).map(clean).filter(Boolean)[0] ?? '';
  const full =
    one('fullName') || [one('firstName'), one('lastName')].filter(Boolean).join(' ');
  const fullName = titleCaseIfShouting(full);
  return {
    submissionId: one('submissionId') || null,
    submittedAt: one('submittedAt') || null,
    fullName,
    displayName: titleCaseIfShouting(one('displayName')) || fullName,
    credentials: one('credentials'),
    email: one('email').toLowerCase(),
    phone: one('phone'),
    state: one('state'),
    country: one('country'),
    bookTitle: one('bookTitle'),
    additionalTitles: [one('secondBook'), one('thirdBook')].filter(Boolean),
    bookCoverUrl: firstHttpUrl((fields.cover ?? []).join('\n')),
    headshotUrl: firstHttpUrl((fields.headshot ?? []).join('\n')),
    marketingPermission: parsePermission(one('marketing')),
    attendanceIntent: one('attendance'),
    ticketInterest: one('ticket'),
    companionIntent: one('companionIntent'),
    additionalGuestDetails: (fields.companionDetails ?? []).join('\n').trim(),
    dietary: one('dietary'),
    accessibility: one('accessibility'),
  };
}

/** Jotform REST API submission → NormalizedGuest */
export function normalizeApiSubmission(sub: any): NormalizedGuest {
  const fields: Partial<Record<Key, string[]>> = {};
  for (const ans of Object.values<any>(sub?.answers ?? {})) {
    const label = clean(ans?.text);
    if (!label) continue;
    const key = keyForLabel(label);
    if (!key) continue;
    const text = answerToText(ans.answer);
    if (!text) continue;
    (fields[key] ??= []).push(text);
  }
  fields.submissionId = [String(sub?.id ?? '')];
  fields.submittedAt = [String(sub?.created_at ?? '')];
  return build(fields);
}

/** Jotform CSV export row (header → value) → NormalizedGuest */
export function normalizeCsvRow(row: Record<string, string>): NormalizedGuest {
  const fields: Partial<Record<Key, string[]>> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = keyForLabel(header);
    const text = clean(value);
    if (!key || !text) continue;
    (fields[key] ??= []).push(key === 'cover' || key === 'headshot' || key === 'companionDetails' ? String(value) : text);
  }
  return build(fields);
}

// ───────────────────────── Classification ─────────────────────────
export type RowClass = 'new' | 'updated' | 'unchanged' | 'duplicate' | 'incomplete' | 'error';

export interface ExistingGuest {
  id: string;
  jotform_submission_id: string | null;
  full_name: string;
  email: string | null;
  [k: string]: unknown;
}

export interface ClassifiedRow {
  index: number;
  submissionId: string | null;
  classification: RowClass;
  decision: 'import' | 'skip' | 'merge';
  payload: NormalizedGuest;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  matchedGuestId: string | null;
  messages: string[];
}

/** Columns the importer owns. Staff-managed columns (category, tickets, seating, notes, flags) are NEVER touched. */
export function toGuestColumns(n: NormalizedGuest) {
  return {
    full_name: n.fullName,
    display_name: n.displayName,
    first_name: deriveFirstName(n.fullName, n.displayName),
    credentials: n.credentials,
    email: n.email,
    phone: n.phone,
    state: n.state,
    country: n.country,
    book_title: n.bookTitle,
    additional_titles: n.additionalTitles,
    book_cover_url: n.bookCoverUrl,
    headshot_url: n.headshotUrl,
    marketing_permission: n.marketingPermission,
    attendance_intent: n.attendanceIntent,
    ticket_interest: n.ticketInterest,
    companion_intent: n.companionIntent,
    additional_guest_details: n.additionalGuestDetails,
    dietary: n.dietary,
    accessibility: n.accessibility,
  };
}

export function deriveFirstName(fullName: string, displayName: string): string {
  return nameTokens(fullName)[0] ? properCase(firstRawToken(fullName)) : properCase(firstRawToken(displayName));
}
const HON = /^(dr|mr|mrs|ms|miss|rev|pastor|bishop|apostle|prophet|minister|sir)\.?$/i;
function firstRawToken(s: string): string {
  return s.split(/\s+/).find((t) => t && !HON.test(t)) ?? s.split(/\s+/)[0] ?? '';
}
const properCase = (s: string) => s;

/** Only non-empty incoming values overwrite; an empty Jotform answer never erases existing data. */
export function diffAgainst(existing: Record<string, unknown>, incoming: ReturnType<typeof toGuestColumns>) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const empty = v === '' || v == null || (Array.isArray(v) && v.length === 0);
    if (empty) continue;
    const cur = existing[k] ?? null;
    if (JSON.stringify(cur) !== JSON.stringify(v)) diff[k] = { from: cur, to: v };
  }
  return Object.keys(diff).length ? diff : null;
}

export function classifyRows(rows: NormalizedGuest[], existing: ExistingGuest[]): ClassifiedRow[] {
  const bySub = new Map(existing.filter((g) => g.jotform_submission_id).map((g) => [g.jotform_submission_id!, g]));
  const byEmail = new Map<string, ExistingGuest>();
  const byName = new Map<string, ExistingGuest>();
  for (const g of existing) {
    if (g.email) byEmail.set(g.email.toLowerCase(), g);
    byName.set(normalizeName(g.full_name), g);
  }
  const seenEmail = new Map<string, string>();
  const seenName = new Map<string, string>();
  const seenSub = new Set<string>();

  return rows.map((n, index) => {
    const messages: string[] = [];
    const base = { index, submissionId: n.submissionId, payload: n, diff: null, matchedGuestId: null as string | null };
    const err = (m: string): ClassifiedRow => ({ ...base, classification: 'error', decision: 'skip', messages: [m] });

    if (!n.fullName) return err('No name on this submission — it cannot be imported.');
    if (n.submissionId && seenSub.has(n.submissionId)) return err(`Submission ${n.submissionId} appears twice in this file.`);
    if (n.submissionId) seenSub.add(n.submissionId);

    const email = n.email.toLowerCase();
    const nameKey = normalizeName(n.fullName);

    const known = n.submissionId ? bySub.get(n.submissionId) : undefined;
    if (known) {
      const diff = diffAgainst(known, toGuestColumns(n));
      if (email) seenEmail.set(email, n.submissionId ?? String(index));
      seenName.set(nameKey, n.submissionId ?? String(index));
      return {
        ...base,
        matchedGuestId: known.id,
        diff,
        classification: diff ? 'updated' : 'unchanged',
        decision: diff ? 'import' : 'skip',
        messages: diff ? [`${Object.keys(diff).length} field(s) changed in Jotform`] : ['No changes'],
      } satisfies ClassifiedRow;
    }

    // Possible duplicate: same email or same name as an existing guest (different submission) or earlier row.
    const dupExisting = (email && byEmail.get(email)) || byName.get(nameKey) || undefined;
    const dupBatch = (email && seenEmail.get(email)) || seenName.get(nameKey);
    if (dupExisting || dupBatch) {
      if (dupExisting) messages.push(`Possible duplicate of existing guest “${dupExisting.full_name}”.`);
      if (dupBatch) messages.push(`Same ${email && seenEmail.get(email) ? 'email' : 'name'} as submission ${dupBatch} in this import.`);
      return { ...base, matchedGuestId: dupExisting?.id ?? null, classification: 'duplicate', decision: 'skip', messages } satisfies ClassifiedRow;
    }
    if (email) seenEmail.set(email, n.submissionId ?? String(index));
    seenName.set(nameKey, n.submissionId ?? String(index));

    if (!email) messages.push('Missing email address.');
    if (!n.bookTitle) messages.push('Missing book title.');
    if (!n.bookCoverUrl) messages.push('No book cover uploaded.');
    if (!n.headshotUrl) messages.push('No headshot uploaded.');
    const incomplete = !email || !n.bookTitle;
    return { ...base, classification: incomplete ? 'incomplete' : 'new', decision: 'import', messages } satisfies ClassifiedRow;
  });
}
