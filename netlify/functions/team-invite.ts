import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, isUuid, json, readJson, route, str } from './_lib/http';
import { requireStaff } from './_lib/auth';

export const config: Config = { path: '/api/team/invite' };

/** Owner-only: invite a staff member by email and grant a role (optionally limited to specific events). */
export default route(['POST'], async (req) => {
  const actor = await requireStaff(req, null, 'owner');
  const b = await readJson(req, 5_000);
  const email = str(b.email, 200).toLowerCase();
  const role = ['owner', 'manager', 'staff'].includes(b.role) ? b.role : 'staff';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'BAD_EMAIL', 'Please enter a valid email address.');
  const eventIds: string[] | null = Array.isArray(b.eventIds) && b.eventIds.length ? b.eventIds.filter(isUuid) : null;
  if (role === 'owner' && eventIds) throw new HttpError(400, 'BAD_REQUEST', 'Owners always have access to all events.');
  const sb = admin();
  const site = (process.env.PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');

  let userId: string | null = null;
  const invited = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/admin` });
  if (invited.data?.user) userId = invited.data.user.id;
  else {
    // Already registered — find them.
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  if (!userId) throw new HttpError(502, 'INVITE_FAILED', invited.error?.message ?? 'Could not create the account.');
  const { error } = await sb.from('admin_accounts').upsert({
    user_id: userId, email, display_name: str(b.displayName, 120) || null, role, event_ids: eventIds, active: true,
  });
  if (error) throw new HttpError(500, 'SERVER_ERROR');
  await sb.from('audit_logs').insert({ actor: actor.userId, actor_email: actor.email, action: 'team_invite', entity: 'admin_accounts', entity_id: userId, details: { email, role, eventIds } });
  return json({ ok: true, userId });
});
