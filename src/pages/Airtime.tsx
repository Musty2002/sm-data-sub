import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PhoneInputWithContacts } from '@/components/PhoneInputWithContacts';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TransactionReceipt } from '@/components/TransactionReceipt';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { TransactionVerifyDialog } from '@/components/auth/TransactionVerifyDialog';
import mtnLogo from '@/assets/networks/mtn-logo.png';
import airtelLogo from '@/assets/networks/airtel-logo.png';
import gloLogo from '@/assets/networks/glo-logo.png';
import nineMobileLogo from '@/assets/networks/9mobile-logo.png';

interface AirtimeService {
  id: number;
  product_id: number;
  service: string;
  name: string | null;
  category: string;
  available: boolean;
  provider?: 'rgc' | 'isquare';
}

const networkLogos: Record<string, string> = {
  'MTN': mtnLogo,
  'AIRTEL': airtelLogo,
  'GLO': gloLogo,
  '9MOBILE': nineMobileLogo,
};

const networkColors: Record<string, string> = {
  'MTN': 'bg-yellow-400/10 border-yellow-400',
  'AIRTEL': 'bg-red-500/10 border-red-500',
  'GLO': 'bg-green-500/10 border-green-500',
  '9MOBILE': 'bg-emerald-600/10 border-emerald-600',
};

const networkAccentColors: Record<string, string> = {
  'MTN': 'from-yellow-400 to-yellow-500',
  'AIRTEL': 'from-red-500 to-red-600',
  'GLO': 'from-green-500 to-green-600',
  '9MOBILE': 'from-emerald-500 to-emerald-600',
};

const quickAmounts = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

const networkPrefixes: Record<string, string> = {
  '0803': 'MTN', '0806': 'MTN', '0703': 'MTN', '0706': 'MTN',
  '0813': 'MTN', '0816': 'MTN', '0810': 'MTN', '0814': 'MTN',
  '0903': 'MTN', '0906': 'MTN', '0913': 'MTN', '0916': 'MTN',
  '0802': 'AIRTEL', '0808': 'AIRTEL', '0708': 'AIRTEL', '0701': 'AIRTEL',
  '0812': 'AIRTEL', '0902': 'AIRTEL', '0901': 'AIRTEL', '0904': 'AIRTEL',
  '0907': 'AIRTEL', '0912': 'AIRTEL', '0911': 'AIRTEL',
  '0805': 'GLO', '0807': 'GLO', '0705': 'GLO', '0815': 'GLO',
  '0811': 'GLO', '0905': 'GLO', '0915': 'GLO',
  '0809': '9MOBILE', '0817': '9MOBILE', '0818': '9MOBILE', '0908': '9MOBILE',
  '0909': '9MOBILE',
};

const normalizePhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 13) {
    return `0${digits.slice(3, 13)}`;
  }
  if (!digits.startsWith('0') && digits.length === 10) {
    return `0${digits}`;
  }
  return digits;
};

