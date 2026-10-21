import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, categoryLabel, type GuestCategory, type TicketStatus } from '../../../shared/types';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { addCompanion, addFlag, recordCheckin, removeCompanion, saveGuest, seatGuests, setTicketStatus, unseatGuests } from '../../lib/actions';
import { friendly } from '../../lib/db';
import { describe, useActivity } from '../../lib/useActivity';
import { Badge, Button, Field, Input, Modal, Select, Textarea, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { clock, timeAgo } from '../../lib/utils';

const TICKETS: { value: TicketStatus; label: string }[] = [
  { value: 'none', label: 'No ticket' }, { value: 'interested', label: 'Interested' }, { value: 'pending', label: 'Pending payment' },
  { value: 'confirmed', label: 'Confirmed' }, { value: 'declined', label: 'Declined' }, { value: 'cancelled', label: 'Cancelled' },
];

export function GuestDrawer({ guestId, onClose }: { guestId: string | null; onClose: () => void }) {
  const { event, isManager } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const g = guestId ? d.guestById.get(guestId) : undefined;
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [compName, setCompName] = useState('');
  const [compExisting, setCompExisting] = useState('');
  const [note, setNote] = useState('');
  const { rows: history } = useActivity(event!.id, 25, guestId ?? undefined);

  useEffect(() => {
    if (g) setForm({ full_name: g.full_name, display_name: g.display_name ?? '', email: g.email ?? '', phone: g.phone ?? '', category: g.category, book_title: g.book_title ?? '', dietary: g.dietary ?? '', accessibility: g.accessibility ?? '', notes: g.notes ?? '', flagged: g.flagged });
  }, [g?.id, g?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticket = g ? d.ticketByGuest.get(g.id) : undefined;
  const assign = g ? d.assignByGuest.get(g.id) : undefined;
  const comps = g ? d.companions.filter((c) => c.host_guest_id === g.id) : [];
  const host = g ? d.companions.find((c) => c.companion_guest_id === g.id) : undefined;
  const candidates = useMemo(() => d.guests.filter((x) => x.id !== g?.id && !d.companions.some((c) => c.companion_guest_id === x.id) && !d.companions.some((c) => c.host_guest_id === x.id && x.id === g?.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)), [d.guests, d.companions, g?.id]);
  const nm = (id: string | null) => (id ? d.guestById.get(id)?.display_name || d.guestById.get(id)?.full_name || 'a guest' : 'a guest');

  if (!g) return null;
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target ? e.target.value : e }));
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); await d.refresh(); } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); }
  };
  const dirty = JSON.stringify(form) !== JSON.stringify({ full_name: g.full_name, display_name: g.display_name ?? '', email: g.email ?? '', phone: g.phone ?? '', category: g.category, book_title: g.book_title ?? '', dietary: g.dietary ?? '', accessibility: g.accessibility ?? '', notes: g.notes ?? '', flagged: g.flagged });
  const tableOptions = d.tables.map((t) => ({ t, used: d.guestsAtTable(t.id).length })).map(({ t, used }) => ({ t, used, full: used >= t.capacity && assign?.table_id !== t.id }));

  return (
    <Modal open onClose={onClose} title={g.display_name || g.full_name} wide>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{categoryLabel(g.category)}</Badge>
          {g.is_confirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge>Not confirmed</Badge>}
          {g.checked_in_at ? <Badge tone="ok">Checked in {clock(g.checked_in_at)}</Badge> : g.is_confirmed && <Badge tone="warn">Awaiting arrival</Badge>}
          {assign ? <Badge tone="blue">Table {d.tableById.get(assign.table_id)?.number}</Badge> : g.is_confirmed && <Badge tone="warn">No table</Badge>}
          {g.is_demo && <Badge tone="warn">DEMO</Badge>}
          {g.jotform_submission_id && <Badge title="Jotform submission ID">JF #{g.jotform_submission_id}</Badge>}
          {host && <Badge>Companion of {nm(host.host_guest_id)}</Badge>}
        </div>

        <section className="grid gap-3 rounded-2xl border border-ivory/10 p-4" aria-label="Attendance and arrival">
          <h3 className="text-xl">Attendance & Arrival</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ticket / attendance" htmlFor="tk">
              <Select id="tk" disabled={!isManager || busy} value={ticket?.status ?? 'none'} onChange={(e) => run(() => setTicketStatus(event!.id, g.id, e.target.value as TicketStatus), 'Ticket updated')}>
                {TICKETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Table" htmlFor="tb" hint={g.is_confirmed ? undefined : 'Confirm attendance before assigning a table.'}>
              <Select id="tb" disabled={!isManager || busy || !g.is_confirmed} value={assign?.table_id ?? ''} onChange={(e) => run(() => (e.target.value ? seatGuests(e.target.value, [g.id]) : unseatGuests([g.id])), 'Seating updated')}>
                <option value="">Unassigned</option>
                {tableOptions.map(({ t, used, full }) => <option key={t.id} value={t.id} disabled={full}>Table {t.number} — {used}/{t.capacity}{full ? ' (full)' : ''}{t.designation !== 'general' ? ` · ${t.designation}` : ''}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {g.checked_in_at
              ? <Button busy={busy} onClick={() => run(() => recordCheckin(event!.id, g.id, 'check_out', 'correction', note), 'Checked out (correction logged)')}>Undo check-in</Button>
              : <Button variant="gold" busy={busy} onClick={() => run(() => recordCheckin(event!.id, g.id, 'check_in', g.is_confirmed ? 'staff' : 'exception', note), 'Checked in')} disabled={!g.is_confirmed && !isManager}>{g.is_confirmed ? 'Check in' : 'Manager override check-in'}</Button>}
            <div className="min-w-[12rem] flex-1"><Input aria-label="Check-in note" placeholder="Optional note for the log" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <Button onClick={() => run(() => addFlag(event!.id, g.id, 'other', note || 'Flagged for manager attention'), 'Flag raised')}>⚑ Flag exception</Button>
          </div>
        </section>

        <section className="grid gap-3" aria-label="Guest details">
          <h3 className="text-xl">Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fn"><Input id="fn" disabled={!isManager} value={form.full_name ?? ''} onChange={set('full_name')} /></Field>
            <Field label="Display / certificate name" htmlFor="dn"><Input id="dn" disabled={!isManager} value={form.display_name ?? ''} onChange={set('display_name')} /></Field>
            <Field label="Email" htmlFor="em"><Input id="em" type="email" disabled={!isManager} value={form.email ?? ''} onChange={set('email')} /></Field>
            <Field label="Phone" htmlFor="ph"><Input id="ph" disabled={!isManager} value={form.phone ?? ''} onChange={set('phone')} /></Field>
            <Field label="Guest type" htmlFor="ct"><Select id="ct" disabled={!isManager} value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
            <Field label="Book title" htmlFor="bt"><Input id="bt" disabled={!isManager} value={form.book_title ?? ''} onChange={set('book_title')} /></Field>
            <Field label="Dietary requirements" htmlFor="di"><Textarea id="di" rows={2} disabled={!isManager} value={form.dietary ?? ''} onChange={set('dietary')} /></Field>
            <Field label="Accessibility requirements" htmlFor="ac"><Textarea id="ac" rows={2} disabled={!isManager} value={form.accessibility ?? ''} onChange={set('accessibility')} /></Field>
          </div>
          <Field label="Staff notes (private)" htmlFor="nt"><Textarea id="nt" disabled={!isManager} value={form.notes ?? ''} onChange={set('notes')} /></Field>
          {g.book_cover_url && <p className="text-xs text-ivory/55">Book cover on file · marketing permission: {g.marketing_permission ? 'granted' : 'not granted (cover will not be shown to the guest)'}</p>}
          {(g.attendance_intent || g.ticket_interest || g.additional_guest_details) && (
            <div className="rounded-xl border border-ivory/10 p-3 text-sm text-ivory/75">
              <b>From Jotform:</b> attending — {g.attendance_intent || '—'} · ticket interest — {g.ticket_interest || '—'}{g.companion_intent ? ` · companions — ${g.companion_intent}` : ''}{g.additional_guest_details ? ` · ${g.additional_guest_details}` : ''}
            </div>
          )}
          {isManager && <Toggle checked={!!form.flagged} onChange={set('flagged')} label="Flag this guest" description="Shows a marker on staff screens." />}
          {isManager && <div className="flex justify-end"><Button variant="gold" disabled={!dirty} busy={busy} onClick={() => run(() => saveGuest(g.id, { ...form, email: form.email ? String(form.email).trim().toLowerCase() : null, display_name: form.display_name || null } as any), 'Guest saved')}>Save changes</Button></div>}
        </section>

        <section className="grid gap-3 rounded-2xl border border-ivory/10 p-4" aria-label="Companions">
          <h3 className="text-xl">Companions</h3>
          {comps.length === 0 && <p className="text-sm text-ivory/55">No companions registered.</p>}
          <ul className="grid gap-2">{comps.map((c) => {
            const cg = d.guestById.get(c.companion_guest_id);
            return <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"><span>{cg?.full_name} {cg?.is_confirmed ? <Badge tone="ok">confirmed</Badge> : <Badge>unconfirmed</Badge>} {cg?.checked_in_at && <Badge tone="ok">in</Badge>}</span>{isManager && <button className="text-red-200 hover:underline" onClick={() => run(() => removeCompanion(c.id), 'Companion unlinked')}>Unlink</button>}</li>;
          })}</ul>
          {isManager && !host && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2"><Input aria-label="New companion name" placeholder="New companion full name" value={compName} onChange={(e) => setCompName(e.target.value)} /><Button disabled={compName.trim().length < 2} onClick={() => run(async () => { await addCompanion(event!.id, g.id, { full_name: compName, confirmed: g.is_confirmed }); setCompName(''); }, 'Companion added')}>Add</Button></div>
              <div className="flex gap-2"><Select aria-label="Link existing guest" value={compExisting} onChange={(e) => setCompExisting(e.target.value)}><option value="">Link an existing guest…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select><Button disabled={!compExisting} onClick={() => run(async () => { await addCompanion(event!.id, g.id, { existingId: compExisting }); setCompExisting(''); }, 'Companion linked')}>Link</Button></div>
            </div>
          )}
        </section>

        <section aria-label="History"><h3 className="mb-2 text-xl">History</h3>
          <ul className="divide-y divide-ivory/10 text-sm">{history.length === 0 && <li className="py-2 text-ivory/55">No recorded changes yet.</li>}
            {history.map((r) => <li key={r.id} className="flex justify-between gap-3 py-1.5"><span>{describe(r, nm)}</span><span className="shrink-0 text-xs text-ivory/50">{r.actor_email?.split('@')[0] ?? 'system'} · {timeAgo(r.created_at)}</span></li>)}</ul>
        </section>
      </div>
    </Modal>
  );
}
export type { GuestCategory };
