import { useMemo, useState } from 'react';
import { CATEGORIES, categoryLabel, type GuestCategory } from '../../../shared/types';
import { rankByName } from '../../../shared/names';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { createGuest } from '../../lib/actions';
import { friendly } from '../../lib/db';
import { Badge, Button, Empty, Field, Input, Modal, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { downloadCsv } from '../../lib/utils';
import { GuestDrawer } from './GuestDrawer';

export default function Guests() {
  const { event, isManager } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [ticket, setTicket] = useState('');
  const [seat, setSeat] = useState('');
  const [arrival, setArrival] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(100);

  const rows = useMemo(() => {
    let list = d.guests;
    const text = q.trim();
    if (text) {
      const lc = text.toLowerCase();
      const byText = list.filter((g) => (g.email ?? '').toLowerCase().includes(lc) || (g.book_title ?? '').toLowerCase().includes(lc) || g.jotform_submission_id === text);
      const byName = rankByName(list, text, (g) => [g.full_name, g.display_name]);
      list = Array.from(new Set([...byName, ...byText]));
    } else list = [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));
    return list.filter((g) =>
      (!cat || g.category === cat) &&
      (!ticket || (ticket === 'confirmed' ? g.is_confirmed : !g.is_confirmed)) &&
      (!seat || (seat === 'assigned' ? d.assignByGuest.has(g.id) : g.is_confirmed && !d.assignByGuest.has(g.id))) &&
      (!arrival || (arrival === 'in' ? !!g.checked_in_at : g.is_confirmed && !g.checked_in_at)) &&
      (!flagged || g.flagged));
  }, [d.guests, d.assignByGuest, q, cat, ticket, seat, arrival, flagged]);

  const exportCsv = () => {
    downloadCsv(`${event!.slug}-guests.csv`, rows.map((g) => ({
      full_name: g.full_name, display_name: g.display_name, email: g.email, phone: g.phone, category: categoryLabel(g.category),
      confirmed: g.is_confirmed ? 'yes' : 'no', table: d.tableById.get(d.assignByGuest.get(g.id)?.table_id ?? '')?.number ?? '',
      checked_in_at: g.checked_in_at ?? '', book_title: g.book_title, dietary: g.dietary, accessibility: g.accessibility,
      companion_of: d.hostOf(g.id)?.full_name ?? '', jotform_submission_id: g.jotform_submission_id, notes: g.notes,
    })));
    toast(`Exported ${rows.length} guests`);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-4xl">Guests</h1><p className="text-ivory/60">{rows.length} of {d.guests.length} records</p></div>
        <div className="flex gap-2">
          <Button onClick={exportCsv}>Export CSV</Button>
          {isManager && <Button variant="gold" onClick={() => setAdding(true)}>+ Add guest</Button>}
        </div>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-[2fr_repeat(4,1fr)]">
        <Field label="Search" htmlFor="gq"><Input id="gq" type="search" placeholder="Name, email, book title, submission #" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} /></Field>
        <Field label="Guest type" htmlFor="gc"><Select id="gc" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
        <Field label="Attendance" htmlFor="gt"><Select id="gt" value={ticket} onChange={(e) => setTicket(e.target.value)}><option value="">All</option><option value="confirmed">Confirmed</option><option value="unconfirmed">Not confirmed</option></Select></Field>
        <Field label="Seating" htmlFor="gs"><Select id="gs" value={seat} onChange={(e) => setSeat(e.target.value)}><option value="">All</option><option value="assigned">Has table</option><option value="unassigned">Confirmed, no table</option></Select></Field>
        <Field label="Arrival" htmlFor="ga"><Select id="ga" value={arrival} onChange={(e) => setArrival(e.target.value)}><option value="">All</option><option value="in">Checked in</option><option value="awaiting">Awaiting arrival</option></Select></Field>
        <label className="flex items-center gap-2 text-sm md:col-span-5"><input type="checkbox" className="h-5 w-5 accent-[#D4AF37]" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Flagged guests only</label>
      </div>

      {!d.ready ? <div className="h-64 animate-pulse rounded-2xl bg-white/5" /> : rows.length === 0 ? (
        <Empty title={d.guests.length ? 'No guests match' : 'No guest records yet'}>{d.guests.length ? 'Try clearing a filter.' : 'Import finalists from Jotform, upload a CSV, or add a guest manually.'}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-ivory/10"><tr><th className="th">Guest</th><th className="th hidden md:table-cell">Type</th><th className="th">Status</th><th className="th">Table</th><th className="th hidden lg:table-cell">Book</th></tr></thead>
            <tbody className="divide-y divide-ivory/5">
              {rows.slice(0, limit).map((g) => {
                const t = d.tableById.get(d.assignByGuest.get(g.id)?.table_id ?? '');
                return (
                  <tr key={g.id} tabIndex={0} role="button" onClick={() => setOpen(g.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(g.id)} className="cursor-pointer hover:bg-white/[0.04] focus-visible:bg-white/[0.06]">
                    <td className="td"><div className="font-semibold">{g.display_name || g.full_name} {g.flagged && <span title="Flagged" className="text-amber-300">⚑</span>} {g.is_demo && <Badge tone="warn">DEMO</Badge>}</div><div className="text-xs text-ivory/50">{g.email}</div></td>
                    <td className="td hidden md:table-cell"><Badge tone="gold">{categoryLabel(g.category)}</Badge></td>
                    <td className="td"><div className="flex flex-wrap gap-1">{g.is_confirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge>Record</Badge>}{g.checked_in_at && <Badge tone="blue">In</Badge>}</div></td>
                    <td className="td table-number text-2xl">{t?.number ?? <span className="font-sans text-sm text-ivory/40">—</span>}</td>
                    <td className="td hidden max-w-[18rem] truncate text-ivory/70 lg:table-cell">{g.book_title}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit && <div className="p-3 text-center"><Button onClick={() => setLimit((l) => l + 200)}>Show more ({rows.length - limit} remaining)</Button></div>}
        </div>
      )}

      <GuestDrawer guestId={open} onClose={() => setOpen(null)} />
      <AddGuest open={adding} onClose={() => setAdding(false)} onCreated={(id) => { setOpen(id); void d.refresh(); }} eventId={event!.id} toast={toast} />
    </div>
  );
}

function AddGuest({ open, onClose, eventId, onCreated, toast }: { open: boolean; onClose: () => void; eventId: string; onCreated: (id: string) => void; toast: (t: string, k?: 'ok' | 'error') => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [category, setCategory] = useState<GuestCategory>('general'); const [confirmed, setConfirmed] = useState(true); const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Add a guest">
      <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const id = await createGuest(eventId, { full_name: name, email, category, confirmed }); toast('Guest added'); setName(''); setEmail(''); onClose(); onCreated(id); } catch (x) { toast(friendly(x), 'error'); } finally { setBusy(false); } }}>
        <Field label="Full name" htmlFor="an"><Input id="an" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email (optional)" htmlFor="ae"><Input id="ae" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Guest type" htmlFor="ac"><Select id="ac" value={category} onChange={(e) => setCategory(e.target.value as GuestCategory)}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#D4AF37]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Attendance confirmed (counts toward seating)</label>
        <Button type="submit" variant="gold" busy={busy} disabled={name.trim().length < 2}>Add guest</Button>
      </form>
    </Modal>
  );
}
