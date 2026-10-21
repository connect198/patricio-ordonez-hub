import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { fillGreeting, type PublicEvent, type VerifiedGuestView } from '../../../shared/types';
import { ApiError, fetchPublicEvent, requestAssistance, verifyGuest } from '../../lib/api';
import { Crown, Sparkles } from '../../components/Crown';
import { FloorPlan } from '../../components/FloorPlan';
import { Button, Modal, Field, Input, Textarea, Spinner } from '../../components/ui';
import { formatDate, isLowBandwidth, setLowBandwidth } from '../../lib/utils';

type Step = 'arrival' | 'name' | 'welcome' | 'info';
type InfoTab = 'location' | 'program' | 'news';

export default function GuestExperience() {
  const { slug = '' } = useParams();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('arrival');
  const [guest, setGuest] = useState<VerifiedGuestView | null>(null);
  const [infoTab, setInfoTab] = useState<InfoTab>('location');
  const [lowbw, setLowbw] = useState(isLowBandwidth());
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => { setLowBandwidth(lowbw); }, [lowbw]);

  const load = useCallback(async () => {
    setLoadError(null);
    try { setEvent(await fetchPublicEvent(slug)); }
    catch (e) { setLoadError(e instanceof ApiError ? e.message : 'We could not load this event. Please check your connection.'); }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);

  // Personal QR: /e/slug#k=TOKEN → verify immediately and strip the secret from the address bar.
  useEffect(() => {
    const m = window.location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
    if (m) {
      tokenRef.current = m[1];
      history.replaceState(null, '', window.location.pathname);
      setAutoVerifying(true);
      verifyGuest({ slug, token: m[1] })
        .then((r) => { setGuest(r.guest); setStep('welcome'); })
        .catch(() => setStep('name'))
        .finally(() => setAutoVerifying(false));
      return;
    }
    try {
      const saved = sessionStorage.getItem(`kc-guest-${slug}`);
      if (saved) { setGuest(JSON.parse(saved)); setStep('welcome'); }
    } catch { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    try { guest ? sessionStorage.setItem(`kc-guest-${slug}`, JSON.stringify(guest)) : sessionStorage.removeItem(`kc-guest-${slug}`); } catch { /* ignore */ }
  }, [guest, slug]);

  useEffect(() => { if (event) document.title = `${event.name} · Kingdom Concierge™`; }, [event]);

  if (loadError) {
    return (
      <Shell lowbw={lowbw} setLowbw={setLowbw}>
        <div className="mx-auto grid max-w-md gap-4 text-center" role="alert">
          <Crown className="mx-auto h-16 w-16 opacity-80" glow={false} />
          <h1 className="text-3xl">We’re having trouble connecting</h1>
          <p className="text-ivory/70">{loadError}</p>
          <Button variant="gold" size="lg" onClick={load}>Try Again</Button>
          <p className="text-sm text-ivory/55">Or ask any member of our concierge team — they’d be delighted to help.</p>
        </div>
      </Shell>
    );
  }
  if (!event || autoVerifying) {
    return <Shell lowbw={lowbw} setLowbw={setLowbw}><div className="grid place-items-center py-24"><Spinner label={autoVerifying ? 'Preparing your welcome' : 'Opening the doors'} /></div></Shell>;
  }

  const s = event.settings;
  return (
    <Shell lowbw={lowbw} setLowbw={setLowbw} event={event} art={!lowbw ? s.artworkUrl : ''} full={step === 'arrival'}>
      {step === 'arrival' && <Arrival event={event} onBegin={() => setStep('name')} />}
      {step === 'name' && (
        <NameStep event={event} slug={slug} onBack={() => setStep('arrival')} onHelp={() => setHelpOpen(true)}
          onVerified={(g) => { setGuest(g); setStep('welcome'); }} />
      )}
      {step === 'welcome' && guest && (
        <Welcome event={event} guest={guest} lowbw={lowbw}
          onLocation={() => { setInfoTab('location'); setStep('info'); }}
          onProgram={() => { setInfoTab('program'); setStep('info'); }}
          onHelp={() => setHelpOpen(true)}
          onNotMe={() => { setGuest(null); setStep('name'); }} />
      )}
      {step === 'info' && (
        <Info event={event} guest={guest} tab={infoTab} setTab={setInfoTab} onBack={() => setStep('welcome')} onHelp={() => setHelpOpen(true)} />
      )}
      <Assistance open={helpOpen} onClose={() => setHelpOpen(false)} slug={slug} guest={guest} token={tokenRef.current} message={s.welcome.assistanceMessage} />
      {s.music.enabled && s.music.url && step !== 'arrival' && !lowbw && <MusicButton url={s.music.url} title={s.music.title} />}
    </Shell>
  );
}

// ───────────────────────── Shell ─────────────────────────
function Shell({ children, event, art, full, lowbw, setLowbw }: { children: React.ReactNode; event?: PublicEvent; art?: string; full?: boolean; lowbw: boolean; setLowbw: (v: boolean) => void }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {art && <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.16),transparent_65%)] fx animate-glow" aria-hidden="true" />
      {event?.isDemo && (
        <div className="relative z-20 bg-amber-300 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-widest text-royal" role="note">
          Demonstration — sample guests only · not a real event
        </div>
      )}
      <main className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col px-5 pb-24 pt-[max(1.5rem,env(safe-area-inset-top))] ${full ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <div className="flex-1">{children}</div>
      </main>
      <footer className="no-print absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-ivory/50">
        <span className="serif tracking-[0.2em]">KINGDOM CONCIERGE™</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={lowbw} onChange={(e) => setLowbw(e.target.checked)} />
          Low-bandwidth mode
        </label>
      </footer>
    </div>
  );
}

