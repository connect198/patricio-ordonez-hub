import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { friendly, must } from '../../lib/db';
import { inviteStaff, ApiError } from '../../lib/api';
import type { Account, EventRow } from '../../lib/types';
import { Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';

const KINDS = ['Kingdom Book Awards', 'Positioned for Victory Conference', 'VIP Coaching Day', 'Author Visibility Workshop', 'Kingdom Influencer Experience', 'Private Retreat', 'Conference / Gala'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export default function Admin() {
  const { event, events, reloadEvents, setEventId, isOwner, isManager } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Partial<EventRow>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (event) setForm({ name: event.name, tagline: event.tagline, event_date: event.event_date, venue: event.venue, city: event.city, status: event.status, jotform_form_id: event.jotform_form_id }); }, [event]);

  const saveEvent = async () => {
    setBusy(true);
    try { await must(supabase.from('events').update({ ...form, jotform_form_id: form.jotform_form_id || null }).eq('id', event!.id)); await reloadEvents(); toast('Event saved'); } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6">
      <h1 className="text-4xl">Settings &amp; Team</h1>
      {isManager && (
        <Card className="grid gap-4 p-5">
          <h2 className="text-2xl">Event Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Event name" htmlFor="en"><Input id="en" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Tagline" htmlFor="et"><Input id="et" value={form.tagline ?? ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
            <Field label="Date" htmlFor="ed"><Input id="ed" type="date" value={form.event_date ?? ''} onChange={(e) => setForm({ ...form, event_date: e.target.value || null })} /></Field>
            <Field label="Status" htmlFor="es" hint="Only “live” events open for guests. Draft hides the QR experience."><Select id="es" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventRow['status'] })}><option value="draft">Draft</option><option value="live">Live</option><option value="closed">Closed</option></Select></Field>
            <Field label="Venue" htmlFor="ev"><Input id="ev" value={form.venue ?? ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
            <Field label="City" htmlFor="ec"><Input id="ec" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Jotform form ID" htmlFor="ej" hint="Used by the server-side sync for this event."><Input id="ej" value={form.jotform_form_id ?? ''} onChange={(e) => setForm({ ...form, jotform_form_id: e.target.value })} /></Field>
            <Field label="Guest link (slug)" htmlFor="esl"><Input id="esl" readOnly value={event?.slug ?? ''} /></Field>
          </div>
          <div className="flex justify-end"><Button variant="gold" busy={busy} onClick={saveEvent}>Save event</Button></div>
        </Card>
      )}
      {isOwner && <NewEvent onCreated={async (id) => { await reloadEvents(); setEventId(id); }} sources={events} />}
      {isOwner && <Team events={events} />}
      {!isOwner && <p className="text-sm text-ivory/55">Creating events and managing the team is reserved for owners.</p>}
    </div>
  );
}

function NewEvent({ onCreated, sources }: { onCreated: (id: string) => void; sources: EventRow[] }) {
  const toast = useToast();
  const [name, setName] = useState(''); const [kind, setKind] = useState(KINDS[0]); const [date, setDate] = useState(''); const [copy, setCopy] = useState(''); const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const rows = await must(supabase.from('events').insert({ name, slug: slugify(name), kind, event_date: date || null, status: 'draft', tagline: 'Every Guest. Honored. Every Moment. Extraordinary.' }).select('id'));
      const id = rows![0].id as string;
      if (copy) {
        const { data: st } = await supabase.from('event_settings').select('settings').eq('event_id', copy).maybeSingle();
        await supabase.from('event_settings').upsert({ event_id: id, settings: st?.settings ?? {} });
      } else await supabase.from('event_settings').upsert({ event_id: id, settings: {} });
      toast('Event created as a draft'); setName(''); onCreated(id);
    } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="grid gap-4 p-5"><h2 className="text-2xl">Create a New Event</h2>
      <p className="text-sm text-ivory/65">Each event gets its own branding, guest directory, QR code, seating layout, schedule, staff access and analytics.</p>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Event name" htmlFor="nn"><Input id="nn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Positioned for Victory Conference 2027" /></Field>
        <Field label="Type" htmlFor="nk"><Select id="nk" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Date" htmlFor="nd"><Input id="nd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Copy messaging from" htmlFor="nc"><Select id="nc" value={copy} onChange={(e) => setCopy(e.target.value)}><option value="">Start fresh</option>{sources.filter((s) => !s.is_demo).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>
      <div className="flex justify-end"><Button variant="gold" busy={busy} disabled={name.trim().length < 3 || !slugify(name)} onClick={create}>Create event</Button></div>
    </Card>
  );
}

function Team({ events }: { events: EventRow[] }) {
  const toast = useToast();
  const [team, setTeam] = useState<Account[]>([]);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [role, setRole] = useState('staff'); const [scope, setScope] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from('admin_accounts').select('user_id,email,display_name,role,event_ids,active').order('email'); setTeam((data as Account[]) ?? []); }, []);
  useEffect(() => { void load(); }, [load]);
  const invite = async () => {
    setBusy(true);
    try { await inviteStaff({ email, displayName: name, role, eventIds: scope ? [scope] : null }); toast('Invitation sent'); setEmail(''); setName(''); await load(); } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not invite.', 'error'); } finally { setBusy(false); }
  };
  const update = async (id: string, patch: Partial<Account>) => { const { error } = await supabase.from('admin_accounts').update(patch).eq('user_id', id); if (error) toast(friendly(error), 'error'); else void load(); };
  return (
    <Card className="grid gap-4 p-5"><h2 className="text-2xl">Event Team</h2>
      <p className="text-sm text-ivory/65"><b>Staff</b> can search, check in guests and flag exceptions. <b>Managers</b> also edit guests, seating, imports and the experience. <b>Owners</b> manage events and the team.</p>
      <ul className="divide-y divide-ivory/10 text-sm">{team.map((t) => (
        <li key={t.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{t.display_name || t.email} <span className="text-ivory/50">· {t.email}</span> {!t.active && <Badge tone="bad">disabled</Badge>} <Badge>{t.event_ids ? `${t.event_ids.length} event(s)` : 'all events'}</Badge></span>
          <span className="flex items-center gap-2"><Select aria-label="Role" className="w-32" value={t.role} onChange={(e) => update(t.user_id, { role: e.target.value as Account['role'] })}><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></Select><Button onClick={() => update(t.user_id, { active: !t.active })}>{t.active ? 'Disable' : 'Enable'}</Button></span></li>
      ))}</ul>
      <div className="grid gap-3 rounded-xl border border-gold/30 p-4 md:grid-cols-5 md:items-end">
        <Field label="Email" htmlFor="ie"><Input id="ie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Name" htmlFor="in"><Input id="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Role" htmlFor="ir"><Select id="ir" value={role} onChange={(e) => setRole(e.target.value)}><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></Select></Field>
        <Field label="Access" htmlFor="is"><Select id="is" value={scope} onChange={(e) => setScope(e.target.value)} disabled={role === 'owner'}><option value="">All events</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
        <Button variant="gold" busy={busy} disabled={!email.includes('@')} onClick={invite}>Send invite</Button>
      </div>
    </Card>
  );
}
