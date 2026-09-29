import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, GoogleIcon, Input, cx } from '../../components/ui';
import supabase from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/googleAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['bg-bad', 'bg-bad', 'bg-warn', 'bg-ok', 'bg-ok'];
  if (!password) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1 flex-1 rounded-full', i < score ? colors[score] : 'bg-line-strong')} />)}</div>
      <p className="mt-1 text-[11px] text-muted">Password strength: {labels[score]}</p>
    </div>
  );
}

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const score = useMemo(() => passwordScore(form.password), [form.password]);

  useEffect(() => { if (user) navigate('/app', { replace: true }); }, [user, navigate]);

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.password.length < 8) errs.password = 'Use at least 8 characters.';
    else if (score < 2) errs.password = 'Choose a stronger password (mix letters, numbers and symbols).';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.';
    if (!form.terms) errs.terms = 'Please accept the terms to continue.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.name.trim() }, emailRedirectTo: `${window.location.origin}/login` },
    });
    setLoading(false);
    if (error) { setErrors({ form: /registered|exists/i.test(error.message) ? 'An account with this email already exists. Try signing in.' : error.message }); return; }
    if (data.session) { toast.success('Account created', 'Welcome to DeployForge!'); navigate('/app'); }
    else navigate(`/verify?email=${encodeURIComponent(form.email.trim())}`);
  };

  return (
    <AuthLayout title="Create your account" subtitle="Free plan · 5 projects · no card required" footer={<>Already have an account? <Link to="/login" className="font-medium text-ember hover:underline">Sign in</Link></>}>
      <Button variant="secondary" className="w-full" size="lg" onClick={() => { if (!signInWithGoogle('DeployForge')) toast.error('Google sign-in unavailable'); }} icon={<GoogleIcon />}>Sign up with Google</Button>
      <div className="my-6 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name} required><Input id="name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} /></Field>
        <Field label="Email" htmlFor="email" error={errors.email} required><Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} /></Field>
        <Field label="Password" htmlFor="password" error={errors.password} required>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} className="pr-11" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <StrengthMeter password={form.password} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm} required><Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} invalid={!!errors.confirm} /></Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm text-muted">
            <input type="checkbox" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[var(--ember)]" />
            <span>I agree to the <Link to="/terms" className="text-ember hover:underline">Terms</Link> and <Link to="/privacy" className="text-ember hover:underline">Privacy Policy</Link>.</span>
          </label>
          {errors.terms && <p className="mt-1 text-xs font-medium text-bad">{errors.terms}</p>}
        </div>
        {errors.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2.5 text-sm text-bad" role="alert">{errors.form}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading} icon={<UserPlus className="h-4 w-4" />}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
