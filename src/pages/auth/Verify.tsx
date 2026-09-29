import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailOpen, RefreshCw } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button } from '../../components/ui';
import supabase from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';

export default function Verify() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const toast = useToast();

  const resend = async () => {
    if (!email) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/login` } });
    setLoading(false);
    if (error) { toast.error('Could not resend', error.message); return; }
    toast.success('Verification email sent');
    setCooldown(60);
    const t = setInterval(() => setCooldown((c) => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
  };

  return (
    <AuthLayout title="Verify your email" footer={<>Verified already? <Link to="/login" className="font-medium text-ember hover:underline">Sign in</Link></>}>
      <div className="glass rounded-2xl p-6 text-center">
        <div className="relative mx-auto h-16 w-16"><div className="absolute inset-0 rounded-2xl bg-ember/30 blur-xl" /><div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-forge text-white"><MailOpen className="h-7 w-7" /></div></div>
        <p className="mt-5 text-sm text-muted">We sent a confirmation link to {email ? <b className="text-fg">{email}</b> : 'your email address'}. Open it to activate your account, then sign in.</p>
        <p className="mt-3 text-xs text-faint">Didn’t get it? Check spam or promotions folders.</p>
        {email && <Button variant="secondary" className="mt-6" onClick={resend} loading={loading} disabled={cooldown > 0} icon={<RefreshCw className="h-4 w-4" />}>{cooldown ? `Resend in ${cooldown}s` : 'Resend email'}</Button>}
      </div>
    </AuthLayout>
  );
}
