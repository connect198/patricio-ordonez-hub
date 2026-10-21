import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.CREDENTIAL_PEPPER = 'x'.repeat(40);
process.env.RATE_LIMIT_SALT = 'salt';

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let rlAllowed = true;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const q: any = {
    select: () => q,
    update: (p: Row) => { patch = p; return q; },
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
    is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: any) => { if (patch) run().forEach((r) => Object.assign(r, patch)); return Promise.resolve({ data: run(), error: null }).then(res); },
  };
  return q;
}
vi.mock('../netlify/functions/_lib/supabase', () => ({
  admin: () => ({ from: query, rpc: async () => ({ data: rlAllowed, error: null }) }),
  env: (n: string) => process.env[n],
}));

const { default: verify } = await import('../netlify/functions/guest-verify');
const { hashCode, hashToken } = await import('../netlify/functions/_lib/creds');

const call = (body: any) => verify(new Request('http://x/api/verify', { method: 'POST', body: JSON.stringify(body) }), { ip: '1.2.3.4' } as any);

beforeEach(() => {
  rlAllowed = true;
  db.events = [{ id: 'e1', slug: 'gala', name: 'Gala', is_demo: false, status: 'live' }];
  db.event_settings = [];
  db.guests = [
    { id: 'g1', event_id: 'e1', full_name: 'José Núñez', display_name: 'José Núñez', first_name: 'José', category: 'finalist', is_confirmed: true, email: 'jose@x.io', book_title: 'My Book', book_cover_url: 'https://www.jotform.com/uploads/c.jpg', marketing_permission: true, is_demo: false },
    { id: 'g2', event_id: 'e1', full_name: 'Ann Lee', display_name: 'Ann Lee', first_name: 'Ann', category: 'general', is_confirmed: false, email: 'ann@x.io', book_title: null, book_cover_url: null, marketing_permission: false, is_demo: false },
    { id: 'g3', event_id: 'e1', full_name: 'Bo Ray', display_name: 'Bo Ray', first_name: 'Bo', category: 'finalist', is_confirmed: true, email: 'bo@x.io', book_title: 'Hidden', book_cover_url: 'https://evil.example.com/c.jpg', marketing_permission: false, is_demo: false },
  ];
  db.event_tables = [{ id: 't1', number: 13, label: null, designation: 'general' }];
  db.seating_assignments = [{ guest_id: 'g1', event_tables: { number: 13, label: null, designation: 'general' } }, { guest_id: 'g3', event_tables: { number: 5, label: null, designation: 'general' } }];
  db.guest_credentials = [{ id: 'c1', event_id: 'e1', guest_id: 'g1', token_hash: hashToken('TOKEN_TOKEN_TOKEN_TOKEN_1'), code_hash: hashCode('K7QM-4TXD'), revoked_at: null }];
});

describe('guest verification', () => {
  it('verifies with name + private code (accent/partial tolerant) and reveals the table + book', async () => {
    const r = await call({ slug: 'gala', name: 'jose nunez', secret: 'k7qm 4txd' });
    const j: any = await r.json();
    expect(r.status).toBe(200);
    expect(j.guest.table.number).toBe(13);
    expect(j.guest.firstName).toBe('José');
    expect(j.guest.book.title).toBe('My Book');
    expect(JSON.stringify(j)).not.toContain('jose@x.io'); // private fields never leave the server
  });
  it('verifies with name + registration email', async () => {
    const r = await call({ slug: 'gala', name: 'Jose', secret: 'JOSE@x.io' });
    expect(r.status).toBe(200);
  });
  it('verifies by personal QR token', async () => {
    const r = await call({ slug: 'gala', token: 'TOKEN_TOKEN_TOKEN_TOKEN_1' });
    expect((await r.json() as any).guest.displayName).toBe('José Núñez');
  });
  it('rejects a wrong code, wrong name, and wrong email with the same generic error', async () => {
    const bad = await Promise.all([
      call({ slug: 'gala', name: 'jose nunez', secret: 'AAAA-AAAA' }),
      call({ slug: 'gala', name: 'Someone Else', secret: 'K7QM-4TXD' }),
      call({ slug: 'gala', name: 'Jose Nunez', secret: 'nobody@x.io' }),
    ]);
    const bodies = await Promise.all(bad.map((r) => r.json() as Promise<any>));
    bad.forEach((r) => expect(r.status).toBe(401));
    expect(new Set(bodies.map((b) => b.message)).size).toBe(1);
  });
  it('never reveals a table for unconfirmed guests', async () => {
    const r = await call({ slug: 'gala', name: 'Ann Lee', secret: 'ann@x.io' });
    const j: any = await r.json();
    expect(j.guest.confirmed).toBe(false);
    expect(j.guest.table).toBeNull();
  });
  it('hides the book when permission is missing or the image host is untrusted', async () => {
    const r = await call({ slug: 'gala', name: 'Bo Ray', secret: 'bo@x.io' });
    expect((await r.json() as any).guest.book).toBeNull();
  });
  it('rejects revoked credentials', async () => {
    db.guest_credentials[0].revoked_at = '2026-01-01';
    expect((await call({ slug: 'gala', token: 'TOKEN_TOKEN_TOKEN_TOKEN_1' })).status).toBe(401);
    expect((await call({ slug: 'gala', name: 'jose', secret: 'K7QM-4TXD' })).status).toBe(401);
  });
  it('respects rate limiting', async () => {
    rlAllowed = false;
    expect((await call({ slug: 'gala', name: 'jose nunez', secret: 'K7QM-4TXD' })).status).toBe(429);
  });
  it('ignores honeypot submissions and draft events', async () => {
    expect((await call({ slug: 'gala', name: 'jose nunez', secret: 'K7QM-4TXD', website: 'http://spam' })).status).toBe(401);
    db.events[0].status = 'draft';
    expect((await call({ slug: 'gala', name: 'jose nunez', secret: 'K7QM-4TXD' })).status).toBe(404);
  });
  it('does not allow listing: name alone never works', async () => {
    expect((await call({ slug: 'gala', name: 'Jose Nunez' })).status).toBe(401);
  });
});
