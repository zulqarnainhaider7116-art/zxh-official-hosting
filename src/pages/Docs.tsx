import PublicLayout from '../components/PublicLayout';
import { Reveal } from '../components/ui';

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  { id: 'start', title: 'Getting started', body: <ol className="list-decimal space-y-2 pl-5"><li>Create an account and verify your email.</li><li>Open <b>Vercel connections</b> and add a personal access token from <a className="text-ember hover:underline" href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer">vercel.com/account/tokens</a>. For a team, scope the token to that team and enter its team ID or slug.</li><li>Click <b>New project</b> and follow the seven-step wizard.</li></ol> },
  { id: 'source', title: 'Preparing your source', body: <><p>Upload a <code>.zip</code> of your project root (the folder containing <code>package.json</code> or <code>index.html</code>). You can also choose a folder or import a public GitHub repository.</p><ul className="mt-3 list-disc space-y-1 pl-5"><li><code>node_modules</code>, <code>.git</code>, <code>.next</code>, build caches and OS files are removed automatically.</li><li><code>.env</code> files are removed for safety — add their values as environment variables.</li><li>A single top-level wrapper folder (e.g. GitHub archives) is stripped.</li></ul></> },
  { id: 'analysis', title: 'Analysis & settings', body: <p>The analyzer reads <code>package.json</code>, lockfiles, framework config files, <code>.nvmrc</code> and scans source for <code>process.env.*</code> / <code>import.meta.env.*</code> references. It suggests framework, package manager, build/install commands, output directory and Node version. Every value can be corrected before deploying. Leave build fields empty to use Vercel’s framework defaults.</p> },
  { id: 'deploy', title: 'How deployments run', body: <><p>Deployments are background jobs with the phases <b>Queued → Preparing → Uploading → Building → Checking → Completed</b> (or Failed / Cancelled). The worker:</p><ol className="mt-3 list-decimal space-y-1 pl-5"><li>creates or updates the Vercel project and applies your settings,</li><li>syncs encrypted environment variables,</li><li>hashes every file (SHA-1) and uploads only files Vercel doesn’t already have,</li><li>creates a production deployment and streams Vercel’s real build events,</li><li>resolves the production alias and checks that it responds.</li></ol><p className="mt-3">Jobs use database leases, retry transient Vercel errors up to three times, time out after the configured limit and can be cancelled at any time. Your code is built on Vercel’s isolated infrastructure — never on DeployForge servers.</p></> },
  { id: 'domains', title: 'Custom domains', body: <><p>Add a domain in a project’s <b>Domains</b> tab. If the project has been deployed, it is attached on Vercel immediately; otherwise it’s attached after the first successful deployment.</p><ul className="mt-3 list-disc space-y-1 pl-5"><li>Apex domains: <code>A @ 76.76.21.21</code></li><li>Subdomains: <code>CNAME www cname.vercel-dns.com</code></li><li>If Vercel requests ownership verification, a TXT record is shown.</li></ul></> },
  { id: 'billing', title: 'Plans & payments', body: <p>The Free plan includes 5 projects. Paid plans are activated after an administrator manually reviews your payment proof. Payment verification is manual — DeployForge never claims automatic verification. If an admin requests a correction you can update and resubmit.</p> },
  { id: 'security', title: 'Security model', body: <ul className="list-disc space-y-1 pl-5"><li>Vercel tokens and env values are encrypted with AES-256-GCM before storage and never returned to the browser.</li><li>All API routes verify the session token and resource ownership server-side; admin routes check roles.</li><li>Rate limiting protects token validation, uploads, deploys and payments.</li><li>URL imports are https-only, host-allowlisted and blocked from private network ranges.</li><li>Privileged actions are recorded in an audit log.</li></ul> },
];

export default function Docs() {
  return (
    <PublicLayout>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-24 pt-32 lg:grid-cols-[220px_1fr]">
        <nav className="top-28 hidden self-start lg:sticky lg:block" aria-label="Documentation">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">Docs</p>
          <ul className="mt-4 space-y-1">{SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg">{s.title}</a></li>)}</ul>
        </nav>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Documentation</h1>
          <p className="mt-3 text-muted">Everything you need to deploy with DeployForge.</p>
          <div className="mt-10 space-y-6">
            {SECTIONS.map((s) => (
              <Reveal key={s.id}>
                <section id={s.id} className="glass scroll-mt-28 rounded-3xl p-6 text-sm leading-relaxed text-muted sm:p-8 [&_b]:text-fg [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-fg">
                  <h2 className="mb-4 font-display text-lg font-semibold text-fg">{s.title}</h2>
                  {s.body}
                </section>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
