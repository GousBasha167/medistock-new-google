import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import type { UserProfile } from '../../shared/types.ts';
import { FamilyHealthIllustration, MediStockLogo } from '../BrandMark.tsx';

export type AuthMode = 'welcome' | 'signup' | 'login';

interface WelcomeAuthScreenProps {
  initialMode?: AuthMode;
  onAuthenticated: (user: UserProfile, isNewSignup: boolean) => void;
}

export const WelcomeAuthScreen: React.FC<WelcomeAuthScreenProps> = ({
  initialMode = 'welcome',
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameAvailability, setNameAvailability] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const checkDatabaseReady = useCallback(async () => {
    setCheckingSchema(true);
    try {
      const status = await api.health();
      const missing = status.supabaseConfigured && !status.schemaReady;
      setSchemaMissing(missing);
      if (!missing) {
        setError((prev) =>
          prev && prev.includes('001_medistock_schema.sql') ? null : prev
        );
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setCheckingSchema(false);
    }
  }, []);

  useEffect(() => {
    void checkDatabaseReady();
  }, [checkDatabaseReady]);

  const handleCopySql = async () => {
    try {
      const { sql } = await api.getMigrationSql();
      await navigator.clipboard.writeText(sql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      setError('Could not copy migration SQL. Please open supabase/migrations/001_medistock_schema.sql.');
    }
  };

  useEffect(() => {
    if (mode !== 'signup') {
      setNameAvailability({ checking: false, available: null });
      return;
    }

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameAvailability({ checking: false, available: null });
      return;
    }

    let cancelled = false;
    setNameAvailability({ checking: true, available: null });
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkNameAvailable(trimmed);
        if (!cancelled) {
          setNameAvailability({
            checking: false,
            available: res.available,
            reason: res.available ? undefined : res.reason || 'This name is already registered.',
          });
        }
      } catch {
        if (!cancelled) {
          setNameAvailability({ checking: false, available: null });
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, mode]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter a name with at least 2 characters.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (nameAvailability.available === false) {
        setError('This name is already taken. Please choose another name or log in.');
        return;
      }
    } else if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const user = await api.signup(trimmedName, password);
        onAuthenticated(user, true);
      } else {
        const user = await api.login(trimmedName, password);
        onAuthenticated(user, false);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not complete request. Please check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] dark:bg-slate-950 flex flex-col justify-center p-4 sm:p-6 lg:p-10">
      <div className="w-full max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-[#E3EAF3] dark:border-slate-800 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Branding & Illustration Panel */}
        <div className="lg:col-span-6 bg-gradient-to-b from-[#EAF2FD] to-[#F4F8FE] dark:from-slate-900 dark:to-slate-800/80 p-7 sm:p-10 flex flex-col items-center justify-between text-center border-b lg:border-b-0 lg:border-r border-[#E3EAF3] dark:border-slate-800">
          <div className="w-full flex flex-col items-center">
            <MediStockLogo size="lg" />
            <p className="mt-3 text-lg font-display font-semibold text-[#183153] dark:text-slate-100">
              Never run out of medicines.
            </p>
            <p className="mt-2 text-sm text-[#667085] dark:text-slate-300 max-w-sm leading-relaxed">
              Keep your family&apos;s medicines organized, track remaining tablets, and receive timely
              refill reminders from one calm place.
            </p>
          </div>

          <div className="my-6 w-full flex justify-center">
            <FamilyHealthIllustration className="w-full max-w-[300px] sm:max-w-[340px] h-auto" />
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#245DB5] dark:text-blue-300">
            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Your family&apos;s health, our priority</span>
          </div>
        </div>

        {/* Right Action / Form Panel */}
        <div className="lg:col-span-6 p-7 sm:p-10 flex flex-col justify-center">
          {schemaMissing && (
            <div
              role="alert"
              className="max-w-sm mx-auto w-full mb-5 p-4 rounded-2xl bg-[#FFF8EB] dark:bg-amber-950/40 border border-[#B7791F]/30 text-left space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-[#B7791F] dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs sm:text-sm text-[#182230] dark:text-slate-100">
                  <p className="font-semibold text-[#8A5A12] dark:text-amber-300">
                    One-time Supabase table setup required
                  </p>
                  <p className="mt-1 text-[#667085] dark:text-slate-300 leading-relaxed">
                    Your Supabase project is connected, but the MediStock tables haven&apos;t been
                    created yet. Copy the SQL below and run it once in your{' '}
                    <span className="font-medium text-[#182230] dark:text-white">
                      Supabase Dashboard &rarr; SQL Editor
                    </span>
                    .
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-xs font-semibold transition-colors"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'SQL Copied!' : 'Copy SQL Migration'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void checkDatabaseReady()}
                  disabled={checkingSchema}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-[#E3EAF3] dark:border-slate-700 text-[#182230] dark:text-slate-100 text-xs font-semibold hover:bg-[#F6F8FB] dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingSchema ? 'animate-spin' : ''}`} />
                  <span>{checkingSchema ? 'Checking...' : 'I Ran It — Re-check'}</span>
                </button>
              </div>
            </div>
          )}
          {mode === 'welcome' ? (
            <div className="max-w-sm mx-auto w-full space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#182230] dark:text-white">
                  Care for every family member
                </h1>
                <p className="mt-2 text-sm text-[#667085] dark:text-slate-400 leading-relaxed">
                  Manage medicines for yourself, your parents, and your grandparents without complicated
                  spreadsheets or missed refills.
                </p>
              </div>

              <ul className="space-y-3 text-sm text-[#182230] dark:text-slate-200">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#16866B] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Track tablet quantities and automatic stock-end dates</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#16866B] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Organize separate medicine lists for each family member</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#16866B] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Get refill reminders 3 days before stock runs out</span>
                </li>
              </ul>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-center text-sm text-[#667085] dark:text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-[#245DB5] dark:text-blue-400 hover:underline min-h-[36px] px-1"
                  >
                    Log In
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="max-w-sm mx-auto w-full space-y-5" noValidate>
              <div>
                <h1 className="text-2xl font-display font-bold text-[#182230] dark:text-white">
                  {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
                </h1>
                <p className="mt-1 text-sm text-[#667085] dark:text-slate-400">
                  {mode === 'signup'
                    ? 'Get started with MediStock using just a name and password.'
                    : 'Log in to your MediStock account.'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[#FDECEC] dark:bg-rose-950/50 border border-[#C53939]/30 text-sm text-[#C53939] dark:text-rose-300"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
                >
                  Name
                </label>
                <div className="relative">
                  <User
                    className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="username"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
                    required
                  />
                </div>
                {mode === 'signup' && name.trim().length >= 2 && (
                  <p className="mt-1.5 text-xs">
                    {nameAvailability.checking ? (
                      <span className="text-[#667085] dark:text-slate-400">Checking availability...</span>
                    ) : nameAvailability.available === true ? (
                      <span className="text-[#16866B] dark:text-emerald-400">Name is available</span>
                    ) : nameAvailability.available === false ? (
                      <span className="text-[#C53939] dark:text-rose-400">
                        {nameAvailability.reason || 'This name is already registered.'}
                      </span>
                    ) : null}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                    className="w-full min-h-[46px] pl-10 pr-12 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#667085] hover:text-[#182230] dark:text-slate-400 dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="mt-1.5 text-xs text-[#667085] dark:text-slate-400">
                    Use at least 6 characters. Your password is encrypted before storage.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-sm"
              >
                {submitting
                  ? mode === 'signup'
                    ? 'Creating Account...'
                    : 'Logging In...'
                  : mode === 'signup'
                    ? 'Create Account'
                    : 'Log In'}
              </button>

              <div className="flex flex-col items-center gap-2 pt-1 text-sm text-[#667085] dark:text-slate-400">
                {mode === 'signup' ? (
                  <p>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-semibold text-[#245DB5] dark:text-blue-400 hover:underline"
                    >
                      Log In
                    </button>
                  </p>
                ) : (
                  <p>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-semibold text-[#245DB5] dark:text-blue-400 hover:underline"
                    >
                      Create Account
                    </button>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => switchMode('welcome')}
                  className="text-xs text-[#667085] hover:text-[#182230] dark:hover:text-slate-200 underline"
                >
                  Back to welcome
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
