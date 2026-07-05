CREATE OR REPLACE FUNCTION public.process_aspfiy_deposit(
  p_user_id uuid,
  p_reference text,
  p_amount numeric,
  p_description text,
  p_metadata jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'Missing transaction reference';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid deposit amount';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    type,
    category,
    amount,
    description,
    reference,
    status,
    metadata
  ) VALUES (
    p_user_id,
    'credit',
    'deposit',
    p_amount,
    p_description,
    p_reference,
    'completed',
    COALESCE(p_metadata, '{}'::jsonb)
  );

  UPDATE public.wallets
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_aspfiy_deposit(uuid, text, numeric, text, jsonb) TO service_role;