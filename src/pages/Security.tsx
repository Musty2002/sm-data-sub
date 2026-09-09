import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Lock, Smartphone, Shield, Eye, EyeOff, Loader2, Fingerprint, KeyRound, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useAuth } from '@/hooks/useAuth';
import { 
  PinSetupDialog, 
  clearStoredPin, 
  TransactionPinDialog,
  clearTransactionPin,
  usePinStatus
} from '@/components/auth/PinSetupDialog';

import { 
  isBiometricForTransactionsEnabled, 
  setBiometricForTransactions 
} from '@/components/auth/TransactionVerifyDialog';
import { ForgotTransactionPinDialog } from '@/components/auth/ForgotTransactionPinDialog';

export default function Security() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    isAvailable, 
    isEnabled, 
    biometryName, 
    isChecking,
    enableBiometricAuth, 
    disableBiometricAuth 
  } = useBiometricAuth();
  
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const pinStatus = usePinStatus();
  const hasPinSetup = pinStatus.hasAppPin;
  const hasTransactionPin = pinStatus.hasTransactionPin;
  const [transactionPinOpen, setTransactionPinOpen] = useState(false);
  const [biometricForTransactions, setBiometricForTransactionsState] = useState(isBiometricForTransactionsEnabled());
  const [forgotPinOpen, setForgotPinOpen] = useState(false);

  // Refresh PIN status when dialogs close
  useEffect(() => {
    setBiometricForTransactionsState(isBiometricForTransactionsEnabled());
    pinStatus.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSetupOpen, transactionPinOpen]);


  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordData.oldPassword) {
      toast.error('Please enter your current password');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (passwordData.oldPassword === passwordData.newPassword) {
      toast.error('New password must be different from current password');
      return;
    }

    setLoading(true);
    try {
      // First, verify the old password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordData.oldPassword,
      });

      if (signInError) {
        toast.error('Current password is incorrect');
        setLoading(false);
        return;
      }

      // Now update to the new password
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    await clearStoredPin();
    setPinSetupOpen(true);
  };

  const handleResetTransactionPin = async () => {
    await clearTransactionPin();
    setTransactionPinOpen(true);
  };


  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-card flex items-center justify-center shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Security</h1>
        </div>

        <div className="space-y-6">
          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="w-5 h-5 text-primary" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="oldPassword"
                      type={showOldPassword ? 'text' : 'password'}
                      value={passwordData.oldPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* App Lock PIN */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-5 h-5 text-primary" />
                App Lock PIN
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">6-Digit Passcode</p>
                    <p className="text-xs text-muted-foreground">
                      {hasPinSetup ? 'PIN is set up' : 'Required to secure your app'}
                    </p>
                  </div>
                </div>
                {hasPinSetup ? (
                  <Button variant="outline" size="sm" onClick={handleResetPin}>
                    Change
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setPinSetupOpen(true)}>
                    Set Up
                  </Button>
                )}
              </div>
              {!hasPinSetup && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                  ⚠️ Please set up your PIN to secure your account when returning to the app.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transaction PIN */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="w-5 h-5 text-primary" />
                Transaction PIN
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">4-Digit Transaction PIN</p>
                    <p className="text-xs text-muted-foreground">
                      {hasTransactionPin ? 'Transaction PIN is set up' : 'Required for all transactions'}
                    </p>
                  </div>
                </div>
                {hasTransactionPin ? (
                  <Button variant="outline" size="sm" onClick={handleResetTransactionPin}>
                    Change
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setTransactionPinOpen(true)}>
                    Set Up
                  </Button>
                )}
              </div>
              {!hasTransactionPin && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                  ⚠️ Please set up your transaction PIN to authorize transactions.
                </p>
              )}

              {/* Biometric for Transactions Toggle */}
              {isAvailable && isEnabled && hasTransactionPin && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Pay with {biometryName}</p>
                      <p className="text-xs text-muted-foreground">Use as alternative to PIN</p>
                    </div>
                  </div>
                  <Switch 
                    checked={biometricForTransactions}
                    onCheckedChange={(checked) => {
                      setBiometricForTransactions(checked);
                      setBiometricForTransactionsState(checked);
                      toast.success(checked 
                        ? `${biometryName} enabled for transactions` 
                        : `${biometryName} disabled for transactions`
                      );
                    }}
                  />
                </div>
              )}

              {/* Forgot PIN Link */}
              {hasTransactionPin && (
                <button
                  onClick={() => setForgotPinOpen(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Forgot Transaction PIN?
                </button>
              )}
            </CardContent>
          </Card>

          {/* Biometric Authentication */}
          {isAvailable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Fingerprint className="w-5 h-5 text-primary" />
                  {biometryName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Enable {biometryName}</p>
                      <p className="text-xs text-muted-foreground">Quick login with biometrics</p>
                    </div>
                  </div>
                  <Switch 
                    checked={isEnabled}
                    disabled={biometricLoading || isChecking}
                    onCheckedChange={async (checked) => {
                      if (!user?.email) {
                        toast.error('Unable to enable biometrics');
                        return;
                      }
                      setBiometricLoading(true);
                      try {
                        if (checked) {
                          const success = await enableBiometricAuth(user.email);
                          if (success) {
                            toast.success(`${biometryName} enabled successfully`);
                          } else {
                            toast.error('Failed to enable biometric login');
                          }
                        } else {
                          disableBiometricAuth();
                          toast.success(`${biometryName} disabled`);
                        }
                      } finally {
                        setBiometricLoading(false);
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEnabled 
                    ? `${biometryName} is enabled. You can use it to quickly log in.` 
                    : `Enable ${biometryName} for faster and more secure login.`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Security Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-5 h-5 text-primary" />
                Security Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAvailable && (
                <div className="flex items-center justify-between opacity-50">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Biometric Login</p>
                      <p className="text-xs text-muted-foreground">Not available on this device</p>
                    </div>
                  </div>
                  <Switch disabled />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Require Transaction PIN</p>
                    <p className="text-xs text-muted-foreground">PIN required for all transactions</p>
                  </div>
                </div>
                <Switch defaultChecked disabled />
              </div>
            </CardContent>
          </Card>

          <PinSetupDialog 
            open={pinSetupOpen} 
            onOpenChange={setPinSetupOpen}
            onComplete={() => {
              pinStatus.refresh();
              toast.success('PIN set up successfully!');
            }}
          />

          <TransactionPinDialog
            open={transactionPinOpen}
            onOpenChange={setTransactionPinOpen}
            onComplete={() => {
              pinStatus.refresh();
              toast.success('Transaction PIN set up successfully!');
            }}
          />

          <ForgotTransactionPinDialog
            open={forgotPinOpen}
            onOpenChange={setForgotPinOpen}
            onComplete={() => {
              pinStatus.refresh();
              toast.success('Transaction PIN reset successfully!');
            }}
            userEmail={user?.email || ''}
          />


          {/* Active Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                <Smartphone className="w-8 h-8 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Current Device</p>
                  <p className="text-xs text-muted-foreground">Active now</p>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MobileLayout>
  );
}
