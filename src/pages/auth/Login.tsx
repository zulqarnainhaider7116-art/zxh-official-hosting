import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, LogIn, TimerOff } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, GoogleIcon, Input } from '../../components/ui';
import supabase from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/googleAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function Login() {
  const [params] = useSearchParams();
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => { if (user) navigate(next, { replace: true }); }, [user, navigate, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      const msg = /confirm/i.test(error.message) ? 'Please verify your email first — check your inbox for the confirmation link.' : /invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message;
      setErrors({ form: msg });
      return;
    }
    toast.success('Welcome back');
  };

  const google = () => {
    if (!signInWithGoogle('DeployForge')) toast.error('Google sign-in unavailable', 'Google OAuth is not configured for this deployment.');
  };

  return (
    <AuthLayout title="Sign in to DeployForge" subtitle="Welcome back. Continue deploying." footer={<>New here? <Link to="/signup" className="font-medium text-ember hover:underline">Create an account</Link></>}>
      {params.get('expired') && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm" role="status"><TimerOff className="h-4 w-4 text-info" />Your session expired. Please sign in again.</div>
      )}
      <Button variant="secondary" className="w-full" size="lg" onClick={google} icon={<GoogleIcon />}>Continue with Google</Button>
      <div className="my-6 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@company.com" />
        </Field>
        <Field label={<span className="flex w-full justify-between">Password<Link to="/forgot-password" className="text-xs font-normal text-ember hover:underline">Forgot password?</Link></span>} htmlFor="password" error={errors.password}>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} className="pr-11" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        {errors.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2.5 text-sm text-bad" role="alert">{errors.form}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LogIn className="h-4 w-4" />}>Sign in</Button>
      </form>
      <p className="mt-6 rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-xs text-muted">Demo account: <span className="font-mono text-fg">demo@deployforge.app</span> / <span className="font-mono text-fg">Demo@12345</span></p>
    </AuthLayout>
  );
}
