import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, Moon, Sun } from 'lucide-react';
import Logo from '../../components/Logo';
import Background from '../../components/Background';
import { useTheme } from '../../contexts/ThemeContext';

export default function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <Background intense />
      <aside className="relative hidden overflow-hidden border-r border-line p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="my-auto max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">DeployForge</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">Ship to Vercel with <span className="text-forge">confidence</span>.</h2>
          <ul className="mt-8 space-y-4">
            {['Encrypted Vercel tokens — never shown again', 'Framework-aware analysis with manual override', 'Real-time build logs from Vercel', 'Custom domains with DNS guidance'].map((t, i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-3 text-sm text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-ok/15 text-ok"><Check className="h-3.5 w-3.5" /></span>{t}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="glass rounded-2xl p-4 font-mono text-[11px] text-muted">
          <span className="text-ok">✓</span> Deployment completed in 38s → <span className="text-ember">your-site.vercel.app</span>
        </div>
      </aside>
      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden"><Logo /></div>
          <button onClick={toggle} className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}
