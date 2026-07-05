import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wiaxy-signature",
};

interface AspfiyWebhook {
  event: string;
  data: {
    type?: string;
    reference?: string;
    merchant_reference?: string;
    aspfiy_ref?: string;
    wiaxy_ref?: string;
    transaction_ref?: string;
    amount?: string | number;
    created_at?: string;
    account?: {
      account_number?: string;
      account_name?: string;
      bank_name?: string;
      created_at?: string;
    };
    payer?: {
      account_number?: string;
      first_name?: string;
      last_name?: string;
      createdAt?: string;
    };
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeAccountNumber(raw: unknown): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return digits.padStart(10, "0");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function extractUserIdFromReference(raw: unknown): string | null {
  const ref = String(raw || "");
  const match = ref.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aspfiySecretKey = Deno.env.get("ASPFIY_SECRET_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    console.log("Aspfiy webhook payload:", rawBody);

    // Verify x-wiaxy-signature = MD5(secret key)
    const signature = req.headers.get("x-wiaxy-signature");
    const expected = createHash("md5").update(aspfiySecretKey).digest("hex");
    if (signature && signature.toLowerCase() !== expected.toLowerCase()) {
      console.error("Invalid Aspfiy webhook signature");
      return json({ error: "Invalid signature" }, 401);
    }

    const payload: AspfiyWebhook = JSON.parse(rawBody);

    if (payload.event !== "PAYMENT_NOTIFIFICATION" && payload.event !== "PAYMENT_NOTIFICATION") {
      console.log("Ignoring non-payment event:", payload.event);
      return json({ message: "ignored" });
    }
    if (payload.data?.type !== "RESERVED_ACCOUNT_TRANSACTION") {
      console.log("Ignoring non-reserved-account event:", payload.data?.type);
      return json({ message: "ignored" });
    }

    const merchantRef = payload.data.merchant_reference; // user_id, or user_id-timestamp after regeneration
    const accountNumber = normalizeAccountNumber(payload.data.account?.account_number);
    // Aspfiy `reference` can be the reserved-account/customer reference on some
    // deposits, so using it first can make every later deposit look duplicate.
    // `reference` is the reserved-account reference and repeats for every deposit.
    // Aspfiy sends the unique per-payment ID as `transaction_ref` / `wiaxy_ref`
    // on live callbacks, so use those first to avoid rejecting later deposits.
    const transactionRef =
      payload.data.transaction_ref ||
      payload.data.wiaxy_ref ||
      payload.data.aspfiy_ref ||
      payload.data.reference;
    const amount = Number(payload.data.amount || 0);

    if (!transactionRef || !amount || amount <= 0) {
      return json({ error: "Invalid payload" }, 400);
    }

    // Locate profile by merchant_reference (user_id) first, fall back to account_number
    let profile: { user_id: string; full_name: string } | null = null;

    const merchantUserId = extractUserIdFromReference(merchantRef);
    if (merchantUserId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", merchantUserId)
        .maybeSingle();
      if (error) console.error("Merchant reference lookup failed:", error);
      if (data) profile = data as any;
    }
    if (!profile && accountNumber) {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("account_number", accountNumber)
        .maybeSingle();
      if (error) console.error("Account lookup failed:", error);
      if (data) profile = data as any;
    }

    if (!profile) {
      console.error("Profile not found for payload", { merchantRef, accountNumber });
      return json({ error: "User not found" }, 404);
    }

    // If profile is missing the account details (created post-webhook), persist them now
    if (accountNumber) {
      await supabase
        .from("profiles")
        .update({
          account_number: accountNumber,
          virtual_account_name: payload.data.account?.account_name || profile.full_name,
          // Always brand Aspfiy accounts as "Paga - Aspfiy" regardless of the
          // underlying settlement bank (PalmPay, 9PSB, etc.) returned by Aspfiy.
          virtual_account_bank: "Paga - Aspfiy",
        })
        .eq("user_id", profile.user_id)
        .is("virtual_account_name", null);
    }

    const payerName = [payload.data.payer?.first_name, payload.data.payer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unknown Sender";

    const { data: newBalance, error: creditError } = await supabase.rpc("process_aspfiy_deposit", {
      p_user_id: profile.user_id,
      p_reference: transactionRef,
      p_amount: amount,
      p_description: `Deposit from ${payerName}`,
      p_metadata: {
        sender_name: payerName,
        sender_account: payload.data.payer?.account_number,
        aspfiy_ref: payload.data.aspfiy_ref,
        wiaxy_ref: payload.data.wiaxy_ref,
        transaction_ref: payload.data.transaction_ref,
        timestamp: payload.data.created_at,
        merchant_reference: merchantRef,
        account_number: accountNumber,
      },
    });

    if (creditError) {
      if (creditError.code === "23505") {
        console.log("Already processed:", transactionRef);
        return json({ message: "duplicate" });
      }
      console.error("Failed to credit Aspfiy deposit:", creditError);
      return json({ error: "Failed to credit wallet", details: creditError.message }, 500);
    }

    await supabase.from("notifications").insert({
      user_id: profile.user_id,
      title: "Deposit Successful",
      message: `₦${amount.toLocaleString()} has been credited to your wallet from ${payerName}`,
      type: "transaction",
    });

    // Push notification
    try {
      const { data: pushSubs } = await supabase
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", profile.user_id);
      for (const sub of pushSubs || []) {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            token: sub.endpoint,
            title: "💰 Deposit Received!",
            body: `₦${amount.toLocaleString()} credited from ${payerName}`,
            data: { type: "deposit", amount: String(amount), reference: transactionRef, route: "/history" },
          },
        });
      }
    } catch (e) {
      console.error("Push error:", e);
    }

    return json({ success: true, newBalance });
  } catch (e: unknown) {
    console.error("Aspfiy webhook error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});