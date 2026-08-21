import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { AmbiguousProviderError, classifyPurchaseFailure } from '../_shared/purchase-safety.ts';
import { beginPurchase, completePurchase, markPurchasePending, refundPurchase, resolveRequestId } from '../_shared/purchase-lifecycle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BONANZA_BASE_URL = 'https://bonanzasubapi.com/api';

function cleanSecret(v: string | undefined | null) {
  return (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

// Network id mapping used by Bonanza (typical Nigerian VTU aggregator convention)
// 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL
function getNetworkId(name: string): number {
  const n = (name || '').toString().trim().toUpperCase();
  const map: Record<string, number> = {
    'MTN': 1, 'GLO': 2, '9MOBILE': 3, 'ETISALAT': 3, 'AIRTEL': 4,
    '1': 1, '2': 2, '3': 3, '4': 4,
  };
  const id = map[n];
  if (!id) throw new Error(`Unsupported network: ${name}`);
  return id;
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

  // Non-JSON body or 5xx: we can't tell if provider processed the request.
  if (!parsed) {
    throw new AmbiguousProviderError(`Unexpected Bonanza response (status ${res.status})`, { status: res.status, raw: text });
  }
  if (res.status >= 500) {
    throw new AmbiguousProviderError(`Bonanza server error (${res.status})`, { status: res.status, raw: data });
  }

  if (!res.ok || data?.Status === 'failed' || data?.status === 'failed' || data?.success === false) {
    const msg = data?.message || data?.api_response || data?.detail || `Bonanza request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
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

async function deductFromWallet(supabase: any, userId: string, amount: number) {
  const { data, error } = await supabase.rpc('deduct_wallet_balance', {
    _user_id: userId, _amount: amount,
  });
  if (error) { console.error(error); return false; }
  return data === true;
}

async function refundWallet(supabase: any, userId: string, amount: number) {
  const { data: w } = await supabase.from('wallets').select('balance').eq('user_id', userId).single();
  if (w) {
    await supabase.from('wallets').update({
      balance: Number(w.balance) + Number(amount), updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }
}

// Read the provider-side wallet balance. Used to decide whether a "failed"
// response actually cost us money upstream (provider delivered / debited us).
async function getProviderBalance(): Promise<number | null> {
  try {
    const data = await bonanzaRequest('/user/');
    const raw = data?.user?.Account_Balance ?? data?.user?.wallet_balance ?? data?.Account_Balance;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.warn('Could not read Bonanza balance', e);
    return null;
  }
}

function digitsOnly(v: unknown) {
  return String(v ?? '').replace(/\D/g, '');
}

// Look up the actual order on the provider side, matched by phone number +
// plan/amount within a short time window. This is race-safe: unlike comparing
// wallet balances, a concurrent purchase by another user can't be mistaken for
// this one.
async function findProviderOrder(
  kind: 'data' | 'airtime',
  mobileNumber: string,
  match: { plan?: number; amount?: number },
  sinceMs: number,
): Promise<any | null> {
  try {
    const data = await bonanzaRequest(kind === 'airtime' ? '/topup/' : '/data/');
    const rows: any[] = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
    const phone = digitsOnly(mobileNumber).slice(-10);
    return rows.find((r) => {
      if (digitsOnly(r?.mobile_number).slice(-10) !== phone) return false;
      const created = Date.parse(r?.create_date ?? '');
      if (Number.isFinite(created) && created < sinceMs - 120_000) return false;
      if (match.plan !== undefined) return Number(r?.plan) === Number(match.plan);
      if (match.amount !== undefined) return Math.abs(Number(r?.amount ?? r?.plan_amount) - match.amount) < 1;
      return true;
    }) ?? null;
  } catch (e) {
    console.warn('Could not list Bonanza orders', e);
    return null;
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

    // Public: fetch balance/user info (used by admin to test connectivity)
    if (action === 'get-user') {
      const data = await bonanzaRequest('/user/');
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Diagnostic: list recent provider-side orders (data or topup)
    if (action === 'list-orders') {
      const path = body?.kind === 'airtime' ? '/topup/' : '/data/';
      const data = await bonanzaRequest(path);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Public: fetch data plans list (endpoint convention on Bonanza-style APIs)
    if (action === 'get-services' && serviceType === 'data') {
      try {
        const data = await bonanzaRequest('/user/');
        // Bonanza's user endpoint typically returns a MOBILE_NETWORK / Dataplans block
        const plans: any[] = [];
        const networks = data?.Dataplans || {};
        const pushPlan = (netKey: string, p: any) => {
          if (!p || (!p.dataplan_id && !p.id)) return;
          plans.push({
            id: Number(p.dataplan_id || p.id),
            product_id: Number(p.dataplan_id || p.id),
            service: p.plan_type || 'DATA',
            amount: String(p.plan_amount || p.amount || ''),
            name: [p.plan, p.month_validate].filter(Boolean).join(' - '),
            plan_size: p.plan,
            validity: p.month_validate,
            category: `${(p.plan_network || netKey || '').toUpperCase().replace('_PLAN','')} ${p.plan_type || ''}`.trim(),
            available: true,
            provider: 'bonanza',
          });
        };
        // Structure: Dataplans.MTN_PLAN.{CORPORATE|SME|GIFTING}[]
        Object.entries(networks).forEach(([netKey, group]: [string, any]) => {
          if (Array.isArray(group)) {
            group.forEach((p: any) => pushPlan(netKey, p));
          } else if (group && typeof group === 'object') {
            Object.values(group).forEach((arr: any) => {
              if (Array.isArray(arr)) arr.forEach((p: any) => pushPlan(netKey, p));
            });
          }
        });
        return new Response(JSON.stringify({ success: true, data: plans, raw: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
    let attemptStartedAt = Date.now();
    let purchaseTransactionId: string | null = null;

    try {
      if (serviceType === 'data') {
        if (!body.plan || !body.mobile_number || !body.amount) {
          throw new Error('Missing required fields for data purchase');
        }
        amount = Number(body.amount);
        description = `Data purchase - ${body.mobile_number}`;

        const requestId = resolveRequestId(body.request_id);
        const purchase = await beginPurchase(supabase, {
          userId,
          requestId,
          amount,
          category: 'data',
          description,
          metadata: {
            request_id: requestId,
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
        attemptStartedAt = Date.now();
        result = await bonanzaRequest('/data/', 'POST', {
          network: networkId,
          mobile_number: body.mobile_number,
          plan: Number(body.plan),
          Ported_number: true,
        });

        const success = result?.Status?.toString().toLowerCase() === 'successful' ||
                        result?.status?.toString().toLowerCase() === 'successful' ||
                        result?.Status === 'success' || result?.success === true;
        const status = success ? 'completed' : 'pending';

        const resultMetadata = { mobile_number: body.mobile_number, plan: body.plan, plan_name: body.plan_name,
          provider: 'bonanza', api_response: result };
        if (status === 'completed') {
          await completePurchase(supabase, purchaseTransactionId, result?.id?.toString() || result?.reference, resultMetadata);
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
        const airtimePurchase = await beginPurchase(supabase, {
          userId,
          requestId: airtimeRequestId,
          amount,
          category: 'airtime',
          description,
          metadata: {
            request_id: airtimeRequestId,
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
        attemptStartedAt = Date.now();
        result = await bonanzaRequest('/topup/', 'POST', {
          network: networkId,
          amount: String(amount),
          mobile_number: body.mobile_number,
          Ported_number: true,
          airtime_type: 'VTU',
        });

        const success = result?.Status?.toString().toLowerCase() === 'successful' ||
                        result?.status?.toString().toLowerCase() === 'successful' ||
                        result?.success === true;
        const status = success ? 'completed' : 'pending';

        const airtimeMetadata = {
          mobile_number: body.mobile_number, network: body.network,
          provider: 'bonanza', api_response: result,
        };
        if (status === 'completed') {
          await completePurchase(supabase, purchaseTransactionId, result?.id?.toString() || result?.reference, airtimeMetadata);
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
      const decision = classifyPurchaseFailure(err);
      if (String(err?.message || '').startsWith('PURCHASE_RECORD_UNCONFIRMED:')) {
        decision.refund = false;
        decision.status = 'pending';
        decision.userMessage = 'The provider accepted your request and confirmation is pending. Please check transaction history shortly.';
      }

      // Even for "definitive" 4xx rejections, Bonanza sometimes still creates
      // and processes the order. Look up THIS order on the provider side,
      // matched by phone number + plan/amount within this attempt's time
      // window — a concurrent purchase by another user cannot match it.
      let providerOrder: any = null;
      if (amount > 0 && (serviceType === 'data' || serviceType === 'airtime')) {
        providerOrder = await findProviderOrder(
          serviceType,
          String(body.mobile_number || ''),
          serviceType === 'data' ? { plan: Number(body.plan) } : { amount },
          attemptStartedAt,
        );
      }
      const orderStatus = String(providerOrder?.Status ?? providerOrder?.status ?? '').toLowerCase();
      const providerDelivered = orderStatus === 'successful' || orderStatus === 'success' ||
                                orderStatus === 'processing' || orderStatus === 'pending';

      if (providerDelivered) {
        // Order exists upstream and was accepted — never refund.
        decision.refund = false;
        decision.status = 'pending';
        decision.userMessage =
          "Your order was accepted by the provider but we couldn't confirm delivery yet. It's saved and will be reconciled — contact support if it doesn't arrive.";
      } else if (providerOrder && orderStatus === 'failed') {
        // Provider explicitly recorded this exact order as failed → refund.
        decision.refund = true;
        decision.status = 'failed';
      }

      if (amount > 0) {
        const failureMetadata = {
            error: err.message, provider: 'bonanza', unconfirmed: !decision.refund,
            mobile_number: body.mobile_number,
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
          // beginPurchase failed before any wallet debit (for example,
          // insufficient balance). Record the attempt for audit only. Never
          // refund here: doing so would credit money that was never deducted.
          await recordTransaction(supabase, userId, amount, serviceType, description, decision.status,
            providerOrder?.id?.toString(), failureMetadata);
        }
        if (!decision.refund) console.warn(`Bonanza unconfirmed failure — wallet NOT refunded (user ${userId}, amount ${amount}, providerOrder=${providerOrder?.id ?? 'none'}/${orderStatus || 'n/a'}): ${err.message}`);
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