// ───────────────────────── Screen 1 ─────────────────────────
function Arrival({ event, onBegin }: { event: PublicEvent; onBegin: () => void }) {
  const w = event.settings.welcome;
  return (
    <section className="relative grid min-h-[82dvh] place-items-center text-center" aria-labelledby="arrival-h">
      <Sparkles />
      <div className="stagger relative grid justify-items-center gap-6">
        {event.settings.logoUrl
          ? <img src={event.settings.logoUrl} alt={`${event.name} logo`} className="h-24 w-auto object-contain" />
          : <Crown className="h-24 w-24 animate-float sm:h-32 sm:w-32" />}
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gold-soft sm:text-sm">{event.name}</p>
        <h1 id="arrival-h" className="gold-text max-w-4xl text-[clamp(2.6rem,9vw,6rem)] font-semibold leading-[1.02]">{w.arrivalHeadline}</h1>
        <p className="max-w-xl text-lg text-ivory/85 sm:text-xl">{w.arrivalSubheadline.replace('{eventName}', event.name)}</p>
        <div className="rule-gold w-48" />
        <Button variant="gold" size="xl" onClick={onBegin} className="min-w-[17rem]">{w.beginLabel}</Button>
        <p className="text-sm text-ivory/60">
          {[formatDate(event.eventDate), event.venue, event.city].filter(Boolean).join(' · ')}
        </p>
      </div>
    </section>
  );
}

