import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Authentication required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Authentication required');

    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (roleError || isAdmin !== true) {
      return new Response(JSON.stringify({ success: false, message: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(transactionId)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid transaction' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabase.rpc('refund_purchase', {
      p_transaction_id: transactionId,
      p_reason: 'Manual admin refund',
      p_metadata: { refunded_by: user.id, refund_source: 'admin' },
    });
    if (error) throw error;

    return new Response(JSON.stringify({
      success: data === true,
      message: data === true ? 'Refund processed' : 'This transaction was already refunded',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Refund failed';
    return new Response(JSON.stringify({ success: false, message }), {
      status: message === 'Authentication required' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});