import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, FileSearch, FolderTree, Gauge, Globe, KeyRound, Lock, Plug, Radio, Rocket, ScrollText, Server, ShieldCheck, Sparkles, UploadCloud, Users, Wand2, Bell, Layers, Fingerprint, EyeOff, Timer, Hammer } from 'lucide-react';
import PublicLayout from '../components/PublicLayout';
import { LinkButton, Reveal, Skeleton, cx } from '../components/ui';
import { usePublicConfig } from '../lib/useConfig';
import { money } from '../lib/format';

const FRAMEWORKS = ['Next.js', 'React', 'Vite', 'Vue', 'Nuxt', 'Astro', 'SvelteKit', 'Angular', 'Gatsby', 'Remix', 'Static HTML', 'Preact', 'Solid'];

const PREVIEW_LOGS = [
  ['system', '▸ Worker picked up the job'],
  ['info', 'Created Vercel project "aurora-site"'],
  ['info', 'Synced 3 environment variables — values hidden'],
  ['info', '42 files to upload, 118 already cached'],
  ['success', 'Vercel deployment created (dpl_••••)'],
  ['info', 'Running "npm run build"'],
  ['info', 'vite v7 building for production…'],
  ['info', '✓ 312 modules transformed.'],
  ['success', 'Build completed on Vercel'],
  ['success', 'Live URL responded with HTTP 200'],
];

