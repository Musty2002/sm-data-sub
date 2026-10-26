import { useEffect, useState } from 'react';
import { ChevronRight, Coins, Gift, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(n);

export function RewardsOffers() {
  const { cashbackWallet, profile, refreshWallet, refreshCashbackWallet } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [withdrawing, setWithdrawing] = useState(false);
  const [referralTotal, setReferralTotal] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('referrals')
      .select('referrer_bonus, status')
      .eq('referrer_id', profile.id)
      .eq('status', 'bonus_paid')
      .then(({ data }) => {
        setReferralTotal((data || []).reduce((s, r: any) => s + Number(r.referrer_bonus || 0), 0));
      });
  }, [profile?.id]);

  const cashback = cashbackWallet?.balance || 0;

  const withdraw = async () => {
    if (cashback < 100) {
      toast({ title: 'Cannot Withdraw', description: 'Minimum cashback withdrawal is ₦100', variant: 'destructive' });
      return;
    }
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-cashback');
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      toast({ title: 'Cashback Withdrawn!', description: data.message });
      refreshWallet();
      refreshCashbackWallet();
    } catch (e: any) {
      toast({ title: 'Withdrawal Failed', description: e?.message || 'Please try again later.', variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="px-4 md:px-6 pb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-extrabold text-foreground">Rewards & Offers</h3>
        <button onClick={() => navigate('/cashback')} className="text-xs font-semibold text-secondary flex items-center">
          See All <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-3 text-secondary-foreground shadow-md" style={{ background: 'var(--gradient-balance)' }}>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-warning flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-warning-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight">Cashback Balance</p>
              <p className="text-base font-extrabold leading-tight">{fmt(cashback)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <p className="text-[9px] opacity-90 leading-tight">Earn ₦5/GB on data</p>
            <button
              onClick={withdraw}
              disabled={withdrawing}
              className="bg-warning text-foreground text-[10px] font-bold rounded-full px-2 py-0.5 inline-flex items-center disabled:opacity-60"
            >
              {withdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Withdraw <ChevronRight className="w-3 h-3" /></>}
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate('/referral')}
          className="rounded-2xl p-3 text-primary-foreground shadow-md text-left"
          style={{ background: 'var(--gradient-reward-red)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-background/20 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight">Referral Bonus</p>
              <p className="text-base font-extrabold leading-tight">{fmt(referralTotal)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <p className="text-[9px] opacity-90 leading-tight">Invite friends & earn</p>
            <span className="bg-warning text-foreground text-[10px] font-bold rounded-full px-2 py-0.5 inline-flex items-center">
              Invite <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
