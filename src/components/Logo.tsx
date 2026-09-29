import { Link } from 'react-router-dom';
import { cx } from './ui';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="df-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb53d" />
          <stop offset="1" stopColor="#ff4d1f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" className="fill-[#140f0c] dark:fill-[#1b1410]" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="url(#df-g)" strokeOpacity=".35" />
      <path d="M18 16h26l-6 9H27v6h13l-6 9h-7v8h-9z" fill="url(#df-g)" />
      <circle cx="47" cy="45" r="4" fill="#ffb53d" />
    </svg>
  );
}

export default function Logo({ to = '/', className, suffix }: { to?: string; className?: string; suffix?: string }) {
  return (
    <Link to={to} className={cx('group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember', className)} aria-label="DeployForge home">
      <LogoMark className="h-8 w-8 transition-transform duration-500 group-hover:rotate-[8deg]" />
      <span className="font-display text-[15px] font-semibold tracking-tight">Deploy<span className="text-forge">Forge</span></span>
      {suffix && <span className="rounded-md border border-ember/30 bg-ember/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ember">{suffix}</span>}
    </Link>
  );
}
