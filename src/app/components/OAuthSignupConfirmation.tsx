import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/context/supabase';
import { getAuthCallbackUrl } from '@/utils/authRedirect';

const PENDING_KEY = 'ventra_oauth_confirmation_pending';
const EMAIL_LINK_PENDING_KEY = 'ventra_oauth_email_link_pending';
const EMAIL_LINK_LAST_SENT_AT_KEY = 'ventra_oauth_email_link_last_sent_at';
const EMAIL_LINK_COOLDOWN_MS = 60_000;

export function OAuthSignupConfirmation() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [isSending, setIsSending] = useState(false);
  const [linkSent, setLinkSent] = useState(Boolean(localStorage.getItem(EMAIL_LINK_PENDING_KEY)));
  const pendingEmail = localStorage.getItem(PENDING_KEY);
  const autoSendAttemptedRef = useRef(false);

  const targetEmail = useMemo(
    () => (currentUser?.email || pendingEmail || '').trim().toLowerCase(),
    [currentUser?.email, pendingEmail]
  );

  useEffect(() => {
    if (!targetEmail) {
      navigate('/sign-in', { replace: true });
      return;
    }
    if (pendingEmail && !linkSent && currentUser?.email?.toLowerCase() !== pendingEmail) {
      navigate('/sign-in', { replace: true });
    }
  }, [currentUser?.email, linkSent, navigate, pendingEmail, targetEmail]);

  useEffect(() => {
    if (!targetEmail) return;
    if (linkSent) return;
    if (isSending) return;
    if (autoSendAttemptedRef.current) return;
    const lastSentAt = Number(localStorage.getItem(EMAIL_LINK_LAST_SENT_AT_KEY) || 0);
    if (lastSentAt && Date.now() - lastSentAt < EMAIL_LINK_COOLDOWN_MS) return;
    autoSendAttemptedRef.current = true;
    void handleSendConfirmationLink();
  }, [isSending, linkSent, targetEmail]);

  const handleSendConfirmationLink = async () => {
    if (!targetEmail) {
      toast.error('No email address is available for confirmation.');
      return;
    }

    const lastSentAt = Number(localStorage.getItem(EMAIL_LINK_LAST_SENT_AT_KEY) || 0);
    if (lastSentAt && Date.now() - lastSentAt < EMAIL_LINK_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((EMAIL_LINK_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);
      toast.error(`Email link already sent recently. Please wait ${remainingSeconds}s and try again.`);
      return;
    }

    setIsSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${getAuthCallbackUrl()}?confirmation=email-link`,
        },
      });

      if (error) {
        console.error('Failed to send magic link email:', {
          message: error.message,
          status: (error as any)?.status,
          name: (error as any)?.name,
          targetEmail,
          redirectTo: `${getAuthCallbackUrl()}?confirmation=email-link`,
        });
        toast.error(error.message);
        setIsSending(false);
        return;
      }

      localStorage.setItem(EMAIL_LINK_PENDING_KEY, targetEmail);
      localStorage.setItem(EMAIL_LINK_LAST_SENT_AT_KEY, String(Date.now()));
      setLinkSent(true);
      toast.success('Confirmation link sent. Please open the email and click the link.');

      await supabase.auth.signOut();
      localStorage.removeItem('currentUser');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send confirmation email.');
    } finally {
      setIsSending(false);
    }
  };

  const handleBackToSignIn = async () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(EMAIL_LINK_PENDING_KEY);
    localStorage.removeItem('ventra_oauth_flow');
    localStorage.removeItem('currentUser');
    await supabase.auth.signOut();
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800 text-center">
        <img src="/ventra-logo.png" alt="Ventra" className="h-20 w-auto mx-auto mb-5" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Confirm Social Sign Up</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          We will send a confirmation link to this Gmail account before allowing dashboard access.
        </p>
        {targetEmail && (
          <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">{targetEmail}</p>
        )}

        {linkSent ? (
          <div className="mt-6 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 p-4 text-left">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-teal-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Check your Gmail inbox</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Open the confirmation email and click the link to finish your Google or Facebook sign up.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSendConfirmationLink}
              disabled={isSending}
              className="mt-6 w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
              {isSending ? 'Sending link...' : 'Send Confirmation Link'}
            </button>
          </>
        )}

        {linkSent && (
          <button
            type="button"
            onClick={handleSendConfirmationLink}
            disabled={isSending}
            className="mt-3 w-full py-3 px-4 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Resend Link
          </button>
        )}

        <button
          type="button"
          onClick={handleBackToSignIn}
          className="mt-3 w-full py-3 px-4 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
