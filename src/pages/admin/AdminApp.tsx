import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../lib/auth';
import { PageLoader } from '../../components/ui';
import Login from './Login';
import { Gate, Layout } from './Layout';

const CommandCenter = lazy(() => import('./CommandCenter'));
const Guests = lazy(() => import('./Guests'));
const Seating = lazy(() => import('./Seating'));
const CheckIn = lazy(() => import('./CheckIn'));
const ImportPage = lazy(() => import('./ImportPage'));
const QrPage = lazy(() => import('./QrPage'));
const Director = lazy(() => import('./Director'));
const Activity = lazy(() => import('./Activity'));
const Admin = lazy(() => import('./Admin'));

export default function AdminApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader label="Loading" />}>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Gate />}>
            <Route element={<Layout />}>
              <Route index element={<CommandCenter />} />
              <Route path="checkin" element={<CheckIn />} />
              <Route path="guests" element={<Guests />} />
              <Route path="seating" element={<Seating />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="qr" element={<QrPage />} />
              <Route path="director" element={<Director />} />
              <Route path="activity" element={<Activity />} />
              <Route path="settings" element={<Admin />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
