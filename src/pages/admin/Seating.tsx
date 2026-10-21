import { useMemo, useState, type DragEvent } from 'react';
import { DESIGNATIONS, categoryLabel, type TableDesignation } from '../../../shared/types';
import { rankByName } from '../../../shared/names';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { createTable, deleteTable, seatGuests, unseatGuests, updateTable } from '../../lib/actions';
import { friendly } from '../../lib/db';
import type { Guest, TableRow } from '../../lib/types';
import { Badge, Button, Empty, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cx } from '../../lib/utils';

const MATCH: Partial<Record<TableDesignation, string[]>> = { finalist: ['finalist'], vip: ['vip', 'distinguished'], speaker: ['speaker'], sponsor: ['sponsor'] };

function warningsFor(guests: Guest[], t: TableRow, hostSeated: (g: Guest) => string | null): string[] {
  const w: string[] = [];
  for (const g of guests) {
    const ok = MATCH[t.designation];
    if (ok && g.category !== 'companion' && !ok.includes(g.category)) w.push(`${g.display_name || g.full_name} (${categoryLabel(g.category)}) is not a ${t.designation} guest — Table ${t.number} is designated ${t.designation}.`);
    if (t.designation === 'reserved') w.push(`Table ${t.number} is reserved${t.reserved_for ? ` for ${t.reserved_for}` : ''}.`);
    const apart = hostSeated(g); if (apart) w.push(apart);
  }
  return Array.from(new Set(w));
}

