import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { fetchAll } from './db';
import type { Assignment, Assist, Companion, Flag, Guest, TableRow, Ticket } from './types';

type Key = 'guests' | 'tickets' | 'tables' | 'assignments' | 'companions' | 'flags' | 'assists';
const TABLE_OF: Record<Key, string> = { guests: 'guests', tickets: 'tickets', tables: 'event_tables', assignments: 'seating_assignments', companions: 'companion_relationships', flags: 'staff_flags', assists: 'assistance_requests' };

export interface Stats {
  total: number; confirmed: number; checkedIn: number; awaiting: number; tablesAssigned: number; seated: number; unassigned: number;
  seatsTotal: number; seatsRemaining: number; companions: number; openFlags: number; openAssists: number; checkedInCompanions: number;
}
export interface Issue { id: string; severity: 'high' | 'medium'; text: string; guestId?: string; tableId?: string }

interface Data {
  ready: boolean; error: string | null; live: boolean;
  guests: Guest[]; tickets: Ticket[]; tables: TableRow[]; assignments: Assignment[]; companions: Companion[]; flags: Flag[]; assists: Assist[];
  guestById: Map<string, Guest>; tableById: Map<string, TableRow>; assignByGuest: Map<string, Assignment>; ticketByGuest: Map<string, Ticket>;
  guestsAtTable: (tableId: string) => Guest[]; companionsOf: (guestId: string) => Guest[]; hostOf: (guestId: string) => Guest | undefined;
  stats: Stats; issues: Issue[]; refresh: (k?: Key) => Promise<void>;
}
const Ctx = createContext<Data | null>(null);
export const useEventData = () => { const c = useContext(Ctx); if (!c) throw new Error('useEventData outside provider'); return c; };

export function EventDataProvider({ eventId, children }: { eventId: string; children: ReactNode }) {
  const [state, setState] = useState<Record<Key, any[]>>({ guests: [], tickets: [], tables: [], assignments: [], companions: [], flags: [], assists: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timers = useRef<Partial<Record<Key, number>>>({});

  const load = useCallback(async (k: Key) => {
    const t = TABLE_OF[k];
    const rows = await fetchAll<any>((from, to) => {
      let q = supabase.from(t).select('*').eq('event_id', eventId);
      if (k === 'flags' || k === 'assists') q = q.neq('status', 'resolved');
      if (k === 'tables') q = q.order('number');
      else q = q.order('id');
      return q.range(from, to);
    });
    setState((s) => ({ ...s, [k]: rows }));
  }, [eventId]);

  const refresh = useCallback(async (k?: Key) => {
    try {
      setError(null);
      await Promise.all((k ? [k] : (Object.keys(TABLE_OF) as Key[])).map(load));
      setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load event data.'); }
  }, [load]);

  useEffect(() => {
    setReady(false);
    void refresh();
    const ch = supabase.channel(`event-${eventId}`);
    (Object.keys(TABLE_OF) as Key[]).forEach((k) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: TABLE_OF[k], filter: `event_id=eq.${eventId}` }, () => {
        window.clearTimeout(timers.current[k]);
        timers.current[k] = window.setTimeout(() => { void load(k).catch(() => {}); }, 250);
      });
    });
    ch.subscribe((status) => setLive(status === 'SUBSCRIBED'));
    // Safety net for flaky venue networks: reconcile every 60s and when the tab regains focus.
    const poll = window.setInterval(() => { void refresh(); }, 60_000);
    const vis = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', vis);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); document.removeEventListener('visibilitychange', vis); Object.values(timers.current).forEach((t) => window.clearTimeout(t)); };
  }, [eventId, refresh, load]);

  const value = useMemo<Data>(() => {
    const guests = state.guests as Guest[]; const tables = state.tables as TableRow[]; const assignments = state.assignments as Assignment[];
    const tickets = state.tickets as Ticket[]; const companions = state.companions as Companion[];
    const guestById = new Map(guests.map((g) => [g.id, g]));
    const tableById = new Map(tables.map((t) => [t.id, t]));
    const assignByGuest = new Map(assignments.map((a) => [a.guest_id, a]));
    const ticketByGuest = new Map(tickets.map((t) => [t.guest_id, t]));
    const byTable = new Map<string, Guest[]>();
    for (const a of assignments) { const g = guestById.get(a.guest_id); if (g) (byTable.get(a.table_id) ?? byTable.set(a.table_id, []).get(a.table_id)!).push(g); }
    const companionsOf = (id: string) => companions.filter((c) => c.host_guest_id === id).map((c) => guestById.get(c.companion_guest_id)).filter(Boolean) as Guest[];
    const hostOf = (id: string) => { const c = companions.find((x) => x.companion_guest_id === id); return c ? guestById.get(c.host_guest_id) : undefined; };

    const confirmed = guests.filter((g) => g.is_confirmed);
    const seated = confirmed.filter((g) => assignByGuest.has(g.id));
    const seatsTotal = tables.reduce((n, t) => n + t.capacity, 0);
    const companionIds = new Set(companions.map((c) => c.companion_guest_id));
    const stats: Stats = {
      total: guests.length, confirmed: confirmed.length, checkedIn: confirmed.filter((g) => g.checked_in_at).length,
      awaiting: confirmed.filter((g) => !g.checked_in_at).length, tablesAssigned: new Set(assignments.map((a) => a.table_id)).size,
      seated: seated.length, unassigned: confirmed.length - seated.length, seatsTotal, seatsRemaining: Math.max(0, seatsTotal - assignments.length),
      companions: companions.length, openFlags: state.flags.length, openAssists: state.assists.length,
      checkedInCompanions: guests.filter((g) => companionIds.has(g.id) && g.checked_in_at).length,
    };

    const issues: Issue[] = [];
    for (const g of confirmed) {
      if (!assignByGuest.has(g.id)) issues.push({ id: `u${g.id}`, severity: g.checked_in_at ? 'high' : 'medium', guestId: g.id, text: `${g.display_name || g.full_name} is ${g.checked_in_at ? 'checked in but ' : ''}confirmed without a table.` });
    }
    for (const a of assignments) {
      const g = guestById.get(a.guest_id);
      if (g && !g.is_confirmed) issues.push({ id: `n${g.id}`, severity: 'medium', guestId: g.id, text: `${g.display_name || g.full_name} has a table but no confirmed ticket.` });
    }
    for (const t of tables) {
      const used = byTable.get(t.id)?.length ?? 0;
      if (used > t.capacity) issues.push({ id: `o${t.id}`, severity: 'high', tableId: t.id, text: `Table ${t.number} is over capacity (${used}/${t.capacity}).` });
    }
    for (const c of companions) {
      const h = assignByGuest.get(c.host_guest_id); const k = assignByGuest.get(c.companion_guest_id);
      if (h && k && h.table_id !== k.table_id) issues.push({ id: `c${c.id}`, severity: 'medium', guestId: c.companion_guest_id, text: `${guestById.get(c.companion_guest_id)?.full_name} is seated apart from their host.` });
    }
    return { ready, error, live, guests, tickets, tables, assignments, companions, flags: state.flags as Flag[], assists: state.assists as Assist[], guestById, tableById, assignByGuest, ticketByGuest, guestsAtTable: (id) => byTable.get(id) ?? [], companionsOf, hostOf, stats, issues, refresh };
  }, [state, ready, error, live, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
