import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import {
  AmbiguousProviderError,
  classifyPurchaseFailure,
} from '../_shared/purchase-safety.ts';
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

const ISQUARE_BASE_URL = 'https://isquaredata.com/api';

function cleanSecret(value: string | undefined | null): string {
  return (value || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

interface ServiceRequest {
  action: 'get-services' | 'purchase';
  serviceType: 'data' | 'airtime';
  // For purchases
  plan?: number; // plan id for data
  phone_number?: string;
  amount?: number;
  plan_name?: string; // plan name for cashback calculation
  network?: number; // network id for airtime
  mobile_number?: string; // alternative phone number field
}

async function makeISquareRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const username = cleanSecret(Deno.env.get('ISQUARE_USERNAME'));
  const password = cleanSecret(Deno.env.get('ISQUARE_PASSWORD'));
  
  if (!username || !password) {
    throw new Error('Service temporarily unavailable: provider credentials are not configured. Please contact support.');
  }

  const credentials = btoa(`${username}:${password}`);
  
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  console.log(`Making iSquare request to: ${ISQUARE_BASE_URL}${endpoint}`);

  let response: Response;
  try {
    response = await fetch(`${ISQUARE_BASE_URL}${endpoint}`, options);
  } catch (e: any) {
    // Network-level failure: provider may or may not have received the request.
    throw new AmbiguousProviderError(
      `Network error contacting iSquare: ${e?.message || 'unknown'}`,
    );
  }

  const rawText = await response.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new AmbiguousProviderError(
      `Unexpected iSquare response (status ${response.status})`,
      { status: response.status, raw: rawText },
    );
  }
  
  console.log(`iSquare response status: ${response.status}`);
  console.log(`iSquare response data:`, JSON.stringify(data));
  
  if (!response.ok) {
    // 5xx: server-side issue, could have partially processed — do NOT refund.
    if (response.status >= 500) {
      throw new AmbiguousProviderError(
        `iSquare server error (${response.status})`,
        { status: response.status, raw: data },
      );
    }

    // Detect invalid credentials early and surface a clear message
    const lower = JSON.stringify(data).toLowerCase();
    if (
      response.status === 401 ||
      response.status === 403 ||
      lower.includes('invalid username') ||
      lower.includes('invalid credentials') ||
      lower.includes('authentication failed') ||
      lower.includes('unauthorized')
    ) {
      throw new Error('Service temporarily unavailable: provider authentication failed. Please contact support.');
    }

    // Parse specific error messages from iSquare
    let errorMessage = 'iSquare API request failed';
    
    // Check for specific error patterns
    if (data.network && Array.isArray(data.network)) {
      const networkError = data.network[0];
      if (networkError?.toLowerCase().includes('insufficient balance')) {
        // Provider insufficient balance - generic failure message (not user's wallet)
        errorMessage = 'Provider error: Unable to process request';
      } else {
        errorMessage = networkError;
      }
    } else if (data.phone_number && Array.isArray(data.phone_number)) {
      errorMessage = `Invalid phone number: ${data.phone_number[0]}`;
    } else if (data.amount && Array.isArray(data.amount)) {
      errorMessage = `Amount error: ${data.amount[0]}`;
    } else if (data.detail) {
      errorMessage = data.detail;
    } else if (data.message) {
      errorMessage = data.message;
    } else if (typeof data === 'object') {
      // Try to extract any error message from the response
      const firstKey = Object.keys(data)[0];
      if (firstKey && Array.isArray(data[firstKey])) {
        errorMessage = data[firstKey][0];
      }
    }
    
    throw new Error(errorMessage);
  }
  
  return data;
}

async function getDataServices() {
  return await makeISquareRequest('/data/services/');
}

async function getAirtimeServices() {
  return await makeISquareRequest('/airtime/services/');
}

async function purchaseData(planId: number, phoneNumber: string, reference: string) {
  return await makeISquareRequest('/data/buy/', 'POST', {
    plan: planId,
    phone_number: phoneNumber,
    reference,
    disable_validation: false,
  });
}

async function purchaseAirtime(networkId: number, phoneNumber: string, amount: number, reference: string) {
  return await makeISquareRequest('/airtime/buy/', 'POST', {
    network: networkId,
    phone_number: phoneNumber,
    amount: amount,
    reference,
    disable_validation: false,
  });
}

