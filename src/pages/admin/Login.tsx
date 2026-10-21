import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isConfigured } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Crown } from '../../components/Crown';
import { Button, Field, Input } from '../../components/ui';

export default function Login() {
  const { session, loading } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (!loading && session) return <Navigate to={loc.state?.from ?? '/admin'} replace />;

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMsg({ kind: 'error', text: 'Those credentials were not recognized.' });
    setBusy(false);
  }
  async function magic() {
    if (!email.trim()) return setMsg({ kind: 'error', text: 'Enter your email first.' });
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin` } });
    setMsg(error ? { kind: 'error', text: 'We could not send a link to that address.' } : { kind: 'ok', text: 'If that address belongs to a team member, a sign-in link is on its way.' });
    setBusy(false);
  }
  async function reset() {
    if (!email.trim()) return setMsg({ kind: 'error', text: 'Enter your email first.' });
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` });
    setMsg({ kind: 'ok', text: 'If that address belongs to a team member, a reset link is on its way.' });
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-8 grid justify-items-center gap-3 text-center">
          <Crown className="h-16 w-16" />
          <h1 className="gold-text text-4xl font-semibold">Kingdom Concierge™</h1>
          <p className="text-sm uppercase tracking-[0.3em] text-ivory/60">Event Team</p>
        </div>
        <form onSubmit={signIn} className="card-gold grid gap-5 p-6 sm:p-8">
          {!isConfigured && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see docs/DEPLOYMENT.md).</p>}
          <Field label="Email" htmlFor="em"><Input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${msg.kind === 'error' ? 'text-red-200' : 'text-emerald-200'}`}>{msg.text}</p>}
          <Button type="submit" variant="gold" size="lg" busy={busy} disabled={!password}>Sign In</Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" onClick={magic} className="text-gold-soft hover:underline">Email me a sign-in link</button>
            <button type="button" onClick={reset} className="text-ivory/60 hover:underline">Forgot password?</button>
          </div>
        </form>
      </div>
    </main>
  );
}
