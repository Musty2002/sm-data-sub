-- Replace legacy PalmPay bank label with current Aspfiy/Paga provider
UPDATE public.profiles
SET virtual_account_bank = 'Paga'
WHERE virtual_account_bank = 'PalmPay';
