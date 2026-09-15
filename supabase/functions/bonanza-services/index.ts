import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { AmbiguousProviderError, classifyPurchaseFailure } from '../_shared/purchase-safety.ts';
import { beginPurchase, completePurchase, markPurchasePending, refundPurchase, resolveRequestId } from '../_shared/purchase-lifecycle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BONANZA_BASE_URL = 'https://bonanzasub.com/api';

function cleanSecret(v: string | undefined | null) {
  return (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

// Network ids per Bonanza docs: 1=MTN, 2=AIRTEL, 3=GLO, 4=9MOBILE
function getNetworkId(name: string): number {
  const n = (name || '').toString().trim().toUpperCase();
  const map: Record<string, number> = {
    'MTN': 1, 'AIRTEL': 2, 'GLO': 3, '9MOBILE': 4, 'ETISALAT': 4,
    '1': 1, '2': 2, '3': 3, '4': 4,
  };
  const id = map[n];
  if (!id) throw new Error(`Unsupported network: ${name}`);
  return id;
}

// Deterministic provider reference derived from our request id, so a retry of
// the same purchase reuses the same upstream reference.
function buildRef(prefix: string, requestId: string) {
  return `${prefix}_${requestId.replace(/-/g, '').slice(0, 24).toUpperCase()}`;
}

async function bonanzaRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const token = cleanSecret(Deno.env.get('BONANZASUB_API_TOKEN'));
  if (!token) throw new Error('Bonanza service unavailable: token not configured');

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && method === 'POST') options.body = JSON.stringify(body);

  console.log(`Bonanza ${method} ${path}`, body ? JSON.stringify(body) : '');
  let res: Response;
  try {
    res = await fetch(`${BONANZA_BASE_URL}${path}`, options);
  } catch (e: any) {
    throw new AmbiguousProviderError(`Network error contacting Bonanza: ${e?.message || 'unknown'}`);
  }
  const text = await res.text();
  let data: any;
  let parsed = true;
  try { data = text ? JSON.parse(text) : {}; } catch { parsed = false; data = { message: text }; }
  console.log(`Bonanza status ${res.status}`, JSON.stringify(data));

  if (!parsed) {
    throw new AmbiguousProviderError(`Unexpected Bonanza response (status ${res.status})`, { status: res.status, raw: text });
  }
  if (res.status >= 500) {
    throw new AmbiguousProviderError(`Bonanza server error (${res.status})`, { status: res.status, raw: data });
  }

  const statusText = String(data?.status ?? '').toLowerCase();
  if (!res.ok || statusText === 'failed' || statusText === 'error' || data?.success === false) {
    const msg = data?.message || data?.msg || data?.api_response || data?.detail || `Bonanza request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

function isSuccessful(result: any) {
  const s1 = String(result?.Status ?? '').toLowerCase();
  const s2 = String(result?.status ?? '').toLowerCase();
  return s1 === 'successful' || s1 === 'success' || s2 === 'successful' || s2 === 'success' || result?.success === true;
}

async function recordTransaction(
  supabase: any, userId: string, amount: number, category: string,
  description: string, status: 'completed' | 'pending' | 'failed',
  reference?: string, metadata?: object,
) {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId, amount, type: 'debit', category, description,
    status, reference, metadata,
  });
  if (error) console.error('record tx err', error);
}

// Ask Bonanza for the exact order we sent, by our own reference. This is
// race-safe: it can never match another user's purchase.
async function lookupProviderTransaction(reference: string): Promise<any | null> {
  try {
    const data = await bonanzaRequest(`/transaction/status/?reference=${encodeURIComponent(reference)}`);
    return data?.response ?? null;
  } catch (e) {
    console.warn('Could not look up Bonanza transaction', e);
    return null;
  }
}

function extractDataSizeGB(planName: string): number {
  if (!planName) return 0;
  const gbMatch = planName.match(/(\d+\.?\d*)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]);
  const mbMatch = planName.match(/(\d+\.?\d*)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]) / 1024;
  return 0;
}

async function getCashbackConfig(supabase: any) {
  const fallback = { enabled: true, data_rate: 5, data_unit: '1GB', airtime_rate: 2, airtime_unit: 100 };
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'cashback_config')
      .maybeSingle();
    return { ...fallback, ...((data?.value as Record<string, unknown>) || {}) };
  } catch (_e) {
    return fallback;
  }
}

// Award cashback: data => rate per full GB, airtime => rate per unit spent
async function awardCashback(
  supabase: any,
  userId: string,
  category: 'data' | 'airtime',
  amount: number,
  planName: string | undefined,
  description: string,
) {
  try {
    const config = await getCashbackConfig(supabase);
    if (config.enabled === false) return;

    let cashback = 0;
    if (category === 'data') {
      const gb = extractDataSizeGB(planName || '');
      cashback = Math.floor(gb) * Number(config.data_rate || 0);
    } else {
      const unit = Number(config.airtime_unit || 100) || 100;
      cashback = Math.floor(amount / unit) * Number(config.airtime_rate || 0);
    }
    if (!cashback || cashback <= 0) return;

    let { data: wallet } = await supabase
      .from('cashback_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!wallet) {
      const { data: created, error: createError } = await supabase
        .from('cashback_wallets')
        .insert({ user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0 })
        .select()
        .single();
      if (createError) {
        console.error('Error creating cashback wallet:', createError);
        return;
      }
      wallet = created;
    }

    const { error: updateError } = await supabase
      .from('cashback_wallets')
      .update({
        balance: Number(wallet.balance) + cashback,
        total_earned: Number(wallet.total_earned) + cashback,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating cashback wallet:', updateError);
      return;
    }

    await supabase.from('cashback_transactions').insert({
      user_id: userId,
      amount: cashback,
      type: 'earned',
      category,
      description: `Cashback from ${description}`,
    });

    console.log(`Awarded ${cashback} naira cashback (${category}) to ${userId}`);
  } catch (error) {
    console.error('Error awarding cashback:', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const auth = req.headers.get('authorization');
    let userId: string | null = null;
    if (auth) {
      const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
      if (user) userId = user.id;
    }

    const body = await req.json();
    const { action, serviceType } = body || {};

    // Balance / account info (admin connectivity test)
    if (action === 'get-user') {
      const data = await bonanzaRequest('/user/');
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Diagnostic: probe an arbitrary provider GET path (admin use)
    if (action === 'probe') {
      const data = await bonanzaRequest(String(body?.path || '/user/'));
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Plan catalogue used by the admin data pricing page.
    // Bonanza has no public plan-list endpoint, so we serve the stored
    // Bonanza price list (imported from the provider price sheet).
    if (action === 'get-services') {
      const { data: rows, error } = await supabase
        .from('data_bundles')
        .select('plan_code, plan_name, data_type, network_code, api_price, app_price, validity, is_active')
        .eq('provider', 'bonanza')
        .order('data_type', { ascending: true })
        .order('api_price', { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const bundles = (rows || []).map((b: any) => ({
        id: String(b.plan_code),
        product_id: String(b.plan_code),
        service: 'DATA',
        amount: String(b.api_price),
        name: b.plan_name,
        category: b.data_type,
        available: true,
        validity: b.validity,
      }));

      return new Response(JSON.stringify({ success: true, data: bundles }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Diagnostic: look up a single order by reference
    if (action === 'transaction-status') {
      const data = await bonanzaRequest(`/transaction/status/?reference=${encodeURIComponent(String(body?.reference || ''))}`);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    if (action !== 'purchase') {
      return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ success: false, message: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const av = await validateUserAccount(supabase, userId);
    if (!av.valid) {
      return new Response(JSON.stringify({ success: false, message: av.error }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) {
      return new Response(JSON.stringify({
        success: false,
        message: `Please wait ${rl.retryAfter} seconds before making another purchase`,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let amount = 0;
    let description = '';
    let result: any;
    let purchaseTransactionId: string | null = null;
    let providerRef: string | null = null;

    try {
      if (serviceType === 'data') {
        if (!body.plan || !body.mobile_number || !body.amount) {
          throw new Error('Missing required fields for data purchase');
        }
        amount = Number(body.amount);
        description = `Data purchase - ${body.mobile_number}`;

        const requestId = resolveRequestId(body.request_id);
        providerRef = buildRef('DATA', requestId);
        const purchase = await beginPurchase(supabase, {
          userId,
          requestId,
          amount,
          category: 'data',
          description,
          metadata: {
            request_id: requestId,
            provider_ref: providerRef,
            mobile_number: body.mobile_number,
            plan: body.plan,
            plan_name: body.plan_name,
            provider: 'bonanza',
          },
        });
        purchaseTransactionId = purchase.transactionId;
        if (purchase.duplicate) {
          const unconfirmed = purchase.status === 'pending';
          return new Response(JSON.stringify({
            success: purchase.status === 'completed',
            unconfirmed,
            transaction_id: purchase.transactionId,
            message: unconfirmed ? 'This purchase is already pending confirmation.' : `This purchase was already ${purchase.status}.`,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const networkId = getNetworkId(body.network || body.network_name || '');
        result = await bonanzaRequest('/data/', 'POST', {
          network: String(networkId),
          phone: String(body.mobile_number),
          ref: providerRef,
          data_plan: String(body.plan),
          ported_number: true,
        });

        const status = isSuccessful(result) ? 'completed' : 'pending';
        const resultMetadata = {
          mobile_number: body.mobile_number, plan: body.plan, plan_name: body.plan_name,
          provider: 'bonanza', provider_ref: providerRef, api_response: result,
        };
        if (status === 'completed') {
          await completePurchase(supabase, purchaseTransactionId, providerRef, resultMetadata);
        } else {
          await markPurchasePending(supabase, purchaseTransactionId, resultMetadata);
        }

      } else if (serviceType === 'airtime') {
        if (!body.amount || !body.mobile_number || !body.network) {
          throw new Error('Missing required fields for airtime purchase');
        }
        amount = Number(body.amount);
        description = `Airtime purchase - ${body.mobile_number}`;

        const airtimeRequestId = resolveRequestId(body.request_id);
        providerRef = buildRef('AIRTIME', airtimeRequestId);
        const airtimePurchase = await beginPurchase(supabase, {
          userId,
          requestId: airtimeRequestId,
          amount,
          category: 'airtime',
          description,
          metadata: {
            request_id: airtimeRequestId,
            provider_ref: providerRef,
            mobile_number: body.mobile_number,
            network: body.network,
            provider: 'bonanza',
          },
        });
        purchaseTransactionId = airtimePurchase.transactionId;
        if (airtimePurchase.duplicate) {
          const unconfirmed = airtimePurchase.status === 'pending';
          return new Response(JSON.stringify({
            success: airtimePurchase.status === 'completed',
            unconfirmed,
            transaction_id: airtimePurchase.transactionId,
            message: unconfirmed ? 'This purchase is already pending confirmation.' : `This purchase was already ${airtimePurchase.status}.`,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const networkId = getNetworkId(body.network);
        result = await bonanzaRequest('/airtime/', 'POST', {
          network: String(networkId),
          phone: String(body.mobile_number),
          ref: providerRef,
          airtime_type: 'VTU',
          ported_number: true,
          amount: String(amount),
        });

        const status = isSuccessful(result) ? 'completed' : 'pending';
        const airtimeMetadata = {
          mobile_number: body.mobile_number, network: body.network,
          provider: 'bonanza', provider_ref: providerRef, api_response: result,
        };
        if (status === 'completed') {
          await completePurchase(supabase, purchaseTransactionId, providerRef, airtimeMetadata);
        } else {
          await markPurchasePending(supabase, purchaseTransactionId, airtimeMetadata);
        }

      } else {
        throw new Error('Unsupported service type');
      }

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('Bonanza purchase error', err);

      // Wallet was never debited (e.g. insufficient balance) — surface the
      // failure without recording a debit or touching the wallet.
      if (!purchaseTransactionId && String(err?.message || '').includes('Insufficient balance')) {
        return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const decision = classifyPurchaseFailure(err);
      if (String(err?.message || '').startsWith('PURCHASE_RECORD_UNCONFIRMED:')) {
        decision.refund = false;
        decision.status = 'pending';
        decision.userMessage = 'The provider accepted your request and confirmation is pending. Please check transaction history shortly.';
      }

      // Even for "definitive" rejections, Bonanza sometimes still processes the
      // order. Look up THIS order upstream by our own reference.
      let providerOrder: any = null;
      if (purchaseTransactionId && providerRef) {
        providerOrder = await lookupProviderTransaction(providerRef);
      }
      const orderStatus = String(providerOrder?.status ?? providerOrder?.Status ?? '').toLowerCase();
      const providerDelivered = orderStatus === 'successful' || orderStatus === 'success' ||
                                orderStatus === 'processing' || orderStatus === 'pending';

      if (providerDelivered) {
        decision.refund = false;
        decision.status = 'pending';
        decision.userMessage =
          "Your order was accepted by the provider but we couldn't confirm delivery yet. It's saved and will be reconciled — contact support if it doesn't arrive.";
      } else if (providerOrder && (orderStatus === 'failed' || orderStatus === 'refunded')) {
        decision.refund = true;
        decision.status = 'failed';
      }

      if (amount > 0) {
        const failureMetadata = {
          error: err.message, provider: 'bonanza', unconfirmed: !decision.refund,
          mobile_number: body.mobile_number,
          provider_ref: providerRef,
          provider_order: providerOrder ?? null,
          provider_order_status: orderStatus || null,
        };
        if (purchaseTransactionId) {
          if (decision.refund) {
            await refundPurchase(supabase, purchaseTransactionId, err.message, failureMetadata);
          } else {
            await markPurchasePending(supabase, purchaseTransactionId, failureMetadata);
          }
        } else {
          await recordTransaction(supabase, userId, amount, serviceType, description, decision.status,
            providerRef ?? undefined, failureMetadata);
        }
        if (!decision.refund) console.warn(`Bonanza unconfirmed failure — wallet NOT refunded (user ${userId}, amount ${amount}, ref ${providerRef}/${orderStatus || 'n/a'}): ${err.message}`);
      }
      return new Response(JSON.stringify({
        success: false, message: decision.userMessage, unconfirmed: !decision.refund,
      }), {
        status: decision.refund ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) {
    console.error('bonanza-services error', e);
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
