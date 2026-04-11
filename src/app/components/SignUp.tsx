import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { PASSWORD_MIN_LENGTH } from '@/config/authPolicy';
import { Mail, Lock, User, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const ACCOUNT_CREATED_NOTICE_KEY = 'ventra_account_created_notice';
type PortalRole = 'admin' | 'coach' | 'player';

const isPortalRole = (value: unknown): value is PortalRole => {
  return value === 'admin' || value === 'coach' || value === 'player';
};

export function SignUp() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<PortalRole>('player');
  const [adminCode, setAdminCode] = useState('');
  const [coachProfile, setCoachProfile] = useState('');
  const [coachExpertise, setCoachExpertise] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<'certification' | 'license' | 'experience' | 'other'>('certification');
  const [verificationDocumentName, setVerificationDocumentName] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [coachApplicationSubmitted, setCoachApplicationSubmitted] = useState(false);
  const [coachSubmissionMessage, setCoachSubmissionMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { signup, signInWithProvider } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  const roleFromQuery = new URLSearchParams(location.search).get('role');
  const roleFromQuerySafe = isPortalRole(roleFromQuery) ? roleFromQuery : null;
  const isCoachRole = selectedRole === 'coach';
  const isAdminRole = selectedRole === 'admin';

  React.useEffect(() => {
    if (!roleFromQuerySafe) return;
    setSelectedRole(roleFromQuerySafe);
  }, [roleFromQuerySafe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!termsAccepted) {
      toast.error('You must accept the Terms of Service to continue.');
      return;
    }
    if (password.trim().length < PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (isAdminRole && !adminCode.trim()) {
      toast.error('Admin code is required to create an admin account.');
      return;
    }
    if (isCoachRole) {
      if (!name.trim()) {
        toast.error('Full name is required for coach registration.');
        return;
      }
      if (!verificationDocumentName.trim()) {
        toast.error('Verification document name is required for coach registration.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const { success, message } = await signup(email, password, selectedRole, {
        name: name.trim(),
        phone: phone.trim(),
        adminCode: isAdminRole ? adminCode.trim() : undefined,
        coachProfile: isCoachRole ? coachProfile.trim() : undefined,
        coachExpertise: isCoachRole
          ? coachExpertise
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
        verificationMethod: isCoachRole ? verificationMethod : undefined,
        verificationDocumentName: isCoachRole ? verificationDocumentName.trim() : undefined,
        verificationId: isCoachRole ? verificationId.trim() || undefined : undefined,
        verificationNotes: isCoachRole ? verificationNotes.trim() || undefined : undefined,
      });
      
      if (success) {
        if (isCoachRole) {
          setCoachSubmissionMessage(message || 'Your coach account request is under review by the administrator.');
          setCoachApplicationSubmitted(true);
        } else {
          const successMessage = message || 'Account created successfully! Please sign in.';
          localStorage.setItem(ACCOUNT_CREATED_NOTICE_KEY, successMessage);
          toast.success(successMessage);
          navigate(`/sign-in?role=${selectedRole}`, {
            state: { role: selectedRole, accountCreatedMessage: successMessage },
          });
        }
      } else {
        toast.error(message || 'Failed to create account');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: 'google' | 'facebook') => {
    if (isCoachRole) {
      toast.error('Coach registration requires manual verification details. Please complete the form.');
      return;
    }
    if (selectedRole !== 'player') {
      toast.error('Social sign-up is available for Player accounts only.');
      return;
    }
    setIsLoading(true);
    const result = await signInWithProvider(provider, selectedRole, 'signup');
    if (!result.success) {
      toast.error(result.message || 'Unable to continue with social sign-up.');
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen overflow-y-auto flex items-start justify-center p-3 md:py-8 bg-cover bg-center relative"
      style={{
        backgroundImage: `url('/landing-bg.png')`
      }}
    >
      <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm"></div>
      <div className="bg-[#73b8b4]/70 backdrop-blur-xl rounded-[56px] shadow-[0_20px_60px_rgba(0,0,0,0.38)] w-full max-w-md p-6 md:p-7 my-4 md:my-8 relative z-10 border border-black/10 text-slate-950 animate-in fade-in zoom-in-95 duration-500">
        {coachApplicationSubmitted ? (
          <div className="text-center py-4 space-y-4">
            <img src="/ventra-logo.png" alt="Ventra" className="h-24 md:h-28 w-auto mx-auto" />
            <h1 className="text-2xl md:text-3xl text-slate-900">Application Submitted</h1>
            <p className="text-slate-900 text-base">
              {coachSubmissionMessage}
            </p>
            <p className="text-slate-900 text-base">
              You can sign in as coach only after admin approval.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/sign-in?role=coach', { state: { role: 'coach' } })}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg shadow-md hover:shadow-lg hover:bg-green-700 transition-all"
              >
                Go To Sign In
              </button>
              <Link
                to="/"
                className="w-full border border-slate-400 bg-white/90 text-slate-800 py-2.5 rounded-lg shadow-sm hover:bg-white transition-all text-center"
              >
                Back To Home
              </Link>
            </div>
          </div>
        ) : (
          <>
        <div className="text-center mb-5">
          <img src="/ventra-logo.png" alt="Ventra" className="h-24 md:h-28 w-auto mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl text-slate-900 mb-1">Create Account</h1>
          <p className="text-slate-900">Join us to book your next game</p>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">Choose account type</p>
          <div className="grid grid-cols-3 gap-2">
            {(['player', 'coach', 'admin'] as const).map((role) => {
              const active = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-teal-700 bg-teal-600 text-white shadow-md'
                      : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-white'
                  }`}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-800">
            {selectedRole === 'player'
              ? 'Player accounts can book courts right away.'
              : selectedRole === 'coach'
                ? 'Coach accounts need profile and verification details.'
                : 'Admin accounts require the admin code.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isAdminRole && (
            <div>
              <label className="block text-sm mb-2 text-slate-900">Admin Code</label>
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter admin code"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm mb-2 text-slate-900">Full Name</label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500 pl-10"
                placeholder="John Doe"
                required
              />
              <User className="w-5 h-5 text-slate-500 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-slate-900">Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500 pl-10"
                placeholder="you@example.com"
                required
              />
              <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-2.5" />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-2 text-slate-900">Phone</label>
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="+63 912 345 6789"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-slate-900">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500 pl-10 pr-10"
                placeholder="Enter your password"
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 top-2.5" />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-500 hover:text-slate-700"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {isCoachRole && (
            <>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Coaching Profile</label>
                <textarea
                  value={coachProfile}
                  onChange={(e) => setCoachProfile(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Briefly describe your coaching background."
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Expertise (comma-separated)</label>
                <input
                  type="text"
                  value={coachExpertise}
                  onChange={(e) => setCoachExpertise(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Basketball, Strength and Conditioning"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Verification Method</label>
                <select
                  value={verificationMethod}
                  onChange={(e) => setVerificationMethod(e.target.value as 'certification' | 'license' | 'experience' | 'other')}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="certification">Certification</option>
                  <option value="license">License</option>
                  <option value="experience">Experience</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Document Name</label>
                <input
                  type="text"
                  value={verificationDocumentName}
                  onChange={(e) => setVerificationDocumentName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="National Coaching Certification"
                  required={isCoachRole}
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Document ID (optional)</label>
                <input
                  type="text"
                  value={verificationId}
                  onChange={(e) => setVerificationId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="CERT-12345"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-slate-900">Notes (optional)</label>
                <textarea
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-400 bg-white/95 rounded-lg shadow-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Any additional details for admin verification."
                />
              </div>
            </>
          )}

          <label htmlFor="terms" className="flex items-center gap-3 pt-2 text-base text-slate-900 leading-relaxed cursor-pointer">
            <span className="flex items-center justify-center shrink-0">
              <input
                id="terms"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-green-300"
              />
            </span>
            <span>
              I agree to the{' '}
              <Link
                to={`/terms-of-service?returnTo=${returnTo}`}
                className="text-indigo-700 font-medium hover:text-indigo-900 hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                to={`/privacy-policy?returnTo=${returnTo}`}
                className="text-indigo-700 font-medium hover:text-indigo-900 hover:underline"
              >
                Privacy Policy
              </Link>
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg shadow-md hover:shadow-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Sign Up'}
          </button>
        </form>

        {selectedRole === 'player' && !isCoachRole ? (
          <div className="my-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px flex-1 bg-gray-300" />
              <p className="text-base text-slate-900 text-center whitespace-nowrap">or sign up with</p>
              <div className="h-px flex-1 bg-gray-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSocialSignUp('facebook')}
                disabled={isLoading}
                aria-label="Sign up with Facebook"
                className="w-full border border-gray-300 bg-white text-gray-800 py-2.5 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
              >
                <img src="/facebook.png" alt="Facebook" className="w-5 h-5" />
                Facebook
              </button>
              <button
                type="button"
                onClick={() => handleSocialSignUp('google')}
                disabled={isLoading}
                aria-label="Sign up with Google"
                className="w-full border border-gray-300 bg-white text-gray-800 py-2.5 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
              >
                <img src="/Google.png" alt="Google" className="w-5 h-5" />
                Google
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 text-center">
          <p className="text-slate-900 text-base">
            Already have an account?{' '}
            <Link to={`/sign-in?role=${selectedRole}`} className="text-indigo-600 font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
