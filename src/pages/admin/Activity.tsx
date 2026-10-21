import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useEventData } from '../../lib/store';
import { describe, useActivity } from '../../lib/useActivity';
import { Button, Card, Empty, Input, Select } from '../../components/ui';
import { downloadCsv } from '../../lib/utils';

export default function Activity() {
  const { event } = useAuth();
  const d = useEventData();
  const [limit, setLimit] = useState(200);
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const { rows, loading } = useActivity(event!.id, limit);
  const nm = (id: string | null) => (id ? d.guestById.get(id)?.display_name || d.guestById.get(id)?.full_name || 'a guest' : 'a guest');
  const shown = useMemo(() => rows.filter((r) => (!entity || r.entity === entity) && (!q || (describe(r, nm) + (r.actor_email ?? '')).toLowerCase().includes(q.toLowerCase()))), [rows, entity, q, d.guestById]); // eslint-disable-line react-hooks/exhaustive-deps
  const entities = Array.from(new Set(rows.map((r) => r.entity)));
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-4xl">Activity History</h1><p className="text-ivory/60">Every change, who made it, and when. Check-ins are append-only.</p></div>
        <Button onClick={() => downloadCsv(`${event!.slug}-activity.csv`, shown.map((r) => ({ time: r.created_at, who: r.actor_email ?? 'system', action: r.action, entity: r.entity, summary: describe(r, nm), details: JSON.stringify(r.details) })))}>Export CSV</Button></div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2"><Input aria-label="Search activity" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /><Select aria-label="Type" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">All activity</option>{entities.map((x) => <option key={x}>{x}</option>)}</Select></div>
      <Card>
        {loading ? <div className="p-8 text-center text-ivory/60">Loading…</div> : shown.length === 0 ? <Empty title="No activity yet" /> : (
          <ul className="divide-y divide-ivory/10">{shown.map((r) => <li key={r.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr_12rem] sm:gap-4"><span className="text-ivory/55">{new Date(r.created_at).toLocaleString()}</span><span>{describe(r, nm)}</span><span className="truncate text-ivory/55 sm:text-right">{r.actor_email ?? 'system'}</span></li>)}</ul>
        )}
        {rows.length >= limit && <div className="p-3 text-center"><Button onClick={() => setLimit((l) => l + 300)}>Load older</Button></div>}
      </Card>
    </div>
  );
}
