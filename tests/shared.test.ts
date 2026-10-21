import { describe, expect, it } from 'vitest';
import { nameMatchesAll, nameScore, normalizeName, rankByName } from '../shared/names';
import { classifyRows, normalizeApiSubmission, normalizeCsvRow, toGuestColumns } from '../shared/jotform';
import { fillGreeting, mergeSettings } from '../shared/types';

describe('name matching', () => {
  it('ignores accents, case and punctuation', () => {
    expect(normalizeName("José  O’Brien-Núñez")).toBe('jose obrien nunez');
    expect(nameMatchesAll('jose nunez', ['José Núñez'])).toBe(true);
  });
  it('supports partial and slightly misspelled names', () => {
    expect(nameMatchesAll('geo vas', ['George Vasquez'])).toBe(true);
    expect(nameMatchesAll('Jorge Vazquez', ['George Vasquez'])).toBe(true);
    expect(nameMatchesAll('Jon Smith', ['George Vasquez'])).toBe(false);
    expect(nameMatchesAll('Georgee Vasquez', ['George Vasquez'])).toBe(true);
    expect(nameMatchesAll('Maria', ['Dr. Maria Rodriguez'])).toBe(true);
  });
  it('does not match unrelated names', () => {
    expect(nameScore('David Thompson', ['Maria Rodriguez'])).toBe(0);
  });
  it('ranks results', () => {
    const r = rankByName(['Maria Rodriguez', 'David Thompson'], 'thomp', (x) => [x]);
    expect(r).toEqual(['David Thompson']);
  });
});

const api = (id: string, name: string, email: string) => ({
  id,
  created_at: '2026-06-28 10:00:00',
  answers: {
    '3': { text: 'Full Name', type: 'control_fullname', answer: { first: name.split(' ')[0], last: name.split(' ')[1] } },
    '4': { text: 'Name to be Printed on Official Finalist Certificate', answer: `Dr. ${name}` },
    '6': { text: 'Exact Book Title as It Should Be Displayed', answer: 'The Book' },
    '7': { text: 'Email Address for Finalist Communications', answer: email },
    '19': { text: 'High-resolution book cover image', answer: ['https://www.jotform.com/uploads/x/cover.jpg'] },
    '21': { text: 'Are you planning to attend the Kingdom Book Awards Gala? (November 17th- Orlando, FL)', answer: 'Yes' },
    '29': { text: 'Permission to use submitted photos, information, and book cover for Kingdom Book Awards marketing', answer: ['I give permission'] },
    '39': { text: 'If you submitted a second book, please write the exact book title as it should be displayed.', answer: 'Book Two' },
  },
});

describe('jotform normalisation', () => {
  it('maps API answers', () => {
    const n = normalizeApiSubmission(api('111', 'Jane Smith', 'Jane@Example.com'));
    expect(n.submissionId).toBe('111');
    expect(n.fullName).toBe('Jane Smith');
    expect(n.displayName).toBe('Dr. Jane Smith');
    expect(n.email).toBe('jane@example.com');
    expect(n.bookTitle).toBe('The Book');
    expect(n.additionalTitles).toEqual(['Book Two']);
    expect(n.bookCoverUrl).toContain('cover.jpg');
    expect(n.marketingPermission).toBe(true);
    expect(toGuestColumns(n).first_name).toBe('Jane');
  });
  it('maps CSV rows', () => {
    const n = normalizeCsvRow({ 'Submission ID': '5', 'Full Name': 'ANA LOPEZ', 'Email Address for Finalist Communications': 'ana@x.com', 'Exact Book Title as It Should Be Displayed': 'T' });
    expect(n.fullName).toBe('Ana Lopez');
    expect(n.submissionId).toBe('5');
  });
});

describe('import classification', () => {
  const existing = [{ id: 'g1', jotform_submission_id: '111', full_name: 'Jane Smith', email: 'jane@example.com', book_title: 'Old Title' }];
  it('detects new, updated, duplicate, incomplete, error', () => {
    const rows = [
      normalizeApiSubmission(api('111', 'Jane Smith', 'jane@example.com')), // updated (title)
      normalizeApiSubmission(api('222', 'Bob Jones', 'bob@example.com')), // new
      normalizeApiSubmission(api('333', 'Jane Smith', 'jane@example.com')), // duplicate
      { ...normalizeApiSubmission(api('444', 'Cy Young', '')), email: '' }, // incomplete
      { ...normalizeApiSubmission(api('555', 'X Y', 'x@y.com')), fullName: '' }, // error
      normalizeApiSubmission(api('222', 'Bob Jones', 'bob2@example.com')), // dup submission id → error
    ];
    const out = classifyRows(rows, existing);
    expect(out.map((r) => r.classification)).toEqual(['updated', 'new', 'duplicate', 'incomplete', 'error', 'error']);
    expect(out[0].matchedGuestId).toBe('g1');
    expect(out[2].decision).toBe('skip');
  });
  it('never includes staff-managed columns in imports', () => {
    const cols = Object.keys(toGuestColumns(normalizeApiSubmission(api('1', 'A B', 'a@b.com'))));
    for (const forbidden of ['category', 'notes', 'flagged', 'is_confirmed', 'table_id', 'checked_in_at']) {
      expect(cols).not.toContain(forbidden);
    }
  });
});

describe('settings', () => {
  it('merges over defaults and fills greetings', () => {
    const s = mergeSettings({ greetings: { vip: { headline: 'Hello {firstName}' } } });
    expect(s.greetings.vip.subline).toContain('honor');
    expect(fillGreeting(s.greetings.vip.headline, { firstName: 'Ana' })).toBe('Hello Ana');
    expect(s.welcome.beginLabel).toBe('Begin Your Experience');
  });
});
