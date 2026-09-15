import { useEffect, useState } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Coins, TrendingUp, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface CashbackTransaction {
  id: string;
  amount: number;
  type: string;
  category: string;
  description: string;
  created_at: string;
}

interface CashbackConfig {
  enabled: boolean;
  data_rate: number;
  data_unit: string;
  airtime_rate: number;
  airtime_unit: number;
  min_withdrawal: number;
}

export default function Cashback() {
  const navigate = useNavigate();
  const { user, cashbackWallet, refreshCashbackWallet } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<CashbackTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [cashbackConfig, setCashbackConfig] = useState<CashbackConfig>({
    enabled: true,
    data_rate: 5,
    data_unit: '1GB',
    airtime_rate: 2,
    airtime_unit: 100,
    min_withdrawal: 100
  });

  useEffect(() => {
    fetchCashbackConfig();
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchCashbackConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'cashback_config')
        .single();

      if (!error && data?.value) {
        setCashbackConfig(data.value as unknown as CashbackConfig);
      }
    } catch (error) {
      console.error('Error fetching cashback config:', error);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('cashback_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching cashback transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!cashbackWallet || cashbackWallet.balance < cashbackConfig.min_withdrawal) {
      toast({
        variant: 'destructive',
        title: 'Cannot withdraw',
        description: `Minimum withdrawal amount is ₦${cashbackConfig.min_withdrawal}`,
      });
      return;
    }

    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-cashback', {
        body: { amount: cashbackWallet.balance },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Withdrawal successful!',
          description: `₦${cashbackWallet.balance.toLocaleString()} has been transferred to your main wallet.`,
        });
        refreshCashbackWallet();
        fetchTransactions();
      } else {
        throw new Error(data?.message || 'Withdrawal failed');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Withdrawal failed',
        description: error.message || 'Please try again later',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  // If cashback is disabled, show disabled state
  if (!cashbackConfig.enabled) {
    return (
      <MobileLayout showNav={false}>
        <div className="safe-area-top">
          <div className="flex items-center gap-4 px-4 py-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-foreground">Cashback Rewards</h1>
          </div>
          
          <div className="mx-4 mt-8 text-center">
            <Coins className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground mb-2">Cashback Currently Unavailable</h2>
            <p className="text-muted-foreground">
              The cashback rewards program is temporarily paused. Please check back later.
            </p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Cashback Rewards</h1>
        </div>

        {/* Balance Card */}
        <div className="gradient-primary mx-4 rounded-2xl p-6 text-primary-foreground mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-8 h-8" />
            <span className="text-sm opacity-90">Cashback Balance</span>
          </div>
          <p className="text-3xl font-bold mb-4">
            {formatCurrency(cashbackWallet?.balance || 0)}
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleWithdraw}
            disabled={withdrawing || !cashbackWallet || cashbackWallet.balance < cashbackConfig.min_withdrawal}
          >
            <Wallet className="w-4 h-4 mr-2" />
            {withdrawing ? 'Processing...' : 'Withdraw to Main Wallet'}
          </Button>
          {cashbackWallet && cashbackWallet.balance < cashbackConfig.min_withdrawal && (
            <p className="text-xs text-center mt-2 opacity-75">
              Minimum withdrawal: ₦{cashbackConfig.min_withdrawal}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="mx-4 grid grid-cols-2 gap-3 mb-6">
          <div className="bg-card rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-xs text-muted-foreground">Total Earned</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(cashbackWallet?.total_earned || 0)}
            </p>
          </div>
          <div className="bg-card rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="text-xs text-muted-foreground">Total Withdrawn</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(cashbackWallet?.total_withdrawn || 0)}
            </p>
          </div>
        </div>

        {/* Cashback Rates */}
        <div className="mx-4 bg-card rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-foreground mb-3">Cashback Rates</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Data Purchase</span>
              <span className="font-medium text-green-600">₦{cashbackConfig.data_rate} per {cashbackConfig.data_unit}</span>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mx-4 pb-6">
          <h3 className="font-semibold text-foreground mb-4">Transaction History</h3>
          
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">No cashback transactions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Buy data or airtime to earn cashback rewards!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-card rounded-xl p-4 shadow-sm flex items-center gap-4"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'earned'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-orange-100 text-orange-600'
                    }`}
                  >
                    {tx.type === 'earned' ? (
                      <ArrowDownRight className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground capitalize">{tx.category}</p>
                    <p className="text-xs text-muted-foreground">{tx.description}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-bold ${
                        tx.type === 'earned' ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {tx.type === 'earned' ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'MMM d')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