export default function Seating() {
  const { event } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<TableRow | 'new' | null>(null);
  const [pending, setPending] = useState<{ tableId: string; ids: string[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const unassigned = useMemo(() => {
    const list = d.guests.filter((g) => g.is_confirmed && !d.assignByGuest.has(g.id));
    return q.trim() ? rankByName(list, q, (g) => [g.full_name, g.display_name]) : list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [d.guests, d.assignByGuest, q]);

  const expandGroup = (ids: string[]) => {
    const out = new Set(ids);
    for (const id of ids) {
      d.companionsOf(id).forEach((c) => c.is_confirmed && out.add(c.id));
      const h = d.hostOf(id); if (h?.is_confirmed) out.add(h.id);
    }
    return [...out];
  };

  const attempt = (tableId: string, ids: string[], withGroup = false) => {
    const t = d.tableById.get(tableId); if (!t) return;
    const all = withGroup ? expandGroup(ids) : ids;
    const moving = all.filter((id) => d.assignByGuest.get(id)?.table_id !== tableId);
    if (!moving.length) return;
    const free = t.capacity - d.guestsAtTable(t.id).length;
    if (moving.length > free) return toast(`Table ${t.number} has ${free} seat${free === 1 ? '' : 's'} left — it cannot take ${moving.length} guests.`, 'error');
    const guests = moving.map((id) => d.guestById.get(id)!).filter(Boolean);
    const warnings = warningsFor(guests, t, (g) => {
      const h = d.hostOf(g.id); const ha = h && d.assignByGuest.get(h.id);
      return ha && ha.table_id !== tableId && !moving.includes(h!.id) ? `${g.full_name} would be seated apart from their host ${h!.full_name}.` : null;
    });
    if (warnings.length) setPending({ tableId, ids: moving, warnings });
    else void commit(tableId, moving);
  };
  const commit = async (tableId: string, ids: string[]) => {
    setBusy(true);
    try { await seatGuests(tableId, ids); toast(`Seated ${ids.length} at Table ${d.tableById.get(tableId)?.number}`); setSel(new Set()); await d.refresh(); }
    catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); setPending(null); }
  };
  const unseat = async (ids: string[]) => { try { await unseatGuests(ids); await d.refresh(); } catch (e) { toast(friendly(e), 'error'); } };

  const onDrop = (e: DragEvent, tableId: string) => {
    e.preventDefault(); setDragOver(null);
    try { const ids = JSON.parse(e.dataTransfer.getData('application/x-guests')) as string[]; attempt(tableId, ids); } catch { /* ignore foreign drags */ }
  };
  const dragStart = (e: DragEvent, id: string) => {
    const ids = sel.has(id) ? [...sel] : [id];
    e.dataTransfer.setData('application/x-guests', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move';
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-4xl">Royal Seating Designer</h1><p className="text-ivory/60">{d.tables.length} tables · {d.stats.seatsTotal} seats · {d.stats.seated} seated · {d.stats.unassigned} confirmed guests waiting</p></div>
        <Button variant="gold" onClick={() => setEditing('new')}>+ New table</Button>
      </div>

      {d.issues.length > 0 && (
        <details className="card border-amber-400/30 p-4" open={d.issues.some((i) => i.severity === 'high')}>
          <summary className="cursor-pointer font-semibold text-amber-200">⚠ {d.issues.length} seating warning{d.issues.length === 1 ? '' : 's'}</summary>
          <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto text-sm">{d.issues.map((i) => <li key={i.id} className={i.severity === 'high' ? 'text-red-200' : 'text-ivory/80'}>• {i.text}</li>)}</ul>
        </details>
      )}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <aside className="card self-start p-4 lg:sticky lg:top-20" aria-label="Unassigned guests">
          <h2 className="text-2xl">Awaiting a Table <span className="text-gold-soft">({d.stats.unassigned})</span></h2>
          <Input aria-label="Search unassigned guests" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="mt-3" />
          <ul className="mt-3 grid max-h-[46vh] gap-1.5 overflow-y-auto pr-1">
            {unassigned.length === 0 && <li className="p-3 text-sm text-ivory/55">{d.stats.confirmed === 0 ? 'No confirmed attendees yet. Confirm attendance in the Guests page.' : 'Everyone confirmed has a table. 🎉'}</li>}
            {unassigned.map((g) => {
              const host = d.hostOf(g.id); const comps = d.companionsOf(g.id);
              return (
                <li key={g.id} draggable onDragStart={(e) => dragStart(e, g.id)} className={cx('flex cursor-grab items-center gap-2 rounded-xl border px-3 py-2 text-sm active:cursor-grabbing', sel.has(g.id) ? 'border-gold bg-gold/10' : 'border-ivory/10 bg-white/[0.03]')}>
                  <input type="checkbox" aria-label={`Select ${g.full_name}`} checked={sel.has(g.id)} onChange={() => toggle(g.id)} className="h-5 w-5 accent-[#D4AF37]" />
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{g.display_name || g.full_name}</div><div className="truncate text-xs text-ivory/55">{categoryLabel(g.category)}{host ? ` · with ${host.full_name}` : ''}{comps.length ? ` · +${comps.length} companion${comps.length > 1 ? 's' : ''}` : ''}</div></div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid gap-2 border-t border-ivory/10 pt-3">
            <Select aria-label="Seat selected guests at table" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Seat selected at…</option>
              {d.tables.map((t) => { const left = t.capacity - d.guestsAtTable(t.id).length; return <option key={t.id} value={t.id} disabled={left <= 0}>Table {t.number} — {left} left</option>; })}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="gold" disabled={!sel.size || !target || busy} onClick={() => attempt(target, [...sel])}>Seat {sel.size || ''}</Button>
              <Button disabled={!sel.size || !target || busy} onClick={() => attempt(target, [...sel], true)} title="Include each selected guest's companions and host">+ Group</Button>
            </div>
            {sel.size > 0 && <button className="text-xs text-ivory/60 hover:underline" onClick={() => setSel(new Set())}>Clear selection</button>}
          </div>
        </aside>

        <section aria-label="Tables">
          {d.tables.length === 0 ? <Empty title="No tables yet">Create your first table — or add many at once — then drag confirmed guests onto them.</Empty> : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
              {d.tables.map((t) => {
                const guests = d.guestsAtTable(t.id); const left = t.capacity - guests.length; const over = left < 0;
                const pct = Math.min(1, guests.length / t.capacity);
                return (
                  <article key={t.id} onDragOver={(e) => { e.preventDefault(); setDragOver(t.id); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, t.id)}
                    className={cx('relative overflow-hidden rounded-2xl border bg-gradient-to-b from-[#16161a] to-royal p-4 transition', over ? 'border-red-400' : dragOver === t.id ? 'border-gold-soft shadow-gold' : left === 0 ? 'border-gold/70' : 'border-ivory/15')} aria-label={`Table ${t.number}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold-soft">Table</div>
                        <div className="table-number gold-text text-7xl">{t.number}</div>
                        {t.label && <div className="serif text-lg text-ivory/80">{t.label}</div>}
                      </div>
                      <div className="grid justify-items-end gap-1.5">
                        <svg viewBox="0 0 40 40" className="h-14 w-14 -rotate-90" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(247,231,206,.12)" strokeWidth="4" /><circle cx="20" cy="20" r="16" fill="none" stroke={over ? '#f87171' : '#D4AF37'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${pct * 100.5} 100.5`} /></svg>
                        <span className="text-sm tabular-nums"><b>{guests.length}</b>/{t.capacity} · <span className={left === 0 ? 'text-gold-soft' : over ? 'text-red-300' : ''}>{over ? `${-left} over` : `${left} left`}</span></span>
                        {t.designation !== 'general' && <Badge tone="gold">{DESIGNATIONS.find((x) => x.value === t.designation)?.label}{t.reserved_for ? ` · ${t.reserved_for}` : ''}</Badge>}
                      </div>
                    </div>
                    <ul className="mt-3 grid gap-1.5">
                      {guests.map((g) => (
                        <li key={g.id} draggable onDragStart={(e) => dragStart(e, g.id)} className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">{g.display_name || g.full_name}{g.checked_in_at && <span className="ml-1 text-emerald-300" title="Checked in">✓</span>}</span>
                          <select aria-label={`Move ${g.full_name}`} className="w-[5.5rem] rounded-md border border-ivory/15 bg-royal px-1 py-1 text-xs" value="" onChange={(e) => { if (e.target.value === 'x') void unseat([g.id]); else if (e.target.value) attempt(e.target.value, [g.id]); }}>
                            <option value="">Move…</option>
                            {d.tables.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id} disabled={x.capacity - d.guestsAtTable(x.id).length <= 0}>Table {x.number}</option>)}
                            <option value="x">Unseat</option>
                          </select>
                        </li>
                      ))}
                      {guests.length === 0 && <li className="rounded-lg border border-dashed border-ivory/15 p-3 text-center text-xs text-ivory/45">Drop guests here</li>}
                    </ul>
                    <div className="mt-3 flex justify-between text-sm"><button className="text-gold-soft hover:underline" onClick={() => setEditing(t)}>Edit table</button>{guests.length > 0 && <button className="text-ivory/50 hover:underline" onClick={() => void unseat(guests.map((g) => g.id))}>Clear table</button>}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <TableEditor key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} table={editing === 'new' ? null : editing} onClose={() => setEditing(null)} eventId={event!.id} nextNumber={Math.max(0, ...d.tables.map((t) => t.number)) + 1} used={editing && editing !== 'new' ? d.guestsAtTable(editing.id).length : 0} onSaved={() => d.refresh()} />

      <Modal open={!!pending} onClose={() => setPending(null)} title="Seat anyway?">
        <ul className="mb-4 grid gap-2 text-sm text-amber-100">{pending?.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
        <div className="flex justify-end gap-2"><Button onClick={() => setPending(null)}>Cancel</Button><Button variant="gold" busy={busy} onClick={() => pending && commit(pending.tableId, pending.ids)}>Seat anyway</Button></div>
      </Modal>
    </div>
  );
}

function TableEditor({ open, table, onClose, eventId, nextNumber, used, onSaved }: { open: boolean; table: TableRow | null; onClose: () => void; eventId: string; nextNumber: number; used: number; onSaved: () => void }) {
  const toast = useToast();
  const [number, setNumber] = useState(table?.number ?? nextNumber);
  const [capacity, setCapacity] = useState(table?.capacity ?? 10);
  const [designation, setDesignation] = useState<TableDesignation>(table?.designation ?? 'general');
  const [label, setLabel] = useState(table?.label ?? '');
  const [reservedFor, setReservedFor] = useState(table?.reserved_for ?? '');
  const [notes, setNotes] = useState(table?.notes ?? '');
  const [bulk, setBulk] = useState(1);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (table) await updateTable(table.id, { number, capacity, designation, label: label || null, reserved_for: reservedFor || null, notes: notes || null });
      else for (let i = 0; i < bulk; i++) await createTable(eventId, { number: number + i, capacity, designation, label: bulk === 1 ? label : '', reserved_for: bulk === 1 ? reservedFor : '' });
      toast(table ? 'Table updated' : bulk > 1 ? `${bulk} tables created` : 'Table created'); onSaved(); onClose();
    } catch (e) { toast(friendly(e), 'error'); onSaved(); } finally { setBusy(false); }
  }
  async function remove() {
    if (!table) return; setBusy(true);
    try { await deleteTable(table.id); toast('Table removed'); onSaved(); onClose(); } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={table ? `Table ${table.number}` : 'New table'}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={table ? 'Table number' : 'Starting number'} htmlFor="tn"><Input id="tn" type="number" min={1} value={number} onChange={(e) => setNumber(+e.target.value)} /></Field>
          <Field label="Capacity" htmlFor="tc" hint={used ? `${used} seated now` : undefined}><Input id="tc" type="number" min={Math.max(1, used)} max={60} value={capacity} onChange={(e) => setCapacity(+e.target.value)} /></Field>
        </div>
        {!table && <Field label="How many tables?" htmlFor="tbk" hint="Creates consecutive numbers, all with this capacity."><Input id="tbk" type="number" min={1} max={60} value={bulk} onChange={(e) => setBulk(Math.max(1, Math.min(60, +e.target.value)))} /></Field>}
        <Field label="Special designation" htmlFor="td"><Select id="td" value={designation} onChange={(e) => setDesignation(e.target.value as TableDesignation)}>{DESIGNATIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        {(!table ? bulk === 1 : true) && <>
          <Field label="Table name (optional)" htmlFor="tl"><Input id="tl" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Honored Authors" /></Field>
          {designation === 'reserved' && <Field label="Reserved for" htmlFor="tr"><Input id="tr" value={reservedFor} onChange={(e) => setReservedFor(e.target.value)} /></Field>}
        </>}
        {table && <Field label="Notes" htmlFor="tnotes"><Textarea id="tnotes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
        <div className="flex items-center justify-between gap-2">
          {table ? <Button variant="danger" disabled={used > 0 || busy} onClick={remove} title={used ? 'Unseat guests before deleting' : ''}>Delete table</Button> : <span />}
          <Button variant="gold" busy={busy} onClick={save} disabled={!number || number < 1 || capacity < 1}>{table ? 'Save' : bulk > 1 ? `Create ${bulk} tables` : 'Create table'}</Button>
        </div>
      </div>
    </Modal>
  );
}
