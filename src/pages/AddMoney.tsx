import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Copy, Building2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVirtualAccounts, VirtualAccount } from '@/hooks/useVirtualAccounts';
import { PalmPayNinDialog } from '@/components/dashboard/PalmPayNinDialog';

export default function AddMoney() {
  const navigate = useNavigate();
  const { profile, user, refreshProfile: refreshProfileBase } = useAuth();
  const { toast } = useToast();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [ninOpen, setNinOpen] = useState(false);
  const { paga, palmpay, refresh } = useVirtualAccounts();
  const refreshProfile = async () => { await refreshProfileBase(); await refresh(); };

  

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const createVirtualAccount = async (force = false) => {
    console.log('[AddMoney] createVirtualAccount called, user:', !!user, 'profile:', !!profile);
    if (!user || !profile) {
      console.error('[AddMoney] Missing user or profile, cannot create virtual account');
      toast({
        title: 'Error',
        description: 'Please log in first to create a virtual account.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingAccount(true);
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
          force,
          provider: 'paga',
        },
      });

      if (error) {
        console.error('Error creating virtual account:', error);
        toast({
          title: 'Error',
          description: 'Failed to create virtual account. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      if (data?.success) {
        toast({
          title: 'Success!',
          description: `Virtual account created: ${data.accountNumber}`,
        });
        // Refresh profile to get the new account number
        await refreshProfile();
      } else {
        toast({
          title: 'Error',
          description: data?.error || 'Failed to create virtual account',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const renderAccount = (acc: VirtualAccount, label: string) => (
    <div className="bg-card rounded-2xl p-5 shadow-sm mb-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-primary-foreground text-[10px] font-extrabold ${acc.provider === 'paga' ? 'bg-paga' : 'bg-palmpay'}`}>
          {acc.provider === 'paga' ? 'paga' : 'P'}
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground">Bank transfer</p>
        </div>
      </div>
      {[
        { k: 'Bank Name', v: label },
        { k: 'Account Number', v: acc.account_number },
        { k: 'Account Name', v: acc.account_name },
      ].map(({ k, v }) => (
        <div key={k} className="bg-secondary/10 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{k}</p>
            <p className="font-semibold text-foreground tracking-wide">{v}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(v, k)}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        <div className="flex items-center gap-4 px-4 py-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Add Money</h1>
        </div>

        <div className="px-4 pb-6">
          {paga ? renderAccount(paga, 'Paga') : (
            <div className="bg-card rounded-2xl p-5 shadow-sm mb-4 text-center">
              <p className="text-muted-foreground mb-3 text-sm">Your Paga account is not ready yet.</p>
              <Button onClick={() => createVirtualAccount(false)} disabled={isCreatingAccount} className="w-full">
                {isCreatingAccount ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Account...</> : 'Create Paga Account'}
              </Button>
            </div>
          )}

          {palmpay ? renderAccount(palmpay, 'PalmPay') : (
            <div className="bg-card rounded-2xl p-5 shadow-sm mb-4">
              <div className="flex items-center gap-3 mb-3">
                <Building2 className="w-6 h-6 text-palmpay" />
                <h2 className="font-semibold text-foreground">PalmPay</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                According to CBN and PalmPay compliance rules, you must provide your NIN to get a PalmPay account number.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setNinOpen(true)}>
                Generate PalmPay Account Number
              </Button>
            </div>
          )}

          <div className="bg-accent/10 rounded-xl p-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">Note:</span> Transfer any amount to any of your accounts above.
              Your wallet will be credited automatically within minutes.
            </p>
          </div>
        </div>
        <PalmPayNinDialog open={ninOpen} onOpenChange={setNinOpen} onCreated={refresh} />
      </div>
    </MobileLayout>
  );
}
