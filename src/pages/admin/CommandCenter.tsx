import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { describe, useActivity } from '../../lib/useActivity';
import { Badge, Card, Empty, ProgressBar, Stat } from '../../components/ui';
import { CATEGORIES } from '../../../shared/types';
import { clock, timeAgo } from '../../lib/utils';

export default function CommandCenter() {
  const { event, isManager } = useAuth();
  const d = useEventData();
  const { rows } = useActivity(event!.id, 10);
  const s = d.stats;
  const name = (id: string | null) => (id ? d.guestById.get(id)?.display_name || d.guestById.get(id)?.full_name || 'a guest' : 'a guest');
  const byCat = CATEGORIES.map((c) => ({ ...c, n: d.guests.filter((g) => g.category === c.value && g.is_confirmed).length })).filter((c) => c.n > 0);
  const maxCat = Math.max(1, ...byCat.map((c) => c.n));

  if (!d.ready) return <div className="grid gap-4"><div className="h-24 animate-pulse rounded-2xl bg-white/5" /><div className="h-64 animate-pulse rounded-2xl bg-white/5" /></div>;

  return (
    <div className="grid gap-6">
      <div className="text-center sm:text-left">
        <p className="text-xs uppercase tracking-[0.4em] text-gold-soft">Kingdom Concierge</p>
        <h1 className="gold-text text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-tight">KINGDOM CONCIERGE — COMMAND CENTER</h1>
      </div>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total guest records" value={s.total} sub="all imported & added" />
        <Stat label="Confirmed attendees" value={s.confirmed} tone="gold" sub="count toward seating" />
        <Stat label="Checked in" value={s.checkedIn} tone="gold" sub={`${s.confirmed ? Math.round((s.checkedIn / s.confirmed) * 100) : 0}% of confirmed`} />
        <Stat label="Awaiting arrival" value={s.awaiting} />
        <Stat label="Tables assigned" value={`${s.tablesAssigned}/${d.tables.length}`} sub="tables with guests" />
        <Stat label="Unassigned attendees" value={s.unassigned} tone={s.unassigned ? 'warn' : undefined} sub="confirmed, no table" />
        <Stat label="Seats remaining" value={s.seatsRemaining} sub={`of ${s.seatsTotal} total seats`} />
        <Stat label="Companions registered" value={s.companions} sub={`${s.checkedInCompanions} checked in`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl">Arrival Progress</h2><span className="text-sm text-ivory/60">{s.checkedIn} of {s.confirmed} confirmed</span></div>
          <ProgressBar value={s.checkedIn} max={s.confirmed} label="Check-in progress" />
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg text-ivory/80">Seating</h3>
              <ProgressBar value={s.seated} max={s.confirmed} label="Seated confirmed guests" />
              <p className="mt-1 text-sm text-ivory/60">{s.seated} seated · {s.unassigned} still need a table</p>
            </div>
            <div>
              <h3 className="mb-3 text-lg text-ivory/80">Confirmed by guest type</h3>
              {byCat.length === 0 ? <p className="text-sm text-ivory/55">No confirmed guests yet.</p> : (
                <ul className="grid gap-2">{byCat.map((c) => (
                  <li key={c.value} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm"><span className="truncate">{c.label}</span><ProgressBar value={c.n} max={maxCat} label={c.label} /><span className="text-right tabular-nums">{c.n}</span></li>
                ))}</ul>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-2xl">Needs Attention</h2><Badge tone={d.issues.length || s.openFlags || s.openAssists ? 'warn' : 'ok'}>{d.issues.length + s.openFlags + s.openAssists || 'All clear'}</Badge></div>
          <ul className="grid max-h-80 gap-2 overflow-y-auto text-sm">
            {d.assists.map((a) => <li key={a.id} className="rounded-lg border border-sky-300/30 bg-sky-300/5 p-2.5"><b>Assistance:</b> {a.name_given || 'A guest'} {a.message ? `— ${a.message}` : ''} <span className="text-ivory/50">{timeAgo(a.created_at)}</span></li>)}
            {d.flags.map((f) => <li key={f.id} className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-2.5"><b>{f.kind}:</b> {f.note}{f.guest_id ? ` — ${name(f.guest_id)}` : ''}</li>)}
            {d.issues.slice(0, 40).map((i) => <li key={i.id} className={`rounded-lg border p-2.5 ${i.severity === 'high' ? 'border-red-400/40 bg-red-400/5' : 'border-ivory/10'}`}>{i.text}</li>)}
            {!d.issues.length && !d.flags.length && !d.assists.length && <li className="text-ivory/55">No outstanding seating issues, flags or assistance requests.</li>}
          </ul>
          {isManager && <Link to="/admin/director" className="mt-3 inline-block text-sm text-gold-soft hover:underline">Manage assistance requests →</Link>}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl">Tables at a Glance</h2>{isManager && <Link to="/admin/seating" className="text-sm text-gold-soft hover:underline">Open Seating Designer →</Link>}</div>
        {d.tables.length === 0 ? <Empty title="No tables yet">Create tables in the Seating Designer to begin assigning confirmed guests.</Empty> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
            {d.tables.map((t) => {
              const n = d.guestsAtTable(t.id).length; const full = n >= t.capacity;
              return (
                <div key={t.id} className={`rounded-xl border p-2 text-center ${n > t.capacity ? 'border-red-400/60' : full ? 'border-gold/60' : 'border-ivory/10'}`} title={`${n}/${t.capacity} seated`}>
                  <div className="table-number text-3xl">{t.number}</div>
                  <div className="text-xs text-ivory/60 tabular-nums">{n}/{t.capacity}</div>
                  <div className="mt-1"><ProgressBar value={n} max={t.capacity} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-2xl">Live Activity</h2>
        {rows.length === 0 ? <p className="text-sm text-ivory/55">Activity will appear here as the team works.</p> : (
          <ul className="divide-y divide-ivory/10">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{describe(r, name)}</span><span className="shrink-0 text-xs text-ivory/50" title={r.actor_email ?? ''}>{r.actor_email?.split('@')[0] ?? 'system'} · {clock(r.created_at)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
