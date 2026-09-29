import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, Send } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../../components/ui';
import supabase from '../../lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (err && /rate/i.test(err.message)) { setError('Too many requests. Please wait a minute and try again.'); return; }
    setSent(true); // Always show success to avoid account enumeration.
  };

  return (
    <AuthLayout title={sent ? 'Check your inbox' : 'Reset your password'} subtitle={sent ? undefined : 'We’ll email you a secure link to set a new password.'} footer={<Link to="/login" className="font-medium text-ember hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="glass rounded-2xl p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-ok" />
          <p className="mt-4 text-sm text-muted">If an account exists for <b className="text-fg">{email}</b>, a password reset link is on its way. The link expires after a short time.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={error}><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={loading} icon={<Send className="h-4 w-4" />}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
