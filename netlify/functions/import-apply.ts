import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, isUuid, json, readJson, route } from './_lib/http';
import { requireStaff } from './_lib/auth';
import { fetchAllRows } from './_lib/page';
import { toGuestColumns, type NormalizedGuest } from '../../shared/jotform';

export const config: Config = { path: '/api/import/apply' };

/**
 * Applies a reviewed import. Only importer-owned columns are written; category, ticket status, seating,
 * notes and flags are never touched on existing guests. Imported finalists are RECORDS, not confirmed attendees.
 */
export default route(['POST'], async (req) => {
  const b = await readJson(req, 5_000);
  if (!isUuid(b.runId)) throw new HttpError(400, 'BAD_REQUEST');
  const sb = admin();
  const { data: run } = await sb.from('import_runs').select('id,event_id,source,status').eq('id', b.runId).single();
  if (!run) throw new HttpError(404, 'NOT_FOUND');
  const actor = await requireStaff(req, run.event_id, 'manager');

  // Atomically claim the run so a double click cannot import twice.
  const { data: claimed } = await sb.from('import_runs').update({ status: 'applying' }).eq('id', run.id).eq('status', 'staged').select('id');
  if (!claimed?.length) throw new HttpError(409, 'ALREADY_APPLIED', 'This import has already been applied or discarded.');

  const result = { created: 0, updated: 0, merged: 0, skipped: 0, failed: 0, errors: [] as string[] };
  try {
    const rows = await fetchAllRows((from, to) => sb.from('import_rows').select('*').eq('run_id', run.id).order('row_index').range(from, to));
    const source = run.source === 'csv' ? 'csv' : 'jotform';
    const now = new Date().toISOString();
    const inserts: any[] = [];
    const updates: { id: string; cols: any; sub: string | null }[] = [];

    for (const r of rows) {
      const n = r.payload as NormalizedGuest;
      if (r.decision === 'skip' || r.classification === 'error' || r.classification === 'unchanged') { result.skipped++; continue; }
      const cols = toGuestColumns(n);
      if (r.classification === 'updated' && r.matched_guest_id) {
        updates.push({ id: r.matched_guest_id, cols: stripEmpty(cols), sub: null });
      } else if (r.decision === 'merge' && r.matched_guest_id) {
        updates.push({ id: r.matched_guest_id, cols: stripEmpty(cols), sub: r.submission_id });
      } else {
        inserts.push({ ...nullIfEmpty(cols), event_id: run.event_id, jotform_submission_id: r.submission_id, category: 'finalist', source, import_run_id: run.id, imported_at: now });
      }
    }

    for (let i = 0; i < inserts.length; i += 100) {
      const { error, count } = await sb.from('guests').insert(inserts.slice(i, i + 100), { count: 'exact' });
      if (error) { result.failed += Math.min(100, inserts.length - i); result.errors.push(error.message); } else result.created += count ?? 0;
    }
    for (let i = 0; i < updates.length; i += 10) {
      await Promise.all(updates.slice(i, i + 10).map(async (u) => {
        const patch: any = { ...u.cols, imported_at: now, import_run_id: run.id };
        if (u.sub) patch.jotform_submission_id = u.sub;
        const { error } = await sb.from('guests').update(patch).eq('id', u.id).eq('event_id', run.event_id);
        if (error) { result.failed++; result.errors.push(error.message); } else if (u.sub) result.merged++; else result.updated++;
      }));
    }
    await sb.from('import_runs').update({ status: result.failed && !result.created && !result.updated && !result.merged ? 'failed' : 'applied', applied_at: now, result }).eq('id', run.id);
    await sb.from('audit_logs').insert({ event_id: run.event_id, actor: actor.userId, actor_email: actor.email, action: 'import_applied', entity: 'import_runs', entity_id: run.id, details: result });
  } catch (e) {
    await sb.from('import_runs').update({ status: 'failed', result: { ...result, errors: [String(e)] } }).eq('id', run.id);
    throw e;
  }
  return json(result);
});

const nullIfEmpty = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));
const stripEmpty = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => !(v === '' || v == null || (Array.isArray(v) && v.length === 0))));
