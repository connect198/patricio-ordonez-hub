import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import GuestExperience from './pages/guest/GuestExperience';
import { PageLoader } from './components/ui';
import { Crown } from './components/Crown';
import { DEMO_PREVIEW } from './lib/config';

// Staff tooling is code-split so the guest experience stays light on slow connections.
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

function Landing() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center justify-items-center gap-6 px-6 text-center">
      <Crown className="h-20 w-20 animate-float" />
      <h1 className="gold-text text-5xl font-semibold">Kingdom Concierge™</h1>
      <p className="serif text-xl text-ivory/80">Every Guest. Honored. Every Moment. Extraordinary.</p>
      <div className="rule-gold w-40" />
      <p className="text-sm text-ivory/60">Guests: please scan the QR code displayed at your event.</p>
      <Link to="/admin" className="btn-ghost">Event team sign-in</Link>
      {DEMO_PREVIEW && <Link to="/e/demo-kingdom-gala" className="btn-gold">Open demo experience</Link>}
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/e/:slug" element={<GuestExperience />} />
      <Route path="/admin/*" element={<Suspense fallback={<PageLoader label="Opening the command center" />}><AdminApp /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
