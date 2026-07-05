import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RGC_BASE_URL = 'https://api.rgcdata.com.ng';

interface ServiceRequest {
  action: 'get-services' | 'validate' | 'purchase';
  serviceType: 'airtime' | 'data' | 'cable' | 'electricity' | 'resultcheck';
  // For purchases
  network?: string | number; // airtime network category name
  network_id?: number; // product_id from services list for airtime
  amount?: number;
  mobile_number?: string;
  plan?: number; // product_id for data
  plan_name?: string; // plan name for data cashback calculation
  plan_id?: number; // product_id for cable
  smart_card_number?: string;
  discoid?: number; // product_id for electricity
  MeterType?: 'PREPAID' | 'POSTPAID';
  meter_number?: string;
  // For validation
  cable_name?: string;
  // For exam pins
  examid?: number; // product_id for exam
  quantity?: number; // number of pins
  exam_name?: string; // exam name for description
}

async function makeRGCRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const apiKey = Deno.env.get('RGC_DATA_API_KEY');
  
  if (!apiKey) {
    throw new Error('RGC_DATA_API_KEY not configured');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  console.log(`Making RGC request to: ${RGC_BASE_URL}${endpoint}`);
  
  const response = await fetch(`${RGC_BASE_URL}${endpoint}`, options);
  const responseText = await response.text();
  let data: any;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    data = { message: responseText || 'RGC API returned an invalid response' };
  }
  
  console.log(`RGC response status: ${response.status}`);
  console.log(`RGC response data:`, JSON.stringify(data));
  
  if (!response.ok || data.success === false || data.status === false) {
    throw new Error(data.message || 'RGC API request failed');
  }
  
  return data;
}

async function getServices(serviceType: string) {
  const endpoint = `/api/v2/services/${serviceType}`;
  return await makeRGCRequest(endpoint);
}

async function validateCable(smartCardNumber: string, cableName: string) {
  const endpoint = `/api/v2/validation/cable?smart_card_number=${encodeURIComponent(smartCardNumber)}&cable_name=${encodeURIComponent(cableName)}`;
  return await makeRGCRequest(endpoint);
}

async function validateElectricity(meterNumber: string, discoid: number, meterType: string) {
  const endpoint = `/api/v2/validation/electricity?meter_number=${encodeURIComponent(meterNumber)}&discoid=${discoid}&meter_type=${encodeURIComponent(meterType)}`;
  return await makeRGCRequest(endpoint);
}

// Map network category name to RGC network code when live service product_id is unavailable.
function getNetworkCode(category: string): number {
  const normalized = category.trim().toUpperCase();

  const numericCode = Number(normalized);
  if ([1, 2, 3, 4].includes(numericCode)) {
    return numericCode;
  }

  const map: Record<string, number> = {
    'MTN': 1,
    'GLO': 2,
    '9MOBILE': 3,
    'ETISALAT': 3,
    'AIRTEL': 4,
  };

  const code = map[normalized];
  if (!code) {
    throw new Error(`Unsupported network category: ${category}`);
  }

  return code;
}

async function purchaseAirtime(networkCategory: string, amount: number, mobileNumber: string, networkId?: number) {
  // Use product_id from services list if available, otherwise fall back to hardcoded mapping.
  const networkCode = networkId || getNetworkCode(networkCategory);
  console.log(`Airtime purchase: category=${networkCategory.toUpperCase()}, networkCode=${networkCode}, networkId=${networkId}, amount=${amount}, mobile=${mobileNumber}`);
  
  // Try without Ported_number first, if fails try with it
  try {
    return await makeRGCRequest('/api/v2/purchase/airtime', 'POST', {
      network: networkCode,
      amount,
      mobile_number: mobileNumber,
      Ported_number: true,
      airtime_type: 'VTU',
    });
  } catch (firstError: any) {
    console.log(`First airtime attempt failed: ${firstError.message}, retrying without extra params...`);
    return await makeRGCRequest('/api/v2/purchase/airtime', 'POST', {
      network: networkCode,
      amount,
      mobile_number: mobileNumber,
    });
  }
}

async function purchaseData(plan: number, mobileNumber: string) {
  return await makeRGCRequest('/api/v2/purchase/data', 'POST', {
    plan,
    mobile_number: mobileNumber,
  });
}

async function purchaseCable(planId: number, smartCardNumber: string) {
  return await makeRGCRequest('/api/v2/purchase/cable', 'POST', {
    plan_id: planId,
    smart_card_number: smartCardNumber,
  });
}

async function purchaseElectricity(discoid: number, meterType: string, meterNumber: string, amount: number) {
  return await makeRGCRequest('/api/v2/purchase/electricity', 'POST', {
    discoid,
    MeterType: meterType,
    meter_number: meterNumber,
    amount,
  });
}

