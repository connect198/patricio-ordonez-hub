import { admin } from './supabase';
import { HttpError } from './http';

export type Role = 'owner' | 'manager' | 'staff';
const rank: Record<Role, number> = { staff: 1, manager: 2, owner: 3 };

export interface Actor { userId: string; email: string; role: Role; eventIds: string[] | null }

/** Verifies the caller's Supabase JWT and their admin_accounts membership. */
export async function requireStaff(req: Request, eventId: string | null, min: Role = 'staff'): Promise<Actor> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  const { data: acct } = await sb
    .from('admin_accounts')
    .select('user_id,email,role,event_ids,active')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!acct || !acct.active) throw new HttpError(403, 'FORBIDDEN', 'This account is not authorized.');
  if (eventId && acct.event_ids && !acct.event_ids.includes(eventId)) throw new HttpError(403, 'FORBIDDEN', 'No access to this event.');
  if (rank[acct.role as Role] < rank[min]) throw new HttpError(403, 'FORBIDDEN', 'Your role does not allow this action.');
  return { userId: acct.user_id, email: acct.email, role: acct.role, eventIds: acct.event_ids };
}
