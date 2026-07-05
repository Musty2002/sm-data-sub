import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { useLoginTracking } from '@/hooks/useLoginTracking';
import logo from '@/assets/sm-data-sub-logo.jpeg';

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  referralCode: z.string().optional(),
});

const signInSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required'),
  password: z.string().min(1, 'Password is required'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    referralCode: '',
    identifier: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { trackLogin } = useLoginTracking();

  const getLastLoggedInUser = () => localStorage.getItem('last_logged_in_user');
  const setLastLoggedInUser = (email: string) => localStorage.setItem('last_logged_in_user', email);

  // Check for returning user on mount
  useEffect(() => {
    const lastUser = getLastLoggedInUser();
    if (lastUser && isLogin) {
      setIsReturningUser(true);
      setFormData(prev => ({ ...prev, identifier: lastUser }));
    }
  }, [isLogin]);

  // Auto-apply referral code from URL (?ref=CODE) or stored value, switching to signup
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRef = params.get('ref') || params.get('referral');
      const stored = localStorage.getItem('pending_referral_code');
      const refCode = (urlRef || stored || '').trim().toUpperCase();
      if (refCode) {
        localStorage.setItem('pending_referral_code', refCode);
        setFormData(prev => ({ ...prev, referralCode: refCode }));
        // If user arrived via referral link and has no prior session here, switch to signup
        if (urlRef && !getLastLoggedInUser()) {
          setIsLogin(false);
          setIsReturningUser(false);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Clear stored referral code after successful signup
  const clearPendingReferral = () => {
    try { localStorage.removeItem('pending_referral_code'); } catch { /* ignore */ }
  };

  const handleSwitchUser = () => {
    setIsReturningUser(false);
    setFormData(prev => ({ ...prev, identifier: '', password: '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      if (isLogin) {
        const result = signInSchema.safeParse(formData);
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        // Check if identifier is email or phone
        const isEmail = formData.identifier.includes('@');
        let loginEmail = formData.identifier;
        
        if (!isEmail) {
          // Look up email by phone number
          const { data: profileData } = await supabase
            .from('profiles')
            .select('email')
            .eq('phone', formData.identifier)
            .maybeSingle();
          
          if (profileData?.email) {
            loginEmail = profileData.email;
          } else {
            toast({
              variant: 'destructive',
              title: 'Login Failed',
              description: 'No account found with this phone number.',
            });
            setLoading(false);
            return;
          }
        }
        
        const { error, data } = await signIn(loginEmail, formData.password);
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: error.message === 'Invalid login credentials' 
              ? 'Invalid email/phone or password. Please try again.'
              : error.message,
          });
        } else {
          // Track login session
          if (data?.user?.id) {
            await trackLogin(data.user.id);
          }
          // Save the user for next time
          setLastLoggedInUser(formData.identifier);
          navigate('/dashboard');
        }
      } else {
        const result = signUpSchema.safeParse(formData);
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        const { error, data } = await signUp(
          formData.email,
          formData.password,
          formData.fullName,
          formData.phone,
          formData.referralCode || undefined
        );

        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Account Exists',
              description: 'This email is already registered. Please log in instead.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign Up Failed',
              description: error.message,
            });
          }
        } else {
          // Track login session for new signup
          if (data?.user?.id) {
            await trackLogin(data.user.id);
          }
          // Save the user for next time
          setLastLoggedInUser(formData.email);
          clearPendingReferral();
          toast({
            title: 'Welcome!',
            description: 'Your account has been created successfully.',
          });
          navigate('/dashboard');
        }
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Extract display name from email for welcome back message
  const getDisplayName = () => {
    const email = formData.identifier;
    if (!email) return '';
    if (email.includes('@')) {
      return email.split('@')[0];
    }
    return email;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      {/* Logo */}
      <div className="mb-8 text-center">
        <img src={logo} alt="SM Data Sub" className="w-24 h-24 mx-auto rounded-full shadow-lg mb-4 border-4 border-secondary" />
        <h1 className="text-2xl font-bold text-secondary">SM Data Sub</h1>
        <p className="text-muted-foreground text-sm mt-1">Your trusted data partner</p>
      </div>

      {/* Form Card */}
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-lg p-6 border border-border">
        {/* Welcome Back View for Returning Users */}
        {isReturningUser && isLogin ? (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <User className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Welcome back!</h2>
              <p className="text-muted-foreground text-sm mt-1">{formData.identifier}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <ForgotPasswordDialog />
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Please wait...' : 'Login'}
              </Button>

            </form>

            <button
              onClick={handleSwitchUser}
              className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Not {getDisplayName()}? Switch account
            </button>
          </>
        ) : (
          <>
            {/* Regular Login/Signup View */}
            <div className="flex mb-6 bg-muted rounded-lg p-1">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2.5 text-center font-medium rounded-md transition-all ${
                  isLogin ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2.5 text-center font-medium rounded-md transition-all ${
                  !isLogin ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div>
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      placeholder="Enter your full name"
                      value={formData.fullName}
                      onChange={handleChange}
                      className={errors.fullName ? 'border-destructive' : ''}
                    />
                    {errors.fullName && (
                      <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={formData.phone}
                      onChange={handleChange}
                      className={errors.phone ? 'border-destructive' : ''}
                    />
                    {errors.phone && (
                      <p className="text-xs text-destructive mt-1">{errors.phone}</p>
                    )}
                  </div>
                </>
              )}

              {isLogin ? (
                <div>
                  <Label htmlFor="identifier">Email or Phone Number</Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    type="text"
                    placeholder="Email or phone number"
                    value={formData.identifier}
                    onChange={handleChange}
                    className={errors.identifier ? 'border-destructive' : ''}
                  />
                  {errors.identifier && (
                    <p className="text-xs text-destructive mt-1">{errors.identifier}</p>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive mt-1">{errors.email}</p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {isLogin && <ForgotPasswordDialog />}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              {!isLogin && (
                <div>
                  <Label htmlFor="referralCode">Referral Code (Optional)</Label>
                  <Input
                    id="referralCode"
                    name="referralCode"
                    placeholder="Enter referral code"
                    value={formData.referralCode}
                    onChange={handleChange}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
              </Button>

            </form>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our{' '}
          <a href="/terms-of-service" className="text-primary underline">Terms of Service</a>{' '}
          and{' '}
          <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
