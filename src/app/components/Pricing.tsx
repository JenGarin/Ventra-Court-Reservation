import React, { useState } from 'react';
import { CreditCard, Loader2, Lock, ArrowRight, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';

const peso = '\u20b1';

const FINAL_PLANS = [
  {
    id: 'final-basic',
    name: 'Basic',
    price: 899,
    annualPrice: Math.round(899 * 12 * 0.85),
    badge: '',
    gradient: 'from-[#123f43] via-[#1b7d7a] to-[#2ea7b3]',
    border: 'border-transparent',
    description: 'For single-court venues getting started with online reservations.',
    features: [
      '1 court',
      'Online booking & reservation',
      'Booking schedule & calendar',
      'Manual booking approval',
      'Admin dashboard',
      'Email notifications',
      'Mobile-friendly',
      'Developer labor & maintenance included',
      'Hosting & domain included',
    ],
  },
  {
    id: 'final-standard',
    name: 'Standard',
    price: 1599,
    annualPrice: Math.round(1599 * 12 * 0.85),
    badge: '#bestdeal',
    gradient: 'from-[#123f43] via-[#229499] to-[#2db0bd]',
    border: 'border-[#b9c2ff]',
    description: 'Best for active facilities managing multiple courts and daily bookings.',
    features: [
      'Up to 3 courts',
      'All Basic features',
      'Real-time schedule availability',
      'Automated booking confirmation',
      'Booking cancellation & rescheduling',
      'Multi-court management',
      'Email notifications & monthly booking reports',
      'Priority maintenance & support',
    ],
  },
  {
    id: 'final-premium',
    name: 'Premium',
    price: 2699,
    annualPrice: Math.round(2699 * 12 * 0.85),
    badge: '',
    gradient: 'from-[#123f43] via-[#218b8f] to-[#31a8b2]',
    border: 'border-transparent',
    description: 'For growing sports businesses that need scale, payments, and deeper reporting.',
    features: [
      'Unlimited courts',
      'All Standard features',
      'Online payment integration (GCash / PayMaya)',
      'SMS & Email notifications',
      'Advanced analytics & reports',
      'Featured listing on website',
      'Multi-location support',
      'Priority support & faster updates',
    ],
  },
] as const;

export default function Pricing() {
  const { subscribe } = useApp();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedPlan = FINAL_PLANS.find((plan) => plan.id === selectedPlanId) || null;

  const handleSubscribeClick = (planId: string) => {
    setSelectedPlanId(planId);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsProcessing(true);
    try {
      await subscribe(selectedPlan.id);
      toast.success('Subscription activated successfully');
      setIsPaymentModalOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#13273c] px-5 py-5 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#74efe3]">
            Ventra Pricing
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-[3rem]">
            Simple plans for sports facilities of every size
          </h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
            Choose a plan based on how many courts you manage today. Annual billing saves 15% and includes hosting,
            maintenance, and platform updates.
          </p>
          <p className="mt-4 text-sm font-medium text-[#b8f45e]">
            Monthly pricing below. Annual plans are billed at a 15% discount.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {FINAL_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex min-h-[540px] flex-col rounded-[26px] border ${plan.border} bg-gradient-to-br ${plan.gradient} px-8 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.24)]`}
            >
              {plan.badge && (
                <div className="absolute right-4 top-4 rounded-full bg-[#74efe3] px-4 py-1.5 text-lg font-medium text-[#183046]">
                  {plan.badge}
                </div>
              )}

              <div className="mb-8">
                <h2 className="text-4xl font-bold tracking-tight md:text-[2.65rem]">{plan.name}</h2>
                <p className="mt-2 max-w-xs text-sm leading-5 text-white/85">
                  {plan.description}
                </p>
                <p className="mt-3 text-[4rem] font-extrabold leading-none tracking-tight md:text-[4.15rem]">
                  {peso}{plan.price}
                </p>
                <p className="mt-2 text-sm text-white/80">
                  {peso}{plan.annualPrice}/year when billed annually
                </p>
              </div>

              <ul className="flex-1 space-y-2 pr-3 text-[0.98rem] leading-[1.1] md:text-[1.02rem]">
                {plan.features.map((feature, featureIndex) => (
                  <li key={`${plan.id}-${featureIndex}`} className="flex items-start gap-4">
                    <Check className="mt-1 h-5 w-5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribeClick(plan.id)}
                className="mt-8 flex items-center justify-between rounded-full bg-white px-6 py-3.5 text-xl font-medium text-[#231d49] transition-transform hover:scale-[1.01]"
              >
                <span>Choose this plan</span>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#239b97] text-white">
                  <ArrowRight size={22} />
                </span>
              </button>
            </article>
          ))}
        </section>

        <p className="mt-6 text-center text-sm text-slate-300">
          Need a custom rollout for a larger venue or organization? Contact the Ventra team for enterprise support.
        </p>
      </div>

      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Lock size={20} className="text-teal-600" />
                Secure Payment
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="space-y-4 p-6">
              <div className="mb-4 rounded-xl bg-slate-50 p-4">
                <p className="mb-1 text-sm text-slate-500">Total Amount</p>
                <p className="text-2xl font-bold">{peso}{selectedPlan?.price ?? 0}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Card Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="text"
                    placeholder="0000 0000 0000 0000"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date</label>
                  <input
                    required
                    type="text"
                    placeholder="MM/YY"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">CVC</label>
                  <input
                    required
                    type="text"
                    placeholder="123"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 font-bold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : 'Pay & Subscribe'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
