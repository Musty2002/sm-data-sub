import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Delete, ArrowRight, User } from 'lucide-react';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePinStatus, verifyStoredPin } from './PinSetupDialog';

interface LockScreenProps {
  userEmail: string;
  userName?: string;
  onUnlock: () => void;
  onSwitchAccount: () => void;
}

export function LockScreen({ userEmail, userName, onUnlock, onSwitchAccount }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    isAvailable: biometricAvailable,
    isEnabled: biometricEnabled,
    biometryName,
    authenticate,
  } = useBiometricAuth();

  const biometricTriggered = useRef(false);
  const pinStatus = usePinStatus();
  const hasPinSetup = pinStatus.hasAppPin;


  // Auto-trigger biometric on mount (use ref to track if already triggered)
  useEffect(() => {
    const triggerBiometric = async () => {
      if (biometricAvailable && biometricEnabled && !biometricTriggered.current) {
        biometricTriggered.current = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const verified = await authenticate('Verify your identity to continue');
          if (verified) {
            onUnlock();
          }
        } catch (error) {
          console.log('Biometric auth failed:', error);
        }
      }
    };
    
    triggerBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricAvailable, biometricEnabled]);

  const handleBiometricAuth = async () => {
    const verified = await authenticate('Verify your identity to continue');
    if (verified) {
      onUnlock();
    }
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');

      // Auto-submit when 6 digits entered
      if (newPin.length === 6) {
        verifyPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const verifyPin = async (pinCode: string) => {
    setLoading(true);
    try {
      // First check if PIN is set up locally
      if (hasPinSetup) {
        const isValid = await verifyStoredPin(pinCode);
        if (isValid) {
          onUnlock();
        } else {
          setError('Incorrect passcode');
          setPin('');
        }
      } else {
        // Fallback: Use the PIN as password for re-authentication (legacy)
        const { error } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: pinCode,
        });

        if (error) {
          setError('Incorrect passcode');
          setPin('');
        } else {
          onUnlock();
        }
      }
    } catch (err) {
      setError('Verification failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasscode = () => {
    // Sign out and redirect to auth page
    supabase.auth.signOut();
    navigate('/auth');
  };

  // Get display initials
  const getInitials = () => {
    if (userName) {
      const parts = userName.split(' ');
      return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }
    return userEmail.slice(0, 2).toUpperCase();
  };

  // Get masked email
  const getMaskedEmail = () => {
    if (!userEmail.includes('@')) return userEmail;
    const [local, domain] = userEmail.split('@');
    const maskedLocal = local.slice(0, 3) + '***';
    return `${maskedLocal}@${domain}`;
  };

  const pinDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // If no PIN is set up and no biometrics, just unlock (will prompt to set up PIN after)
  // Use a ref to prevent multiple calls
  const autoUnlockedRef = useRef(false);
  
  useEffect(() => {
    if (!hasPinSetup && !biometricAvailable && !autoUnlockedRef.current) {
      // No security set up yet, unlock and let the app prompt for setup
      autoUnlockedRef.current = true;
      onUnlock();
    }
  }, [hasPinSetup, biometricAvailable, onUnlock]);

  // If no PIN setup but biometrics available, show only biometric option
  if (!hasPinSetup && biometricAvailable) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Avatar */}
        <div className="mb-4">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <span className="text-2xl font-bold text-primary-foreground">{getInitials()}</span>
          </div>
        </div>

        {/* User badge */}
        <div className="mb-4 px-3 py-1 bg-muted rounded-full">
          <span className="text-sm text-muted-foreground">@ {getMaskedEmail()}</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back!</h1>
        <p className="text-muted-foreground text-sm mb-8">Use biometrics to continue</p>

        {/* Biometric Button */}
        <button
          onClick={handleBiometricAuth}
          disabled={loading}
          className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all active:scale-95 mb-6"
        >
          <Fingerprint className="w-10 h-10 text-primary-foreground" />
        </button>
        <p className="text-sm text-muted-foreground mb-8">Tap to use {biometryName}</p>

        {/* Switch Account */}
        <button
          onClick={onSwitchAccount}
          className="mt-4 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        >
          <User className="w-4 h-4" />
          Switch account
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      {/* Avatar */}
      <div className="mb-4">
        <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <span className="text-2xl font-bold text-primary-foreground">{getInitials()}</span>
        </div>
      </div>

      {/* User badge */}
      <div className="mb-4 px-3 py-1 bg-muted rounded-full">
        <span className="text-sm text-muted-foreground">@ {getMaskedEmail()}</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back!</h1>
      <p className="text-muted-foreground text-sm mb-8">Enter your 6 digit passcode</p>

      {/* PIN Display */}
      <div className="flex gap-2 mb-8">
        {[...Array(6)].map((_, i) => (
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
            {i === pin.length && (
              <div className="w-0.5 h-6 bg-primary animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-destructive text-sm mb-4">{error}</p>
      )}

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {pinDigits.map((digit) => (
          <button
            key={digit}
            onClick={() => handlePinInput(String(digit))}
            disabled={loading}
            className="w-16 h-16 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-2xl font-semibold text-foreground transition-all active:scale-95"
          >
            {digit}
          </button>
        ))}
        
        {/* Bottom row: Delete, 0, Submit/Biometric */}
        <button
          onClick={handleDelete}
          disabled={loading || pin.length === 0}
          className="w-16 h-16 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
        >
          <Delete className="w-6 h-6 text-foreground" />
        </button>
        
        <button
          onClick={() => handlePinInput('0')}
          disabled={loading}
          className="w-16 h-16 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-2xl font-semibold text-foreground transition-all active:scale-95"
        >
          0
        </button>
        
        {biometricAvailable ? (
          <button
            onClick={handleBiometricAuth}
            disabled={loading}
            className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all active:scale-95"
          >
            <Fingerprint className="w-6 h-6 text-primary-foreground" />
          </button>
        ) : (
          <button
            onClick={() => pin.length === 6 && verifyPin(pin)}
            disabled={loading || pin.length !== 6}
            className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            <ArrowRight className="w-6 h-6 text-primary-foreground" />
          </button>
        )}
      </div>

      {/* Forgot Passcode */}
      <button
        onClick={handleForgotPasscode}
        className="text-secondary text-sm hover:underline"
      >
        Forgot passcode?
      </button>

      {/* Switch Account */}
      <button
        onClick={onSwitchAccount}
        className="mt-4 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
      >
        <User className="w-4 h-4" />
        Switch account
      </button>
    </div>
  );
}
