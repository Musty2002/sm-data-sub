export type TransactionType = 'credit' | 'debit';
export type TransactionCategory = 'deposit' | 'airtime' | 'data' | 'electricity' | 'tv' | 'transfer' | 'referral_bonus';
export type TransactionStatus = 'pending' | 'completed' | 'failed';
export type ReferralStatus = 'pending' | 'completed' | 'bonus_paid';
export type AppRole = 'admin' | 'user';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  account_number: string;
  referral_code: string;
  referred_by: string | null;
  avatar_url: string | null;
  virtual_account_name: string | null;
  virtual_account_bank: string | null;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface CashbackWallet {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  status: TransactionStatus;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referee_id: string;
  status: ReferralStatus;
  referrer_bonus: number;
  referee_bonus: number;
  bonus_paid_at: string | null;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}