import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, LogOut, Mail, Monitor, Moon, Save, ShieldCheck, Sun, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import supabase from '../../lib/supabase';
import { Badge, Button, Card, ConfirmModal, Field, Input, PageHeader, Pagination, Skeleton, Tabs } from '../../components/ui';
import { dateTime, humanAction } from '../../lib/format';
import { StrengthMeter, passwordScore } from '../auth/Signup';

export default function Settings() {
  const { user, me, refreshMe, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ full_name: '', phone: '' });
  const [pErr, setPErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [pwSaving, setPwSaving] = useState(false);
  const [signOutAll, setSignOutAll] = useState(false);
  const [page, setPage] = useState(1);
  const activity = useApi<any>(tab === 'activity' ? `/api/me?action=activity&page=${page}&size=20` : null);

  useEffect(() => { if (me) setProfile({ full_name: me.profile.full_name || '', phone: me.profile.phone || '' }); }, [me]);

  const saveProfile = async () => {
    const e: Record<string, string> = {};
    if (profile.full_name.trim().length > 80) e.full_name = 'Max 80 characters.';
    if (profile.phone && !/^[+0-9 ()-]{7,20}$/.test(profile.phone.trim())) e.phone = 'Enter a valid phone number.';
    setPErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try { await api('/api/me?action=profile', { method: 'PUT', body: profile }); await refreshMe(); toast.success('Profile saved'); }
    catch (err: any) { toast.error('Could not save', err.message); } finally { setSaving(false); }
  };

  const changePassword = async () => {
    const e: Record<string, string> = {};
    if (pw.next.length < 8 || passwordScore(pw.next) < 2) e.next = 'Use at least 8 characters with a mix of letters, numbers or symbols.';
    if (pw.next !== pw.confirm) e.confirm = 'Passwords do not match.';
    setPwErr(e);
    if (Object.keys(e).length) return;
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setPwSaving(false);
    if (error) { setPwErr({ form: /reauth|recent/i.test(error.message) ? 'For security, sign out and sign in again before changing your password.' : error.message }); return; }
    api('/api/me?action=security-event', { method: 'POST', body: { event: 'password_changed' } }).catch(() => {});
    setPw({ next: '', confirm: '' });
    toast.success('Password updated');
  };

  const doSignOutAll = async () => {
    await api('/api/me?action=security-event', { method: 'POST', body: { event: 'signed_out_everywhere' } }).catch(() => {});
    await signOut('global');
    toast.success('Signed out on all devices');
    navigate('/login');
  };

  const resend = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email, options: { emailRedirectTo: `${window.location.origin}/login` } });
    if (error) toast.error('Could not resend', error.message); else toast.success('Verification email sent');
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title="Settings" description="Manage your profile, security and preferences." />
      <Tabs tabs={[{ id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> }, { id: 'security', label: 'Security', icon: <ShieldCheck className="h-4 w-4" /> }, { id: 'appearance', label: 'Appearance', icon: <Monitor className="h-4 w-4" /> }, { id: 'activity', label: 'Activity log', icon: <KeyRound className="h-4 w-4" /> }]} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'profile' && (
        <Card className="max-w-2xl space-y-4 p-6">
          <Field label="Email" hint="Your sign-in email cannot be changed here."><Input value={user?.email || ''} disabled /></Field>
          <Field label="Full name" error={pErr.full_name}><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} maxLength={80} /></Field>
          <Field label="Phone number" error={pErr.phone}><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} type="tel" maxLength={20} /></Field>
          <div className="flex justify-end"><Button onClick={saveProfile} loading={saving} icon={<Save className="h-4 w-4" />}>Save profile</Button></div>
        </Card>
      )}

      {tab === 'security' && (
        <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
          <Card className="p-6">
            <p className="text-sm font-semibold">Account security</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="text-muted">Email verification</dt><dd>{me?.email_verified ? <Badge tone="ok" dot>Verified</Badge> : <Badge tone="warn" dot>Unverified</Badge>}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted">Sign-in method</dt><dd className="capitalize">{me?.provider}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted">Last sign-in</dt><dd>{dateTime(me?.last_sign_in_at)}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted">Password storage</dt><dd>bcrypt hashed</dd></div>
            </dl>
            {!me?.email_verified && me?.provider === 'email' && <Button variant="secondary" size="sm" className="mt-4" onClick={resend} icon={<Mail className="h-4 w-4" />}>Resend verification email</Button>}
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm font-semibold">Sessions</p>
              <p className="mt-1 text-sm text-muted">Sign out of DeployForge on every device, including this one.</p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setSignOutAll(true)} icon={<LogOut className="h-4 w-4" />}>Sign out everywhere</Button>
            </div>
          </Card>
          <Card className="space-y-4 p-6">
            <p className="text-sm font-semibold">Change password</p>
            {me?.provider !== 'email' && <p className="text-xs text-muted">You signed in with {me?.provider}. Setting a password lets you also sign in with email.</p>}
            <Field label="New password" error={pwErr.next}><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><StrengthMeter password={pw.next} /></Field>
            <Field label="Confirm new password" error={pwErr.confirm}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            {pwErr.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{pwErr.form}</p>}
            <Button onClick={changePassword} loading={pwSaving} icon={<KeyRound className="h-4 w-4" />}>Update password</Button>
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <Card className="max-w-2xl p-6">
          <p className="text-sm font-semibold">Theme</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([v, l, Icon]) => (
              <button key={v} onClick={() => setTheme(v)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${theme === v ? 'border-ember bg-ember/10' : 'border-line bg-surface hover:border-line-strong'}`} aria-pressed={theme === v}>
                <Icon className="h-5 w-5 text-ember" /><span className="flex-1 text-sm font-medium">{l}</span>{theme === v && <CheckCircle2 className="h-4 w-4 text-ember" />}
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === 'activity' && (
        <Card className="overflow-hidden">
          {activity.loading && !activity.data ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Action</th><th className="px-3 py-3 font-medium">Target</th><th className="px-3 py-3 font-medium">IP</th><th className="px-5 py-3 font-medium">When</th></tr></thead>
                <tbody>{(activity.data?.items || []).map((a: any) => <tr key={a.id} className="border-b border-line last:border-0"><td className="px-5 py-3">{humanAction(a.action)}</td><td className="px-3 py-3 text-xs text-muted">{a.target_type}</td><td className="px-3 py-3 font-mono text-xs text-muted">{a.ip || '—'}</td><td className="px-5 py-3 text-xs text-muted">{dateTime(a.created_at)}</td></tr>)}</tbody>
              </table>
              {activity.data && !activity.data.items.length && <p className="p-8 text-center text-sm text-muted">No activity yet.</p>}
            </div>
          )}
        </Card>
      )}
      {tab === 'activity' && activity.data && <Pagination page={activity.data.page} size={activity.data.size} total={activity.data.total} onChange={setPage} />}

      <ConfirmModal open={signOutAll} onClose={() => setSignOutAll(false)} onConfirm={doSignOutAll} danger title="Sign out everywhere?" confirmLabel="Sign out all sessions" message="All active sessions will be revoked. You’ll need to sign in again on every device." />
    </div>
  );
}
