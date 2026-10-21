import { supabase } from './supabase';
import { must } from './db';
import type { Guest, TableRow } from './types';
import type { GuestCategory, TableDesignation, TicketStatus } from '../../shared/types';

export const setTicketStatus = (eventId: string, guestId: string, status: TicketStatus, kind?: string | null) =>
  must(supabase.from('tickets').upsert({ event_id: eventId, guest_id: guestId, status, ...(kind !== undefined ? { kind } : {}) }, { onConflict: 'guest_id' }));

export async function recordCheckin(eventId: string, guestId: string, action: 'check_in' | 'check_out', method: 'staff' | 'qr' | 'correction' | 'exception' = 'staff', note?: string) {
  const { data: u } = await supabase.auth.getUser();
  return must(supabase.from('checkins').insert({ event_id: eventId, guest_id: guestId, action, method, note: note || null, created_by: u.user?.id }));
}

export const saveGuest = (id: string, patch: Partial<Guest>) => must(supabase.from('guests').update(patch).eq('id', id));

export async function createGuest(eventId: string, g: { full_name: string; display_name?: string; email?: string; category: GuestCategory; notes?: string; confirmed?: boolean }) {
  const rows = await must(supabase.from('guests').insert({
    event_id: eventId, full_name: g.full_name.trim(), display_name: (g.display_name || g.full_name).trim(),
    email: g.email?.trim().toLowerCase() || null, category: g.category, notes: g.notes || null, source: 'manual',
  }).select('id'));
  const id = rows![0].id as string;
  if (g.confirmed) await setTicketStatus(eventId, id, 'confirmed');
  return id;
}

export async function addCompanion(eventId: string, hostId: string, companion: { existingId?: string; full_name?: string; confirmed?: boolean }) {
  let id = companion.existingId;
  if (!id) id = await createGuest(eventId, { full_name: companion.full_name!, category: 'companion', confirmed: companion.confirmed });
  await must(supabase.from('companion_relationships').insert({ event_id: eventId, host_guest_id: hostId, companion_guest_id: id }));
  return id;
}
export const removeCompanion = (relId: string) => must(supabase.from('companion_relationships').delete().eq('id', relId));

export const seatGuests = (tableId: string, guestIds: string[]) => must(supabase.rpc('seat_guests', { p_table: tableId, p_guests: guestIds }));
export const unseatGuests = (guestIds: string[]) => must(supabase.rpc('unseat_guests', { p_guests: guestIds }));

export const createTable = (eventId: string, t: { number: number; capacity: number; designation: TableDesignation; label?: string; reserved_for?: string }) =>
  must(supabase.from('event_tables').insert({ event_id: eventId, ...t, label: t.label || null, reserved_for: t.reserved_for || null }));
export const updateTable = (id: string, patch: Partial<TableRow>) => must(supabase.from('event_tables').update(patch).eq('id', id));
export const deleteTable = (id: string) => must(supabase.from('event_tables').delete().eq('id', id));

export const addFlag = (eventId: string, guestId: string | null, kind: string, note: string) =>
  supabase.auth.getUser().then(({ data }) => must(supabase.from('staff_flags').insert({ event_id: eventId, guest_id: guestId, kind, note, created_by: data.user?.id })));
export const resolveFlag = (id: string) =>
  supabase.auth.getUser().then(({ data }) => must(supabase.from('staff_flags').update({ status: 'resolved', resolved_by: data.user?.id, resolved_at: new Date().toISOString() }).eq('id', id)));
export const setAssist = (id: string, status: 'open' | 'handling' | 'resolved') =>
  supabase.auth.getUser().then(({ data }) => must(supabase.from('assistance_requests').update({ status, ...(status === 'resolved' ? { resolved_by: data.user?.id, resolved_at: new Date().toISOString() } : {}) }).eq('id', id)));