async function purchaseExamPin(examid: number, quantity: number) {
  return await makeRGCRequest('/api/v2/purchase/resultcheck', 'POST', {
    examid,
    quantity,
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

  return true;
}

// Calculate cashback based on purchase type
function calculateCashback(category: string, amount: number, dataSizeGB?: number): number {
  if (category === 'data' && dataSizeGB) {
    // 5 naira for every 1GB of data
    return Math.floor(dataSizeGB) * 5;
  } else if (category === 'airtime') {
    // 2 naira for every 100 naira of airtime
    return Math.floor(amount / 100) * 2;
  }
  return 0;
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
    // Get or create cashback wallet
    let { data: cashbackWallet, error: fetchError } = await supabase
      .from('cashback_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !cashbackWallet) {
      // Create cashback wallet if it doesn't exist
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

    // Update cashback wallet balance
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

    // Record cashback transaction
    const { error: txError } = await supabase
      .from('cashback_transactions')
      .insert({
        user_id: userId,
        amount,
        type: 'earned',
        category,
        description: `Cashback from ${transactionDescription}`
      });

    if (txError) {
      console.error('Error recording cashback transaction:', txError);
    }

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
    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, referred_by')
      .eq('user_id', userId)
      .single();

    if (!profile || !profile.referred_by) {
      console.log('User has no referrer');
      return;
    }

    // Check if referral bonus already paid
    const { data: referral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referee_id', profile.id)
      .eq('referrer_id', profile.referred_by)
      .single();

    if (!referral) {
      console.log('No referral record found');
      return;
    }

    if (referral.status === 'completed' || referral.status === 'bonus_paid') {
      console.log('Referral bonus already processed');
      return;
    }

    // Get referrer's profile to get user_id
    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('id', profile.referred_by)
      .single();

    if (!referrerProfile) {
      console.log('Referrer profile not found');
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

      // Record referrer transaction
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

      // Record referee transaction
      await supabase.from('transactions').insert({
        user_id: userId,
        amount: refereeBonus,
        type: 'credit',
        category: 'referral_bonus',
        description: 'Welcome bonus for first data purchase',
        status: 'completed',
      });
    }

    // Update referral status
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

// Extract data size from plan name (e.g., "1GB", "500MB", "2.5GB")
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to identify the user
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

    // BACKWARD COMPAT: RGC no longer offers airtime. Older mobile builds still
    // call this function for airtime. Transparently forward to isquare-services
    // so legacy clients keep working without a Play Store update.
    if (serviceType === 'airtime') {
      console.log('Forwarding airtime request to isquare-services');

      // Map legacy RGC airtime payload -> iSquare format.
      // RGC product_ids: MTN=38, AIRTEL=39, 9MOBILE=40, GLO=41
      // iSquare network ids: MTN=1, AIRTEL=2, GLO=3, 9MOBILE=4
      const rgcToIsquare: Record<string, number> = {
        '38': 1, '39': 2, '40': 4, '41': 3,
        'MTN': 1, 'AIRTEL': 2, 'GLO': 3, '9MOBILE': 4,
      };
      const rawNetwork = (body as any).network ?? (body as any).network_id;
      const key = String(rawNetwork ?? '').toUpperCase();
      const isquareNetwork = rgcToIsquare[key] ?? (typeof rawNetwork === 'number' && rawNetwork >= 1 && rawNetwork <= 4 ? rawNetwork : undefined);

      const forwardBody: any = {
        ...body,
        serviceType: 'airtime',
        network: isquareNetwork,
        phone_number: (body as any).phone_number ?? (body as any).mobile_number,
        mobile_number: (body as any).mobile_number ?? (body as any).phone_number,
      };

      const forwardUrl = `${supabaseUrl}/functions/v1/isquare-services`;
      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      };
      if (authHeader) forwardHeaders['Authorization'] = authHeader;
      const forwardRes = await fetch(forwardUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(forwardBody),
      });
      const forwardText = await forwardRes.text();
      return new Response(forwardText, {
        status: forwardRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle get-services - no auth required
    if (action === 'get-services') {
      const result = await getServices(serviceType);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle validation - no auth required
    if (action === 'validate') {
      let result;
      if (serviceType === 'cable' && body.smart_card_number && body.cable_name) {
        result = await validateCable(body.smart_card_number, body.cable_name);
      } else if (serviceType === 'electricity' && body.meter_number && body.discoid && body.MeterType) {
        result = await validateElectricity(body.meter_number, body.discoid, body.MeterType);
      } else {
        throw new Error('Invalid validation parameters');
      }
      return new Response(JSON.stringify(result), {
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

      let result;
      let amount = 0;
      let description = '';

      try {
        if (serviceType === 'airtime') {
          if (body.network === undefined || body.amount === undefined || body.mobile_number === undefined) {
            throw new Error('Missing required fields for airtime purchase');
          }

          // network is the category name (e.g. "MTN"); network_id is the live RGC product_id from the services list.
          const networkCategory = String(body.network);

          amount = body.amount;
          description = `Airtime purchase - ${body.mobile_number}`;

          // Check and deduct balance first
          const deducted = await deductFromWallet(supabase, userId, amount);
          if (!deducted) {
            return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          result = await purchaseAirtime(networkCategory, body.amount, body.mobile_number, body.network_id);
          
          // Determine status - RGC typically returns success if the API doesn't throw
          const isSuccessful = result.success !== false && !result.error;
          const transactionStatus = isSuccessful ? 'completed' : 'pending';
          console.log(`RGC airtime transaction status: ${transactionStatus}`);
          
          await recordTransaction(
            supabase,
            userId,
            amount,
            'airtime',
            description,
            transactionStatus,
            result.reference || undefined,
            { 
              mobile_number: body.mobile_number, 
              network: networkCategory,
              provider: 'rgc',
              api_response: result
            }
          );

          // Calculate and add cashback for airtime
          const airtimeCashback = calculateCashback('airtime', amount);
          if (airtimeCashback > 0) {
            await addCashback(supabase, userId, airtimeCashback, 'airtime', description);
          }

        } else if (serviceType === 'data') {
          if (!body.plan || !body.mobile_number || !body.amount) {
            throw new Error('Missing required fields for data purchase');
          }
          amount = body.amount;
          description = `Data purchase - ${body.mobile_number}`;

          const deducted = await deductFromWallet(supabase, userId, amount);
          if (!deducted) {
            return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          result = await purchaseData(body.plan, body.mobile_number);
          
          // Get the plan name from metadata to calculate data size
          const planName = body.plan_name || '';
          const dataSizeGB = extractDataSizeGB(planName);
          
          // Determine status - RGC typically returns success if the API doesn't throw
          const isSuccessful = result.success !== false && !result.error;
          const transactionStatus = isSuccessful ? 'completed' : 'pending';
          console.log(`RGC data transaction status: ${transactionStatus}`);
          
          await recordTransaction(
            supabase, 
            userId, 
            amount, 
            'data', 
            description, 
            transactionStatus, 
            result.reference || undefined, 
            { 
              mobile_number: body.mobile_number, 
              plan: body.plan, 
              plan_name: planName,
              provider: 'rgc',
              api_response: result // Store full API response
            }
          );

          // Calculate and add cashback for data
          const dataCashback = calculateCashback('data', amount, dataSizeGB);

          // Check and process referral bonus if user bought >= 1GB and was referred
          if (dataSizeGB >= 1) {
            await processReferralBonus(supabase, userId);
          }
          if (dataCashback > 0) {
            await addCashback(supabase, userId, dataCashback, 'data', description);
          }

        } else if (serviceType === 'cable') {
          if (!body.plan_id || !body.smart_card_number || !body.amount) {
            throw new Error('Missing required fields for cable purchase');
          }
          amount = body.amount;
          description = `TV subscription - ${body.smart_card_number}`;

          const deducted = await deductFromWallet(supabase, userId, amount);
          if (!deducted) {
            return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          result = await purchaseCable(body.plan_id, body.smart_card_number);
          await recordTransaction(supabase, userId, amount, 'tv', description, 'completed', result.reference || undefined, { 
            smart_card_number: body.smart_card_number, 
            plan_id: body.plan_id,
            provider: 'rgc',
            api_response: result 
          });

        } else if (serviceType === 'electricity') {
          if (!body.discoid || !body.MeterType || !body.meter_number || !body.amount) {
            throw new Error('Missing required fields for electricity purchase');
          }
          amount = body.amount;
          description = `Electricity purchase - ${body.meter_number}`;

          const deducted = await deductFromWallet(supabase, userId, amount);
          if (!deducted) {
            return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          result = await purchaseElectricity(body.discoid, body.MeterType, body.meter_number, body.amount);
          await recordTransaction(supabase, userId, amount, 'electricity', description, 'completed', result.reference || undefined, { 
            meter_number: body.meter_number, 
            discoid: body.discoid, 
            meter_type: body.MeterType,
            provider: 'rgc',
            api_response: result 
          });

        } else if (serviceType === 'resultcheck') {
          if (!body.examid || !body.quantity || !body.amount) {
            throw new Error('Missing required fields for exam pin purchase');
          }
          amount = body.amount;
          const examName = body.exam_name || 'Exam';
          description = `${examName} pin purchase x${body.quantity}`;

          const deducted = await deductFromWallet(supabase, userId, amount);
          if (!deducted) {
            return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          result = await purchaseExamPin(body.examid, body.quantity);
          await recordTransaction(supabase, userId, amount, 'airtime', description, 'completed', result.reference || undefined, { 
            examid: body.examid, 
            quantity: body.quantity,
            exam_name: examName,
            provider: 'rgc',
            api_response: result 
          });

        } else {
          throw new Error('Invalid service type');
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (purchaseError: any) {
        // If purchase fails after deduction, we need to refund
        console.error('Purchase failed:', purchaseError);
        
        // Record failed transaction
        await recordTransaction(supabase, userId, amount, serviceType === 'cable' ? 'tv' : serviceType, description, 'failed', undefined, { error: purchaseError.message, provider: 'rgc' });

        // Refund the wallet
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', userId)
          .single();

        if (wallet) {
          await supabase
            .from('wallets')
            .update({ balance: wallet.balance + amount, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        }

        return new Response(JSON.stringify({ success: false, message: purchaseError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in rgc-services function:', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
