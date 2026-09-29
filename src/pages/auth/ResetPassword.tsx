import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input, Spinner } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import supabase from '../../lib/supabase';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { StrengthMeter, passwordScore } from './Signup';

export default function ResetPassword() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const hash = window.location.hash;
    if (/error_description/.test(hash)) { setReady('invalid'); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) setReady('ok');
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady('ok'); });
    const t = setTimeout(() => setReady((r) => (r === 'checking' ? 'invalid' : r)), 4000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (password.length < 8 || passwordScore(password) < 2) errs.password = 'Use at least 8 characters with a mix of letters, numbers or symbols.';
    if (password !== confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setErrors({ form: error.message }); return; }
    api('/api/me?action=security-event', { method: 'POST', body: { event: 'password_changed' } }).catch(() => {});
    toast.success('Password updated', 'You are now signed in.');
    navigate('/app');
  };

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login" className="font-medium text-ember hover:underline">Back to sign in</Link>}>
      {ready === 'checking' ? <div className="flex justify-center py-10"><Spinner /></div>
        : ready === 'invalid' ? <ErrorState kind="session_expired" compact title="Reset link invalid or expired" description="Request a new password reset email and use the latest link." actions={<Link to="/forgot-password" className="text-sm font-medium text-ember hover:underline">Request a new link</Link>} />
        : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="New password" htmlFor="pw" error={errors.password}><Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} /><StrengthMeter password={password} /></Field>
            <Field label="Confirm new password" htmlFor="pw2" error={errors.confirm}><Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} /></Field>
            {errors.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2.5 text-sm text-bad">{errors.form}</p>}
            <Button type="submit" size="lg" className="w-full" loading={loading} icon={<KeyRound className="h-4 w-4" />}>Update password</Button>
          </form>
        )}
    </AuthLayout>
  );
}
