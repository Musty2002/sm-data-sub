import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface VirtualAccount {
  provider: 'paga' | 'palmpay';
  bank_name: string;
  account_number: string;
  account_name: string;
}

/** Loads the signed-in user's Paga and PalmPay funding accounts. */
export function useVirtualAccounts() {
  const { user, profile } = useAuth();
  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('virtual_accounts')
      .select('provider, bank_name, account_number, account_name')
      .eq('user_id', user.id);
    setAccounts((data as VirtualAccount[]) || []);
    setLoaded(true);
  }, [user?.id]);

  // Re-read whenever the profile changes (e.g. right after auto-provisioning).
  useEffect(() => {
    refresh();
  }, [refresh, profile?.updated_at, profile?.account_number]);

  return {
    accounts,
    loaded,
    refresh,
    paga: accounts.find((a) => a.provider === 'paga'),
    palmpay: accounts.find((a) => a.provider === 'palmpay'),
  };
}
