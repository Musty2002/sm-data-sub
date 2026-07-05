import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paymentpoint-signature",
};

interface PaymentWebhook {
  notification_status: string;
  transaction_id: string;
  amount_paid: number;
  settlement_amount: number;
  settlement_fee: number;
  transaction_status: string;
  sender: {
    name: string;
    account_number: string;
    bank: string;
  };
  receiver: {
    name: string;
    account_number: string;
    bank: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string | null;
    customer_id: string;
  };
  description: string;
  timestamp: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paymentPointApiSecret = Deno.env.get("PAYMENTPOINT_API_SECRET")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get raw body for signature verification
    const rawBody = await req.text();
    console.log("Received webhook payload:", rawBody);

    // Verify signature if provided
    const signature = req.headers.get("paymentpoint-signature");
    if (signature) {
      const calculatedSignature = createHmac("sha256", paymentPointApiSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== calculatedSignature) {
        console.error("Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Webhook signature verified");
    } else {
      console.log("No signature header, proceeding without verification");
    }

    const webhookData: PaymentWebhook = JSON.parse(rawBody);

    // Only process successful payments
    if (webhookData.notification_status !== "payment_successful" || 
        webhookData.transaction_status !== "success") {
      console.log("Ignoring non-successful payment:", webhookData.notification_status);
      return new Response(
        JSON.stringify({ message: "Ignored non-successful payment" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receiverAccountNumber = webhookData.receiver.account_number;
    const amountPaid = Number(webhookData.settlement_amount); // Use settlement amount (after fees)
    const transactionId = webhookData.transaction_id;

    if (!transactionId || !amountPaid || amountPaid <= 0) {
      console.error("Invalid webhook payload", { transactionId, amountPaid });
      return new Response(
        JSON.stringify({ error: "Invalid payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing payment: ${amountPaid} to account ${receiverAccountNumber}, txn: ${transactionId}`);

    // Find the user profile by account number (use maybeSingle to avoid PGRST116 throws)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("account_number", receiverAccountNumber)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile not found for account:", receiverAccountNumber, profileError);
      return new Response(
        JSON.stringify({ error: "User not found for this account" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found user: ${profile.user_id}, name: ${profile.full_name}`);

    // Check if transaction already processed (prevent duplicates)
    const { data: existingTxn } = await supabase
      .from("transactions")
      .select("id")
      .eq("reference", transactionId)
      .maybeSingle();

    if (existingTxn) {
      console.log("Transaction already processed:", transactionId);
      return new Response(
        JSON.stringify({ message: "Transaction already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    if (walletError || !wallet) {
      console.error("Wallet not found:", walletError);
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cast numeric -> Number; supabase returns numeric as a STRING, so `+` would concat.
    const newBalance = Number(wallet.balance) + amountPaid;

    // Update wallet balance
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);

    if (updateError) {
      console.error("Failed to update wallet:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update wallet" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create transaction record
    const { error: txnError } = await supabase
      .from("transactions")
      .insert({
        user_id: profile.user_id,
        type: "credit",
        category: "deposit",
        amount: amountPaid,
        description: `Deposit from ${webhookData.sender.name} via ${webhookData.sender.bank}`,
        reference: transactionId,
        status: "completed",
        metadata: {
          sender_name: webhookData.sender.name,
          sender_bank: webhookData.sender.bank,
          sender_account: webhookData.receiver.account_number,
          original_amount: webhookData.amount_paid,
          settlement_fee: webhookData.settlement_fee,
          paymentpoint_timestamp: webhookData.timestamp,
        },
      });

    if (txnError) {
      console.error("Failed to create transaction:", txnError);
      // Don't fail the webhook, wallet was already updated
    }

    // Create notification for user
    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: profile.user_id,
        title: "Deposit Successful",
        message: `₦${amountPaid.toLocaleString()} has been credited to your wallet from ${webhookData.sender.name}`,
        type: "transaction",
      });

    if (notifError) {
      console.error("Failed to create notification:", notifError);
    }

    // Send native push notification for deposit
    try {
      const { data: pushSubscriptions } = await supabase
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", profile.user_id);

      console.log(`Found ${pushSubscriptions?.length || 0} push subscriptions for user ${profile.user_id}`);

      if (pushSubscriptions && pushSubscriptions.length > 0) {
        for (const sub of pushSubscriptions) {
          try {
            console.log(`Sending credit alert push to token: ${sub.endpoint.substring(0, 20)}...`);
            const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push-notification', {
              body: {
                token: sub.endpoint,
                title: "💰 Deposit Received!",
                body: `₦${amountPaid.toLocaleString()} credited from ${webhookData.sender.name}`,
                data: {
                  type: 'deposit',
                  amount: String(amountPaid),
                  reference: transactionId,
                  route: '/history'
                }
              }
            });
            if (pushError) {
              console.error("Push invoke error:", pushError);
            } else {
              console.log("Push result:", JSON.stringify(pushResult));
            }
          } catch (pushErr) {
            console.error("Failed to send push notification:", pushErr);
          }
        }
      }
    } catch (pushError) {
      console.error("Error sending push notifications:", pushError);
    }

    console.log(`Successfully credited ₦${amountPaid} to user ${profile.user_id}. New balance: ₦${newBalance}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Payment processed successfully",
        newBalance: newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
