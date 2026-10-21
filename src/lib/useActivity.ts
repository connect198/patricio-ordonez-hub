import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AuditRow } from './types';

export function useActivity(eventId: string, limit = 12, entityId?: string) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const load = async () => {
      let q = supabase.from('audit_logs').select('id,event_id,actor_email,action,entity,entity_id,details,created_at').eq('event_id', eventId);
      if (entityId) q = q.eq('entity_id', entityId);
      const { data } = await q.order('id', { ascending: false }).limit(limit);
      if (live) { setRows((data as AuditRow[]) ?? []); setLoading(false); }
    };
    void load();
    const ch = supabase.channel(`audit-${eventId}-${entityId ?? 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `event_id=eq.${eventId}` }, () => void load())
      .subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
  }, [eventId, limit, entityId]);
  return { rows, loading };
}

const ENTITY: Record<string, string> = {
  guests: 'guest', tickets: 'ticket', event_tables: 'table', seating_assignments: 'seating', checkins: 'check-in', staff_flags: 'flag',
  assistance_requests: 'assistance request', companion_relationships: 'companion link', event_settings: 'experience settings',
  program_items: 'program', announcements: 'announcement', guest_credentials: 'credentials', import_runs: 'import', events: 'event', admin_accounts: 'team',
};
export function describe(r: AuditRow, names: (id: string | null) => string): string {
  const d = r.details ?? {};
  const what = ENTITY[r.entity] ?? r.entity;
  if (r.entity === 'checkins' && r.action === 'insert') return `${d.action === 'check_in' ? 'Checked in' : 'Checked out'} ${names(d.guest_id)}${d.method && d.method !== 'staff' ? ` (${d.method})` : ''}`;
  if (r.entity === 'seating_assignments') return r.action === 'delete' ? `Unseated ${names(d.guest_id)}` : `Seated ${names(d.guest_id)}`;
  if (r.entity === 'tickets') return `Ticket for ${names(d.guest_id)}: ${r.action === 'update' ? d.status?.to : d.status}`;
  if (r.entity === 'guests' && r.action === 'update') return `Edited ${names(r.entity_id)} — ${Object.keys(d).join(', ')}`;
  if (r.entity === 'import_runs' || r.action === 'import_applied') return r.action === 'import_applied' ? `Import applied (${d.created ?? 0} new, ${d.updated ?? 0} updated)` : `Import ${r.action}`;
  if (r.action === 'issue') return `Issued ${d.issued} guest credentials`;
  return `${r.action[0].toUpperCase()}${r.action.slice(1)} ${what}`;
}
