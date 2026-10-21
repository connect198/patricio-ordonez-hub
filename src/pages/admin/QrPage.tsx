import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { issueCredentials, ApiError, type IssuedCredential } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Card, Field, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { downloadCsv, formatDate } from '../../lib/utils';
import { Crown } from '../../components/Crown';
import type { EventRow } from '../../lib/types';

const origin = () => (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;
export const eventUrl = (slug: string) => `${origin()}/e/${slug}`;

function Qr({ value, size = 220, dark = '#0B0B0D', light = '#FFFFFF', label }: { value: string; size?: number; dark?: string; light?: string; label: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark, light } }).then(setSvg); }, [value, dark, light]);
  return <div role="img" aria-label={label} style={{ width: size, height: size }} className="[&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function doPrint(mode: 'sign' | 'cards') {
  document.body.dataset.print = mode;
  window.print();
  setTimeout(() => delete document.body.dataset.print, 500);
}

export default function QrPage() {
  const { event, events } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [creds, setCreds] = useState<Record<string, boolean>>({});
  const [issued, setIssued] = useState<IssuedCredential[]>([]);
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState<EventRow | null>(null);
  const [scope, setScope] = useState('missing');
    const ev = sign ?? event!;

  const loadCreds = async () => {
    const { data } = await supabase.from('guest_credentials').select('guest_id').eq('event_id', event!.id).is('revoked_at', null);
    setCreds(Object.fromEntries((data ?? []).map((c) => [c.guest_id, true])));
  };
  useEffect(() => { void loadCreds(); }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmed = d.guests.filter((g) => g.is_confirmed);
  const missing = confirmed.filter((g) => !creds[g.id]);

  const issue = async (regenerate: boolean) => {
    setBusy(true);
    try {
      const r = await issueCredentials({ eventId: event!.id, scope: 'confirmed', regenerate });
      setIssued(r.issued); await loadCreds();
      toast(r.issued.length ? `Issued ${r.issued.length} credentials — save or print them now; they cannot be shown again.` : 'Everyone confirmed already has a credential.');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not issue credentials.', 'error'); } finally { setBusy(false); }
  };
  const revoke = async (guestId: string) => {
    const { error } = await supabase.from('guest_credentials').update({ revoked_at: new Date().toISOString() }).eq('guest_id', guestId).is('revoked_at', null);
    if (error) toast('Could not revoke.', 'error'); else { toast('Credential revoked'); void loadCreds(); }
  };
  const revokeAll = async () => {
    if (!confirm('Revoke ALL active guest credentials for this event? Guests will need new codes or must use their registration email.')) return;
    const { error } = await supabase.from('guest_credentials').update({ revoked_at: new Date().toISOString() }).eq('event_id', event!.id).is('revoked_at', null);
    if (error) toast('Could not revoke.', 'error'); else { toast('All credentials revoked'); setIssued([]); void loadCreds(); }
  };

  return (
    <div className="grid gap-6">
      <div className="no-print"><h1 className="text-4xl">Royal QR Experience</h1><p className="text-ivory/65">Public signage, private guest credentials, and a printable sign for every Kingdom event.</p></div>

      <Card className="no-print p-5" gold>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl">A · Main Welcome QR &amp; Printable Signage</h2><p className="text-sm text-ivory/65">Everyone scans the same code; guests then verify privately.</p></div>
          <div className="flex items-end gap-2">
            <Field label="Event" htmlFor="qe"><Select id="qe" value={ev.id} onChange={(e) => setSign(events.find((x) => x.id === e.target.value) ?? null)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
            <Button variant="gold" onClick={() => doPrint('sign')}>Print sign</Button>
          </div>
        </div>
        <p className="mt-2 break-all text-xs text-ivory/55">{eventUrl(ev.slug)}</p>
        {ev.status === 'draft' && <p className="mt-2 text-sm text-amber-200">This event is still a draft — set it to “live” in Settings so the QR code opens the experience.</p>}
      </Card>

      <div className="sign-block mx-auto w-full max-w-xl rounded-3xl border-4 border-double border-[#D4AF37] bg-[#0B0B0D] p-8 text-center text-[#F7E7CE] print:max-w-none print:rounded-none print:border-8 print:p-16" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        <Crown className="mx-auto h-20 w-20" glow={false} />
        <p className="mt-2 text-xs uppercase tracking-[0.4em] text-[#E6C968]">{ev.name}</p>
        <h2 className="gold-text my-3 text-5xl font-semibold leading-tight print:text-7xl">Your Royal Evening Awaits.</h2>
        <div className="mx-auto my-6 w-fit rounded-2xl bg-white p-4"><Qr value={eventUrl(ev.slug)} size={280} label={`QR code for ${ev.name}`} /></div>
        <p className="serif text-3xl print:text-4xl">Scan to find your table</p>
        <p className="mt-2 text-sm text-[#CDBFA8]">Point your phone camera at the code{ev.event_date ? ` · ${formatDate(ev.event_date)}` : ''}</p>
        <p className="mt-6 text-[10px] uppercase tracking-[0.5em] text-[#D4AF37]">Kingdom Concierge™</p>
      </div>

      <Card className="p-5 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <h2 className="no-print text-2xl">B · Private Guest Credentials</h2>
        <p className="no-print mt-1 max-w-3xl text-sm text-ivory/70">Each confirmed guest can receive a personal QR link and an 8-character private code. Credentials are random, stored only as keyed hashes, revocable, and shown <b>once</b> at creation. Guests without one can still verify with their name + registration email.</p>
        <div className="no-print mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="gold">{confirmed.length - missing.length} of {confirmed.length} confirmed guests have credentials</Badge>
          <Select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} className="w-56"><option value="missing">Only guests without one</option><option value="all">Regenerate for everyone</option></Select>
          <Button variant="gold" busy={busy} disabled={confirmed.length === 0} onClick={() => issue(scope === 'all')}>Issue credentials</Button>
          <Button variant="danger" onClick={revokeAll}>Revoke all</Button>
        </div>
        {issued.length > 0 && (
          <div className="mt-5 grid gap-3">
            <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm"><span>⚠ Save these now — plaintext codes are not stored.</span>
              <span className="flex gap-2"><Button onClick={() => downloadCsv(`${event!.slug}-credentials.csv`, issued.map((c) => ({ name: c.name, private_code: c.code, personal_link: c.url })))}>Download CSV</Button><Button variant="gold" onClick={() => doPrint('cards')}>Print cards</Button></span></div>
            <div className="cards-block grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
              {issued.map((c) => (
                <div key={c.guestId} className="break-inside-avoid rounded-xl border border-gold/40 bg-royal p-4 text-center print:border-black print:bg-white print:text-black">
                  <div className="serif text-xl">{c.name}</div>
                  <div className="mx-auto my-2 w-fit rounded-lg bg-white p-2"><Qr value={c.url} size={140} label={`Personal QR for ${c.name}`} /></div>
                  <div className="font-mono text-xl font-bold tracking-widest text-gold-soft print:text-black">{c.code}</div>
                  <div className="text-[10px] text-ivory/50 print:text-black">{ev.name} · scan or visit the event page and enter your code</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {confirmed.length > 0 && (
          <details className="no-print mt-5"><summary className="cursor-pointer text-sm text-gold-soft">Revoke an individual credential</summary>
            <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto text-sm">{confirmed.filter((g) => creds[g.id]).map((g) => <li key={g.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1.5"><span>{g.display_name || g.full_name}</span><button className="text-red-200 hover:underline" onClick={() => revoke(g.id)}>Revoke</button></li>)}</ul></details>
        )}
      </Card>

      <Card className="no-print p-5">
        <h2 className="text-2xl">C · Staff QR-Scanning Mode</h2>
        <p className="mt-1 text-sm text-ivory/70">Open <b>Check-In</b> on a phone or tablet and tap <b>Scan QR</b>. The camera reads a guest’s personal QR (or a typed code); the server resolves it only for signed-in staff.</p>
      </Card>

      <Card className="no-print p-5">
        <h2 className="text-2xl">D · QR Codes for Every Kingdom Event</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <div key={e.id} className="grid justify-items-center gap-2 rounded-xl border border-ivory/10 p-4 text-center">
              <div className="rounded-lg bg-white p-2"><Qr value={eventUrl(e.slug)} size={150} label={`QR for ${e.name}`} /></div>
              <div className="serif text-lg">{e.name}</div>{e.is_demo && <Badge tone="warn">DEMO</Badge>}
              <div className="break-all text-xs text-ivory/50">{eventUrl(e.slug)}</div>
              <Button onClick={() => { setSign(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Make sign</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
