import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { classifyPurchaseFailure } from '../_shared/purchase-safety.ts';
import {
  beginPurchase,
  completePurchase,
  markPurchasePending,
  refundPurchase,
  resolveRequestId,
} from '../_shared/purchase-lifecycle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELRUFAI_BASE_URL = 'https://elrufaidatalink.com';

interface ServiceRequest {
  action: 'get-services' | 'purchase' | 'query';
  serviceType: 'airtime' | 'data' | 'cable' | 'electricity';
  // For data purchases
  network?: number;
  mobile_number?: string;
  plan?: number;
  plan_name?: string;
  amount?: number;
  ported_number?: boolean;
  // For airtime
  airtime_type?: string;
  // For query
  transaction_id?: number;
}

async function makeElrufaiRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const apiToken = Deno.env.get('ELRUFAI_API_TOKEN');
  
  if (!apiToken) {
    throw new Error('ELRUFAI_API_TOKEN not configured');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  console.log(`Making Elrufai request to: ${ELRUFAI_BASE_URL}${endpoint}`);
  
  const response = await fetch(`${ELRUFAI_BASE_URL}${endpoint}`, options);
  const text = await response.text();
  
  console.log(`Elrufai response status: ${response.status}`);
  console.log(`Elrufai response text:`, text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // If not JSON, return as message
    data = { message: text, success: response.ok };
  }
  
  return { data, status: response.status, ok: response.ok };
}

// Get network ID for Elrufai API
function getNetworkId(networkCode: string): number {
  const networkMap: Record<string, number> = {
    'MTN': 1,
    'GLO': 2,
    'AIRTEL': 3,
    '9MOBILE': 4,
    'ETISALAT': 4,
  };
  return networkMap[networkCode.toUpperCase()] || 1;
}

// Get user's balance/details
async function getUserDetails() {
  return await makeElrufaiRequest('/api/user/');
}

// Get data services/plans - GET request returns available plans
async function getDataServices() {
  // Elrufai uses GET on /api/data/ to get transactions, but we need to check their pricing page
  // Based on the API docs, we need to query their services
  return await makeElrufaiRequest('/api/user/');
}

// Purchase data
async function purchaseData(network: number, mobileNumber: string, plan: number, portedNumber: boolean = true) {
  return await makeElrufaiRequest('/api/data/', 'POST', {
    network,
    mobile_number: mobileNumber,
    plan,
    Ported_number: portedNumber,
  });
}

// Query data transaction
async function queryDataTransaction(transactionId: number) {
  return await makeElrufaiRequest(`/api/data/${transactionId}`);
}

// Purchase airtime
async function purchaseAirtime(network: number, amount: number, mobileNumber: string, portedNumber: boolean = true, airtimeType: string = 'VTU') {
  return await makeElrufaiRequest('/api/topup/', 'POST', {
    network,
    amount,
    mobile_number: mobileNumber,
    Ported_number: portedNumber,
    airtime_type: airtimeType,
  });
}

// Query airtime transaction
async function queryAirtimeTransaction(transactionId: number) {
  return await makeElrufaiRequest(`/api/topup/${transactionId}`);
}

// Transaction/Wallet management helpers
async function recordTransaction(
  supabase: any,
  userId: string,
  amount: number,
  category: string,
  description: string,
  status: 'completed' | 'pending' | 'failed',
  reference?: string,
  metadata?: object
) {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    amount,
    type: 'debit',
    category,
    description,
    status,
    reference,
    metadata,
  });

  if (error) {
    console.error('Error recording transaction:', error);
  }
}

async function deductFromWallet(supabase: any, userId: string, amount: number): Promise<boolean> {
  // Atomic deduction using database function to prevent race conditions
  const { data, error } = await supabase.rpc('deduct_wallet_balance', {
    _user_id: userId,
    _amount: amount,
  });

  if (error) {
    console.error('Error deducting from wallet:', error);
    return false;
  }

  return data === true;
}

