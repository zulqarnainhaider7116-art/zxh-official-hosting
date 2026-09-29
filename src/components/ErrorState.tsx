import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertOctagon, Ban, CloudOff, CreditCard, FileWarning, Hammer, KeyRound, Lock, PackageX, Rocket, SearchX, ShieldAlert, TimerOff, UserX, WifiOff, Gauge, PlugZap } from 'lucide-react';
import { cx } from './ui';

export type ErrorKind = '404' | '401' | '403' | 'invalid_token' | 'connection_failed' | 'invalid_zip' | 'unsupported' | 'build_failed' | 'deploy_failed' | 'quota_reached' | 'payment_failed' | 'subscription_unavailable' | 'offline' | 'session_expired' | 'suspended' | 'generic';

const MAP: Record<ErrorKind, { icon: any; code?: string; title: string; description: string; tone: string }> = {
  '404': { icon: SearchX, code: '404', title: 'This page slipped off the anvil', description: 'The page you were looking for doesn’t exist or was moved.', tone: 'text-ember' },
  '401': { icon: Lock, code: '401', title: 'Sign in required', description: 'You need to sign in to view this page.', tone: 'text-info' },
  '403': { icon: ShieldAlert, code: '403', title: 'Access denied', description: 'Your account doesn’t have permission to open this area.', tone: 'text-bad' },
  invalid_token: { icon: KeyRound, title: 'Invalid Vercel token', description: 'Vercel rejected the token. Create a new personal access token and reconnect.', tone: 'text-bad' },
  connection_failed: { icon: PlugZap, title: 'Vercel connection failed', description: 'We couldn’t reach Vercel with this connection. Test it again or replace the token.', tone: 'text-warn' },
  invalid_zip: { icon: PackageX, title: 'Invalid ZIP archive', description: 'The file couldn’t be read as a ZIP. Re-export the project and try again.', tone: 'text-bad' },
  unsupported: { icon: FileWarning, title: 'Unsupported project', description: 'We couldn’t find a package.json or index.html. Upload the project root.', tone: 'text-warn' },
  build_failed: { icon: Hammer, title: 'Build failed', description: 'Vercel couldn’t build this project. Check the logs for the first error.', tone: 'text-bad' },
  deploy_failed: { icon: Rocket, title: 'Deployment failed', description: 'The deployment didn’t complete. Review the summary and retry.', tone: 'text-bad' },
  quota_reached: { icon: Gauge, title: 'Project limit reached', description: 'Your plan’s project quota is full. Upgrade or delete a project to continue.', tone: 'text-warn' },
  payment_failed: { icon: CreditCard, title: 'Payment submission failed', description: 'We couldn’t submit your payment details. Nothing was charged — please try again.', tone: 'text-bad' },
  subscription_unavailable: { icon: Ban, title: 'Paid subscriptions unavailable', description: 'Upgrades are switched off right now. You can keep using the Free plan.', tone: 'text-muted' },
  offline: { icon: WifiOff, title: 'You’re offline', description: 'Check your internet connection. We’ll keep your work on this page.', tone: 'text-warn' },
  session_expired: { icon: TimerOff, title: 'Session expired', description: 'For your security you’ve been signed out. Please sign in again.', tone: 'text-info' },
  suspended: { icon: UserX, title: 'Account suspended', description: 'This account has been suspended by an administrator.', tone: 'text-bad' },
  generic: { icon: AlertOctagon, title: 'Something went wrong', description: 'An unexpected error occurred. Please try again.', tone: 'text-bad' },
};

export default function ErrorState({ kind = 'generic', title, description, actions, className, compact }: { kind?: ErrorKind; title?: string; description?: ReactNode; actions?: ReactNode; className?: string; compact?: boolean }) {
  const m = MAP[kind] || MAP.generic;
  const Icon = m.icon || CloudOff;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cx('flex flex-col items-center text-center', compact ? 'py-8' : 'py-16', className)} role="alert">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-ember/20 blur-3xl" />
        {m.code && !compact && <p className="relative mb-2 font-display text-6xl font-bold tracking-tighter text-forge sm:text-7xl">{m.code}</p>}
        <div className={cx('glass-strong relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl', m.tone)}><Icon className="h-7 w-7" /></div>
      </div>
      <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">{title || m.title}</h2>
      <div className="mt-2 max-w-md text-sm text-muted">{description || m.description}</div>
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </motion.div>
  );
}
