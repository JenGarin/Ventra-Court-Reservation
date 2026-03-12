// User Roles:
//
// Admin & Staff: Manage courts, bookings, analytics, and system settings.
// Player: Book courts, view bookings, and manage their profile.
// Coach: Book courts for training, manage sessions, and view their schedule.

import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { LogIn, Eye, EyeOff, UserPlus } from 'lucide-react';

const ACCOUNT_CREATED_NOTICE_KEY = 'ventra_account_created_notice';

export function Login() {
  const [email, setEmail] = useState(localStorage.getItem('rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { currentUser, login, signInWithProvider } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem('rememberedEmail'));
  const roleFromQuery = new URLSearchParams(location.search).get('role');
  const selectedRole =
    roleFromQuery ||
    (location.state as { role?: string } | null)?.role;
  const authError = (location.state as { authError?: string } | null)?.authError;
  const accountCreatedMessage = (location.state as { accountCreatedMessage?: string } | null)?.accountCreatedMessage;
  const roleLabel = selectedRole ? selectedRole.toLowerCase() : 'player';
  const roleArticle = roleLabel === 'admin' ? 'an' : 'a';
  const pendingOauthConfirmation = localStorage.getItem('ventra_oauth_confirmation_pending');

  useEffect(() => {
    if (!authError) return;
    setError(authError);
  }, [authError]);

  useEffect(() => {
    const storedNotice = localStorage.getItem(ACCOUNT_CREATED_NOTICE_KEY);
    const nextNotice = accountCreatedMessage || storedNotice || '';
    if (!nextNotice) return;
    setSuccessNotice(nextNotice);
    localStorage.removeItem(ACCOUNT_CREATED_NOTICE_KEY);
  }, [accountCreatedMessage]);

  useEffect(() => {
    if (!currentUser) return;
    if (pendingOauthConfirmation && pendingOauthConfirmation === currentUser.email.toLowerCase()) {
      navigate('/auth/confirm', { replace: true });
      return;
    }
    navigate('/dashboard', { replace: true });
  }, [currentUser, navigate, pendingOauthConfirmation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password, selectedRole as 'admin' | 'coach' | 'player' | undefined);
      if (result.success) {
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        navigate('/dashboard');
      } else {
        setError(result.message || 'Invalid credentials. Please check your email and password.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'google' | 'facebook') => {
    setError('');
    setLoading(true);
    const result = await signInWithProvider(provider, roleLabel, 'signin');
    if (!result.success) {
      setError(result.message || 'Unable to continue with social sign-in.');
      setLoading(false);
    }
  };

  return (
    <div 
      className="h-screen overflow-hidden flex items-center justify-center p-3 bg-cover bg-center relative"
      style={{
        backgroundImage: `url('/landing-bg.png')`
      }}
    >
      <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm"></div>
      <div className="bg-[#73b8b4]/50 backdrop-blur-xl rounded-[56px] shadow-[0_20px_60px_rgba(0,0,0,0.38)] w-full max-w-md p-6 md:p-7 relative z-10 border border-black/10 text-slate-900 animate-in fade-in zoom-in-95 duration-500" role="main" aria-label="Login form">
        <div className="text-center mb-5">
          <img src="/ventra-logo.png" alt="Ventra" className="h-24 md:h-28 w-auto mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl text-slate-900 mb-1">Court Booking System</h1>
          <p className="text-slate-800">
            {selectedRole ? `Sign in as ${selectedRole}` : 'Sign in to manage your bookings'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" aria-label="Login form">
          {successNotice && (
            <div className="rounded-lg border border-green-700/20 bg-green-100/90 px-4 py-3 text-sm text-green-900 shadow-sm" role="status">
              {successNotice}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm mb-2 text-slate-900">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your email"
              required
              aria-label="Email"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-slate-900">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                placeholder="Enter your password"
                required
                aria-label="Password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-500"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {error && <div className="text-red-600 text-sm" role="alert">{error}</div>}

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg shadow-md hover:shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="my-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px flex-1 bg-gray-300" />
            <p className="text-sm text-gray-600 text-center whitespace-nowrap">or sign in with</p>
            <div className="h-px flex-1 bg-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSocialSignIn('facebook')}
              disabled={loading}
              aria-label="Sign in with Facebook"
              className="w-full border border-gray-300 bg-white text-gray-800 py-2.5 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <img src="/facebook.png" alt="Facebook" className="w-5 h-5" />
              Facebook
            </button>
            <button
              type="button"
              onClick={() => handleSocialSignIn('google')}
              disabled={loading}
              aria-label="Sign in with Google"
              className="w-full border border-gray-300 bg-white text-gray-800 py-2.5 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <img src="/Google.png" alt="Google" className="w-5 h-5" />
              Google
            </button>
          </div>
        </div>

        <Link
          to={`/signup${selectedRole ? `?role=${selectedRole}` : ''}`}
          className="w-full mt-3 bg-green-600 text-white py-2.5 rounded-lg shadow-md hover:shadow-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2 font-medium"
        >
          <UserPlus className="w-5 h-5" />
          Create New Account
        </Link>

        <Link
          to="/login"
          className="block mt-3 text-center text-sm text-slate-700 hover:text-slate-900 underline underline-offset-4 transition-colors"
        >
          {`Not ${roleArticle} ${roleLabel}?`}
        </Link>
      </div>
    </div>
  );
}
