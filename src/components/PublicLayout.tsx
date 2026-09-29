import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Moon, Sun, X, Github, Mail } from 'lucide-react';
import Logo from './Logo';
import Background from './Background';
import { LinkButton, cx } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const LINKS = [
  { href: '/#workflow', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#security', label: 'Security' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/docs', label: 'Docs' },
];

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);
  return (
    <header className={cx('fixed inset-x-0 top-0 z-40 transition-all duration-300', scrolled ? 'py-2' : 'py-4')}>
      <div className={cx('mx-3 flex max-w-6xl items-center gap-4 rounded-2xl px-4 transition-all duration-300 sm:mx-4 sm:px-5 xl:mx-auto', scrolled ? 'glass-strong h-14 bg-bg/70 shadow-xl shadow-black/5' : 'h-14')}>
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-fg">{l.label}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ember" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          {user ? <LinkButton to="/app" size="sm">Dashboard</LinkButton> : <>
            <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-fg sm:block">Sign in</Link>
            <LinkButton to="/signup" size="sm">Start free</LinkButton>
          </>}
          <button onClick={() => setOpen((o) => !o)} className="rounded-xl p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass-strong mx-3 mt-2 rounded-2xl bg-bg/90 p-2 lg:hidden" aria-label="Mobile">
            {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-sm hover:bg-surface-2">{l.label}</a>)}
            {!user && <Link to="/login" className="block rounded-xl px-4 py-3 text-sm hover:bg-surface-2">Sign in</Link>}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">A deployment workbench for teams who ship to Vercel. Upload, analyze, configure and go live — with your own Vercel account and real build logs.</p>
          <div className="mt-5 flex gap-2">
            <a href="mailto:support@deployforge.app" className="glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg" aria-label="Email support"><Mail className="h-4 w-4" /></a>
            <a href="https://vercel.com/docs/rest-api" target="_blank" rel="noopener noreferrer" className="glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg" aria-label="Vercel API documentation"><Github className="h-4 w-4" /></a>
          </div>
        </div>
        {[
          { title: 'Product', links: [['How it works', '/#workflow'], ['Features', '/#features'], ['Pricing', '/#pricing'], ['FAQ', '/#faq']] },
          { title: 'Resources', links: [['Documentation', '/docs'], ['Security', '/#security'], ['Create account', '/signup'], ['Sign in', '/login']] },
          { title: 'Legal', links: [['Terms of service', '/terms'], ['Privacy policy', '/privacy'], ['Deployment guide', '/docs#deploy']] },
        ].map((c) => (
          <div key={c.title}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{c.title}</p>
            <ul className="mt-4 space-y-2.5">{c.links.map(([l, h]) => <li key={l}><a href={h} className="text-sm text-muted transition hover:text-fg">{l}</a></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-faint sm:flex-row">
          <p>© {new Date().getFullYear()} DeployForge. Not affiliated with Vercel Inc.</p>
          <p className="font-mono">Tokens encrypted · AES-256-GCM · Manual payment review</p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Background intense />
      <PublicNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
