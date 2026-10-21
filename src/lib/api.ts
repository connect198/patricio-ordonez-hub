import type { PublicEvent, VerifiedGuestView } from '../../shared/types';
import { DEMO_PREVIEW } from './config';
import { demoEvent, demoVerify } from './demo';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.auth) {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set('authorization', `Bearer ${data.session.access_token}`);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'We could not reach the server. Please check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'ERROR', data?.message ?? 'Something went wrong. Please try again.');
  return data as T;
}

const post = (path: string, body: unknown, auth = false) => call<any>(path, { method: 'POST', body: JSON.stringify(body), auth });

// ───────── Public guest experience ─────────
export async function fetchPublicEvent(slug: string): Promise<PublicEvent> {
  if (DEMO_PREVIEW) return demoEvent(slug);
  return call<PublicEvent>(`/api/event?slug=${encodeURIComponent(slug)}`);
}

export async function verifyGuest(p: { slug: string; name?: string; secret?: string; token?: string; website?: string }) {
  if (DEMO_PREVIEW) return demoVerify(p);
  return post('/api/verify', p) as Promise<{ ok: true; guest: VerifiedGuestView }>;
}

export const requestAssistance = (p: { slug: string; name?: string; message?: string; token?: string; website?: string }) =>
  DEMO_PREVIEW ? Promise.resolve({ ok: true }) : (post('/api/assist', p) as Promise<{ ok: true }>);

// ───────── Staff / admin ─────────
export interface IssuedCredential { guestId: string; name: string; code: string; url: string }
export const issueCredentials = (p: { eventId: string; scope?: 'confirmed' | 'ids'; guestIds?: string[]; regenerate?: boolean }) =>
  post('/api/credentials/issue', p, true) as Promise<{ issued: IssuedCredential[]; skipped: number }>;
export const resolveCredential = (p: { eventId: string; value: string }) =>
  post('/api/credentials/resolve', p, true) as Promise<{ guestId: string }>;
export const stageImport = (p: { eventId: string; source: 'jotform_api' | 'csv'; rows?: Record<string, string>[]; fileName?: string }) =>
  post('/api/import/stage', p, true) as Promise<{ runId: string; counts: Record<string, number> }>;
export const applyImport = (runId: string) =>
  post('/api/import/apply', { runId }, true) as Promise<{ created: number; updated: number; merged: number; skipped: number; failed: number; errors: string[] }>;
export const serverStatus = () => call<{ jotform: boolean; credentials: boolean; siteUrl: string | null; formId: string | null }>('/api/status', { auth: true });
export const inviteStaff = (p: { email: string; displayName?: string; role: string; eventIds?: string[] | null }) => post('/api/team/invite', p, true);