async function recordTransaction(
  supabase: any,
  userId: string,
  amount: number,
  category: string,
  description: string,
  status: 'completed' | 'pending' | 'failed',
  reference?: string | undefined,
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

// Calculate cashback for data (5 naira per 1GB)
function calculateCashback(dataSizeGB: number): number {
  return Math.floor(dataSizeGB) * 5;
}

// Add cashback to user's cashback wallet
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
      
      if (createError) {
        console.error('Error creating cashback wallet:', createError);
        return false;
      }
      cashbackWallet = newWallet;
    }

    const { error: updateError } = await supabase
      .from('cashback_wallets')
      .update({
        balance: cashbackWallet.balance + amount,
        total_earned: cashbackWallet.total_earned + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating cashback wallet:', updateError);
      return false;
    }

    await supabase
      .from('cashback_transactions')
      .insert({
        user_id: userId,
        amount,
        type: 'earned',
        category,
        description: `Cashback from ${transactionDescription}`
      });

    console.log(`Added ${amount} naira cashback for ${category} purchase`);
    return true;
  } catch (error) {
    console.error('Error adding cashback:', error);
    return false;
  }
}

// Process referral bonus when user buys >= 1GB data
async function processReferralBonus(supabase: any, userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, referred_by')
      .eq('user_id', userId)
      .single();

    if (!profile || !profile.referred_by) {
      return;
    }

    const { data: referral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referee_id', profile.id)
      .eq('referrer_id', profile.referred_by)
      .single();

    if (!referral || referral.status === 'completed' || referral.status === 'bonus_paid') {
      return;
    }

    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('id', profile.referred_by)
      .single();

    if (!referrerProfile) {
      return;
    }

    const referrerBonus = referral.referrer_bonus || 200;
    const refereeBonus = referral.referee_bonus || 100;

    // Credit referrer's wallet
    const { data: referrerWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', referrerProfile.user_id)
      .single();

    if (referrerWallet) {
      await supabase
        .from('wallets')
        .update({ 
          balance: referrerWallet.balance + referrerBonus,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', referrerProfile.user_id);

      await supabase.from('transactions').insert({
        user_id: referrerProfile.user_id,
        amount: referrerBonus,
        type: 'credit',
        category: 'referral_bonus',
        description: 'Referral bonus - friend bought data',
        status: 'completed',
      });
    }

    // Credit referee's wallet
    const { data: refereeWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (refereeWallet) {
      await supabase
        .from('wallets')
        .update({ 
          balance: refereeWallet.balance + refereeBonus,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      await supabase.from('transactions').insert({
        user_id: userId,
        amount: refereeBonus,
        type: 'credit',
        category: 'referral_bonus',
        description: 'Welcome bonus for first data purchase',
        status: 'completed',
      });
    }

    await supabase
      .from('referrals')
      .update({ 
        status: 'completed',
        bonus_paid_at: new Date().toISOString()
      })
      .eq('id', referral.id);

    console.log(`Referral bonus paid: Referrer ${referrerBonus}, Referee ${refereeBonus}`);
  } catch (error) {
    console.error('Error processing referral bonus:', error);
  }
}

// Extract data size from plan name
function extractDataSizeGB(planName: string): number {
  const gbMatch = planName.match(/(\d+\.?\d*)\s*GB/i);
  if (gbMatch) {
    return parseFloat(gbMatch[1]);
  }
  
  const mbMatch = planName.match(/(\d+\.?\d*)\s*MB/i);
  if (mbMatch) {
    return parseFloat(mbMatch[1]) / 1024;
  }
  
  return 0;
}

// Transform iSquare airtime services to match RGC format
function transformISquareAirtimeServices(data: any[]) {
  const transformed: any[] = [];
  
  console.log('Processing iSquare airtime services, total services:', data.length);
  
  for (const service of data) {
    if (!service.is_active) continue;
    
    // Map iSquare network names to our format
    let category = service.name?.toUpperCase() || '';
    if (category.includes('MTN')) category = 'MTN';
    else if (category.includes('AIRTEL')) category = 'AIRTEL';
    else if (category.includes('GLO')) category = 'GLO';
    else if (category.includes('9MOBILE') || category.includes('ETISALAT')) category = '9MOBILE';
    
    transformed.push({
      id: service.id,
      product_id: service.id,
      service: 'Airtime',
      name: service.name,
      category: category,
      available: service.is_active,
      provider: 'isquare',
    });
    
    console.log(`Including airtime service ID: ${service.id}, Name: ${service.name}, Category: ${category}`);
  }
  
  console.log('Transformed iSquare airtime services count:', transformed.length);
  
  return transformed;
}

// Detect network from service name
function detectNetworkFromServiceName(serviceName: string): string {
  const upper = serviceName.toUpperCase();
  if (upper.includes('MTN')) return 'MTN';
  if (upper.includes('AIRTEL')) return 'AIRTEL';
  if (upper.includes('GLO')) return 'GLO';
  if (upper.includes('9MOBILE') || upper.includes('ETISALAT')) return '9MOBILE';
  return 'OTHER';
}

// Transform iSquare data format to match RGC format for compatibility
// Now includes ALL services and plans from iSquare API
function transformISquareDataServices(data: any[]) {
  const transformed: any[] = [];
  
  console.log('Processing ALL iSquare services, total services:', data.length);
  console.log('Available service IDs:', data.map(s => `${s.id}: ${s.name} (${s.plans?.length || 0} plans)`).join(', '));
  
  for (const service of data) {
    // Skip inactive services
    if (service.is_active === false) {
      console.log(`Skipping inactive service: ${service.id} - ${service.name}`);
      continue;
    }
    
    const network = detectNetworkFromServiceName(service.name);
    // Use service name as category (e.g., "MTN SME", "AIRTEL CG", etc.)
    const category = service.name?.toUpperCase() || `ISQUARE-${service.id}`;
    
    console.log(`Including service ID: ${service.id}, Name: ${service.name}, Category: ${category}, Network: ${network}`);
    
    for (const plan of service.plans || []) {
      if (!plan.is_active) continue;
      
      transformed.push({
        id: plan.id,
        product_id: plan.id,
        service: 'Data',
        amount: plan.reseller_amount || plan.amount || '0',
        name: plan.name,
        category: category,
        available: plan.is_active,
        provider: 'isquare',
        network: network,
      });
    }
  }
  
  console.log('Total transformed iSquare plans count:', transformed.length);
  
  return transformed;
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

    console.log(`Processing ${action} for ${serviceType}`, JSON.stringify(body));

    // Handle get-services
    if (action === 'get-services') {
      if (serviceType === 'data') {
        const result = await getDataServices();
        const transformed = transformISquareDataServices(result);
        return new Response(JSON.stringify({ success: true, data: transformed }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (serviceType === 'airtime') {
        try {
          const result = await getAirtimeServices();
          const transformed = transformISquareAirtimeServices(result);
          if (transformed.length > 0) {
            return new Response(JSON.stringify({ success: true, data: transformed }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          throw new Error('No airtime services returned');
        } catch (err) {
          console.error('iSquare airtime services failed, using fallback list:', err);
          const fallback = [
            { id: 1, product_id: 1, service: 'Airtime', name: 'MTN', category: 'MTN', available: true, provider: 'isquare' },
            { id: 2, product_id: 2, service: 'Airtime', name: 'AIRTEL', category: 'AIRTEL', available: true, provider: 'isquare' },
            { id: 3, product_id: 3, service: 'Airtime', name: 'GLO', category: 'GLO', available: true, provider: 'isquare' },
            { id: 4, product_id: 4, service: 'Airtime', name: '9MOBILE', category: '9MOBILE', available: true, provider: 'isquare' },
          ];
          return new Response(JSON.stringify({ success: true, data: fallback }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      throw new Error('Unsupported service type for iSquare');
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

      let amount = 0;
      let description = '';
      let purchaseTransactionId: string | null = null;

      try {
        if (serviceType === 'data') {
          if (!body.plan || !body.phone_number || !body.amount) {
            throw new Error('Missing required fields for data purchase');
          }
          
          amount = body.amount;
          description = `Data purchase - ${body.phone_number}`;
          const reference = `ISQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Atomic: debit wallet + create pending transaction in one step
          const requestId = resolveRequestId((body as any).request_id);
          let purchase;
          try {
            purchase = await beginPurchase(supabase, {
              userId,
              requestId,
              amount,
              category: 'data',
              description,
              metadata: {
                request_id: requestId,
                mobile_number: body.phone_number,
                plan: body.plan,
                plan_name: body.plan_name,
                provider: 'isquare',
              },
            });
          } catch (e: any) {
            const insufficient = String(e?.message || '').includes('Insufficient balance');
            return new Response(JSON.stringify({
              success: false,
              message: insufficient ? 'Insufficient balance' : (e?.message || 'Unable to start purchase'),
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
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

          const result = await purchaseData(body.plan, body.phone_number, reference);
          
          const planName = body.plan_name || '';
          const dataSizeGB = extractDataSizeGB(planName);
          
          // Determine actual status from iSquare response
          // iSquare may return "pending" even when successful - check for balance deduction or other success indicators
          const isSuccessful = result.new_balance !== undefined || 
                               result.status === 'success' || 
                               result.status === 'successful' ||
                               result.status === 'delivered' ||
                               (result.id && result.reference); // Has transaction ID and reference = processed
          
          const transactionStatus = isSuccessful ? 'completed' : 'pending';
          console.log(`iSquare data transaction status determined: ${transactionStatus} (API status: ${result.status})`);
          
          const dataMetadata = {
            mobile_number: body.phone_number,
            plan: body.plan,
            plan_name: planName,
            provider: 'isquare',
            api_response: result,
          };
          if (transactionStatus === 'completed') {
            await completePurchase(supabase, purchaseTransactionId, result.reference || reference, dataMetadata);
          } else {
            await markPurchasePending(supabase, purchaseTransactionId, dataMetadata);
          }

          // Calculate and add cashback
          const dataCashback = calculateCashback(dataSizeGB);
          if (transactionStatus === 'completed' && dataSizeGB >= 1) {
            await processReferralBonus(supabase, userId);
          }
          if (transactionStatus === 'completed' && dataCashback > 0) {
            await addCashback(supabase, userId, dataCashback, 'data', description);
          }

          return new Response(JSON.stringify({ 
            success: true,
            unconfirmed: transactionStatus !== 'completed',
            data: result,
            reference: result.reference || reference 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (serviceType === 'airtime') {
          const phoneNumber = body.phone_number || body.mobile_number;
          if (!body.network || !phoneNumber || !body.amount) {
            throw new Error('Missing required fields for airtime purchase');
          }
          
          amount = body.amount;
          description = `Airtime purchase - ${phoneNumber}`;
          const reference = `ISQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          const airtimeRequestId = resolveRequestId((body as any).request_id);
          let airtimePurchase;
          try {
            airtimePurchase = await beginPurchase(supabase, {
              userId,
              requestId: airtimeRequestId,
              amount,
              category: 'airtime',
              description,
              metadata: {
                request_id: airtimeRequestId,
                mobile_number: phoneNumber,
                network: body.network,
                provider: 'isquare',
              },
            });
          } catch (e: any) {
            const insufficient = String(e?.message || '').includes('Insufficient balance');
            return new Response(JSON.stringify({
              success: false,
              message: insufficient ? 'Insufficient balance' : (e?.message || 'Unable to start purchase'),
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
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

          const result = await purchaseAirtime(body.network, phoneNumber, amount, reference);
          
          // Determine actual status from iSquare response
          // iSquare may return "pending" even when successful - check for balance deduction or other success indicators
          const isSuccessful = result.new_balance !== undefined || 
                               result.status === 'success' || 
                               result.status === 'successful' ||
                               result.status === 'delivered' ||
                               (result.id && result.reference); // Has transaction ID and reference = processed
          
          const transactionStatus = isSuccessful ? 'completed' : 'pending';
          console.log(`iSquare airtime transaction status determined: ${transactionStatus} (API status: ${result.status})`);
          
          const airtimeMetadata = {
            mobile_number: phoneNumber,
            network: body.network,
            provider: 'isquare',
            api_response: result,
          };
          if (transactionStatus === 'completed') {
            await completePurchase(supabase, purchaseTransactionId, result.reference || reference, airtimeMetadata);
          } else {
            await markPurchasePending(supabase, purchaseTransactionId, airtimeMetadata);
          }

          return new Response(JSON.stringify({ 
            success: true,
            unconfirmed: transactionStatus !== 'completed',
            data: result,
            reference: result.reference || reference 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          throw new Error('Unsupported service type for iSquare purchase');
        }

      } catch (purchaseError: any) {
        console.error('Purchase failed:', purchaseError);

        const decision = classifyPurchaseFailure(purchaseError);
        if (String(purchaseError?.message || '').startsWith('PURCHASE_RECORD_UNCONFIRMED:')) {
          decision.refund = false;
          decision.status = 'pending';
          decision.userMessage = 'The provider accepted your request and confirmation is pending. Please check transaction history shortly.';
        }

        const failureMetadata = {
          error: purchaseError.message,
          provider: 'isquare',
          unconfirmed: !decision.refund,
        };

        if (purchaseTransactionId) {
          // Atomic: refund only when the failure is confirmed, otherwise keep pending.
          if (decision.refund) {
            await refundPurchase(supabase, purchaseTransactionId, purchaseError.message, failureMetadata);
          } else {
            await markPurchasePending(supabase, purchaseTransactionId, failureMetadata);
            console.warn(
              `iSquare ambiguous failure — wallet NOT refunded (user ${userId}, amount ${amount}): ${purchaseError.message}`,
            );
          }
        } else if (amount > 0) {
          // Failure before any debit happened — just log a failed attempt.
          await recordTransaction(supabase, userId, amount, serviceType, description, 'failed', undefined, failureMetadata);
        }

        return new Response(JSON.stringify({
          success: false,
          message: decision.userMessage,
          unconfirmed: !decision.refund,
        }), {
          status: decision.refund ? 400 : 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in isquare-services function:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
