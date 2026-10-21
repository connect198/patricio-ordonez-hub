// Backend-less PREVIEW of the guest experience (VITE_DEMO_PREVIEW=true). Sample data only — every screen is labelled DEMO.
import { mergeSettings, type PublicEvent, type VerifiedGuestView } from '../../shared/types';
import { nameMatchesAll } from '../../shared/names';

const people = [
  { name: 'George Vasquez', email: 'george.vasquez@demo.invalid', table: 13, category: 'general' as const },
  { name: 'Maria Rodriguez', email: 'maria.rodriguez@demo.invalid', table: 5, category: 'vip' as const },
  { name: 'David Thompson', email: 'david.thompson@demo.invalid', table: 8, category: 'finalist' as const },
];

export const demoEvent = async (slug: string): Promise<PublicEvent> => ({
  slug,
  name: 'DEMO — Kingdom Book Awards Gala 2026',
  tagline: 'Every Guest. Honored. Every Moment. Extraordinary.',
  eventDate: '2026-11-17',
  venue: 'Marriott Orlando Downtown',
  city: 'Orlando, Florida',
  isDemo: true,
  settings: mergeSettings({ music: { enabled: false } }),
  program: [
    { id: '1', time: '5:30 PM', title: 'Doors & Reception', description: 'Arrive, be welcomed, and find your table.' },
    { id: '2', time: '6:30 PM', title: 'Dinner Service', description: null },
    { id: '3', time: '7:30 PM', title: 'Awards Ceremony', description: 'Honoring this year’s finalists.' },
  ],
  announcements: [{ id: 'a', title: 'Demonstration announcement', body: 'Announcements published by the Experience Director appear here.', pinned: true }],
  tables: Array.from({ length: 16 }, (_, i) => ({ number: i + 1, label: null, designation: 'general' as const, x: null, y: null })),
});

export async function demoVerify(p: { name?: string; secret?: string }): Promise<{ ok: true; guest: VerifiedGuestView }> {
  await new Promise((r) => setTimeout(r, 500));
  const hit = people.find((x) => nameMatchesAll(p.name ?? '', [x.name]) && x.email === (p.secret ?? '').trim().toLowerCase());
  if (!hit) throw Object.assign(new Error('We could not verify those details. Please check them and try again, or ask a member of our concierge team for assistance.'), { status: 401, code: 'NOT_VERIFIED' });
  const [first, last] = hit.name.split(' ');
  return {
    ok: true,
    guest: {
      firstName: first, lastName: last, displayName: hit.name, category: hit.category, confirmed: true,
      table: { number: hit.table, label: null, designation: 'general' }, book: null, isDemo: true,
    },
  };
}
