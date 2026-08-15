export interface PurchaseStart {
  transactionId: string;
  duplicate: boolean;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
}

export async function beginPurchase(
  supabase: any,
  input: {
    userId: string;
    requestId: string;
    amount: number;
    category: string;
    description: string;
    metadata: Record<string, unknown>;
  },
): Promise<PurchaseStart> {
  const { data, error } = await supabase.rpc('begin_purchase', {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_amount: input.amount,
    p_category: input.category,
    p_description: input.description,
    p_metadata: input.metadata,
  });

  if (error) throw new Error(error.message || 'Unable to start purchase');
  const transactionId = data?.transaction_id;
  if (!transactionId) throw new Error('Purchase transaction was not created');

  return {
    transactionId,
    duplicate: data?.duplicate === true,
    status: data?.status ?? 'pending',
    metadata: data?.metadata ?? undefined,
  };
}

export async function completePurchase(
  supabase: any,
  transactionId: string,
  reference: string | undefined,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc('complete_purchase', {
    p_transaction_id: transactionId,
    p_reference: reference ?? null,
    p_metadata: metadata,
  });
  if (error || data !== true) throw new Error(error?.message || 'Unable to complete purchase record');
}

export async function markPurchasePending(
  supabase: any,
  transactionId: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.rpc('mark_purchase_pending', {
    p_transaction_id: transactionId,
    p_metadata: metadata,
  });
  if (error) throw new Error(error.message || 'Unable to update pending purchase');
}

export async function refundPurchase(
  supabase: any,
  transactionId: string,
  reason: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.rpc('refund_purchase', {
    p_transaction_id: transactionId,
    p_reason: reason,
    p_metadata: metadata,
  });
  if (error) throw new Error(error.message || 'Unable to refund purchase');
}

export function resolveRequestId(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID();
}