import PublicLayout from '../components/PublicLayout';

const TERMS = [
  ['Service', 'DeployForge orchestrates deployments to your own Vercel account using credentials you provide. You remain responsible for the content you deploy and for complying with Vercel’s terms.'],
  ['Accounts', 'Keep your login credentials secure. We may suspend accounts that abuse the service, attempt to bypass limits or deploy unlawful content.'],
  ['Plans & payments', 'Paid plans are activated after manual review of submitted payment proof. Plan prices, limits and durations are shown before purchase and may change for future periods.'],
  ['Availability', 'We aim for high availability but the service depends on third parties such as Vercel. Deployments may fail or be delayed for reasons outside our control.'],
  ['Liability', 'The service is provided “as is”. To the extent permitted by law we are not liable for indirect or consequential damages.'],
];
const PRIVACY = [
  ['What we store', 'Your account email and profile, encrypted Vercel tokens, project settings, uploaded source archives, deployment logs, domains, encrypted environment variables, payment submissions and audit logs.'],
  ['How credentials are protected', 'Tokens and secret values are encrypted with AES-256-GCM on the server and are never returned to the browser after saving.'],
  ['Uploaded code', 'Archives are stored privately and used only to deploy your projects. You can delete a project at any time, which removes its stored archive.'],
  ['Payment proofs', 'Proof files are stored privately and are visible only to you and authorized administrators for review.'],
  ['Contact', 'Questions about your data? Contact support@deployforge.app.'],
];

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const items = kind === 'terms' ? TERMS : PRIVACY;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{kind === 'terms' ? 'Terms of service' : 'Privacy policy'}</h1>
        <p className="mt-3 text-sm text-muted">Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</p>
        <div className="mt-10 space-y-4">
          {items.map(([t, b]) => (
            <section key={t} className="glass rounded-2xl p-6">
              <h2 className="font-display text-base font-semibold">{t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
