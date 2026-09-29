import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogoMark } from './Logo';

export function FullLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-ember/30 blur-2xl" />
        <LogoMark className="relative h-12 w-12 animate-pulse" />
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">{label}…</p>
    </div>
  );
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
