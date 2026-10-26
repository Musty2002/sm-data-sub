import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function PalmPayNinDialog({ open, onOpenChange, onCreated }: Props) {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [nin, setNin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valid = /^\d{11}$/.test(nin);

  const submit = async () => {
    if (!valid || !user || !profile) return;
    setSubmitting(true);
    try {
      let phone = (profile.phone || '').replace(/[\s\-()]/g, '');
      if (phone.startsWith('+234')) phone = '0' + phone.slice(4);
      else if (phone.startsWith('234') && phone.length === 13) phone = '0' + phone.slice(3);

      const { data, error } = await supabase.functions.invoke('create-virtual-account', {
        body: {
          userId: user.id,
          email: profile.email || user.email,
          name: profile.full_name,
          phoneNumber: phone,
          provider: 'palmpay',
          nin,
        },
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error));
      if (!data?.success) throw new Error(data?.details?.message || data?.error || 'Could not create account');

      toast({ title: 'PalmPay account ready', description: `Account number: ${data.accountNumber}` });
      setNin('');
      onOpenChange(false);
      await refreshProfile();
      onCreated();
    } catch (e: any) {
      toast({ title: 'Could not create PalmPay account', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-palmpay/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-palmpay" />
          </div>
          <DialogTitle className="text-center">Get a PalmPay account</DialogTitle>
          <DialogDescription className="text-center">
            According to CBN and PalmPay compliance rules, you must provide your NIN (National Identification Number) to get a PalmPay account number.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            inputMode="numeric"
            maxLength={11}
            placeholder="Enter your 11-digit NIN"
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
          />
          <p className="text-xs text-muted-foreground">
            Your NIN is sent securely to PalmPay for verification only.
          </p>
          <Button className="w-full" disabled={!valid || submitting} onClick={submit}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</> : 'Generate PalmPay Account'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
