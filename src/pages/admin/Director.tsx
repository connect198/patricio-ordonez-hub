import { useCallback, useEffect, useState } from 'react';
import { CATEGORIES, DEFAULT_SETTINGS, mergeSettings, type EventSettings, type GuestCategory } from '../../../shared/types';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { friendly, must } from '../../lib/db';
import { setAssist } from '../../lib/actions';
import { Badge, Button, Card, Empty, Field, Input, Textarea, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cx, timeAgo } from '../../lib/utils';

type Tab = 'messages' | 'greetings' | 'program' | 'announce' | 'assets' | 'assist';
interface Prog { id: string; time_label: string; title: string; description: string | null; sort_order: number; published: boolean }
interface Ann { id: string; title: string; body: string | null; pinned: boolean; published: boolean; created_at: string }

export default function Director() {
  const { event } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('messages');
  const [s, setS] = useState<EventSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prog, setProg] = useState<Prog[]>([]);
  const [ann, setAnn] = useState<Ann[]>([]);

  const load = useCallback(async () => {
    const [st, pr, an] = await Promise.all([
      supabase.from('event_settings').select('settings').eq('event_id', event!.id).maybeSingle(),
      supabase.from('program_items').select('*').eq('event_id', event!.id).order('sort_order'),
      supabase.from('announcements').select('*').eq('event_id', event!.id).order('created_at', { ascending: false }),
    ]);
    setS(mergeSettings(st.data?.settings)); setProg((pr.data as Prog[]) ?? []); setAnn((an.data as Ann[]) ?? []); setLoaded(true);
  }, [event]);
  useEffect(() => { void load(); }, [load]);

  const save = async (next = s) => {
    setSaving(true);
    try { const { data: u } = await supabase.auth.getUser(); await must(supabase.from('event_settings').upsert({ event_id: event!.id, settings: next, updated_by: u.user?.id })); toast('Experience updated — live for guests within seconds'); }
    catch (e) { toast(friendly(e), 'error'); } finally { setSaving(false); }
  };
  const patch = <K extends keyof EventSettings>(k: K, v: Partial<EventSettings[K]>) => setS((x) => ({ ...x, [k]: { ...(x[k] as object), ...(v as object) } as EventSettings[K] }));

  const upload = async (file: File | undefined, kind: 'logo' | 'artwork' | 'music') => {
    if (!file) return;
    const okType = kind === 'music' ? /^audio\//.test(file.type) : /^image\//.test(file.type);
    if (!okType) return toast(kind === 'music' ? 'Please choose an audio file (MP3/M4A/OGG).' : 'Please choose an image (PNG, JPG, WebP or SVG).', 'error');
    if (file.size > 8 * 1024 * 1024) return toast('Files must be under 8 MB — compress for fast mobile loading.', 'error');
    const path = `${event!.id}/${kind}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('event-assets').upload(path, file, { upsert: false, contentType: file.type });
    if (error) return toast(friendly(error), 'error');
    const url = supabase.storage.from('event-assets').getPublicUrl(path).data.publicUrl;
    setS((x) => kind === 'logo' ? { ...x, logoUrl: url } : kind === 'artwork' ? { ...x, artworkUrl: url } : { ...x, music: { ...x.music, url } });
    toast('Uploaded — remember to save');
  };

  if (!loaded) return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'messages', label: 'Welcome Messages' }, { id: 'greetings', label: 'VIP Greetings' }, { id: 'program', label: 'Evening Program' },
    { id: 'announce', label: 'Announcements' }, { id: 'assets', label: 'Artwork & Music' }, { id: 'assist', label: `Assistance${d.assists.length ? ` (${d.assists.length})` : ''}` },
  ];
  const w = s.welcome;
  const setW = (k: keyof EventSettings['welcome']) => (e: any) => patch('welcome', { [k]: e.target.value } as any);

  return (
    <div className="grid gap-5">
      <div><p className="text-xs uppercase tracking-[0.4em] text-gold-soft">Kingdom Concierge</p><h1 className="gold-text text-4xl font-semibold">EXPERIENCE DIRECTOR</h1></div>
      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx('min-h-[44px] whitespace-nowrap rounded-full border px-4 text-sm font-semibold', tab === t.id ? 'border-gold bg-gold text-royal' : 'border-ivory/20 text-ivory/80')}>{t.label}</button>)}</div>

      {tab === 'messages' && (
        <Card className="grid gap-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Arrival headline" htmlFor="w1"><Input id="w1" value={w.arrivalHeadline} onChange={setW('arrivalHeadline')} /></Field>
            <Field label="Arrival subheadline" htmlFor="w2" hint="{eventName} is replaced automatically."><Input id="w2" value={w.arrivalSubheadline} onChange={setW('arrivalSubheadline')} /></Field>
            <Field label="Begin button" htmlFor="w3"><Input id="w3" value={w.beginLabel} onChange={setW('beginLabel')} /></Field>
            <Field label="Name screen headline" htmlFor="w4"><Input id="w4" value={w.nameHeadline} onChange={setW('nameHeadline')} /></Field>
            <Field label="Name screen help text" htmlFor="w5"><Input id="w5" value={w.nameHelp} onChange={setW('nameHelp')} /></Field>
            <Field label="Table reveal label" htmlFor="w6"><Input id="w6" value={w.tableLabel} onChange={setW('tableLabel')} /></Field>
            <Field label="Book recognition message" htmlFor="w7"><Input id="w7" value={w.bookMessage} onChange={setW('bookMessage')} /></Field>
            <Field label="Assistance confirmation" htmlFor="w8"><Input id="w8" value={w.assistanceMessage} onChange={setW('assistanceMessage')} /></Field>
          </div>
          <Field label="Message for guests without a confirmed seat" htmlFor="w9"><Textarea id="w9" value={w.unconfirmedMessage} onChange={setW('unconfirmedMessage')} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Table directions (shown with the ballroom map)" htmlFor="d1"><Textarea id="d1" value={s.info.directions} onChange={(e) => patch('info', { directions: e.target.value })} placeholder="e.g. Enter the Grand Ballroom through the main doors…" /></Field>
            <Field label="Ballroom note" htmlFor="d2"><Textarea id="d2" value={s.info.ballroomNote} onChange={(e) => patch('info', { ballroomNote: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle checked={s.celebrations.enabled} onChange={(v) => patch('celebrations', { enabled: v })} label="Visual celebrations" description="Subtle gold sparkles on the table reveal. Automatically off for low-bandwidth and reduced-motion guests." />
            <Toggle checked={s.bookRecognition.enabled} onChange={(v) => patch('bookRecognition', { enabled: v })} label="Book recognition for finalists" description="Shows cover + title only when a cover exists and marketing permission was granted." />
            <Toggle checked={s.verification.allowCode} onChange={(v) => patch('verification', { allowCode: v })} label="Allow private code verification" />
            <Toggle checked={s.verification.allowEmail} onChange={(v) => patch('verification', { allowEmail: v })} label="Allow registration-email verification" description="Name + the email used on the registration form." />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Manager name" htmlFor="m1"><Input id="m1" value={s.managerContact.name} onChange={(e) => patch('managerContact', { name: e.target.value })} /></Field>
            <Field label="Manager phone (staff “Call manager”)" htmlFor="m2"><Input id="m2" type="tel" value={s.managerContact.phone} onChange={(e) => patch('managerContact', { phone: e.target.value })} /></Field>
            <Field label="Manager email" htmlFor="m3"><Input id="m3" type="email" value={s.managerContact.email} onChange={(e) => patch('managerContact', { email: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button variant="gold" busy={saving} onClick={() => save()}>Save &amp; publish</Button></div>
        </Card>
      )}

      {tab === 'greetings' && (
        <Card className="grid gap-5 p-5">
          <p className="text-sm text-ivory/65">Use <code>{'{firstName}'}</code>, <code>{'{lastName}'}</code> or <code>{'{displayName}'}</code>. Keep it warm and dignified.</p>
          {CATEGORIES.map((c) => {
            const g = s.greetings[c.value as GuestCategory];
            const set = (k: 'headline' | 'subline') => (e: any) => setS((x) => ({ ...x, greetings: { ...x.greetings, [c.value]: { ...x.greetings[c.value as GuestCategory], [k]: e.target.value } } }));
            return (
              <div key={c.value} className="grid gap-3 rounded-xl border border-ivory/10 p-4 md:grid-cols-[10rem_1fr_1fr]">
                <div className="font-semibold text-gold-soft">{c.label}</div>
                <Field label="Headline" htmlFor={`gh-${c.value}`}><Input id={`gh-${c.value}`} value={g.headline} onChange={set('headline')} /></Field>
                <Field label="Subline" htmlFor={`gs-${c.value}`}><Input id={`gs-${c.value}`} value={g.subline} onChange={set('subline')} /></Field>
                <div className="rounded-lg bg-black/40 p-3 text-center md:col-span-3"><div className="gold-text serif text-2xl">{g.headline.replace('{firstName}', 'Maria').replace('{lastName}', 'Rodriguez').replace('{displayName}', 'Maria Rodriguez')}</div><div className="text-sm text-ivory/75">{g.subline}</div></div>
              </div>
            );
          })}
          <div className="flex justify-between"><Button onClick={() => setS((x) => ({ ...x, greetings: DEFAULT_SETTINGS.greetings }))}>Reset to defaults</Button><Button variant="gold" busy={saving} onClick={() => save()}>Save &amp; publish</Button></div>
        </Card>
      )}

      {tab === 'program' && <ProgramEditor eventId={event!.id} items={prog} reload={load} />}
      {tab === 'announce' && <Announcements eventId={event!.id} items={ann} reload={load} />}

      {tab === 'assets' && (
        <Card className="grid gap-5 p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2"><Field label="Gala logo" htmlFor="up1" hint="Replaces the crown on the arrival screen. PNG/SVG with transparent background works best."><input id="up1" type="file" accept="image/*" className="input" onChange={(e) => upload(e.target.files?.[0], 'logo')} /></Field>{s.logoUrl && <div className="flex items-center gap-3"><img src={s.logoUrl} alt="Logo preview" className="h-16 rounded bg-black/40 p-1" /><button className="text-sm text-red-200 hover:underline" onClick={() => setS((x) => ({ ...x, logoUrl: '' }))}>Remove</button></div>}</div>
            <div className="grid gap-2"><Field label="Event artwork (background)" htmlFor="up2" hint="Shown softly behind guest screens (skipped in low-bandwidth mode). Keep under 8 MB."><input id="up2" type="file" accept="image/*" className="input" onChange={(e) => upload(e.target.files?.[0], 'artwork')} /></Field>{s.artworkUrl && <div className="flex items-center gap-3"><img src={s.artworkUrl} alt="Artwork preview" className="h-16 rounded" /><button className="text-sm text-red-200 hover:underline" onClick={() => setS((x) => ({ ...x, artworkUrl: '' }))}>Remove</button></div>}</div>
          </div>
          <div className="grid gap-3 rounded-xl border border-ivory/10 p-4">
            <h3 className="text-xl">Optional Music</h3>
            <p className="text-sm text-ivory/65">Music never plays automatically — guests see a small “Play music” button and must tap it. Use music you are licensed to play.</p>
            <Toggle checked={s.music.enabled} onChange={(v) => patch('music', { enabled: v })} label="Offer music to guests" />
            <div className="grid gap-3 md:grid-cols-2"><Field label="Track title" htmlFor="mt"><Input id="mt" value={s.music.title} onChange={(e) => patch('music', { title: e.target.value })} /></Field><Field label="Upload audio" htmlFor="mu"><input id="mu" type="file" accept="audio/*" className="input" onChange={(e) => upload(e.target.files?.[0], 'music')} /></Field></div>
            {s.music.url && <audio controls src={s.music.url} className="w-full" preload="none" />}
          </div>
          <div className="flex justify-end"><Button variant="gold" busy={saving} onClick={() => save()}>Save &amp; publish</Button></div>
        </Card>
      )}

      {tab === 'assist' && (
        <Card className="p-5">
          <h2 className="mb-3 text-2xl">Assistance Requests</h2>
          {d.assists.length === 0 ? <Empty title="No open requests">When a guest taps “Need Assistance?”, it appears here instantly.</Empty> : (
            <ul className="grid gap-2">{d.assists.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/30 p-3"><div><b>{a.name_given || 'A guest'}</b>{a.guest_id && <> · <Badge tone="ok">verified</Badge></>} <span className="text-xs text-ivory/50">{timeAgo(a.created_at)}</span><div className="text-sm text-ivory/80">{a.message || 'No message'}</div></div>
                <div className="flex gap-2">{a.status === 'open' && <Button onClick={() => setAssist(a.id, 'handling').then(() => d.refresh('assists'))}>On my way</Button>}<Button variant="gold" onClick={() => setAssist(a.id, 'resolved').then(() => d.refresh('assists'))}>Resolved</Button></div></li>
            ))}</ul>
          )}
        </Card>
      )}
    </div>
  );
}

function ProgramEditor({ eventId, items, reload }: { eventId: string; items: Prog[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [t, setT] = useState(''); const [title, setTitle] = useState(''); const [desc, setDesc] = useState('');
  const run = async (fn: () => PromiseLike<unknown>) => { try { await fn(); await reload(); } catch (e) { toast(friendly(e), 'error'); } };
  return (
    <Card className="grid gap-4 p-5">
      <ol className="grid gap-2">{items.map((p, i) => (
        <li key={p.id} className="grid gap-2 rounded-xl border border-ivory/10 p-3 md:grid-cols-[8rem_1fr_auto] md:items-center">
          <span className="font-semibold text-gold-soft">{p.time_label}</span>
          <div><div className="serif text-lg">{p.title}</div>{p.description && <div className="text-sm text-ivory/65">{p.description}</div>}</div>
          <div className="flex items-center gap-1">
            <Button aria-label="Move up" disabled={i === 0} onClick={() => run(async () => { await supabase.from('program_items').update({ sort_order: items[i - 1].sort_order }).eq('id', p.id); await supabase.from('program_items').update({ sort_order: p.sort_order }).eq('id', items[i - 1].id); })}>↑</Button>
            <Button aria-label="Move down" disabled={i === items.length - 1} onClick={() => run(async () => { await supabase.from('program_items').update({ sort_order: items[i + 1].sort_order }).eq('id', p.id); await supabase.from('program_items').update({ sort_order: p.sort_order }).eq('id', items[i + 1].id); })}>↓</Button>
            <Button onClick={() => run(() => supabase.from('program_items').update({ published: !p.published }).eq('id', p.id))}>{p.published ? 'Published' : 'Hidden'}</Button>
            <Button variant="danger" onClick={() => run(() => supabase.from('program_items').delete().eq('id', p.id))}>Delete</Button>
          </div>
        </li>))}
        {items.length === 0 && <Empty title="No program items yet">Add the evening’s schedule below.</Empty>}
      </ol>
      <form className="grid gap-3 rounded-xl border border-gold/30 p-4 md:grid-cols-[8rem_1fr_1fr_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from('program_items').insert({ event_id: eventId, time_label: t, title, description: desc || null, sort_order: (items.at(-1)?.sort_order ?? 0) + 10 })).then(() => { setT(''); setTitle(''); setDesc(''); }); }}>
        <Field label="Time" htmlFor="pt"><Input id="pt" required value={t} onChange={(e) => setT(e.target.value)} placeholder="6:30 PM" /></Field>
        <Field label="Title" htmlFor="pti"><Input id="pti" required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Details (optional)" htmlFor="pd"><Input id="pd" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Button type="submit" variant="gold">Add</Button>
      </form>
    </Card>
  );
}

function Announcements({ eventId, items, reload }: { eventId: string; items: Ann[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [pinned, setPinned] = useState(false);
  const run = async (fn: () => PromiseLike<unknown>) => { try { await fn(); await reload(); } catch (e) { toast(friendly(e), 'error'); } };
  return (
    <Card className="grid gap-4 p-5">
      <form className="grid gap-3 rounded-xl border border-gold/30 p-4" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from('announcements').insert({ event_id: eventId, title, body: body || null, pinned, published: true })).then(() => { setTitle(''); setBody(''); setPinned(false); toast('Announcement published'); }); }}>
        <Field label="Headline" htmlFor="at"><Input id="at" required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Message" htmlFor="ab"><Textarea id="ab" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#D4AF37]" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top</label><Button type="submit" variant="gold">Publish announcement</Button></div>
      </form>
      <ul className="grid gap-2">{items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ivory/10 p-3"><div><div className="serif text-lg">{a.title} {a.pinned && <Badge tone="gold">pinned</Badge>} {!a.published && <Badge>hidden</Badge>}</div><div className="whitespace-pre-line text-sm text-ivory/70">{a.body}</div></div>
          <div className="flex gap-2"><Button onClick={() => run(() => supabase.from('announcements').update({ published: !a.published }).eq('id', a.id))}>{a.published ? 'Unpublish' : 'Publish'}</Button><Button variant="danger" onClick={() => run(() => supabase.from('announcements').delete().eq('id', a.id))}>Delete</Button></div></li>
      ))}{items.length === 0 && <Empty title="No announcements" />}</ul>
    </Card>
  );
}