export default function Airtime() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [networks, setNetworks] = useState<AirtimeService[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<AirtimeService | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [lastTransaction, setLastTransaction] = useState<{
    id: string;
    date: Date;
    phoneNumber: string;
    network: string;
    amount: number;
    type: 'airtime' | 'data';
  } | null>(null);

  useEffect(() => {
    fetchNetworks();
  }, []);

  // Prefill last used phone number
  useEffect(() => {
    const saved = localStorage.getItem('lastAirtimePhone');
    if (saved) setPhoneNumber(saved);
  }, []);

  // Auto-detect network from phone number on step 2
  useEffect(() => {
    if (step !== 2 || networks.length === 0) return;
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (normalizedPhone.length < 4) return;
    const prefix = normalizedPhone.substring(0, 4);
    const detectedNetwork = networkPrefixes[prefix];
    if (detectedNetwork && detectedNetwork !== selectedNetwork?.category) {
      // Don't auto-switch network on step 2, user already chose
    }
  }, [phoneNumber, networks, selectedNetwork?.category, step]);

  const fetchNetworks = async () => {
    // Bonanza network IDs: 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL
    const bonanzaNetworks: AirtimeService[] = [
      { id: 1, product_id: 1, service: 'AIRTIME', name: 'MTN', category: 'MTN', available: true },
      { id: 4, product_id: 4, service: 'AIRTIME', name: 'AIRTEL', category: 'AIRTEL', available: true },
      { id: 2, product_id: 2, service: 'AIRTIME', name: 'GLO', category: 'GLO', available: true },
      { id: 3, product_id: 3, service: 'AIRTIME', name: '9MOBILE', category: '9MOBILE', available: true },
    ];
    setNetworks(bonanzaNetworks);
    setLoading(false);
  };

  const handleNetworkSelect = (network: AirtimeService) => {
    setSelectedNetwork(network);
    setStep(2);
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setPhoneNumber('');
      setAmount('');
      setShowTopUpPrompt(false);
    } else {
      navigate('/dashboard');
    }
  };

  const initiateTransaction = () => {
    if (!selectedNetwork || !phoneNumber || !amount) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill in all fields' });
      return;
    }
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (normalizedPhone.length !== 11) {
      toast({ variant: 'destructive', title: 'Invalid Phone Number', description: 'Please enter a valid Nigerian phone number' });
      return;
    }
    const amountNum = parseFloat(amount);
    if (amountNum < 50) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Minimum airtime amount is ₦50' });
      return;
    }
    setShowVerifyDialog(true);
  };

  const handlePurchase = async () => {
    setShowVerifyDialog(false);
    setPurchasing(true);
    setShowTopUpPrompt(false);
    
    if (!selectedNetwork) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a network first.' });
      setPurchasing(false);
      return;
    }
    
    const purchaseAmount = parseFloat(amount);
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    try {
      const { data, error } = await supabase.functions.invoke('bonanza-services', {
        body: {
          action: 'purchase',
          serviceType: 'airtime',
          network: selectedNetwork.category,
          amount: purchaseAmount,
          mobile_number: normalizedPhone,
        },
      });
      let message: string | undefined;
      if (error) message = await getEdgeFunctionErrorMessage(error);
      const primaryFailed = !!error || !data?.success;
      if (primaryFailed) {
        throw new Error(message || data?.message || 'Purchase failed');
      }

      setLastTransaction({
        id: data.data?.reference || `TXN-${Date.now()}`,
        date: new Date(),
        phoneNumber: normalizedPhone,
        network: selectedNetwork.category,
        amount: purchaseAmount,
        type: 'airtime',
      });
      try { localStorage.setItem('lastAirtimePhone', normalizedPhone); } catch {}
      setShowReceipt(true);
      setAmount('');
      setSelectedNetwork(null);
      setStep(1);
    } catch (error: any) {
      console.error('Purchase error:', error);
      let errorTitle = 'Purchase Failed';
      let errorDescription = error.message || 'Unable to complete purchase. Please try again.';
      const isUserInsufficientBalance = error.message === 'Insufficient balance';
      
      if (isUserInsufficientBalance) {
        errorTitle = 'Insufficient Balance';
        errorDescription = "You don't have enough funds in your wallet.";
        setShowTopUpPrompt(true);
      } else if (error.message?.toLowerCase().includes('invalid phone')) {
        errorTitle = 'Invalid Phone Number';
        errorDescription = 'Please check the phone number and try again.';
      }
      
      toast({ variant: 'destructive', title: errorTitle, description: errorDescription });
    } finally {
      setPurchasing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const uniqueNetworks = networks.filter((network, index, self) =>
    index === self.findIndex((n) => n.category === network.category)
  );

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4">
          <button onClick={handleBack} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">
            {step === 1 ? 'Buy Airtime' : `${selectedNetwork?.category} Airtime`}
          </h1>
        </div>

        <div className="px-4 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : step === 1 ? (
            /* ========== STEP 1: Network Selection ========== */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-2">Choose your network to continue</p>
              <div className="grid grid-cols-2 gap-4">
                {uniqueNetworks.map((network) => (
                  <button
                    key={network.id}
                    onClick={() => handleNetworkSelect(network)}
                    className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 hover:scale-[1.02] active:scale-[0.98] ${
                      networkColors[network.category] || 'border-border bg-card'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden">
                      {networkLogos[network.category] ? (
                        <img
                          src={networkLogos[network.category]}
                          alt={network.category}
                          className="w-12 h-12 object-contain rounded-lg"
                        />
                      ) : (
                        <span className="text-xl font-bold">{network.category.charAt(0)}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{network.category}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ========== STEP 2: Purchase Form ========== */
            <div className="space-y-6">
              {/* Selected Network Banner */}
              <div className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${networkAccentColors[selectedNetwork?.category || ''] || 'from-primary to-primary'} text-white`}>
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden">
                  {selectedNetwork && networkLogos[selectedNetwork.category] ? (
                    <img
                      src={networkLogos[selectedNetwork.category]}
                      alt={selectedNetwork.category}
                      className="w-7 h-7 object-contain"
                    />
                  ) : null}
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedNetwork?.category}</p>
                  <p className="text-xs opacity-80">Airtime Top-up</p>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="ml-auto text-xs bg-white/20 rounded-lg px-3 py-1.5 font-medium hover:bg-white/30 transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Phone Number */}
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <PhoneInputWithContacts
                  id="phone"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  className="mt-2"
                />
              </div>

              {/* Amount */}
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount (min ₦50)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-2"
                />
              </div>

              {/* Quick Amounts */}
              <div>
                <Label className="mb-2 block text-xs text-muted-foreground">Quick Select</Label>
                <div className="flex flex-wrap gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(amt.toString())}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        amount === amt.toString()
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border text-foreground'
                      }`}
                    >
                      {formatPrice(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purchase Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={initiateTransaction}
                disabled={!phoneNumber || !amount || purchasing}
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Buy ${amount ? formatPrice(parseFloat(amount)) : ''} Airtime`
                )}
              </Button>

              {/* Top Up Prompt */}
              {showTopUpPrompt && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                    Your wallet balance is insufficient for this purchase.
                  </p>
                  <Button
                    variant="default"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => navigate('/add-money')}
                  >
                    Top Up Wallet
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TransactionVerifyDialog
        open={showVerifyDialog}
        onOpenChange={setShowVerifyDialog}
        onVerified={handlePurchase}
        title="Verify Purchase"
        description="Verify your identity to complete this airtime purchase"
        amount={parseFloat(amount) || 0}
      />

      {lastTransaction && (
        <TransactionReceipt
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          transaction={lastTransaction}
        />
      )}
    </MobileLayout>
  );
}
