import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Plus, History, RefreshCw, Gift, ArrowDownToLine, Bell, User as UserIcon, Building2, CreditCard, Users, Headphones, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import walletArt from '@/assets/wallet-3d.png';

export function AccountCard() {
  const { profile, wallet, cashbackWallet, user, refreshWallet, refreshProfile, refreshCashbackWallet } = useAuth();
  const [showBalance, setShowBalance] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Real-time wallet balance subscription
  useEffect(() => {
    if (!user?.id) return;

    const walletChannel = supabase
      .channel('wallet-balance-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Wallet updated:', payload);
          refreshWallet();
          setLastUpdated('just now');
          toast({
            title: 'Balance Updated',
            description: 'Your wallet balance has been updated.',
          });
        }
      )
      .subscribe();

    const cashbackChannel = supabase
      .channel('cashback-wallet-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cashback_wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Cashback wallet updated:', payload);
          refreshCashbackWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(cashbackChannel);
    };
  }, [user?.id, refreshWallet, refreshCashbackWallet, toast]);

  // Update "last updated" time
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated((prev) => {
        if (prev === 'just now') return '1 min ago';
        const match = prev.match(/(\d+)/);
        if (match) {
          const mins = parseInt(match[1]) + 1;
          return `${mins} min ago`;
        }
        return prev;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const copyAccountNumber = () => {
    if (profile?.account_number) {
      navigator.clipboard.writeText(profile.account_number);
      toast({
        title: 'Copied!',
        description: 'Account number copied to clipboard',
      });
    }
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
    }).format(balance);
  };

  const hasVirtualAccount = profile?.account_number && profile.account_number.length === 10;
  const isAccountReady = hasVirtualAccount && profile?.virtual_account_name;
  const storedBank = profile?.virtual_account_bank || "";
  const bankName = (() => {
    if (storedBank.toLowerCase().includes("aspfiy")) return "ASPFIY";
    if (storedBank.toLowerCase().includes("palmpay")) return "PalmPay";
    return storedBank;
  })();
  const accountName = "ASPFIY";

  const canWithdrawCashback = (cashbackWallet?.balance || 0) >= 100;

  const retryVirtualAccountCreation = async () => {
    console.log('[AccountCard] retryVirtualAccountCreation called, user:', !!user, 'profile:', !!profile);
    if (!user || !profile) {
      console.error('[AccountCard] Missing user or profile, cannot retry');
      toast({
        title: 'Error',
        description: 'Please log in first.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsRetrying(true);
    try {
      // Sanitize phone number
      let phone = (profile.phone || "").replace(/[\s\-()]/g, "");
      if (phone.startsWith("+234")) {
        phone = "0" + phone.slice(4);
      } else if (phone.startsWith("234") && phone.length === 13) {
        phone = "0" + phone.slice(3);
      }

      const { data, error } = await supabase.functions.invoke('create-virtual-account', {
        body: {
          userId: user.id,
          email: profile.email || user.email,
          name: profile.full_name,
          phoneNumber: phone,
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Account Created!',
        description: 'Your virtual account has been set up successfully.',
      });

      // Refresh profile to get the new account details
      await refreshProfile();
    } catch (error: any) {
      console.error('Error creating virtual account:', error);
      toast({
        title: 'Failed to create account',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleWithdrawCashback = async () => {
    if (!canWithdrawCashback) {
      toast({
        title: 'Cannot Withdraw',
        description: 'Minimum cashback withdrawal is ₦100',
        variant: 'destructive',
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-cashback');

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Cashback Withdrawn!',
          description: data.message,
        });
        refreshWallet();
        refreshCashbackWallet();
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      console.error('Error withdrawing cashback:', error);
      toast({
        title: 'Withdrawal Failed',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-3 mx-4 md:mx-6">
      {/* Main Wallet Card */}
      <div className="relative overflow-hidden rounded-3xl p-5 md:p-6 text-primary-foreground shadow-xl"
        style={{ background: 'linear-gradient(135deg, hsl(4 82% 55%) 0%, hsl(4 75% 45%) 100%)' }}>
        {/* Glow accents */}
        <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-black/10 blur-3xl" />

        <div className="relative flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium opacity-95">Available Balance</p>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="w-6 h-6 rounded-full bg-secondary/90 flex items-center justify-center"
                aria-label="Toggle balance visibility"
              >
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 leading-none">
              {showBalance ? formatBalance(wallet?.balance || 0) : '₦ ****'}
            </h2>
            <p className="text-sm font-semibold leading-tight">Welcome {(profile?.full_name || 'User').split(' ')[0]},</p>
            <p className="text-[10px] opacity-80 mb-2">All services are going smoothly</p>

            <div className="inline-flex items-center gap-1 bg-secondary/95 rounded-full px-2 py-0.5 text-[10px] font-medium shadow">
              <Bell className="w-2.5 h-2.5" />
              <span>Balance updated: {lastUpdated}</span>
            </div>
          </div>

          <div className="flex flex-col items-end justify-between shrink-0">
            <img
              src={walletArt}
              alt="Wallet"
              width={120}
              height={120}
              loading="lazy"
              className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl -mt-1 -mr-1"
            />
            <button
              onClick={() => navigate('/add-money')}
              disabled={!isAccountReady}
              className="mt-2 inline-flex items-center gap-1 bg-white text-secondary font-bold text-xs rounded-full px-3 py-1.5 shadow-md hover:shadow-lg active:scale-95 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" strokeWidth={3} />
              Add Money
            </button>
          </div>
        </div>
      </div>

      {/* Account Info Card */}
      {isAccountReady ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-1.5 grid grid-cols-[1fr_1fr_1.3fr] gap-0.5">
          <div className="flex items-start gap-0.5 min-w-0">
            <UserIcon className="w-3 h-3 text-secondary shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-[7px] uppercase tracking-wide text-muted-foreground font-semibold leading-tight">Acct Name</p>
              <p className="text-[10px] font-medium text-foreground tabular-nums">{accountName}</p>
            </div>
          </div>
          <div className="flex items-start gap-0.5 min-w-0 border-l border-border/60 pl-1">
            <Building2 className="w-3 h-3 text-secondary shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-[7px] uppercase tracking-wide text-muted-foreground font-semibold leading-tight">Bank</p>
              <p className="text-[10px] font-medium text-foreground tabular-nums truncate">{bankName}</p>
            </div>
          </div>
          <div className="flex items-start gap-0.5 min-w-0 border-l border-border/60 pl-1">
            <CreditCard className="w-3 h-3 text-secondary shrink-0 mt-px" />
            <div className="min-w-0 flex-1">
              <p className="text-[7px] uppercase tracking-wide text-muted-foreground font-semibold leading-tight">Acct No</p>
              <div className="flex items-center gap-0.5">
                <p className="text-[10px] font-medium text-foreground tabular-nums whitespace-nowrap">{profile?.account_number}</p>
                <button onClick={copyAccountNumber} className="shrink-0 text-secondary hover:opacity-70">
                  <Copy className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {isRetrying ? 'Creating account...' : 'Account not ready'}
          </span>
          <button
            onClick={retryVirtualAccountCreation}
            disabled={isRetrying}
            className="inline-flex items-center gap-1 text-sm font-semibold text-secondary disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-2 grid grid-cols-3 gap-1">
        {[
          { icon: History, label: 'History', path: '/history' },
          { icon: Users, label: 'Refer & Earn', path: '/referral' },
          { icon: Headphones, label: 'Customer Service', path: '/support' },
        ].map(({ icon: Icon, label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-1 py-1.5 rounded-xl hover:bg-muted/60 transition active:scale-95"
          >
            <Icon className="w-5 h-5 text-secondary" strokeWidth={2.2} />
            <span className="text-[10px] font-semibold text-foreground">{label}</span>
          </button>
        ))}
      </div>

      {/* Cashback Wallet Card */}
      <div className="rounded-2xl p-3 text-white shadow-md"
        style={{ background: 'linear-gradient(135deg, hsl(215 80% 45%) 0%, hsl(215 72% 38%) 100%)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium opacity-95">Cashback Balance</p>
              <p className="text-xl font-extrabold leading-tight">
                {showBalance ? formatBalance(cashbackWallet?.balance || 0) : '₦ ****'}
              </p>
            </div>
          </div>
          <button
            onClick={handleWithdrawCashback}
            disabled={!canWithdrawCashback || isWithdrawing}
            className="inline-flex items-center gap-1 bg-white text-secondary font-bold text-xs rounded-full px-3 py-1.5 shadow disabled:opacity-50 active:scale-95 transition"
          >
            {isWithdrawing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                Withdraw
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
        <div className="mt-2 bg-white/10 rounded-lg px-2.5 py-1.5 space-y-0.5">
          {!canWithdrawCashback && (cashbackWallet?.balance || 0) > 0 && (
            <p className="text-[10px] opacity-95">
              Minimum ₦100 required to withdraw ({formatBalance(100 - (cashbackWallet?.balance || 0))} more needed)
            </p>
          )}
          <p className="text-[10px] opacity-90">
            Earn ₦5/GB on data • ₦2/₦100 on airtime
          </p>
        </div>
      </div>
    </div>
  );
}