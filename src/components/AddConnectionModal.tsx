import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import { Button, Field, Input, Modal } from './ui';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function AddConnectionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: any) => void }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [team, setTeam] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => { if (open) { setName(''); setToken(''); setTeam(''); setErrors({}); } }, [open]);

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Give this connection a name (e.g. “Personal”).';
    if (token.trim().length < 16) errs.token = 'Paste a valid Vercel personal access token.';
    if (team && !/^[A-Za-z0-9_-]+$/.test(team.trim())) errs.team = 'Team ID can contain letters, numbers, - and _.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const c = await api('/api/connections', { method: 'POST', body: { name: name.trim(), token: token.trim(), team_id: team.trim() } });
      setToken('');
      toast.success('Vercel connected', `Signed in as ${c.vercel_username}${c.team_name ? ` · ${c.team_name}` : ''}`);
      onCreated(c);
      onClose();
    } catch (e: any) {
      if (e.code === 'invalid_token') setErrors({ token: e.message });
      else if (e.code === 'invalid_team') setErrors({ team: e.message });
      else setErrors({ form: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect a Vercel account" description="Your token is validated with Vercel, encrypted, and never shown again." footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={submit} loading={loading} icon={<ShieldCheck className="h-4 w-4" />}>Validate & connect</Button>
    </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Connection name" htmlFor="cn" error={errors.name} required><Input id="cn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal account" maxLength={60} /></Field>
        <Field label="Personal access token" htmlFor="ct" error={errors.token} required hint={<>Create one at <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ember hover:underline">vercel.com/account/tokens <ExternalLink className="h-3 w-3" /></a>. Choose the scope you want DeployForge to deploy into.</>}>
          <div className="relative"><KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><Input id="ct" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} className="pl-10 font-mono" placeholder="••••••••••••••••" /></div>
        </Field>
        <Field label="Team ID or slug (optional)" htmlFor="tm" error={errors.team} hint="Leave empty to deploy to your personal account."><Input id="tm" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="team_xxxxxxxx or my-team" className="font-mono" /></Field>
        {errors.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2.5 text-sm text-bad" role="alert">{errors.form}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
