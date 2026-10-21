import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Account, EventRow } from './types';

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  account: Account | null;
  events: EventRow[];
  event: EventRow | null;
  setEventId: (id: string) => void;
  reloadEvents: () => Promise<void>;
  isManager: boolean;
  isOwner: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventIdState] = useState<string | null>(() => { try { return localStorage.getItem('kc-event'); } catch { return null; } });

  const reloadEvents = useCallback(async () => {
    const { data } = await supabase.from('events').select('id,slug,name,tagline,kind,event_date,venue,city,is_demo,status,jotform_form_id,timezone').order('event_date', { ascending: false });
    setEvents((data as EventRow[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => {}).finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAccount(null); setEvents([]); return; }
    let live = true;
    (async () => {
      const { data: acct } = await supabase.from('admin_accounts').select('user_id,email,display_name,role,event_ids,active').eq('user_id', session.user.id).maybeSingle();
      if (!live) return;
      setAccount(acct && (acct as Account).active ? (acct as Account) : null);
      if (acct) await reloadEvents();
    })();
    return () => { live = false; };
  }, [session, reloadEvents]);

  const event = useMemo(() => events.find((e) => e.id === eventId) ?? events.find((e) => !e.is_demo) ?? events[0] ?? null, [events, eventId]);
  const setEventId = (id: string) => { setEventIdState(id); try { localStorage.setItem('kc-event', id); } catch { /* ignore */ } };

  const value: AuthCtx = {
    loading, session, account, events, event, setEventId, reloadEvents,
    isManager: account?.role === 'manager' || account?.role === 'owner',
    isOwner: account?.role === 'owner',
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
