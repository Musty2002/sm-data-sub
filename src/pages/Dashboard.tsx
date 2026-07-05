import { useState, useCallback, useEffect } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { AccountCard } from '@/components/dashboard/AccountCard';
import { ServicesGrid } from '@/components/dashboard/ServicesGrid';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { PromoPopup } from '@/components/PromoPopup';
import { TransactionPinDialog, isTransactionPinSetup } from '@/components/auth/PinSetupDialog';
import { Bell, RefreshCw, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/sm-data-sub-logo.jpeg';

export default function Dashboard() {
  const navigate = useNavigate();
  const { refreshWallet, refreshProfile, refreshCashbackWallet, profile } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [showTransactionPinSetup, setShowTransactionPinSetup] = useState(false);

  // Check if transaction PIN needs to be set up
  useEffect(() => {
    const checkTransactionPin = () => {
      if (!isTransactionPinSetup()) {
        // Small delay to let the dashboard load first
        setTimeout(() => {
          setShowTransactionPinSetup(true);
        }, 1000);
      }
    };
    
    checkTransactionPin();
  }, []);

  const handleTransactionPinComplete = () => {
    toast({
      title: 'Transaction PIN Set',
      description: 'Your transaction PIN has been created successfully.',
    });
  };

  const PULL_THRESHOLD = 80;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshWallet(),
        refreshProfile(),
        refreshCashbackWallet(),
      ]);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [refreshWallet, refreshProfile, refreshCashbackWallet]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    if (scrollTop === 0) {
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    
    const touch = e.touches[0];
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    
    if (scrollTop === 0) {
      const distance = Math.min(touch.clientY - 100, 120);
      if (distance > 0) {
        setPullDistance(distance);
      }
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    setIsPulling(false);
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, handleRefresh]);

  return (
    <MobileLayout>
      <PromoPopup />
      <TransactionPinDialog
        open={showTransactionPinSetup}
        onOpenChange={setShowTransactionPinSetup}
        onComplete={handleTransactionPinComplete}
        isRequired={false}
      />
      <div
        className="safe-area-top"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to Refresh Indicator */}
        <div 
          className="flex justify-center items-center overflow-hidden transition-all duration-200"
          style={{ height: isRefreshing ? 50 : pullDistance * 0.5 }}
        >
          <div 
            className={`flex items-center gap-2 text-muted-foreground transition-opacity ${
              pullDistance > 20 || isRefreshing ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <RefreshCw 
              className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} 
              style={{ 
                transform: isRefreshing ? 'none' : `rotate(${pullDistance * 2}deg)`,
                color: pullDistance >= PULL_THRESHOLD ? 'hsl(var(--primary))' : undefined
              }}
            />
            <span className="text-sm">
              {isRefreshing 
                ? 'Refreshing...' 
                : pullDistance >= PULL_THRESHOLD 
                  ? 'Release to refresh' 
                  : 'Pull to refresh'}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/services')}
              className="w-9 h-9 flex items-center justify-center -ml-1"
              aria-label="Menu"
            >
              <Menu className="w-6 h-6 text-foreground" />
            </button>
            <img src={logo} alt="SM Data Sub" className="h-9 w-9 rounded-full object-cover border-2 border-primary" />
            <h1 className="text-base font-extrabold text-secondary tracking-tight">SM DATA SUB</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/notifications')}
              className="relative w-10 h-10 flex items-center justify-center"
              aria-label="Notifications"
            >
              <Bell className="w-6 h-6 text-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-background"></span>
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full bg-muted overflow-hidden border-2 border-secondary/30"
              aria-label="Profile"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary/10 text-secondary text-sm font-bold">
                  {(profile?.full_name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Account Card */}
        <AccountCard />

        {/* Services Grid */}
        <ServicesGrid />

        {/* Recent Transactions */}
        <RecentTransactions />
      </div>
    </MobileLayout>
  );
}