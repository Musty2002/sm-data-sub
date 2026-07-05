import { useEffect, useState } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Copy, Share2, Gift, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  totalEarnings: number;
}

export default function Referral() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    completedReferrals: 0,
    totalEarnings: 0,
  });

  useEffect(() => {
    if (profile) {
      fetchReferralStats();
    }
  }, [profile]);

  const fetchReferralStats = async () => {
    if (!profile) return;

    const { data: referrals } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', profile.id);

    if (referrals) {
      const completed = referrals.filter((r) => r.status === 'completed' || r.status === 'bonus_paid');
      setStats({
        totalReferrals: referrals.length,
        completedReferrals: completed.length,
        totalEarnings: completed.reduce((sum, r) => sum + Number(r.referrer_bonus || 0), 0),
      });
    }
  };

  const copyReferralCode = () => {
    if (profile?.referral_code) {
      navigator.clipboard.writeText(profile.referral_code);
      toast({
        title: 'Copied!',
        description: 'Referral code copied to clipboard',
      });
    }
  };

  const shareReferralCode = async () => {
    if (!profile?.referral_code) return;

    const inviteLink = `https://smdatasub.com.ng/?ref=${profile.referral_code}`;
    const shareText = `Join SM Data Sub using my referral code: ${profile.referral_code} and get ₦100 bonus when you buy at least 1GB of data!\n\nDownload the app here: ${inviteLink}\n\nYour referral code will be applied automatically.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SM Data Sub Referral',
          text: shareText,
          url: inviteLink,
        });
      } catch {
        copyReferralCode();
      }
    } else {
      copyReferralCode();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Refer & Earn</h1>
        </div>

        {/* Hero Section */}
        <div className="gradient-primary mx-4 rounded-2xl p-6 text-primary-foreground text-center mb-6">
          <Gift className="w-12 h-12 mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">Earn ₦200 Per Referral</h2>
          <p className="text-sm opacity-90">
            Invite friends to join SM Data Sub. When they buy at least 1GB of data, you earn ₦200 and they get ₦100!
          </p>
        </div>

        {/* Referral Code */}
        <div className="mx-4 bg-card rounded-xl p-4 mb-6 shadow-sm">
          <p className="text-sm text-muted-foreground mb-2">Your Referral Code</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-secondary rounded-lg py-3 px-4">
              <p className="text-lg font-bold text-center tracking-widest">
                {profile?.referral_code || '------'}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={copyReferralCode}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Share Button */}
        <div className="mx-4 mb-6">
          <Button className="w-full" size="lg" onClick={shareReferralCode}>
            <Share2 className="w-5 h-5 mr-2" />
            Share Referral Code
          </Button>
        </div>

        {/* Stats */}
        <div className="mx-4 grid grid-cols-3 gap-3 mb-4">
          <div className="bg-card rounded-xl p-4 text-center shadow-sm">
            <Users className="w-6 h-6 mx-auto mb-2 text-accent" />
            <p className="text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
            <p className="text-xs text-muted-foreground">Total Referrals</p>
          </div>
          <div className="bg-card rounded-xl p-4 text-center shadow-sm">
            <Gift className="w-6 h-6 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold text-foreground">{stats.completedReferrals}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="bg-card rounded-xl p-4 text-center shadow-sm">
            <Wallet className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
            <p className="text-lg font-bold text-foreground">{formatCurrency(stats.totalEarnings)}</p>
            <p className="text-xs text-muted-foreground">Earned</p>
          </div>
        </div>

        {/* Info Card */}
        <div className="mx-4 mb-6">
          <div className="bg-card rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Your Earnings</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(stats.totalEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">Credited directly to main wallet</p>
              </div>
              <Wallet className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mx-4 pb-6">
          <h3 className="font-semibold text-foreground mb-4">How it works</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                1
              </div>
              <div>
                <p className="font-medium text-foreground">Share your code</p>
                <p className="text-sm text-muted-foreground">Send your unique referral code to friends</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                2
              </div>
              <div>
                <p className="font-medium text-foreground">Friend signs up</p>
                <p className="text-sm text-muted-foreground">They create an account using your code</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                3
              </div>
              <div>
                <p className="font-medium text-foreground">Both earn rewards!</p>
                <p className="text-sm text-muted-foreground">You get ₦200 and your friend gets ₦100 when they buy at least 1GB of data</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}