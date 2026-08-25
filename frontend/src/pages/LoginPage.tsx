import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { BoltIcon } from '@heroicons/react/24/solid';
import { ShieldCheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

/**
 * Sign-in is two-legged when the account has 2FA enabled: the password step
 * returns a short-lived challenge token instead of a session, and the code step
 * exchanges it for real tokens.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Present only while a 2FA challenge is outstanding.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const { login, completeMfaLogin, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login(email, password);

      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        return;
      }

      toast.success('Welcome back!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Login failed');
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;

    try {
      await completeMfaLogin(mfaToken, code.trim());
      toast.success('Welcome back!');
      navigate('/');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Verification failed';
      toast.error(message);
      setCode('');

      // An expired or burned challenge cannot be retried — send the user back
      // to the password step rather than leaving them on a dead form.
      if (/expired|invalid|log in again/i.test(message)) {
        setMfaToken(null);
        setPassword('');
      }
    }
  };

  const backToPassword = () => {
    setMfaToken(null);
    setCode('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl mb-4">
            <BoltIcon className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-dark-100">
            {mfaToken ? 'Two-factor verification' : 'Welcome back'}
          </h1>
          <p className="text-dark-400 mt-2">
            {mfaToken
              ? 'Enter the code from your authenticator app'
              : 'Sign in to your engagement platform'}
          </p>
        </div>

        {!mfaToken ? (
          <form onSubmit={handlePasswordSubmit} className="card space-y-5">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-sm text-dark-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-400 hover:text-primary-300">
                Create one
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="card space-y-5">
            <div className="flex items-center gap-3 rounded-lg bg-dark-800 p-3">
              <ShieldCheckIcon className="w-5 h-5 text-primary-400 shrink-0" aria-hidden="true" />
              <p className="text-sm text-dark-300">
                This account is protected by two-factor authentication.
              </p>
            </div>

            <div>
              <label htmlFor="mfa-code" className="label">
                Authentication code
              </label>
              <input
                id="mfa-code"
                name="one-time-code"
                // autoFocus is appropriate here: this form exists for exactly
                // one input and the user has already committed to signing in.
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input w-full font-mono tracking-[0.3em] text-center text-lg"
                placeholder="000000"
                maxLength={12}
                aria-describedby="mfa-help"
                required
              />
              <p id="mfa-help" className="mt-2 text-xs text-dark-500">
                Lost your device? Enter one of your backup codes instead.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || code.trim().length < 6}
              className="btn-primary w-full"
            >
              {isLoading ? 'Verifying…' : 'Verify and sign in'}
            </button>

            <button
              type="button"
              onClick={backToPassword}
              className="btn-ghost w-full inline-flex items-center justify-center gap-2 text-sm"
            >
              <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