async function refundWallet(supabase: any, userId: string, amount: number): Promise<boolean> {
  const { data: wallet, error: fetchError } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (fetchError || !wallet) return false;

  const { error: updateError } = await supabase
    .from('wallets')
    .update({ balance: wallet.balance + amount, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return !updateError;
}

// Calculate cashback
function calculateCashback(category: string, amount: number, dataSizeGB?: number): number {
  if (category === 'data' && dataSizeGB) {
    return Math.floor(dataSizeGB) * 5;
  } else if (category === 'airtime') {
    return Math.floor(amount / 100) * 2;
  }
  return 0;
}

// Add cashback to user
async function addCashback(
  supabase: any,
  userId: string,
  amount: number,
  category: string,
  transactionDescription: string
): Promise<boolean> {
  if (amount <= 0) return true;

  try {
    let { data: cashbackWallet, error: fetchError } = await supabase
      .from('cashback_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !cashbackWallet) {
      const { data: newWallet, error: createError } = await supabase
        .from('cashback_wallets')
        .insert({ user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0 })
        .select()
        .single();
      
      if (createError) return false;
      cashbackWallet = newWallet;
    }

    await supabase
      .from('cashback_wallets')
      .update({
        balance: cashbackWallet.balance + amount,
        total_earned: cashbackWallet.total_earned + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    await supabase.from('cashback_transactions').insert({
      user_id: userId,
      amount,
      type: 'earned',
      category,
      description: `Cashback from ${transactionDescription}`
    });

    return true;
  } catch (error) {
    console.error('Error adding cashback:', error);
    return false;
  }
}

// Extract data size from plan name
function extractDataSizeGB(planName: string): number {
  const gbMatch = planName.match(/(\d+\.?\d*)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]);
  
  const mbMatch = planName.match(/(\d+\.?\d*)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]) / 1024;
  
  return 0;
}

// Process referral bonus
async function processReferralBonus(supabase: any, userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, referred_by')
      .eq('user_id', userId)
      .single();

    if (!profile || !profile.referred_by) return;

    const { data: referral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referee_id', profile.id)
      .eq('referrer_id', profile.referred_by)
      .single();

    if (!referral || referral.status === 'completed' || referral.status === 'bonus_paid') return;

    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', profile.referred_by)
      .single();

    if (!referrerProfile) return;

    const referrerBonus = referral.referrer_bonus || 200;
    const refereeBonus = referral.referee_bonus || 100;

    // Credit referrer
    const { data: referrerWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', referrerProfile.user_id)
      .single();

    if (referrerWallet) {
      await supabase.from('wallets').update({ 
        balance: referrerWallet.balance + referrerBonus,
        updated_at: new Date().toISOString()
      }).eq('user_id', referrerProfile.user_id);

      await supabase.from('transactions').insert({
        user_id: referrerProfile.user_id,
        amount: referrerBonus,
        type: 'credit',
        category: 'referral_bonus',
        description: 'Referral bonus - friend bought data',
        status: 'completed',
      });
    }

    // Credit referee
    const { data: refereeWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (refereeWallet) {
      await supabase.from('wallets').update({ 
        balance: refereeWallet.balance + refereeBonus,
        updated_at: new Date().toISOString()
      }).eq('user_id', userId);

      await supabase.from('transactions').insert({
        user_id: userId,
        amount: refereeBonus,
        type: 'credit',
        category: 'referral_bonus',
        description: 'Welcome bonus for first data purchase',
        status: 'completed',
      });
    }

    await supabase.from('referrals').update({ 
      status: 'completed',
      bonus_paid_at: new Date().toISOString()
    }).eq('id', referral.id);

  } catch (error) {
    console.error('Error processing referral bonus:', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    const body: ServiceRequest = await req.json();
    const { action, serviceType } = body;

    console.log(`Processing Elrufai ${action} for ${serviceType}`, JSON.stringify(body));

    // Handle get-services - returns user details and available balance
    if (action === 'get-services') {
      const result = await getUserDetails();
      
      // Since Elrufai doesn't have a direct "list plans" endpoint in their public API,
      // we'll need admin to manually add bundles or we return empty for now
      // The admin can configure these in the data_bundles table
      return new Response(JSON.stringify({
        success: result.ok,
        data: [],
        message: 'Elrufai plans must be configured manually in admin panel',
        user_info: result.data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle query - check transaction status
    if (action === 'query') {
      if (!body.transaction_id) {
        return new Response(JSON.stringify({ success: false, message: 'Transaction ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let result;
      if (serviceType === 'data') {
        result = await queryDataTransaction(body.transaction_id);
      } else if (serviceType === 'airtime') {
        result = await queryAirtimeTransaction(body.transaction_id);
      } else {
        return new Response(JSON.stringify({ success: false, message: 'Invalid service type for query' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: result.ok,
        data: result.data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle purchases - auth required
    if (action === 'purchase') {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, message: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate user account before allowing purchase
      const accountValidation = await validateUserAccount(supabase, userId);
      if (!accountValidation.valid) {
        return new Response(JSON.stringify({ success: false, message: accountValidation.error }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Rate limit check - 60 second cooldown between purchases
      console.log(`Checking rate limit for user ${userId}`);
      const rateLimit = await checkRateLimit(supabase, userId);
      if (!rateLimit.allowed) {
        console.log(`Rate limit hit for user ${userId}, retry after ${rateLimit.retryAfter}s`);
        return new Response(JSON.stringify({ 
          success: false, 
          message: `Please wait ${rateLimit.retryAfter} seconds before making another purchase` 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`Rate limit passed for user ${userId}`);

      const amount = body.amount || 0;
      
      if (amount <= 0) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid amount' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (serviceType !== 'data' && serviceType !== 'airtime') {
        return new Response(JSON.stringify({ success: false, message: 'Invalid service type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!body.network || !body.mobile_number || (serviceType === 'data' && !body.plan)) {
        return new Response(JSON.stringify({ success: false, message: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const description = `${serviceType === 'data' ? 'Data' : 'Airtime'} purchase - ${body.mobile_number}`;

      // Atomic: debit wallet + create pending transaction in one step
      const requestId = resolveRequestId((body as any).request_id);
      let purchaseTransactionId: string | null = null;
      try {
        const purchase = await beginPurchase(supabase, {
          userId,
          requestId,
          amount,
          category: serviceType,
          description,
          metadata: {
            request_id: requestId,
            mobile_number: body.mobile_number,
            plan: body.plan,
            plan_name: body.plan_name,
            network: body.network,
            provider: 'elrufai',
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
      } catch (e: any) {
        const insufficient = String(e?.message || '').includes('Insufficient balance');
        return new Response(JSON.stringify({
          success: false,
          message: insufficient ? 'Insufficient balance' : (e?.message || 'Unable to start purchase'),
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        let result;
        if (serviceType === 'data') {
          result = await purchaseData(body.network, body.mobile_number, body.plan, body.ported_number ?? true);
        } else {
          result = await purchaseAirtime(body.network, body.amount, body.mobile_number, body.ported_number ?? true, body.airtime_type || 'VTU');
        }

        // Check if purchase was successful
        const isSuccess = result.ok && (result.data?.status === 'success' || result.data?.Status === 'successful' || result.status === 200);
        const explicitFailure = result.ok === false && result.status >= 400 && result.status < 500;
        const resultMetadata = {
          mobile_number: body.mobile_number,
          plan: body.plan,
          plan_name: body.plan_name,
          network: body.network,
          provider: 'elrufai',
          api_response: result.data,
        };

        if (isSuccess) {
          await completePurchase(supabase, purchaseTransactionId!, result.data?.id?.toString(), resultMetadata);

          // Add cashback for data purchases
          if (serviceType === 'data' && body.plan_name) {
            const dataSizeGB = extractDataSizeGB(body.plan_name);
            const cashback = calculateCashback('data', amount, dataSizeGB);
            if (cashback > 0) {
              await addCashback(supabase, userId, cashback, 'data', description);
            }
            // Process referral bonus for data >= 1GB
            if (dataSizeGB >= 1) {
              await processReferralBonus(supabase, userId);
            }
          }
          // Airtime cashback disabled

          return new Response(JSON.stringify({
            success: true,
            message: 'Purchase successful',
            data: result.data
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });

        } else if (explicitFailure) {
          // Provider explicitly rejected the request → safe to refund atomically.
          await refundPurchase(
            supabase,
            purchaseTransactionId!,
            result.data?.message || result.data?.error || 'Purchase rejected by provider',
            resultMetadata,
          );

          return new Response(JSON.stringify({
            success: false,
            message: result.data?.message || result.data?.error || 'Purchase failed'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Ambiguous provider response — keep pending, never auto-refund.
          await markPurchasePending(supabase, purchaseTransactionId!, resultMetadata);

          return new Response(JSON.stringify({
            success: false,
            unconfirmed: true,
            message: "Your order was sent but we couldn't confirm delivery yet. It's saved and will be reconciled — check your transaction history shortly."
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

      } catch (error: any) {
        console.error('Elrufai purchase error:', error);
        const decision = classifyPurchaseFailure(error);
        if (String(error?.message || '').startsWith('PURCHASE_RECORD_UNCONFIRMED:')) {
          decision.refund = false;
          decision.status = 'pending';
          decision.userMessage = 'The provider accepted your request and confirmation is pending. Please check transaction history shortly.';
        }
        const failureMetadata = { error: error.message, provider: 'elrufai', unconfirmed: !decision.refund };

        if (purchaseTransactionId) {
          if (decision.refund) {
            await refundPurchase(supabase, purchaseTransactionId, error.message, failureMetadata);
          } else {
            await markPurchasePending(supabase, purchaseTransactionId, failureMetadata);
            console.warn(`Elrufai ambiguous failure — wallet NOT refunded (user ${userId}, amount ${amount}): ${error.message}`);
          }
        }

        return new Response(JSON.stringify({
          success: false,
          message: decision.userMessage,
          unconfirmed: !decision.refund,
        }), {
          status: decision.refund ? 400 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Elrufai services error:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
