ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS virtual_account_bank text;

UPDATE public.profiles
SET virtual_account_bank = 'PalmPay'
WHERE virtual_account_bank IS NULL
  AND virtual_account_name IS NOT NULL
  AND account_number IS NOT NULL;