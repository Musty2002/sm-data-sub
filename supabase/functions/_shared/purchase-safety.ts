// Shared helpers for the "debit first, refund only on confirmed failure" flow.
//
// The rule: once we've deducted the user's wallet and dispatched the request
// to the upstream provider, we MUST NOT refund unless we have a clear signal
// that the provider did not (and will not) deliver. Ambiguous errors — network
// failures, timeouts, 5xx responses, HTML/error pages, unparseable bodies —
// are treated as "unknown": the transaction is stored as `pending` with the
// error captured in metadata, and the user's wallet stays debited. This
// prevents the "app says failed but provider delivered" money leak.

export class AmbiguousProviderError extends Error {
  status?: number;
  raw?: unknown;
  constructor(message: string, opts?: { status?: number; raw?: unknown }) {
    super(message);
    this.name = 'AmbiguousProviderError';
    this.status = opts?.status;
    this.raw = opts?.raw;
  }
}

export function isAmbiguous(err: unknown): boolean {
  return err instanceof AmbiguousProviderError;
}

// Wrap a fetch+parse call. If the network fails, the response is 5xx, or the
// body is not JSON (e.g. HTML "Not Found"), throw AmbiguousProviderError so
// the caller does NOT refund. 4xx with a parseable JSON body is treated as a
// definitive provider rejection and re-thrown as a normal Error (safe to
// refund).
export async function safeProviderFetch(
  url: string,
  init: RequestInit,
  parseError: (status: number, body: any) => string,
): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (e: any) {
    // Network-level failure: we don't know if the provider received the request.
    throw new AmbiguousProviderError(
      `Network error contacting provider: ${e?.message || 'unknown'}`,
    );
  }

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON body (HTML error page, etc.) — status alone can't tell us if
    // the request was actually processed. Treat as ambiguous.
    throw new AmbiguousProviderError(
      `Unexpected provider response (status ${response.status})`,
      { status: response.status, raw: text },
    );
  }

  if (response.ok) return data;

  // 5xx = server-side issue, could have partially processed.
  if (response.status >= 500) {
    throw new AmbiguousProviderError(
      `Provider server error (${response.status})`,
      { status: response.status, raw: data },
    );
  }

  // 4xx with a JSON body — provider rejected the request, safe to refund.
  throw new Error(parseError(response.status, data));
}

// Record a transaction that we consider stuck / unconfirmed. Wallet stays
// debited; admin/user can reconcile from the receipt.
export async function recordUnconfirmedTransaction(
  supabase: any,
  userId: string,
  amount: number,
  category: string,
  description: string,
  reference: string | undefined,
  metadata: Record<string, unknown>,
) {
  await supabase.from('transactions').insert({
    user_id: userId,
    amount,
    type: 'debit',
    category,
    description,
    status: 'pending',
    reference,
    metadata: { ...metadata, unconfirmed: true },
  });
}

// Standard shape for the handler's catch block. Returns whether the wallet
// should be refunded and how to record the transaction.
export function classifyPurchaseFailure(err: unknown): {
  refund: boolean;
  status: 'failed' | 'pending';
  userMessage: string;
} {
  if (isAmbiguous(err)) {
    return {
      refund: false,
      status: 'pending',
      userMessage:
        "We couldn't confirm your purchase with the provider. If the service isn't delivered within a few minutes, please contact support — your transaction is saved and will be reconciled.",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { refund: true, status: 'failed', userMessage: msg };
}