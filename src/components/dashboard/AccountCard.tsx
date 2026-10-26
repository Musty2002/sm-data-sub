import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Plus, Clock, Bell, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useVirtualAccounts, VirtualAccount } from '@/hooks/useVirtualAccounts';
import { PalmPayNinDialog } from './PalmPayNinDialog';
import walletArt from '@/assets/wallet-3d.png';
import pagaLogo from '@/assets/banks/paga-logo.png.asset.json';
import palmpayLogo from '@/assets/banks/palmpay-logo.png.asset.json';

export function AccountCard() {
  const { profile, wallet, user, refreshWallet, refreshCashbackWallet, refreshProfile } = useAuth();
  const { paga, palmpay, loaded, refresh } = useVirtualAccounts();
  const [showBalance, setShowBalance] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [ninOpen, setNinOpen] = useState(false);
  const [retryingPaga, setRetryingPaga] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;
    const walletChannel = supabase
      .channel('wallet-balance-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${user.id}` }, () => {
        refreshWallet();
        setLastUpdated('just now');
        toast({ title: 'Balance Updated', description: 'Your wallet balance has been updated.' });
      })
      .subscribe();
    const cashbackChannel = supabase
      .channel('cashback-wallet-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cashback_wallets', filter: `user_id=eq.${user.id}` }, () => refreshCashbackWallet())
      .subscribe();
    return () => {
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(cashbackChannel);
    };
  }, [user?.id, refreshWallet, refreshCashbackWallet, toast]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated((prev) => {
        if (prev === 'just now') return '1 min ago';
        const match = prev.match(/(\d+)/);
        return match ? `${parseInt(match[1]) + 1} min ago` : prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatBalance = (balance: number) =>
    new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance);

  const copy = (acc: VirtualAccount) => {
    navigator.clipboard.writeText(acc.account_number);
    toast({ title: 'Copied!', description: `${acc.provider === 'paga' ? 'Paga' : 'PalmPay'} account number copied` });
  };

  const isAccountReady = !!profile?.virtual_account_name || !!paga || !!palmpay;

  const retryPaga = async () => {
    if (!user || !profile) return;
    setRetryingPaga(true);
    try {
      let phone = (profile.phone || '').replace(/[\s\-()]/g, '');
      if (phone.startsWith('+234')) phone = '0' + phone.slice(4);
      else if (phone.startsWith('234') && phone.length === 13) phone = '0' + phone.slice(3);
      const { data, error } = await supabase.functions.invoke('create-virtual-account', {
        body: { userId: user.id, email: profile.email || user.email, name: profile.full_name, phoneNumber: phone, provider: 'paga' },
      });
      if (error || !data?.success) throw new Error(data?.details?.message || 'Please try again later.');
      await refreshProfile();
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not create Paga account', description: e?.message, variant: 'destructive' });
    } finally {
      setRetryingPaga(false);
    }
  };

  return (
    <div className="space-y-3 mx-4 md:mx-6">
      {/* Balance Card */}
      <div
        className="relative overflow-hidden rounded-3xl p-4 text-secondary-foreground shadow-xl"
        style={{ background: 'var(--gradient-balance)' }}
      >
        {/* Red diagonal ribbon */}
        <div className="pointer-events-none absolute -right-10 -top-6 w-32 h-[140%] rotate-[25deg] bg-primary/90" />
        <div className="pointer-events-none absolute -right-2 -top-6 w-6 h-[140%] rotate-[25deg] bg-warning/80" />

        <div className="relative flex gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold">Available Balance</p>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center"
                aria-label="Toggle balance visibility"
              >
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight leading-none mb-2 tabular-nums">
              {showBalance ? formatBalance(wallet?.balance || 0) : '****'}
            </h2>
            <p className="text-base font-bold leading-tight">Welcome {(profile?.full_name || 'User').split(' ')[0]},</p>
            <p className="text-[11px] opacity-90">All services are going smoothly</p>
          </div>
          <img
            src={walletArt}
            alt=""
            width={120}
            height={120}
            loading="lazy"
            className="relative w-24 h-24 object-contain drop-shadow-2xl shrink-0"
          />
        </div>

        <div className="relative mt-3 flex items-center gap-1.5">
          <div className="flex-1 min-w-0 inline-flex items-center gap-1 bg-primary rounded-full px-2.5 py-1.5 text-[10px] font-semibold shadow">
            <Bell className="w-3 h-3 shrink-0" />
            <span className="truncate">Balance updated: {lastUpdated}</span>
          </div>
          <button
            onClick={() => navigate('/history')}
            className="inline-flex items-center gap-1 bg-card text-foreground font-bold text-xs rounded-full px-3 py-1.5 shadow active:scale-95 transition"
          >
            <Clock className="w-3.5 h-3.5 text-secondary" /> History
          </button>
          <button
            onClick={() => navigate('/add-money')}
            disabled={!isAccountReady}
            className="inline-flex items-center gap-1 bg-card text-foreground font-bold text-xs rounded-full px-3 py-1.5 shadow active:scale-95 transition disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5 text-secondary" strokeWidth={3} /> Add Money
          </button>
        </div>
      </div>

      {/* My Accounts */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-extrabold text-foreground">My Accounts</h3>
          <button onClick={() => navigate('/add-money')} className="text-xs font-semibold text-secondary inline-flex items-center">
            Manage <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* Paga */}
          {paga ? (
            <AccountTile acc={paga} label="PAGA" tone="paga" onCopy={() => copy(paga)} />
          ) : (
            <button
              onClick={retryPaga}
              disabled={retryingPaga || !loaded}
              className="rounded-xl border border-border/60 border-l-4 border-l-paga p-2.5 text-left flex items-center gap-2"
            >
              <BankLogo tone="paga" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">PAGA</p>
                <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  {retryingPaga || !loaded ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {retryingPaga || !loaded ? 'Setting up...' : 'Tap to retry'}
                </p>
              </div>
            </button>
          )}

          {/* PalmPay */}
          {palmpay ? (
            <AccountTile acc={palmpay} label="PalmPay" tone="palmpay" onCopy={() => copy(palmpay)} />
          ) : (
            <button
              onClick={() => setNinOpen(true)}
              className="rounded-xl border border-border/60 border-l-4 border-l-palmpay p-2.5 text-left flex items-center gap-2 active:scale-[0.98] transition"
            >
              <BankLogo tone="palmpay" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">PalmPay</p>
                <p className="text-[10px] font-semibold text-palmpay leading-tight">Generate PalmPay account number</p>
              </div>
            </button>
          )}
        </div>
      </div>

      <PalmPayNinDialog open={ninOpen} onOpenChange={setNinOpen} onCreated={refresh} />
    </div>
  );
}

export function BankLogo({ tone, className = 'w-10 h-10' }: { tone: 'paga' | 'palmpay'; className?: string }) {
  return (
    <img
      src={tone === 'paga' ? pagaLogo.url : palmpayLogo.url}
      alt={tone === 'paga' ? 'Paga' : 'PalmPay'}
      className={`${className} rounded-full shrink-0 object-cover bg-card border border-border/60`}
    />
  );
}

function AccountTile({ acc, label, tone, onCopy }: { acc: VirtualAccount; label: string; tone: 'paga' | 'palmpay'; onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      className={`rounded-xl border border-border/60 border-l-4 p-2.5 text-left active:scale-[0.98] transition ${
        tone === 'paga' ? 'border-l-paga' : 'border-l-palmpay'
      }`}
    >
      <div className="flex items-center gap-2">
        <BankLogo tone={tone} className="w-8 h-8" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground leading-tight">{label}</p>
          <p className="text-[9px] text-muted-foreground leading-tight">Wallet Account</p>
        </div>
        <Copy className="w-3.5 h-3.5 text-secondary shrink-0" />
      </div>
      <p className="mt-1.5 w-full text-[15px] font-extrabold text-foreground tabular-nums tracking-tight whitespace-nowrap leading-none">
        {acc.account_number}
      </p>
    </button>
  );
}
