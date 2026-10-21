import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, isUuid, json, readJson, route, str } from './_lib/http';
import { requireStaff } from './_lib/auth';
import { limit } from './_lib/rate';
import { classifyRows, normalizeApiSubmission, normalizeCsvRow, type NormalizedGuest } from '../../shared/jotform';

export const config: Config = { path: '/api/import/stage' };

async function fetchJotform(formId: string): Promise<NormalizedGuest[]> {
  const key = process.env.JOTFORM_API_KEY;
  if (!key) throw new HttpError(503, 'JOTFORM_NOT_CONFIGURED', 'The Jotform API key has not been added to the server environment yet.');
  const base = (process.env.JOTFORM_API_BASE || 'https://api.jotform.com').replace(/\/$/, '');
  const out: NormalizedGuest[] = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const res = await fetch(`${base}/form/${encodeURIComponent(formId)}/submissions?limit=200&offset=${offset}&orderby=created_at`, {
      headers: { APIKEY: key }, // header, not query string, so the key never lands in logs
    });
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'JOTFORM_AUTH', 'Jotform rejected the API key.');
    if (!res.ok) throw new HttpError(502, 'JOTFORM_ERROR', `Jotform responded with ${res.status}.`);
    const j: any = await res.json();
    const batch: any[] = Array.isArray(j.content) ? j.content : [];
    for (const s of batch) if ((s.status ?? 'ACTIVE') === 'ACTIVE') out.push(normalizeApiSubmission(s));
    if (batch.length < 200) break;
  }
  return out;
}

export default route(['POST'], async (req) => {
  const b = await readJson(req, 5_500_000);
  if (!isUuid(b.eventId)) throw new HttpError(400, 'BAD_REQUEST');
  const actor = await requireStaff(req, b.eventId, 'manager');
  await limit(`stage:${actor.userId}`, 20, 600);
  const sb = admin();

  const { data: ev } = await sb.from('events').select('id,is_demo,jotform_form_id').eq('id', b.eventId).single();
  if (!ev) throw new HttpError(404, 'EVENT_NOT_FOUND');
  if (ev.is_demo) throw new HttpError(409, 'DEMO_PROTECTED', 'Imports are disabled for demonstration events so demo and real data can never mix.');

  let rows: NormalizedGuest[];
  let source: 'jotform_api' | 'csv';
  let fileName: string | null = null;
  if (b.source === 'jotform_api') {
    source = 'jotform_api';
    const formId = ev.jotform_form_id || process.env.JOTFORM_FORM_ID;
    if (!formId) throw new HttpError(400, 'NO_FORM', 'No Jotform form ID is set for this event.');
    rows = await fetchJotform(formId);
  } else if (b.source === 'csv') {
    source = 'csv';
    fileName = str(b.fileName, 200) || null;
    if (!Array.isArray(b.rows) || b.rows.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'The CSV contained no rows.');
    if (b.rows.length > 5000) throw new HttpError(413, 'TOO_MANY_ROWS');
    rows = b.rows.map((r: Record<string, string>) => normalizeCsvRow(r));
  } else throw new HttpError(400, 'BAD_REQUEST');

  const { data: existing, error: exErr } = await sb.from('guests').select('*').eq('event_id', ev.id).limit(10000);
  if (exErr) throw new HttpError(500, 'SERVER_ERROR');
  const classified = classifyRows(rows, (existing ?? []) as any);

  const counts: Record<string, number> = { total: classified.length, new: 0, updated: 0, unchanged: 0, duplicate: 0, incomplete: 0, error: 0 };
  for (const r of classified) counts[r.classification]++;

  const { data: run, error: runErr } = await sb.from('import_runs')
    .insert({ event_id: ev.id, source, file_name: fileName, counts, created_by: actor.userId }).select('id').single();
  if (runErr || !run) throw new HttpError(500, 'SERVER_ERROR');

  const payload = classified.map((r) => ({
    run_id: run.id, event_id: ev.id, row_index: r.index, submission_id: r.submissionId, classification: r.classification,
    decision: r.decision, payload: r.payload, diff: r.diff, matched_guest_id: r.matchedGuestId, messages: r.messages,
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await sb.from('import_rows').insert(payload.slice(i, i + 200));
    if (error) {
      await sb.from('import_runs').update({ status: 'failed' }).eq('id', run.id);
      throw new HttpError(500, 'SERVER_ERROR');
    }
  }
  return json({ runId: run.id, counts });
});
