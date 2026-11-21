// 管理後台 /admin（02 L、04 ADR-15）。程式碼分割成獨立的區塊，不放進 Service Worker 預先快取，一般使用者不會下載。
// 進入前依序確認：是系統管理員（不是的人直接回首頁，看不到任何後台內容）→ 兩步驟驗證（aal2）。
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { adminApi, adminErrorOf, verifiedTotpFactorId } from '../../data/admin.ts';
import { supabase } from '../../data/supabase.ts';
import { AuthLayout, ErrorLine, linkButton } from '../auth/AuthLayout.tsx';
import { InvitesPage } from './InvitesPage.tsx';
import { LogsPage } from './LogsPage.tsx';
import { MfaEnroll, MfaVerify } from './mfa.tsx';
import { SettingsPage } from './SettingsPage.tsx';
import { UsersPage } from './UsersPage.tsx';

type Gate = { kind: 'loading' } | { kind: 'forbidden' } | { kind: 'enroll' } | { kind: 'verify'; factorId: string } | { kind: 'ready' } | { kind: 'error' };

function useGate(): [Gate, () => void] {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const check = useCallback(async () => {
    try {
      await adminApi.config();
      setGate({ kind: 'ready' });
    } catch (e) {
      const code = adminErrorOf(e);
      if (code === 'forbidden' || code === 'unauthorized') return setGate({ kind: 'forbidden' });
      if (code !== 'mfa_required') return setGate({ kind: 'error' });
      try {
        const factorId = await verifiedTotpFactorId();
        setGate(factorId ? { kind: 'verify', factorId } : { kind: 'enroll' });
      } catch {
        setGate({ kind: 'error' });
      }
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);
  return [gate, () => void check()];
}

const NAV = [
  { to: '/admin', end: true, id: 'admin.nav.invites' },
  { to: '/admin/users', end: false, id: 'admin.nav.users' },
  { to: '/admin/settings', end: false, id: 'admin.nav.settings' },
  { to: '/admin/logs', end: false, id: 'admin.nav.logs' },
];

function Layout() {
  const intl = useIntl();
  return (
    <div className="min-h-dvh bg-bg md:flex">
      <nav
        aria-label={intl.formatMessage({ id: 'admin.title' })}
        className="flex flex-col gap-2 border-b border-line bg-surface px-4 py-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:py-6"
      >
        <div className="flex items-center gap-2">
          <Chef size={40} mood="quiet" />
          <span className="font-round text-card-title font-bold"><FormattedMessage id="admin.title" /></span>
        </div>
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 md:mt-3 md:flex-col">
          {NAV.map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex min-h-10 items-center rounded-card px-3 text-caption font-bold whitespace-nowrap no-underline ${isActive ? 'bg-bulb-soft text-ink' : 'text-ink-muted'}`
                }
              >
                <FormattedMessage id={n.id} />
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 md:mt-auto">
          <NavLink to="/" className="min-h-10 content-center text-caption text-ink-muted underline underline-offset-4"><FormattedMessage id="admin.backToApp" /></NavLink>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-[960px] min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminApp() {
  const intl = useIntl();
  const [gate, recheck] = useGate();

  switch (gate.kind) {
    case 'loading':
      return null; // 還沒確認是管理員之前，什麼都不顯示
    case 'forbidden':
      return <Navigate to="/" replace />;
    case 'enroll':
      return <MfaEnroll onDone={recheck} />;
    case 'verify':
      return <MfaVerify factorId={gate.factorId} onDone={recheck} />;
    case 'error':
      return (
        <AuthLayout title={intl.formatMessage({ id: 'admin.title' })} mood="quiet">
          <ErrorLine id="admin.error.network" />
          <div className="flex justify-center gap-2">
            <button type="button" className={linkButton} onClick={recheck}><FormattedMessage id="admin.retry" /></button>
            <button type="button" className={linkButton} onClick={() => void supabase().auth.signOut()}><FormattedMessage id="admin.signOut" /></button>
          </div>
        </AuthLayout>
      );
    case 'ready':
      return (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<InvitesPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      );
  }
}

export default AdminApp;
