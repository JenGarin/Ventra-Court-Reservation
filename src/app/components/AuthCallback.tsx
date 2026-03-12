import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';

const ACCOUNT_CREATED_NOTICE_KEY = 'ventra_account_created_notice';

export function AuthCallback() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingOauthConfirmation = localStorage.getItem('ventra_oauth_confirmation_pending');
  const pendingEmailLinkConfirmation = localStorage.getItem('ventra_oauth_email_link_pending');

  const errorMessage = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get('error_description') ||
      params.get('error') ||
      ''
    );
  }, [location.search]);

  const confirmationMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('confirmation') || '';
  }, [location.search]);

  useEffect(() => {
    if (errorMessage) return;
    if (currentUser) {
      if (
        confirmationMode === 'email-link' &&
        pendingEmailLinkConfirmation &&
        pendingEmailLinkConfirmation === currentUser.email.toLowerCase()
      ) {
        localStorage.removeItem('ventra_oauth_email_link_pending');
        localStorage.removeItem('ventra_oauth_confirmation_pending');
        localStorage.setItem(ACCOUNT_CREATED_NOTICE_KEY, 'Account created successfully. You can now use your new account.');
        toast.success('Account created successfully.');
        navigate('/dashboard', { replace: true });
        return;
      }
      if (pendingOauthConfirmation && pendingOauthConfirmation === currentUser.email.toLowerCase()) {
        navigate('/auth/confirm', { replace: true });
        return;
      }
      navigate('/dashboard', { replace: true });
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate('/sign-in', {
        replace: true,
        state: { authError: 'Sign-in could not be completed. Please try again.' },
      });
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [confirmationMode, currentUser, errorMessage, navigate, pendingEmailLinkConfirmation, pendingOauthConfirmation]);

  useEffect(() => {
    if (!errorMessage) return;
    navigate('/sign-in', {
      replace: true,
      state: { authError: decodeURIComponent(errorMessage.replace(/\+/g, ' ')) },
    });
  }, [errorMessage, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Completing sign-in</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Please wait while we finish your Google or Facebook sign-in.
        </p>
      </div>
    </div>
  );
}
