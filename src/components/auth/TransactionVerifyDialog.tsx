import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Delete, Lock, Check, AlertCircle, Fingerprint, Loader2 } from 'lucide-react';
import { verifyTransactionPin, usePinStatus } from './PinSetupDialog';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { toast } from 'sonner';

interface TransactionVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
  amount?: number;
}

const BIOMETRIC_FOR_TRANSACTIONS_KEY = 'biometric_for_transactions';

export function isBiometricForTransactionsEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_FOR_TRANSACTIONS_KEY) === 'true';
}

export function setBiometricForTransactions(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_FOR_TRANSACTIONS_KEY, enabled ? 'true' : 'false');
}

export function TransactionVerifyDialog({ 
  open, 
  onOpenChange, 
  onVerified,
  title = 'Verify Transaction',
  description = 'Enter your 4-digit transaction PIN',
  amount
}: TransactionVerifyDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'pin' | 'biometric'>('pin');
  
  const { isAvailable, isEnabled, biometryName, authenticate } = useBiometricAuth();
  const biometricEnabled = isBiometricForTransactionsEnabled() && isAvailable && isEnabled;
  const hasPinSetup = usePinStatus().hasTransactionPin;

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      // Default to biometric if enabled
      if (biometricEnabled) {
        setMode('biometric');
      } else {
        setMode('pin');
      }
    }
  }, [open, biometricEnabled]);

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');

      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const verifyPin = async (enteredPin: string) => {
    setLoading(true);
    try {
      const isValid = await verifyTransactionPin(enteredPin);
      if (isValid) {
        onVerified();
        onOpenChange(false);
        setPin('');
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricVerify = async () => {
    setLoading(true);
    try {
      const success = await authenticate();
      if (success) {
        onVerified();
        onOpenChange(false);
      } else {
        setError('Biometric verification failed');
        // Fall back to PIN
        setMode('pin');
      }
    } catch (err) {
      setError('Biometric verification failed');
      setMode('pin');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setPin('');
    setError('');
  };

  const pinDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  if (!hasPinSetup && !biometricEnabled) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="text-center">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <DialogTitle className="text-center">Transaction PIN Required</DialogTitle>
            <DialogDescription className="text-center">
              Please set up your transaction PIN in Security settings before making transactions.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleClose} className="w-full">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-center">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
            {mode === 'biometric' ? (
              <Fingerprint className="w-8 h-8 text-primary" />
            ) : (
              <Lock className="w-8 h-8 text-primary" />
            )}
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {amount ? (
              <span className="block text-lg font-semibold text-foreground mb-1">
                ₦{amount.toLocaleString()}
              </span>
            ) : null}
            {mode === 'biometric' ? `Use ${biometryName} to verify` : description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {mode === 'biometric' ? (
            <div className="space-y-4">
              <Button 
                onClick={handleBiometricVerify} 
                className="w-full h-16 text-lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="w-6 h-6 mr-2" />
                    Verify with {biometryName}
                  </>
                )}
              </Button>

              {hasPinSetup && (
                <Button 
                  variant="ghost" 
                  onClick={() => setMode('pin')} 
                  className="w-full"
                >
                  Use PIN instead
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* PIN Display */}
              <div className="flex justify-center gap-3 mb-6">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center transition-all ${
                      i < pin.length
                        ? 'bg-secondary border-secondary'
                        : i === pin.length
                        ? 'border-primary'
                        : 'border-muted bg-muted/30'
                    }`}
                  >
                    {i < pin.length && (
                      <div className="w-3 h-3 rounded-full bg-foreground" />
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center justify-center gap-2 text-destructive text-sm mb-4">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3 max-w-[200px] mx-auto">
                {pinDigits.map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handlePinInput(String(digit))}
                    disabled={loading}
                    className="w-14 h-14 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-xl font-semibold text-foreground transition-all active:scale-95"
                  >
                    {digit}
                  </button>
                ))}
                
                <button
                  onClick={handleDelete}
                  disabled={loading || pin.length === 0}
                  className="w-14 h-14 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                >
                  <Delete className="w-5 h-5 text-foreground" />
                </button>
                
                <button
                  onClick={() => handlePinInput('0')}
                  disabled={loading}
                  className="w-14 h-14 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-xl font-semibold text-foreground transition-all active:scale-95"
                >
                  0
                </button>
                
                <button
                  onClick={() => pin.length === 4 && verifyPin(pin)}
                  disabled={loading || pin.length !== 4}
                  className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
                  ) : (
                    <Check className="w-5 h-5 text-primary-foreground" />
                  )}
                </button>
              </div>

              {biometricEnabled && (
                <Button 
                  variant="ghost" 
                  onClick={() => setMode('biometric')} 
                  className="w-full mt-4"
                >
                  <Fingerprint className="w-4 h-4 mr-2" />
                  Use {biometryName} instead
                </Button>
              )}
            </>
          )}
        </div>

        <Button variant="ghost" onClick={handleClose} className="w-full">
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}