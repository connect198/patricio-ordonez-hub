// Types and defaults shared by the browser app and Netlify Functions.

export type GuestCategory = 'finalist' | 'vip' | 'distinguished' | 'speaker' | 'sponsor' | 'companion' | 'general';
export type TicketStatus = 'none' | 'interested' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
export type TableDesignation = 'general' | 'reserved' | 'vip' | 'sponsor' | 'speaker' | 'finalist' | 'staff';
export type StaffRole = 'owner' | 'manager' | 'staff';

export const CATEGORIES: { value: GuestCategory; label: string }[] = [
  { value: 'finalist', label: 'Finalist' },
  { value: 'vip', label: 'VIP Guest' },
  { value: 'distinguished', label: 'Distinguished Guest' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'companion', label: 'Companion' },
  { value: 'general', label: 'General Attendee' },
];
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const DESIGNATIONS: { value: TableDesignation; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'vip', label: 'VIP' },
  { value: 'finalist', label: 'Finalists' },
  { value: 'speaker', label: 'Speakers' },
  { value: 'sponsor', label: 'Sponsors' },
  { value: 'staff', label: 'Staff / Hosts' },
];

export interface GreetingConfig {
  headline: string; // tokens: {firstName} {lastName} {displayName}
  subline: string;
}

export interface EventSettings {
  welcome: {
    arrivalHeadline: string;
    arrivalSubheadline: string;
    beginLabel: string;
    nameHeadline: string;
    nameHelp: string;
    tableLabel: string;
    bookMessage: string;
    unconfirmedMessage: string;
    assistanceMessage: string;
  };
  greetings: Record<GuestCategory, GreetingConfig>;
  celebrations: { enabled: boolean };
  bookRecognition: { enabled: boolean };
  music: { enabled: boolean; url: string; title: string };
  logoUrl: string;
  artworkUrl: string;
  verification: { allowEmail: boolean; allowCode: boolean };
  managerContact: { name: string; phone: string; email: string };
  info: { ballroomNote: string; directions: string };
}

export const DEFAULT_SETTINGS: EventSettings = {
  welcome: {
    arrivalHeadline: 'Your Royal Evening Awaits.',
    arrivalSubheadline: 'Welcome to the {eventName}.',
    beginLabel: 'Begin Your Experience',
    nameHeadline: 'May We Have Your Name?',
    nameHelp: 'Enter your name and the private code or registration email from your invitation.',
    tableLabel: 'YOUR TABLE',
    bookMessage: 'Tonight, your story is part of something extraordinary.',
    unconfirmedMessage:
      'We are delighted to have found you. Your seat is still being prepared — please see a member of our concierge team and they will take wonderful care of you.',
    assistanceMessage: 'A member of our concierge team is on the way to you.',
  },
  greetings: {
    finalist: { headline: 'Welcome, {firstName}!', subline: 'Tonight, we celebrate you.' },
    vip: { headline: 'Welcome, {firstName}.', subline: 'It is an honor to celebrate with you this evening.' },
    distinguished: { headline: 'Welcome, Distinguished Guest.', subline: 'It is an honor to celebrate with you this evening.' },
    speaker: { headline: 'Welcome, {firstName}.', subline: 'Thank you for lending your voice to this evening.' },
    sponsor: { headline: 'Welcome, {firstName}.', subline: 'Your generosity helps make tonight possible. Thank you.' },
    companion: { headline: 'Welcome, {firstName}!', subline: 'We are delighted you are here to celebrate with us.' },
    general: { headline: 'Welcome, {firstName}!', subline: 'Tonight, we celebrate you.' },
  },
  celebrations: { enabled: true },
  bookRecognition: { enabled: true },
  music: { enabled: false, url: '', title: '' },
  logoUrl: '',
  artworkUrl: '',
  verification: { allowEmail: true, allowCode: true },
  managerContact: { name: '', phone: '', email: '' },
  info: { ballroomNote: '', directions: '' },
};

/** Deep-merge saved settings over defaults so new keys always have a value. */
export function mergeSettings(saved: unknown): EventSettings {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as EventSettings;
  const merge = (a: any, b: any): any => {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = k in a && typeof a[k] === 'object' && a[k] !== null ? merge(a[k], b[k]) : b[k];
    return out;
  };
  return merge(base, saved ?? {}) as EventSettings;
}

export function fillGreeting(tpl: string, g: { firstName?: string; lastName?: string; displayName?: string }) {
  return tpl
    .replaceAll('{firstName}', g.firstName ?? '')
    .replaceAll('{lastName}', g.lastName ?? '')
    .replaceAll('{displayName}', g.displayName ?? g.firstName ?? '')
    .replace(/\s+([!.,])/g, '$1')
    .trim();
}

/** Payload shape returned by the public verification endpoint — the ONLY guest data the public ever receives. */
export interface VerifiedGuestView {
  firstName: string;
  lastName: string;
  displayName: string;
  category: GuestCategory;
  confirmed: boolean;
  table: { number: number; label: string | null; designation: TableDesignation } | null;
  book: { title: string; coverUrl: string | null } | null;
  isDemo: boolean;
}

export interface PublicEvent {
  slug: string;
  name: string;
  tagline: string | null;
  eventDate: string | null;
  venue: string | null;
  city: string | null;
  isDemo: boolean;
  settings: EventSettings;
  program: { id: string; time: string; title: string; description: string | null }[];
  announcements: { id: string; title: string; body: string | null; pinned: boolean }[];
  tables: { number: number; label: string | null; designation: TableDesignation; x: number | null; y: number | null }[];
}
