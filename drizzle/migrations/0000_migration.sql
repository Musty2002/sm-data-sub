CREATE TABLE public.virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('paga','palmpay')),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE INDEX virtual_accounts_account_number_idx ON public.virtual_accounts(account_number);
GRANT SELECT ON public.virtual_accounts TO authenticated;
GRANT ALL ON public.virtual_accounts TO service_role;
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own virtual accounts" ON public.virtual_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all virtual accounts" ON public.virtual_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_virtual_accounts_updated_at BEFORE UPDATE ON public.virtual_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.virtual_accounts (user_id, provider, bank_name, account_number, account_name)
SELECT user_id,
  CASE WHEN lower(coalesce(virtual_account_bank,'')) LIKE '%palmpay%' THEN 'palmpay' ELSE 'paga' END,
  CASE WHEN lower(coalesce(virtual_account_bank,'')) LIKE '%palmpay%' THEN 'PalmPay' ELSE 'Paga' END,
  account_number, virtual_account_name
FROM public.profiles
WHERE virtual_account_name IS NOT NULL AND length(account_number) = 10
ON CONFLICT DO NOTHING;