function ProductPreview() {
  const [n, setN] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x >= PREVIEW_LOGS.length + 3 ? 2 : x + 1)), 900);
    return () => clearInterval(t);
  }, []);
  const shown = PREVIEW_LOGS.slice(0, Math.min(n, PREVIEW_LOGS.length));
  const done = n >= PREVIEW_LOGS.length;
  const steps = ['Source', 'Scan', 'Analyze', 'Settings', 'Subdomain', 'Review', 'Deploy'];
  const active = Math.min(6, Math.floor((n / PREVIEW_LOGS.length) * 7));
  return (
    <div className="relative">
      <div className="absolute -inset-8 rounded-[40px] bg-ember/20 blur-3xl" />
      <div className="glass-strong relative overflow-hidden rounded-3xl bg-bg/60 shadow-2xl shadow-black/30">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[11px] text-muted">deployforge · new project</span>
          <span className="ml-auto rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">Product preview</span>
        </div>
        <div className="grid gap-0 md:grid-cols-[180px_1fr]">
          <ol className="hidden space-y-1 border-r border-line p-3 md:block">
            {steps.map((s, i) => (
              <li key={s} className={cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs', i === active ? 'bg-ember/10 text-fg' : i < active ? 'text-muted' : 'text-faint')}>
                <span className={cx('flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold', i < active ? 'bg-ok/20 text-ok' : i === active ? 'bg-forge text-white' : 'bg-surface-2')}>{i < active ? <Check className="h-3 w-3" /> : i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-2">
              {[['Framework', 'Vite + React'], ['Files', '160'], ['Node', '22.x']].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line bg-surface p-2.5"><p className="text-[10px] text-muted">{k}</p><p className="mt-0.5 truncate text-xs font-semibold">{v}</p></div>
              ))}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full bg-forge" animate={{ width: `${Math.min(100, (n / PREVIEW_LOGS.length) * 100)}%` }} /></div>
            <div className="mt-3 h-52 overflow-hidden rounded-xl bg-term p-3 font-mono text-[11px] leading-relaxed sm:h-56">
              <AnimatePresence initial={false}>
                {shown.map(([lvl, msg], i) => (
                  <motion.div key={i + msg} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={lvl === 'success' ? 'text-ok' : lvl === 'system' ? 'text-info' : 'text-[#e9dfd6]'}>{msg}</motion.div>
                ))}
              </AnimatePresence>
              {!done && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-ember align-middle" />}
            </div>
            <AnimatePresence>
              {done && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-3 rounded-xl border border-ok/25 bg-ok/10 p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Check className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-xs font-semibold">Deployment completed</p><p className="truncate font-mono text-[11px] text-muted">https://aurora-site.vercel.app</p></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

const WORKFLOW = [
  { icon: Plug, title: 'Connect Vercel', text: 'Paste a personal access token. We validate it server-side, encrypt it, and never show it again.' },
  { icon: UploadCloud, title: 'Upload code', text: 'Drop a ZIP, choose a folder or import a public GitHub archive. node_modules and .env files are stripped.' },
  { icon: FileSearch, title: 'Analyze', text: 'Browse every file, then review detected framework, package manager, build command, Node version and env references.' },
  { icon: Wand2, title: 'Configure', text: 'Correct anything detected, add encrypted environment secrets and pick the Vercel account to use.' },
  { icon: Rocket, title: 'Deploy', text: 'A background job creates the Vercel project, uploads only new files and streams real build logs.' },
  { icon: Globe, title: 'Get a live URL', text: 'Receive the actual Vercel production URL, then attach custom domains with DNS instructions.' },
];

const FEATURES = [
  { icon: FolderTree, title: 'Safe file explorer', text: 'Searchable tree, file sizes and read-only source preview. Uploaded code is never executed on our servers.', span: 'lg:col-span-2' },
  { icon: Layers, title: '12+ frameworks', text: 'Next.js, Vite, CRA, Vue, Nuxt, Astro, SvelteKit, Angular, Gatsby, Remix and static sites.' },
  { icon: ScrollText, title: 'Streaming build logs', text: 'Live phases from Queued to Completed with searchable, filterable, downloadable logs.' },
  { icon: Users, title: 'Multiple Vercel accounts', text: 'Connect personal and team tokens; choose a connection per project.' },
  { icon: KeyRound, title: 'Encrypted env secrets', text: 'Values encrypted at rest, masked in the UI and redacted from build logs.', span: 'lg:col-span-2' },
  { icon: Globe, title: 'Domains & DNS', text: 'Generated URLs plus custom domains with verification status and exact records.' },
  { icon: Gauge, title: 'Plans & quotas', text: 'Server-enforced project limits with admin-configurable plans and pricing.' },
  { icon: Bell, title: 'In-app notifications', text: 'Deploy results, payment reviews, quota alerts and announcements.' },
];

const SECURITY = [
  { icon: Lock, title: 'AES-256-GCM at rest', text: 'Vercel tokens and secrets are encrypted before they touch the database.' },
  { icon: EyeOff, title: 'Write-only credentials', text: 'After saving, tokens are shown only as ••••last4 — never returned to the browser.' },
  { icon: Server, title: 'No code execution here', text: 'Builds run on Vercel’s isolated infrastructure. We only hash and transfer files.' },
  { icon: Fingerprint, title: 'Server-side authorization', text: 'Every endpoint verifies the session and ownership; admin actions require roles.' },
  { icon: Timer, title: 'Rate limits & timeouts', text: 'Abuse limits on uploads, tokens, deploys and payments; jobs time out and clean up.' },
  { icon: ShieldCheck, title: 'SSRF-guarded imports', text: 'URL imports are https-only, host-allowlisted and blocked from private networks.' },
];

const FAQ = [
  ['Do you host my website?', 'No. Your site is deployed to your own Vercel account using your token. DeployForge orchestrates the deployment and shows you the real results.'],
  ['What kind of token do I need?', 'A Vercel personal access token created at vercel.com/account/tokens. For team projects, scope it to the team and enter the team ID when connecting.'],
  ['Is my uploaded code run on your servers?', 'Never. Archives are unpacked in your browser for preview and analysis, stored privately, then files are hashed and sent to Vercel, which builds them on its isolated machines.'],
  ['Which projects are supported?', 'Anything Vercel can build: Next.js, Vite (React/Vue/Svelte), Create React App, Vue CLI, Nuxt, Astro, SvelteKit, Angular, Gatsby, Remix and plain HTML/CSS/JS.'],
  ['How do paid plans work?', 'When enabled by the admin, you choose a plan, send payment to the listed account and submit the transaction ID and proof. An admin verifies it manually — we never claim automatic verification.'],
  ['Can I use custom domains?', 'Yes. Add a domain to any project and we attach it on Vercel, check verification and show the DNS records you need.'],
];

export default function Landing() {
  const { config } = usePublicConfig();
  const [faq, setFaq] = useState<number | null>(0);

  return (
    <PublicLayout>
      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-32 sm:pt-40">
        <div className="pointer-events-none absolute left-1/2 top-24 h-40 w-40 -translate-x-1/2">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="animate-spark absolute bottom-0 h-1 w-1 rounded-full bg-amber" style={{ left: `${10 + i * 11}%`, animationDelay: `${i * 0.33}s` }} />
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-3xl text-center">
          <a href="#workflow" className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted transition hover:text-fg">
            <Sparkles className="h-3.5 w-3.5 text-ember" />Upload → analyze → deploy to Vercel<ArrowRight className="h-3 w-3" />
          </a>
          <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Forge your code into a <span className="text-forge">live URL</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
            DeployForge is a professional deployment workbench for Vercel. Upload source code, inspect every file, get framework-aware build settings and watch real build logs stream until your site is live.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to="/signup" size="lg" className="w-full sm:w-auto" icon={<Rocket className="h-4 w-4" />}>Start deploying free</LinkButton>
            <a href="#workflow" className="glass-strong inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-medium sm:w-auto">See how it works</a>
          </div>
          <p className="mt-5 text-xs text-faint">Free plan includes 5 projects · Your own Vercel account · No card required</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 40, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} className="mx-auto mt-16 max-w-4xl">
          <ProductPreview />
        </motion.div>
      </section>

      {/* FRAMEWORK MARQUEE */}
      <section className="border-y border-line bg-surface/40 py-6" aria-label="Supported frameworks">
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="animate-marquee flex w-max gap-12">
            {[...FRAMEWORKS, ...FRAMEWORKS].map((f, i) => <span key={i} className="font-display text-sm font-medium text-muted">{f}</span>)}
          </div>
        </div>
      </section>

      {/* CAPABILITY NUMBERS */}
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-20 md:grid-cols-4">
        {[['7', 'step guided wizard'], ['12+', 'frameworks detected'], ['256-bit', 'credential encryption'], ['0', 'lines of your code run on our servers']].map(([v, l], i) => (
          <Reveal key={l} delay={i * 0.08} className="glass rounded-2xl p-5">
            <p className="font-display text-3xl font-semibold text-forge sm:text-4xl">{v}</p>
            <p className="mt-2 text-sm text-muted">{l}</p>
          </Reveal>
        ))}
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">Workflow</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">From archive to production in six moves</h2>
          <p className="mt-4 text-muted">Each step is backed by a real API — no simulated progress, no invented URLs.</p>
        </Reveal>
        <div className="relative mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW.map((w, i) => (
            <Reveal key={w.title} delay={i * 0.07}>
              <div className="glass group relative h-full overflow-hidden rounded-3xl p-6 transition hover:-translate-y-1 hover:border-ember/30">
                <span className="absolute right-5 top-4 font-display text-5xl font-bold text-line-strong transition group-hover:text-ember/25">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ember/12 text-ember"><w.icon className="h-5 w-5" /></div>
                <h3 className="mt-5 font-display text-lg font-semibold">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{w.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">Features</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Everything between “it works locally” and “it’s live”</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.06} className={f.span}>
              <div className="glass group relative h-full overflow-hidden rounded-3xl p-6">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-ember/15 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" />
                <f.icon className="h-6 w-6 text-ember" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="relative scroll-mt-24 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">Security</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Built like a vault, not a demo</h2>
            <p className="mt-4 text-muted">Credentials and uploaded code are treated as sensitive and untrusted from the first byte. Every privileged action is written to an audit log.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SECURITY.map((s) => (
                <div key={s.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ok/10 text-ok"><s.icon className="h-4 w-4" /></div>
                  <div><p className="text-sm font-semibold">{s.title}</p><p className="mt-1 text-xs leading-relaxed text-muted">{s.text}</p></div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="glass-strong relative overflow-hidden rounded-3xl p-6 font-mono text-xs">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklab,var(--ok)_14%,transparent),transparent_55%)]" />
              <div className="relative space-y-3">
                <p className="text-muted">// what the browser receives after you save a token</p>
                <pre className="overflow-x-auto rounded-xl bg-term p-4 text-[#e9dfd6]">{`{
  "name": "Production account",
  "token_hint": "••••••••Xk2f",
  "vercel_username": "you",
  "status": "connected"
}`}</pre>
                <p className="text-muted">// what the database stores</p>
                <pre className="overflow-x-auto rounded-xl bg-term p-4 text-ok">{`token_encrypted: "k1:Qm9s…:7fA…:Zx0…"  // AES-256-GCM`}</pre>
                <div className="flex items-center gap-2 pt-2 text-muted"><Hammer className="h-3.5 w-3.5 text-ember" /> builds execute on Vercel — never here</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">Pricing</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Simple plans. Honest review.</h2>
          <p className="mt-4 text-muted">Start free. Upgrade by manual transfer — an admin verifies your proof before activation.</p>
        </Reveal>
        {config && !config.billing.paid_enabled && <p className="mx-auto mt-6 max-w-xl rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm text-muted">{config.billing.unavailable_message}</p>}
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {!config ? [0, 1].map((i) => <Skeleton key={i} className="h-96 rounded-3xl" />) : config.plans.map((p, i) => {
            const featured = !p.is_default && i === 1;
            const paidOff = Number(p.price) > 0 && !config.billing.paid_enabled;
            return (
              <Reveal key={p.id} delay={i * 0.08}>
                <div className={cx('relative h-full overflow-hidden rounded-3xl p-7', featured ? 'glass-strong glow' : 'glass')}>
                  {featured && <span className="absolute right-5 top-5 rounded-full bg-forge px-3 py-1 text-[11px] font-semibold text-white">Most popular</span>}
                  <p className="font-display text-lg font-semibold">{p.name}</p>
                  <p className="mt-4 flex items-baseline gap-2"><span className="font-display text-4xl font-semibold">{Number(p.price) === 0 ? 'Free' : money(p.price, p.currency)}</span>{Number(p.price) > 0 && p.duration_days > 0 && <span className="text-sm text-muted">/ {p.duration_days} days</span>}</p>
                  <p className="mt-2 text-sm text-muted">Up to <b className="text-fg">{p.project_limit}</b> projects</p>
                  <ul className="mt-6 space-y-3">
                    {(p.features || []).map((f: string) => <li key={f} className="flex items-start gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{f}</li>)}
                  </ul>
                  <LinkButton to={Number(p.price) === 0 ? '/signup' : '/app/billing'} variant={featured ? 'primary' : 'secondary'} className="mt-8 w-full">
                    {Number(p.price) === 0 ? 'Start free' : paidOff ? 'Currently unavailable' : `Choose ${p.name}`}
                  </LinkButton>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-20">
        <Reveal className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ember">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Questions, answered</h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="glass overflow-hidden rounded-2xl">
              <button onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ember" aria-expanded={faq === i}>
                {q}<ChevronDown className={cx('h-4 w-4 shrink-0 text-muted transition-transform', faq === i && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {faq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-ember/25 p-10 text-center sm:p-16">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--ember)_28%,transparent),transparent_70%)]" />
            <div className="grid-lines absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div className="relative">
              <Radio className="mx-auto h-8 w-8 text-ember" />
              <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-5xl">Your next deploy is one ZIP away.</h2>
              <p className="mx-auto mt-4 max-w-lg text-muted">Create an account, connect Vercel and watch your project go live with real logs.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <LinkButton to="/signup" size="lg" icon={<Rocket className="h-4 w-4" />}>Create free account</LinkButton>
                <LinkButton to="/docs" size="lg" variant="secondary">Read the docs</LinkButton>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </PublicLayout>
  );
}
