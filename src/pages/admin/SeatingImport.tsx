import { useState } from 'react';
import Papa from 'papaparse';
import { nameTokens } from '../../../shared/names';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { createTable, seatGuests } from '../../lib/actions';
import { supabase } from '../../lib/supabase';
import { friendly } from '../../lib/db';
import type { Guest } from '../../lib/types';
import { Badge, Button, Field, Input, Modal } from '../../components/ui';
import { useToast } from '../../components/Toast';

interface Plan { matched: { guest: Guest; table: number }[]; unmatched: string[]; ambiguous: string[]; badTable: string[] }

const pick = (row: Record<string, string>, test: RegExp) => Object.entries(row).find(([k]) => test.test(k.trim().toLowerCase()))?.[1]?.trim() ?? '';

/** Load an existing seating chart (name/email + table number) from a spreadsheet instead of retyping it. */
export function SeatingImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { event } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [capacity, setCapacity] = useState(10);
  const [confirmAttendance, setConfirmAttendance] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => { setPlan(null); onClose(); };

  const build = (rows: Record<string, string>[]) => {
    const byEmail = new Map(d.guests.filter((g) => g.email).map((g) => [g.email!.toLowerCase(), g]));
    const byName = new Map<string, Guest[]>();
    for (const g of d.guests) for (const n of [g.full_name, g.display_name]) { if (!n) continue; const k = nameTokens(n).join(' '); byName.set(k, [...(byName.get(k) ?? []), g]); }
    const out: Plan = { matched: [], unmatched: [], ambiguous: [], badTable: [] };
    const seen = new Set<string>();
    for (const r of rows) {
      const label = pick(r, /^(full )?name|guest/) || [pick(r, /^first/), pick(r, /^last/)].filter(Boolean).join(' ') || pick(r, /email/);
      const tbl = parseInt(pick(r, /^table/), 10);
      if (!label) continue;
      if (!Number.isInteger(tbl) || tbl < 1) { out.badTable.push(label); continue; }
      const email = pick(r, /email/).toLowerCase();
      let g = email ? byEmail.get(email) : undefined;
      if (!g) {
        const hits = Array.from(new Set(byName.get(nameTokens(label).join(' ')) ?? []));
        if (hits.length > 1) { out.ambiguous.push(label); continue; }
        g = hits[0];
      }
      if (!g) { out.unmatched.push(label); continue; }
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.matched.push({ guest: g, table: tbl });
    }
    setPlan(out);
  };

  const onFile = (f?: File) => f && Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: true, complete: (r) => build(r.data), error: () => toast('Could not read that CSV.', 'error') });

  const apply = async () => {
    if (!plan) return; setBusy(true);
    const errors: string[] = [];
    try {
      const tables = new Map(d.tables.map((t) => [t.number, t.id]));
      for (const n of Array.from(new Set(plan.matched.map((m) => m.table))).sort((a, b) => a - b)) {
        if (!tables.has(n)) await createTable(event!.id, { number: n, capacity, designation: 'general' });
      }
      const { data: all } = await supabase.from('event_tables').select('id,number').eq('event_id', event!.id);
      const idOf = new Map((all ?? []).map((t) => [t.number as number, t.id as string]));
      if (confirmAttendance) {
        const need = plan.matched.filter((m) => !m.guest.is_confirmed).map((m) => ({ event_id: event!.id, guest_id: m.guest.id, status: 'confirmed' }));
        if (need.length) { const { error } = await supabase.from('tickets').upsert(need, { onConflict: 'guest_id' }); if (error) throw error; }
      }
      const groups = new Map<number, string[]>();
      for (const m of plan.matched) { if (!m.guest.is_confirmed && !confirmAttendance) { errors.push(`${m.guest.full_name} is not confirmed`); continue; } groups.set(m.table, [...(groups.get(m.table) ?? []), m.guest.id]); }
      for (const [n, ids] of groups) {
        try { await seatGuests(idOf.get(n)!, ids); } catch (e) { errors.push(`Table ${n}: ${friendly(e)}`); }
      }
      await d.refresh();
      toast(errors.length ? `Seated with ${errors.length} problem(s): ${errors[0]}` : `Seated ${plan.matched.length} guests`, errors.length ? 'error' : 'ok');
      if (!errors.length) reset();
    } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={reset} title="Import a seating chart" wide>
      <div className="grid gap-4">
        <p className="text-sm text-ivory/70">Upload a CSV with a <b>table</b> column and either a <b>name</b> (or first/last name) or an <b>email</b> column. Guests are matched to your imported records; nobody is invented. Missing tables are created.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CSV file" htmlFor="sf"><input id="sf" type="file" accept=".csv,text/csv" className="input" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
          <Field label="Capacity for any new tables" htmlFor="sc"><Input id="sc" type="number" min={1} max={60} value={capacity} onChange={(e) => setCapacity(+e.target.value)} /></Field>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#D4AF37]" checked={confirmAttendance} onChange={(e) => setConfirmAttendance(e.target.checked)} /> Mark matched guests as attendance-confirmed (only confirmed guests can hold a seat). Leave on only if this chart lists confirmed attendees.</label>
        {plan && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2"><Badge tone="ok">{plan.matched.length} matched</Badge><Badge tone={plan.unmatched.length ? 'warn' : 'mute'}>{plan.unmatched.length} not found</Badge><Badge tone={plan.ambiguous.length ? 'warn' : 'mute'}>{plan.ambiguous.length} ambiguous</Badge><Badge tone={plan.badTable.length ? 'warn' : 'mute'}>{plan.badTable.length} bad table #</Badge></div>
            {[['Not found in guest records (import them first, or fix the spelling)', plan.unmatched], ['More than one guest with that name (add an email column)', plan.ambiguous], ['Table is not a positive number', plan.badTable]].map(([t, list]) => (list as string[]).length > 0 && <details key={t as string} className="rounded-xl border border-ivory/10 p-3 text-sm"><summary className="cursor-pointer text-amber-200">{t as string}</summary><ul className="mt-2 grid max-h-40 gap-0.5 overflow-y-auto">{(list as string[]).map((n, i) => <li key={i}>{n}</li>)}</ul></details>)}
            <details className="rounded-xl border border-ivory/10 p-3 text-sm"><summary className="cursor-pointer">Preview matches</summary><ul className="mt-2 grid max-h-48 gap-0.5 overflow-y-auto">{plan.matched.map((m) => <li key={m.guest.id}>{m.guest.full_name} → Table {m.table}</li>)}</ul></details>
            <div className="flex justify-end"><Button variant="gold" busy={busy} disabled={!plan.matched.length} onClick={apply}>Seat {plan.matched.length} guests</Button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
