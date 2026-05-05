import React, { useState, useEffect } from 'react';
import { CreditCard, Crown, Zap, Check, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { getSubscriptionStatus, startCheckout, openCustomerPortal, SubscriptionTier } from '../../services/BillingService';
import { useTranslation } from 'react-i18next';

const PLANS = [
  {
    id: 'free' as SubscriptionTier,
    name: 'Free',
    price: '$0',
    period: '',
    features: [
      'Up to 3 classes',
      '10,000 AI credits (welcome)',
      'Basic lesson builder',
      'Community support',
    ],
    cta: 'current',
    color: 'bg-slate-100 border-slate-200',
    icon: Zap,
  },
  {
    id: 'pro' as SubscriptionTier,
    name: 'Pro',
    price: '$12',
    period: '/month',
    features: [
      'Unlimited classes',
      '50,000 AI credits/month',
      'Advanced lesson studio',
      'Live Commander',
      'Priority support',
      'Custom media generation',
    ],
    cta: 'upgrade',
    color: 'bg-indigo-50 border-indigo-200',
    icon: Crown,
  },
];

const BillingSettings: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ tier: SubscriptionTier; credits: number; history: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const s = await getSubscriptionStatus();
      setStatus(s);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await startCheckout();
    } catch (err: any) {
      setError(err.message);
      setActionLoading(false);
    }
  };

  const handleManage = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await openCustomerPortal();
    } catch (err: any) {
      setError(err.message);
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-indigo-500" size={24} />
      </div>
    );
  }

  const currentTier = status?.tier || 'free';

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
      )}

      {/* Current Plan Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-4">
          Current Plan
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${currentTier === 'pro' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
              {currentTier === 'pro' ? <Crown size={24} /> : <Zap size={24} />}
            </div>
            <div>
              <div className="font-bold text-slate-800 capitalize">{currentTier} Plan</div>
              <div className="text-sm text-slate-500">
                {status?.credits !== undefined && (
                  <span className="flex items-center gap-1">
                    <Sparkles size={14} className="text-amber-500" />
                    {status.credits.toLocaleString()} AI credits remaining
                  </span>
                )}
              </div>
            </div>
          </div>
          {currentTier === 'pro' && (
            <button
              onClick={handleManage}
              disabled={actionLoading}
              className="flex items-center gap-2 text-indigo-600 font-bold border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
            >
              <ExternalLink size={16} /> Manage Subscription
            </button>
          )}
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const Icon = plan.icon;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 ${plan.color} ${isCurrent ? 'ring-2 ring-indigo-500' : ''}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Icon size={24} className={isCurrent ? 'text-indigo-600' : 'text-slate-500'} />
                <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full">Active</span>
                )}
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-slate-800">{plan.price}</span>
                <span className="text-slate-500 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <Check size={16} className="text-green-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled className="w-full py-2 rounded-lg font-bold text-sm bg-slate-200 text-slate-500 cursor-default">
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={actionLoading}
                  className="w-full py-2 rounded-lg font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
                  Upgrade to {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Billing History */}
      {status?.history && status.history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-4">
            Billing History
          </h2>
          <div className="space-y-2">
            {status.history.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50">
                <div>
                  <div className="font-medium text-slate-700 capitalize">{(item.billing_reason || 'payment').replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString()}</div>
                </div>
                <div className="font-bold text-slate-800">
                  ${(item.amount_paid / 100).toFixed(2)} {item.currency?.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingSettings;