// ───────────────────────── Screen 2 ─────────────────────────
function NameStep({ event, slug, onVerified, onBack, onHelp }: { event: PublicEvent; slug: string; onVerified: (g: VerifiedGuestView) => void; onBack: () => void; onHelp: () => void }) {
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [hp, setHp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = event.settings.verification;
  const label = v.allowCode && v.allowEmail ? 'Private code or registration email' : v.allowEmail ? 'Registration email' : 'Private code';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try { const r = await verifyGuest({ slug, name, secret, website: hp }); onVerified(r.guest); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="mx-auto grid min-h-[78dvh] max-w-xl content-center gap-7 animate-fade" aria-labelledby="name-h">
      <button onClick={onBack} className="justify-self-start rounded-lg px-1 py-2 text-sm text-ivory/60 hover:text-ivory">← Back</button>
      <div className="text-center">
        <Crown className="mx-auto mb-4 h-14 w-14" />
        <h1 id="name-h" className="text-[clamp(2.2rem,7vw,3.6rem)] font-semibold leading-tight">{event.settings.welcome.nameHeadline}</h1>
        <p className="mt-3 text-ivory/70">{event.settings.welcome.nameHelp}</p>
      </div>
      <form onSubmit={submit} className="card-gold grid gap-5 p-6 sm:p-8" noValidate>
        <Field label="Your full name" htmlFor="gname">
          <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words" enterKeyHint="next" required
            placeholder="e.g. Maria Rodriguez" className="min-h-[56px] text-lg" />
        </Field>
        <Field label={label} htmlFor="gsecret" hint="Found on your invitation, ticket or QR card — or the email you registered with.">
          <Input id="gsecret" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go" required
            placeholder={v.allowCode ? 'XXXX-XXXX or name@email.com' : 'name@email.com'} className="min-h-[56px] text-lg" />
        </Field>
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
        {err && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">{err}</p>}
        <Button type="submit" variant="gold" size="lg" busy={busy} disabled={name.trim().length < 2 || !secret.trim()}>
          {busy ? 'Finding your place…' : 'Continue'}
        </Button>
      </form>
      <button onClick={onHelp} className="mx-auto rounded-lg px-3 py-2 text-sm text-gold-soft underline-offset-4 hover:underline">Need assistance?</button>
    </section>
  );
}

// ───────────────────────── Screen 3 ─────────────────────────
function Welcome({ event, guest, lowbw, onLocation, onProgram, onHelp, onNotMe }: { event: PublicEvent; guest: VerifiedGuestView; lowbw: boolean; onLocation: () => void; onProgram: () => void; onHelp: () => void; onNotMe: () => void }) {
  const s = event.settings;
  const g = s.greetings[guest.category] ?? s.greetings.general;
  const vars = { firstName: guest.firstName, lastName: guest.lastName, displayName: guest.displayName };
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), lowbw ? 0 : 900); return () => clearTimeout(t); }, [lowbw]);
  const celebrate = s.celebrations.enabled && !lowbw;

  return (
    <section className="relative mx-auto grid max-w-2xl justify-items-center gap-6 pt-6 text-center" aria-live="polite">
      {celebrate && shown && guest.table && <Sparkles count={26} />}
      <Crown className="h-14 w-14 animate-float" />
      <div className="stagger grid gap-2">
        <h1 className="gold-text text-[clamp(2.4rem,8vw,4.5rem)] font-semibold leading-tight">{fillGreeting(g.headline, vars)}</h1>
        <p className="text-lg text-ivory/85 sm:text-xl">{fillGreeting(g.subline, vars)}</p>
      </div>
      <div className="rule-gold w-40" />

      {!guest.confirmed && <p className="max-w-md rounded-2xl border border-gold/30 bg-gold/5 p-5 text-ivory/90">{s.welcome.unconfirmedMessage}</p>}
      {guest.confirmed && !guest.table && (
        <p className="max-w-md rounded-2xl border border-gold/30 bg-gold/5 p-5 text-ivory/90">Your table is being finalized. Please see a member of our concierge team and they will seat you with great care.</p>
      )}
      {guest.table && (
        <div className={`grid justify-items-center gap-1 ${shown ? 'animate-reveal' : 'opacity-0'}`}>
          <div className="text-sm font-semibold uppercase tracking-[0.4em] text-gold-soft">{s.welcome.tableLabel}</div>
          <div className="table-number gold-text text-[clamp(8rem,32vw,16rem)]" aria-label={`Table ${guest.table.number}`}>{guest.table.number}</div>
          {guest.table.label && <div className="serif text-xl text-ivory/80">{guest.table.label}</div>}
        </div>
      )}

      {guest.book && s.bookRecognition.enabled && shown && (
        <figure className="mt-2 grid max-w-sm animate-reveal justify-items-center gap-3 rounded-2xl border border-gold/30 bg-charcoal/70 p-5">
          {!lowbw && guest.book.coverUrl && (
            <img src={guest.book.coverUrl} alt={`Cover of ${guest.book.title}`} loading="lazy" referrerPolicy="no-referrer"
              className="h-56 w-auto rounded-md shadow-[0_18px_40px_-12px_rgba(212,175,55,.45)]" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <figcaption className="grid gap-1">
            <span className="serif text-2xl font-semibold">{guest.book.title}</span>
            <span className="text-sm text-gold-soft">{s.welcome.bookMessage}</span>
          </figcaption>
        </figure>
      )}

      <nav className="mt-2 grid w-full max-w-md gap-3" aria-label="Guest options">
        {guest.table && <Button variant="gold" size="lg" onClick={onLocation}>View Table Location</Button>}
        <Button size="lg" onClick={onProgram}>View Evening Program</Button>
        <Button size="lg" onClick={onHelp}>Need Assistance?</Button>
      </nav>
      <button onClick={onNotMe} className="rounded-lg px-3 py-2 text-xs text-ivory/50 hover:text-ivory">Not {guest.firstName}? Start over</button>
    </section>
  );
}

// ───────────────────────── Screen 4 ─────────────────────────
function Info({ event, guest, tab, setTab, onBack, onHelp }: { event: PublicEvent; guest: VerifiedGuestView | null; tab: InfoTab; setTab: (t: InfoTab) => void; onBack: () => void; onHelp: () => void }) {
  const tabs: { id: InfoTab; label: string }[] = useMemo(() => [
    { id: 'location', label: 'Table Location' },
    { id: 'program', label: 'Evening Program' },
    { id: 'news', label: `Announcements${event.announcements.length ? ` (${event.announcements.length})` : ''}` },
  ], [event.announcements.length]);

  return (
    <section className="mx-auto grid max-w-2xl gap-6 animate-fade" aria-label="Guest information">
      <div className="sticky top-0 z-20 -mx-5 flex items-center justify-between gap-3 bg-royal/90 px-5 py-3 backdrop-blur">
        <button onClick={onBack} className="btn-ghost min-h-[48px]">← {guest?.table ? 'My Table' : 'Back'}</button>
        {guest?.table && (
          <button onClick={onBack} className="flex items-baseline gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-2" aria-label={`Return to my table, table ${guest.table.number}`}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-soft">Table</span>
            <span className="table-number gold-text text-4xl">{guest.table.number}</span>
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Information" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`min-h-[44px] whitespace-nowrap rounded-full border px-4 text-sm font-semibold ${tab === t.id ? 'border-gold bg-gold text-royal' : 'border-ivory/20 text-ivory/80'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'location' && (
        <div className="grid gap-4" role="tabpanel">
          <h2 className="text-3xl">Ballroom Layout</h2>
          <FloorPlan tables={event.tables} highlight={guest?.table?.number ?? null} />
          {guest?.table && <p className="text-lg">Your seat is at <strong className="text-gold-soft">Table {guest.table.number}</strong>. The stage is at the top of the room.</p>}
          {event.settings.info.directions && <p className="whitespace-pre-line rounded-xl border border-ivory/10 p-4 text-ivory/85">{event.settings.info.directions}</p>}
          {event.settings.info.ballroomNote && <p className="whitespace-pre-line text-sm text-ivory/65">{event.settings.info.ballroomNote}</p>}
          <p className="text-sm text-ivory/60">{[event.venue, event.city].filter(Boolean).join(' · ')}</p>
        </div>
      )}
      {tab === 'program' && (
        <div role="tabpanel" className="grid gap-4">
          <h2 className="text-3xl">Evening Program</h2>
          {event.program.length === 0 && <p className="text-ivory/65">The evening program will be shared here soon.</p>}
          <ol className="grid gap-3">
            {event.program.map((p) => (
              <li key={p.id} className="card flex gap-4 p-4">
                <div className="w-24 shrink-0 font-semibold text-gold-soft">{p.time}</div>
                <div><div className="serif text-xl">{p.title}</div>{p.description && <div className="text-sm text-ivory/70">{p.description}</div>}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {tab === 'news' && (
        <div role="tabpanel" className="grid gap-4">
          <h2 className="text-3xl">Announcements</h2>
          {event.announcements.length === 0 && <p className="text-ivory/65">No announcements at the moment.</p>}
          {event.announcements.map((a) => (
            <article key={a.id} className={`card p-4 ${a.pinned ? 'border-gold/50' : ''}`}>
              <h3 className="serif text-xl">{a.title}</h3>
              {a.body && <p className="mt-1 whitespace-pre-line text-ivory/80">{a.body}</p>}
            </article>
          ))}
        </div>
      )}
      <button onClick={onHelp} className="mx-auto rounded-lg px-3 py-2 text-sm text-gold-soft hover:underline">Need assistance?</button>
    </section>
  );
}

// ───────────────────────── Assistance & music ─────────────────────────
function Assistance({ open, onClose, slug, guest, token, message }: { open: boolean; onClose: () => void; slug: string; guest: VerifiedGuestView | null; token: string | null; message: string }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setState('idle'); setErr(''); } }, [open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await requestAssistance({ slug, name: guest?.displayName ?? name, message: note, token: token ?? undefined, website: hp });
      setState('sent');
    } catch (x) { setErr(x instanceof Error ? x.message : 'Please try again.'); setState('error'); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Need Assistance?">
      {state === 'sent' ? (
        <div className="grid gap-4 text-center" role="status">
          <Crown className="mx-auto h-12 w-12" />
          <p className="text-lg">{message}</p>
          <Button variant="gold" onClick={onClose}>Thank You</Button>
        </div>
      ) : (
        <form onSubmit={send} className="grid gap-4">
          <p className="text-sm text-ivory/70">Let us know and a member of our concierge team will come to you.</p>
          {!guest && <Field label="Your name" htmlFor="an"><Input id="an" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
          <Field label="How can we help? (optional)" htmlFor="am"><Textarea id="am" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          {state === 'error' && <p role="alert" className="text-sm text-red-200">{err}</p>}
          <Button type="submit" variant="gold" size="lg" busy={state === 'busy'}>Request a Concierge</Button>
        </form>
      )}
    </Modal>
  );
}

/** Music only ever starts from an explicit tap — never autoplays. */
function MusicButton({ url, title }: { url: string; title: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const toggle = async () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { try { await a.play(); setOn(true); } catch { setOn(false); } } else { a.pause(); setOn(false); }
  };
  return (
    <div className="no-print fixed bottom-14 right-4 z-30">
      <audio ref={ref} src={url} loop preload="none" />
      <button onClick={toggle} aria-pressed={on} className="btn-ghost rounded-full bg-royal/80 backdrop-blur">{on ? '❚❚ Pause music' : `♪ ${title || 'Play music'}`}</button>
    </div>
  );
}
