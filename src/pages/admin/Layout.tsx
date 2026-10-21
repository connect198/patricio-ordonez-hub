import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { EventDataProvider, useEventData } from '../../lib/store';
import { Crown } from '../../components/Crown';
import { Badge, Button, PageLoader, Select } from '../../components/ui';
import { cx } from '../../lib/utils';

export function Gate() {
  const { loading, session, account, event, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader label="Verifying your access" />;
  if (!session) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  if (!account) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="card max-w-md p-8">
          <Crown className="mx-auto mb-3 h-12 w-12" glow={false} />
          <h1 className="text-3xl">Access not yet granted</h1>
          <p className="mt-2 text-ivory/70">You are signed in, but this account has not been added to the event team. Please ask an owner to invite you.</p>
          <Button className="mt-5" onClick={signOut}>Sign out</Button>
        </div>
      </main>
    );
  }
  if (!event) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="card max-w-md p-8">
          <h1 className="text-3xl">No events yet</h1>
          <p className="mt-2 text-ivory/70">Create your first event from the Settings page{account.role === 'owner' ? '' : ' (an owner must do this)'}.</p>
          {account.role === 'owner' && <NavLink to="/admin/settings" className="btn-gold mt-5">Open Settings</NavLink>}
        </div>
      </main>
    );
  }
  return <Outlet />;
}

const NAV = [
  { to: '/admin', label: 'Command Center', end: true, icon: '◈', min: 'staff' },
  { to: '/admin/checkin', label: 'Check-In', icon: '✓', min: 'staff' },
  { to: '/admin/guests', label: 'Guests', icon: '☰', min: 'staff' },
  { to: '/admin/seating', label: 'Seating', icon: '◉', min: 'manager' },
  { to: '/admin/import', label: 'Import', icon: '⇩', min: 'manager' },
  { to: '/admin/qr', label: 'QR & Credentials', icon: '▦', min: 'manager' },
  { to: '/admin/director', label: 'Experience Director', icon: '♛', min: 'manager' },
  { to: '/admin/activity', label: 'Activity', icon: '≡', min: 'manager' },
  { to: '/admin/settings', label: 'Settings & Team', icon: '⚙', min: 'manager' },
] as const;

export function Layout() {
  const { event, account, isManager, signOut } = useAuth();
  const loc = useLocation();
  if (!event || !account) return null;
  // Floor staff land straight on check-in.
  if (!isManager && !/^\/admin\/?(checkin|guests)?$/.test(loc.pathname)) return <Navigate to="/admin/checkin" replace />;
  const items = NAV.filter((n) => n.min === 'staff' || isManager);
  return (
    <EventDataProvider key={event.id} eventId={event.id}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
        <aside className="no-print hidden border-r border-ivory/10 bg-royal/80 p-4 lg:block">
          <div className="sticky top-4 grid gap-6">
            <div className="flex items-center gap-3"><Crown className="h-10 w-10" glow={false} /><div><div className="serif text-xl leading-none">Kingdom</div><div className="text-[10px] uppercase tracking-[0.35em] text-gold-soft">Concierge™</div></div></div>
            <EventPicker />
            <nav className="grid gap-1" aria-label="Main">
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} end={'end' in n && n.end} className={({ isActive }) => cx('flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium', isActive ? 'bg-gold/15 text-gold-soft shadow-[inset_2px_0_0_#D4AF37]' : 'text-ivory/75 hover:bg-white/5')}>
                  <span aria-hidden="true" className="w-5 text-center">{n.icon}</span>{n.label}
                </NavLink>
              ))}
            </nav>
            <div className="grid gap-2 border-t border-ivory/10 pt-4 text-xs text-ivory/60">
              <div className="truncate">{account.display_name || account.email}</div>
              <Badge tone="gold">{account.role}</Badge>
              <Button onClick={signOut} className="mt-1">Sign out</Button>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <TopBar />
          <main className="mx-auto w-full max-w-[1500px] p-4 pb-28 sm:p-6 lg:pb-10">
            {event.is_demo && <div role="note" className="mb-4 rounded-xl bg-amber-300 px-4 py-2 text-center text-sm font-bold uppercase tracking-wider text-royal">Demonstration event — sample data only. Real imports are blocked here.</div>}
            <Outlet />
          </main>
        </div>

        <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-ivory/10 bg-royal/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n && n.end} className={({ isActive }) => cx('flex min-h-[60px] min-w-[76px] flex-1 flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-medium', isActive ? 'text-gold-soft' : 'text-ivory/70')}>
              <span aria-hidden="true" className="text-lg leading-none">{n.icon}</span><span className="whitespace-nowrap">{n.label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button onClick={signOut} className="flex min-h-[60px] min-w-[76px] flex-1 flex-col items-center justify-center text-[11px] text-ivory/60"><span aria-hidden="true" className="text-lg leading-none">⏻</span>Sign out</button>
        </nav>
      </div>
    </EventDataProvider>
  );
}

function EventPicker() {
  const { event, events, setEventId } = useAuth();
  return (
    <div>
      <label className="label" htmlFor="evsel">Event</label>
      <Select id="evsel" value={event?.id} onChange={(e) => setEventId(e.target.value)}>
        {events.map((e) => <option key={e.id} value={e.id}>{e.is_demo ? '[DEMO] ' : ''}{e.name}</option>)}
      </Select>
    </div>
  );
}

function TopBar() {
  const { event, events } = useAuth();
  const { live, ready, error, refresh } = useEventData();
  return (
    <header className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-ivory/10 bg-royal/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Crown className="h-8 w-8 lg:hidden" glow={false} />
        <div className="min-w-0">
          <div className="truncate font-serif text-xl font-semibold">{event?.name}</div>
          <div className="text-xs text-ivory/55">{[event?.event_date, event?.venue].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {events.length > 1 && <div className="lg:hidden"><EventPicker /></div>}
        {error ? <button onClick={() => refresh()} className="badge-bad" title={error}>Offline — retry</button>
          : !ready ? <Badge>Loading…</Badge>
          : live ? <Badge tone="ok"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />Live</Badge>
          : <Badge tone="warn" title="Realtime reconnecting; data refreshes every minute">Reconnecting</Badge>}
      </div>
    </header>
  );
}
