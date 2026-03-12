import React, { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Check, X, CreditCard, Loader2, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { MembershipPlan } from '@/types';

type PlanDecor = {
  gradient: string;
  border: string;
  badge?: string;
};

const PLAN_STYLES: PlanDecor[] = [
  {
    gradient: 'from-[#0f5358] via-[#1d8f95] to-[#33aab0]',
    border: 'border-[#39c2c8]/30',
  },
  {
    gradient: 'from-[#0b4f56] via-[#1b8c93] to-[#2db2b8]',
    border: 'border-[#7ad2d6]',
    badge: '#bestdeal',
  },
  {
    gradient: 'from-[#0c4950] via-[#1d8b92] to-[#31a8ae]',
    border: 'border-[#2abcc4]/40',
  },
];

function getIncludedCourts(plan: MembershipPlan): string {
  if (plan.tier === 'basic') return '1 court';
  if (plan.tier === 'premium') return 'Up to 3 courts';
  if (plan.tier === 'elite') return 'Unlimited courts';
  return 'Included courts';
}

function getAnnualPrice(monthly: number): number {
  return Math.round(monthly * 12 * 0.85);
}

export default function Pricing() {
  const { memberships, currentUser, subscribe } = useApp();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const sortedPlans = useMemo(() => {
    const rank: Record<MembershipTier, number> = { basic: 0, premium: 1, elite: 2 };
    return [...memberships].sort((a, b) => {
      const aRank = rank[a.tier || 'basic'] ?? 99;
      const bRank = rank[b.tier || 'basic'] ?? 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.price - b.price;
    });
  }, [memberships]);

  const handleSubscribeClick = (planId: string) => {
    setSelectedPlanId(planId);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    setIsProcessing(true);
    try {
      await subscribe(selectedPlanId);
      toast.success('Subscription activated successfully');
      setIsPaymentModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedPlan = sortedPlans.find((m) => m.id === selectedPlanId);

  return (
    <div className="min-h-screen bg-[#0b2333] p-5 md:p-8 text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Plan Monthly Price, Annual Price (Save 15%) with Courts Included Features</h1>
            <p className="text-sm text-teal-100/90 mt-2">
              Available plan information for all applicable accounts.
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedPlans.map((plan, idx) => {
            const annualPrice = getAnnualPrice(plan.price);
            const style = PLAN_STYLES[idx % PLAN_STYLES.length];
            const isMiddle = idx === 1;

            return (
              <article
                key={plan.id}
                className={`relative h-full rounded-3xl border ${style.border} bg-gradient-to-br ${style.gradient} p-6 shadow-xl shadow-black/20 flex flex-col`}
              >
                {isMiddle && style.badge && (
                  <span className="absolute top-4 right-4 rounded-full bg-[#91f2f3] text-[#093d44] px-4 py-1 text-sm font-semibold">
                    {style.badge}
                  </span>
                )}

                <div>
                  <h2 className="text-3xl font-bold leading-none">{plan.name}</h2>
                  <p className="mt-2 text-5xl font-bold tracking-tight leading-none">PHP {plan.price}</p>
                  <p className="mt-3 text-sm text-white/85">
                    Monthly: PHP {plan.price} | Annual: PHP {annualPrice} (Save 15%)
                  </p>
                  <p className="mt-1 text-sm text-white/90">{getIncludedCourts(plan)}</p>
                </div>

                <ul className="mt-6 space-y-2.5 min-h-[210px] flex-1">
                  {plan.features?.map((feature, featureIndex) => (
                    <li key={`${plan.id}-${featureIndex}`} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 mt-0.5 shrink-0" />
                      <span className="text-sm md:text-base leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribeClick(plan.id)}
                  className="mt-6 w-full rounded-full bg-white text-[#272244] px-4 py-2.5 text-lg font-semibold flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  CHOOSE THIS
                  <span className="w-9 h-9 rounded-full bg-[#1a998f] text-white inline-flex items-center justify-center">
                    <ArrowRight size={18} />
                  </span>
                </button>
              </article>
            );
          })}
        </section>
      </div>

      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Lock size={20} className="text-teal-600" />
                Secure Payment
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl mb-4">
                <p className="text-sm text-slate-500 mb-1">Total Amount</p>
                <p className="text-2xl font-bold">PHP {selectedPlan?.price ?? 0}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Card Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    required
                    type="text"
                    placeholder="0000 0000 0000 0000"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                  <input
                    required
                    type="text"
                    placeholder="MM/YY"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CVC</label>
                  <input
                    required
                    type="text"
                    placeholder="123"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full mt-4 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
