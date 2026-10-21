import { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useAuth } from '../../lib/auth';
import { applyImport, serverStatus, stageImport, ApiError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { fetchAll, friendly, must } from '../../lib/db';
import { useEventData } from '../../lib/store';
import type { NormalizedGuest } from '../../../shared/jotform';
import { Badge, Button, Card, Empty, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cx, timeAgo } from '../../lib/utils';

interface Row { id: string; row_index: number; submission_id: string | null; classification: string; decision: 'import' | 'skip' | 'merge'; payload: NormalizedGuest; diff: Record<string, { from: unknown; to: unknown }> | null; matched_guest_id: string | null; messages: string[] }
interface Run { id: string; source: string; file_name: string | null; status: string; counts: Record<string, number>; result: any; created_at: string }

const TABS = [
  { id: 'new', label: 'New records' }, { id: 'updated', label: 'Updated records' }, { id: 'duplicate', label: 'Possible duplicates' },
  { id: 'incomplete', label: 'Incomplete records' }, { id: 'error', label: 'Import errors' }, { id: 'unchanged', label: 'Unchanged' },
] as const;

export default function ImportPage() {
  const { event } = useAuth();
  const d = useEventData();
  const toast = useToast();
  const [status, setStatus] = useState<{ jotform: boolean; credentials: boolean; formId: string | null } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const loadRuns = useCallback(async () => {
    const data = await must(supabase.from('import_runs').select('id,source,file_name,status,counts,result,created_at').eq('event_id', event!.id).order('created_at', { ascending: false }).limit(10));
    setRuns(data as Run[]);
  }, [event]);
  useEffect(() => { void loadRuns().catch(() => {}); serverStatus().then(setStatus).catch(() => setStatus({ jotform: false, credentials: false, formId: null })); }, [loadRuns]);

  const openRun = useCallback(async (id: string) => {
    setRunId(id); setResult(null);
    const data = await fetchAll<Row>((from, to) => supabase.from('import_rows').select('id,row_index,submission_id,classification,decision,payload,diff,matched_guest_id,messages').eq('run_id', id).order('row_index').range(from, to));
    setRows(data);
    const first = TABS.find((t) => data.some((r) => r.classification === t.id));
    if (first) setTab(first.id);
  }, []);

  const stage = async (source: 'jotform_api' | 'csv', csvRows?: Record<string, string>[], fileName?: string) => {
    setBusy(source);
    try { const r = await stageImport({ eventId: event!.id, source, rows: csvRows, fileName }); await loadRuns(); await openRun(r.runId); toast('Import staged — review before applying'); }
    catch (e) { toast(e instanceof ApiError ? e.message : friendly(e), 'error'); } finally { setBusy(null); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: true, complete: (r) => (r.data.length ? void stage('csv', r.data, f.name) : toast('That file has no rows.', 'error')), error: () => toast('Could not read that CSV.', 'error') });
  };
  const setDecision = async (ids: string[], decision: Row['decision']) => {
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, decision } : r)));
    try { await must(supabase.from('import_rows').update({ decision }).in('id', ids)); } catch (e) { toast(friendly(e), 'error'); if (runId) void openRun(runId); }
  };
  const apply = async () => {
    if (!runId) return; setBusy('apply');
    try { const r = await applyImport(runId); setResult(r); toast(`Imported: ${r.created} new, ${r.updated} updated, ${r.merged} merged`); await loadRuns(); await d.refresh('guests'); await openRun(runId); }
    catch (e) { toast(e instanceof ApiError ? e.message : friendly(e), 'error'); } finally { setBusy(null); }
  };
  const discard = async () => { if (!runId) return; await supabase.from('import_runs').update({ status: 'discarded' }).eq('id', runId); setRunId(null); setRows([]); await loadRuns(); };

  const run = runs.find((r) => r.id === runId);
  const staged = run?.status === 'staged';
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows.filter((r) => r.classification === t.id).length])), [rows]);
  const toApply = rows.filter((r) => r.decision !== 'skip' && !['error', 'unchanged'].includes(r.classification)).length;
  const visible = rows.filter((r) => r.classification === tab);

  return (
    <div className="grid gap-6">
      <div><h1 className="text-4xl">Import Finalists</h1><p className="max-w-3xl text-ivory/65">Imported finalists become <b>guest records</b> — never automatically confirmed attendees. Table assignments, ticket confirmations, guest types and notes managed by your team are never overwritten.</p></div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="grid gap-3 p-5" gold>
          <h2 className="text-2xl">A · Sync from Jotform</h2>
          <p className="text-sm text-ivory/70">Secure server-side sync of <b>Finalist Information Form</b> (ID {event?.jotform_form_id || status?.formId || '261778660839070'}). Your API key never reaches the browser.</p>
          {status && !status.jotform && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">The Jotform API key is not configured on the server yet. Add <code>JOTFORM_API_KEY</code> in Netlify → Site settings → Environment variables, or use the CSV upload.</p>}
          <Button variant="gold" size="lg" busy={busy === 'jotform_api'} disabled={!!busy || event?.is_demo || (status !== null && !status.jotform)} onClick={() => stage('jotform_api')}>Fetch submissions &amp; preview</Button>
        </Card>
        <Card className="grid gap-3 p-5">
          <h2 className="text-2xl">B · Upload a CSV export</h2>
          <p className="text-sm text-ivory/70">Use Jotform → Submissions → Download → CSV. Column headers are matched to the form’s questions automatically.</p>
          <label className={cx('btn-ghost btn-lg cursor-pointer', (busy || event?.is_demo) && 'pointer-events-none opacity-40')}>
            {busy === 'csv' ? <Spinner label="Reading file" /> : 'Choose CSV file'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </Card>
      </div>
      {event?.is_demo && <p className="rounded-xl bg-amber-300 p-3 text-center text-sm font-bold text-royal">Imports are disabled for demonstration events.</p>}

      {run && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-2xl">Review Import</h2><p className="text-sm text-ivory/60">{run.source === 'csv' ? `CSV · ${run.file_name ?? ''}` : 'Jotform API'} · {timeAgo(run.created_at)} · <Badge tone={run.status === 'applied' ? 'ok' : run.status === 'staged' ? 'gold' : 'mute'}>{run.status}</Badge></p></div>
            {staged && <div className="flex gap-2"><Button onClick={discard}>Discard</Button><Button variant="gold" busy={busy === 'apply'} disabled={!toApply} onClick={apply}>Apply {toApply} record{toApply === 1 ? '' : 's'}</Button></div>}
          </div>
          {result && <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm" role="status">Created {result.created} · updated {result.updated} · merged {result.merged} · skipped {result.skipped}{result.failed ? ` · FAILED ${result.failed}: ${result.errors?.[0] ?? ''}` : ''}</p>}
          <div role="tablist" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx('min-h-[44px] whitespace-nowrap rounded-full border px-4 text-sm font-semibold', tab === t.id ? 'border-gold bg-gold text-royal' : 'border-ivory/20 text-ivory/80')}>{t.label} <span className="opacity-70">({counts[t.id]})</span></button>)}
          </div>
          {staged && visible.length > 0 && tab !== 'unchanged' && tab !== 'error' && (
            <div className="mt-3 flex gap-2 text-sm"><button className="text-gold-soft hover:underline" onClick={() => setDecision(visible.map((r) => r.id), 'import')}>Include all</button><span className="text-ivory/30">|</span><button className="text-ivory/60 hover:underline" onClick={() => setDecision(visible.map((r) => r.id), 'skip')}>Skip all</button></div>
          )}
          <div className="mt-3 grid gap-2">
            {visible.length === 0 && <Empty title="Nothing in this category" />}
            {visible.slice(0, 300).map((r) => (
              <div key={r.id} className="grid gap-2 rounded-xl border border-ivory/10 p-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="font-semibold">{r.payload.displayName || r.payload.fullName || '(no name)'} <span className="font-normal text-ivory/50">· {r.payload.email || 'no email'} · JF #{r.submission_id ?? '—'}</span></div>
                  {r.payload.bookTitle && <div className="truncate text-sm text-ivory/65">“{r.payload.bookTitle}”</div>}
                  {r.messages.map((m) => <div key={m} className="text-xs text-amber-200/90">• {m}</div>)}
                  {r.diff && <ul className="mt-1 text-xs text-ivory/60">{Object.entries(r.diff).slice(0, 6).map(([k, v]) => <li key={k}><b>{k}</b>: {String(v.from ?? '—').slice(0, 40)} → {String(v.to).slice(0, 60)}</li>)}</ul>}
                </div>
                {staged && !['error', 'unchanged'].includes(r.classification) && (
                  <Select aria-label="Decision" className="sm:w-52" value={r.decision} onChange={(e) => setDecision([r.id], e.target.value as Row['decision'])}>
                    <option value="import">{r.classification === 'updated' ? 'Apply update' : 'Import as new'}</option>
                    {r.classification === 'duplicate' && r.matched_guest_id && <option value="merge">Merge into existing</option>}
                    <option value="skip">Skip</option>
                  </Select>
                )}
              </div>
            ))}
            {visible.length > 300 && <p className="text-center text-sm text-ivory/55">Showing first 300 of {visible.length}.</p>}
          </div>
        </Card>
      )}

      {runs.length > 0 && (
        <Card className="p-5"><h2 className="mb-3 text-2xl">Import History</h2>
          <ul className="divide-y divide-ivory/10 text-sm">{runs.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{r.source === 'csv' ? `CSV ${r.file_name ?? ''}` : 'Jotform API'} · {r.counts.total ?? 0} rows · {timeAgo(r.created_at)}</span><span className="flex items-center gap-2"><Badge tone={r.status === 'applied' ? 'ok' : r.status === 'failed' ? 'bad' : 'mute'}>{r.status}</Badge><button className="text-gold-soft hover:underline" onClick={() => openRun(r.id)}>Open</button></span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
