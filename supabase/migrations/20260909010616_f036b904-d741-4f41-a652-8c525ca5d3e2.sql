UPDATE public.data_bundles SET is_active = false, updated_at = now() WHERE provider = 'bonanza';

CREATE TABLE IF NOT EXISTS public.user_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  app_pin_hash text,
  transaction_pin_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_pins TO authenticated;
GRANT ALL ON public.user_pins TO service_role;

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pins" ON public.user_pins FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own pins" ON public.user_pins FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pins" ON public.user_pins FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_pins_updated_at BEFORE UPDATE ON public.user_pins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();