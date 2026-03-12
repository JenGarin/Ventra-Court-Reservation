import { Link } from 'react-router-dom';

export function TermsOfService() {
  return (
    <div
      className="min-h-screen flex items-start justify-center p-4 md:p-8 bg-cover bg-center relative"
      style={{ backgroundImage: `url('/landing-bg.png')` }}
    >
      <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm"></div>
      <div className="w-full max-w-3xl bg-[#73b8b4]/50 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.38)] border border-black/10 text-slate-900 p-6 md:p-8 relative z-10">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-800">Effective date: March 6, 2026</p>

        <div className="mt-6 space-y-4 text-sm leading-6">
          <p>You are responsible for your account security and all activity under your account.</p>
          <p>Bookings are subject to availability, pricing, and cancellation rules configured by the facility.</p>
          <p>You must not misuse the platform, attempt unauthorized access, or disrupt service operation.</p>
          <p>By using this app, you agree to these terms and future updates.</p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link to="/signup" className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-all">
            Back to Sign Up
          </Link>
          <Link
            to="/privacy-policy"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-900 hover:bg-white/40 transition-all"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
