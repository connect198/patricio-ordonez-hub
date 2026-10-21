import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { categoryLabel, mergeSettings, type EventSettings } from '../../../shared/types';
import { rankByName } from '../../../shared/names';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { addFlag, recordCheckin, resolveFlag } from '../../lib/actions';
import { resolveCredential } from '../../lib/api';
import { friendly } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import type { Guest } from '../../lib/types';
import { Badge, Button, Field, Input, Modal, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { clock, maskEmail } from '../../lib/utils';

export default function CheckIn() {
  const { event, isManager } = useAuth();
  const d = useEventData();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [issues, setIssues] = useState(false);
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const toast = useToast();

  useEffect(() => { supabase.from('event_settings').select('settings').eq('event_id', event!.id).maybeSingle().then(({ data }) => setSettings(mergeSettings(data?.settings))); }, [event]);

  const results = useMemo(() => {
    const t = q.trim(); if (t.length < 2) return [];
    const lc = t.toLowerCase();
    const named = rankByName(d.guests, t, (g) => [g.full_name, g.display_name]);
    const other = d.guests.filter((g) => (g.email ?? '').toLowerCase().startsWith(lc) && !named.includes(g));
    return [...named, ...other].sort((a, b) => Number(b.is_confirmed) - Number(a.is_confirmed)).slice(0, 12);
  }, [q, d.guests]);
  const recent = useMemo(() => d.guests.filter((g) => g.checked_in_at).sort((a, b) => b.checked_in_at!.localeCompare(a.checked_in_at!)).slice(0, 5), [d.guests]);
  const mc = settings?.managerContact;

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">Guest Check-In</h1>
        <div className="text-right"><div className="table-number gold-text text-5xl">{d.stats.checkedIn}<span className="text-2xl text-ivory/50"> / {d.stats.confirmed}</span></div><div className="text-xs uppercase tracking-widest text-ivory/55">arrived</div></div>
      </div>

      <div className="sticky top-[4.4rem] z-20 grid gap-3 rounded-2xl bg-royal/95 pb-2 backdrop-blur">
        <Input aria-label="Search guests by name or email" type="search" autoFocus autoComplete="off" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-[64px] text-xl" />
        <div className="grid grid-cols-3 gap-2">
          <Button size="lg" onClick={() => setScan(true)}>▦ Scan QR</Button>
          <Button size="lg" onClick={() => setIssues(true)}>⚑ Issues {d.issues.length + d.flags.length ? `(${d.issues.length + d.flags.length})` : ''}</Button>
          {mc?.phone ? <a className="btn-ghost btn-lg" href={`tel:${mc.phone}`}>☎ Manager</a> : mc?.email ? <a className="btn-ghost btn-lg" href={`mailto:${mc.email}`}>✉ Manager</a> : <Button size="lg" disabled title="Add a manager phone in Experience Director → Messages">☎ Manager</Button>}
        </div>
      </div>

      {q.trim().length >= 2 && results.length === 0 && <p className="card p-6 text-center text-lg text-ivory/70">No guest found for “{q}”. Try fewer letters, or tap Issues to flag a walk-in for a manager.</p>}
      <ul className="grid gap-3">
        {results.map((g) => <GuestCard key={g.id} g={g} onOpen={() => setOpenId(g.id)} />)}
      </ul>
      {q.trim().length < 2 && recent.length > 0 && (
        <section><h2 className="mb-2 text-xl text-ivory/70">Recent arrivals</h2><ul className="grid gap-2">{recent.map((g) => <GuestCard key={g.id} g={g} onOpen={() => setOpenId(g.id)} compact />)}</ul></section>
      )}

      <GuestSheet guestId={openId} onClose={() => setOpenId(null)} settings={settings} isManager={isManager} />
      <Modal open={issues} onClose={() => setIssues(false)} title="Outstanding Issues" wide>
        <div className="grid gap-4">
          {d.assists.length > 0 && <div><h3 className="mb-1 text-lg">Guests asking for help</h3><ul className="grid gap-1.5 text-sm">{d.assists.map((a) => <li key={a.id} className="rounded-lg border border-sky-300/30 p-2.5">{a.name_given || 'A guest'}{a.message ? ` — ${a.message}` : ''}</li>)}</ul></div>}
          {d.flags.length > 0 && <div><h3 className="mb-1 text-lg">Flagged exceptions</h3><ul className="grid gap-1.5 text-sm">{d.flags.map((f) => <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/30 p-2.5"><span><b>{f.kind}</b>: {f.note}{f.guest_id ? ` — ${d.guestById.get(f.guest_id)?.full_name}` : ''}</span><Button onClick={() => resolveFlag(f.id).then(() => d.refresh('flags')).catch((e) => toast(friendly(e), 'error'))}>Resolve</Button></li>)}</ul></div>}
          <div><h3 className="mb-1 text-lg">Seating issues</h3>{d.issues.length === 0 ? <p className="text-sm text-ivory/60">None — every confirmed guest has a table.</p> : <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-sm">{d.issues.map((i) => <li key={i.id} className="rounded-lg border border-ivory/10 p-2.5">{i.text}{i.guestId && <button className="ml-2 text-gold-soft underline" onClick={() => { setIssues(false); setOpenId(i.guestId!); }}>Open</button>}</li>)}</ul>}</div>
          <FlagWalkIn eventId={event!.id} onDone={() => d.refresh('flags')} />
        </div>
      </Modal>
      {scan && <Scanner eventId={event!.id} onClose={() => setScan(false)} onGuest={(id) => { setScan(false); setOpenId(id); }} />}
    </div>
  );
}

function GuestCard({ g, onOpen, compact }: { g: Guest; onOpen: () => void; compact?: boolean }) {
  const d = useEventData();
  const t = d.tableById.get(d.assignByGuest.get(g.id)?.table_id ?? '');
  return (
    <li>
      <button onClick={onOpen} className={`card flex w-full items-center gap-4 p-4 text-left transition hover:border-gold/50 ${compact ? 'min-h-[64px]' : 'min-h-[88px]'}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-semibold">{g.display_name || g.full_name} {g.flagged && <span className="text-amber-300">⚑</span>}</div>
          <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone="gold">{categoryLabel(g.category)}</Badge>{g.checked_in_at ? <Badge tone="ok">✓ Checked in {clock(g.checked_in_at)}</Badge> : g.is_confirmed ? <Badge tone="warn">Awaiting</Badge> : <Badge tone="bad">Not confirmed</Badge>}{g.is_demo && <Badge tone="warn">DEMO</Badge>}</div>
        </div>
        <div className="text-center"><div className="text-[10px] uppercase tracking-widest text-ivory/50">Table</div><div className="table-number gold-text text-5xl">{t?.number ?? '—'}</div></div>
      </button>
    </li>
  );
}

function GuestSheet({ guestId, onClose, settings, isManager }: { guestId: string | null; onClose: () => void; settings: EventSettings | null; isManager: boolean }) {
  const { event } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const g = guestId ? d.guestById.get(guestId) : undefined;
  if (!g) return null;
  const t = d.tableById.get(d.assignByGuest.get(g.id)?.table_id ?? '');
  const comps = d.companionsOf(g.id);
  const host = d.hostOf(g.id);
  const act = async (target: Guest, action: 'check_in' | 'check_out') => {
    setBusy(target.id);
    try {
      await recordCheckin(event!.id, target.id, action, action === 'check_out' ? 'correction' : target.is_confirmed ? 'staff' : 'exception');
      toast(action === 'check_in' ? `${target.display_name || target.full_name} checked in` : 'Check-in undone'); await d.refresh('guests');
    } catch (e) { toast(friendly(e), 'error'); } finally { setBusy(null); }
  };
  const safeHeadshot = g.headshot_url && /^https:\/\//.test(g.headshot_url) ? g.headshot_url : null;
  return (
    <Modal open onClose={onClose} title={g.display_name || g.full_name} wide>
      <div className="grid gap-5">
        <div className="flex items-center gap-5">
          {safeHeadshot && <img src={safeHeadshot} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-24 w-24 rounded-2xl object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <div className="grid flex-1 gap-1">
            <div className="flex flex-wrap gap-1.5"><Badge tone="gold">{categoryLabel(g.category)}</Badge>{g.is_confirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="bad">Not confirmed</Badge>}{host && <Badge>Companion of {host.full_name}</Badge>}</div>
            <div className="text-ivory/70">{maskEmail(g.email)}{g.book_title ? ` · “${g.book_title}”` : ''}</div>
          </div>
          <div className="text-center"><div className="text-xs uppercase tracking-widest text-ivory/50">Table</div><div className="table-number gold-text text-[5.5rem]">{t?.number ?? '—'}</div>{t?.label && <div className="text-xs text-ivory/60">{t.label}</div>}</div>
        </div>

        {(g.dietary || g.accessibility) && <div className="grid gap-2 rounded-xl border border-amber-300/40 bg-amber-300/5 p-3 text-sm">{g.accessibility && <div>♿ <b>Accessibility:</b> {g.accessibility}</div>}{g.dietary && <div>🍽 <b>Dietary:</b> {g.dietary}</div>}</div>}
        {!g.is_confirmed && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3">No confirmed ticket on file. {isManager ? 'You may override as a manager.' : 'Please flag this to a manager.'}</p>}
        {g.is_confirmed && !t && <p role="alert" className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3">No table assigned yet — flag to a manager before seating.</p>}

        {g.checked_in_at
          ? <div className="grid gap-2"><div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-center text-xl font-semibold text-emerald-100">✓ Checked in at {clock(g.checked_in_at)}</div><Button busy={busy === g.id} onClick={() => act(g, 'check_out')}>Undo check-in</Button></div>
          : <Button variant="gold" size="xl" busy={busy === g.id} disabled={!g.is_confirmed && !isManager} onClick={() => act(g, 'check_in')}>{g.is_confirmed ? 'Confirm identity & check in' : 'Manager override — check in'}</Button>}

        {comps.length > 0 && (
          <section aria-label="Companions"><h3 className="mb-2 text-xl">Companions</h3>
            <ul className="grid gap-2">{comps.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-ivory/10 p-3"><div><div className="text-lg font-semibold">{c.full_name}</div><div className="text-xs text-ivory/55">{c.is_confirmed ? 'Confirmed' : 'Not confirmed'}{c.checked_in_at ? ` · in at ${clock(c.checked_in_at)}` : ''}</div></div>
                {c.checked_in_at ? <Button busy={busy === c.id} onClick={() => act(c, 'check_out')}>Undo</Button> : <Button variant="gold" busy={busy === c.id} disabled={!c.is_confirmed && !isManager} onClick={() => act(c, 'check_in')}>Check in</Button>}</li>
            ))}</ul>
          </section>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => setFlagOpen(true)}>⚑ Flag exception</Button>
          {settings?.managerContact.phone ? <a className="btn-ghost btn-lg" href={`tel:${settings.managerContact.phone}`}>☎ Call manager</a> : <Button size="lg" disabled>☎ Call manager</Button>}
        </div>
      </div>
      <Modal open={flagOpen} onClose={() => setFlagOpen(false)} title="Flag an exception"><FlagForm eventId={event!.id} guestId={g.id} onDone={() => { setFlagOpen(false); toast('Flag sent to managers'); void d.refresh('flags'); }} /></Modal>
    </Modal>
  );
}

function FlagForm({ eventId, guestId, onDone }: { eventId: string; guestId: string | null; onDone: () => void }) {
  const [kind, setKind] = useState('seating'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const toast = useToast();
  return (
    <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await addFlag(eventId, guestId, kind, note); onDone(); setNote(''); } catch (x) { toast(friendly(x), 'error'); } finally { setBusy(false); } }}>
      <Field label="What kind of issue?" htmlFor="fk"><Select id="fk" value={kind} onChange={(e) => setKind(e.target.value)}><option value="seating">Seating problem</option><option value="identity">Identity question</option><option value="ticket">Ticket / payment</option><option value="dietary">Dietary need</option><option value="accessibility">Accessibility need</option><option value="other">Other / walk-in</option></Select></Field>
      <Field label="Details" htmlFor="fnote"><Input id="fnote" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Walk-in guest, no registration found" /></Field>
      <Button type="submit" variant="gold" size="lg" busy={busy} disabled={!note.trim()}>Send to manager</Button>
    </form>
  );
}
const FlagWalkIn = (p: { eventId: string; onDone: () => void }) => <div className="rounded-xl border border-ivory/10 p-4"><h3 className="mb-2 text-lg">Flag a walk-in or general issue</h3><FlagForm eventId={p.eventId} guestId={null} onDone={p.onDone} /></div>;

function Scanner({ eventId, onClose, onGuest }: { eventId: string; onClose: () => void; onGuest: (id: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Starting camera…');
  const [manual, setManual] = useState('');
  const toast = useToast();
  const busy = useRef(false);

  const lookup = async (value: string) => {
    if (busy.current) return; busy.current = true;
    try { const r = await resolveCredential({ eventId, value }); onGuest(r.guestId); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Could not read that code.'); setTimeout(() => { busy.current = false; }, 1500); return; }
    busy.current = false;
  };

  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!; v.srcObject = stream; await v.play(); setStatus('Hold a guest QR code in the frame');
        const tick = () => {
          if (stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && !busy.current) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) void lookup(code.data);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setStatus('Camera unavailable — type the guest’s private code instead.'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open onClose={onClose} title="Scan Guest QR">
      <div className="grid gap-4">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-gold/50 bg-black"><video ref={video} playsInline muted className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-gold-soft/80" /></div>
        <p role="status" className="text-center text-sm text-ivory/75">{status}</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) void lookup(manual); else toast('Enter a code first', 'info'); }}>
          <Input aria-label="Private code" placeholder="XXXX-XXXX" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" /><Button type="submit" variant="gold">Find</Button>
        </form>
      </div>
    </Modal>
  );
}
