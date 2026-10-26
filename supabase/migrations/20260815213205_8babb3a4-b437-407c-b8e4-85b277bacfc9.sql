ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_request_id_unique
ON public.transactions (request_id)
WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.begin_purchase(
  p_user_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_category public.transaction_category,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_balance numeric;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing purchase identity';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid purchase amount';
  END IF;

  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE request_id = p_request_id;

  IF FOUND THEN
    IF v_transaction.user_id <> p_user_id
       OR v_transaction.amount <> p_amount
       OR v_transaction.category <> p_category THEN
      RAISE EXCEPTION 'Request identifier conflict';
    END IF;
    RETURN jsonb_build_object(
      'transaction_id', v_transaction.id,
      'status', v_transaction.status,
      'duplicate', true,
      'metadata', v_transaction.metadata
    );
  END IF;

  UPDATE public.wallets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.transactions (
    user_id, type, category, amount, description, status,
    request_id, metadata
  ) VALUES (
    p_user_id, 'debit', p_category, p_amount, p_description, 'pending',
    p_request_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'purchase_state', 'dispatched_pending',
      'wallet_debited', true
    )
  )
  RETURNING * INTO v_transaction;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction.id,
    'status', v_transaction.status,
    'duplicate', false,
    'balance', v_balance
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_transaction
    FROM public.transactions
    WHERE request_id = p_request_id;
    IF FOUND AND v_transaction.user_id = p_user_id
       AND v_transaction.amount = p_amount
       AND v_transaction.category = p_category THEN
      RETURN jsonb_build_object(
        'transaction_id', v_transaction.id,
        'status', v_transaction.status,
        'duplicate', true,
        'metadata', v_transaction.metadata
      );
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_purchase(
  p_transaction_id uuid,
  p_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.transactions
  SET status = 'completed',
      reference = COALESCE(p_reference, reference),
      metadata = COALESCE(metadata, '{}'::jsonb)
        || COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'purchase_state', 'completed',
          'completed_at', now(),
          'wallet_debited', true,
          'refunded', false
        )
  WHERE id = p_transaction_id
    AND type = 'debit'
    AND status = 'pending'
    AND COALESCE((metadata->>'refunded')::boolean, false) = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_purchase(
  p_transaction_id uuid,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_transaction.type <> 'debit' THEN
    RAISE EXCEPTION 'Only debit purchases can be refunded';
  END IF;
  IF COALESCE((v_transaction.metadata->>'refunded')::boolean, false) THEN
    RETURN false;
  END IF;
  IF v_transaction.status = 'completed' THEN
    RAISE EXCEPTION 'Completed transaction requires manual review';
  END IF;

  UPDATE public.wallets
  SET balance = balance + v_transaction.amount,
      updated_at = now()
  WHERE user_id = v_transaction.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  UPDATE public.transactions
  SET status = 'failed',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'purchase_state', 'refunded',
          'refunded', true,
          'refunded_at', now(),
          'refund_reason', COALESCE(p_reason, 'Confirmed provider failure')
        )
  WHERE id = p_transaction_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_purchase_pending(
  p_transaction_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.transactions
  SET status = 'pending',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'purchase_state', 'unconfirmed',
          'unconfirmed', true,
          'wallet_debited', true,
          'refunded', false
        )
  WHERE id = p_transaction_id
    AND type = 'debit'
    AND COALESCE((metadata->>'refunded')::boolean, false) = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_purchase(uuid, uuid, numeric, public.transaction_category, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_purchase(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_purchase(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_purchase_pending(uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_purchase(uuid, uuid, numeric, public.transaction_category, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_purchase(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_purchase(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_purchase_pending(uuid, jsonb) TO service_role;