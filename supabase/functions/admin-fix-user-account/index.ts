import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function sanitizePhone(raw: string): string {
  let p = (raw || "").replace(/[\s\-()]/g, "");
  if (p.startsWith("+234")) p = "0" + p.slice(4);
  else if (p.startsWith("234") && p.length === 13) p = "0" + p.slice(3);
  if (p.length === 10 && /^[789]/.test(p)) p = "0" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paymentPointApiKey = Deno.env.get("PAYMENTPOINT_API_KEY")!;
    const paymentPointApiSecret = Deno.env.get("PAYMENTPOINT_API_SECRET")!;
    const paymentPointBusinessId = Deno.env.get("PAYMENTPOINT_BUSINESS_ID")!;

    // Admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: claims.claims.sub,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.userId;
    const newPhone: string | undefined = body.phone;
    if (!targetUserId) return json({ error: "Missing userId" }, 400);

    // Load profile
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, phone")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (pErr || !profile) return json({ error: "User not found" }, 404);

    const email = (profile.email || "").trim().toLowerCase();
    if (!email) return json({ error: "User has no email on file" }, 400);

    // Use provided phone, or fall back to the profile's existing phone
    let phone = sanitizePhone(newPhone || profile.phone || "");
    if (!/^\d{11}$/.test(phone) || !/^0[789]/.test(phone)) {
      return json({ error: "Invalid phone number. Must be 11-digit Nigerian mobile (e.g. 08012345678)" }, 400);
    }

    // Update phone if a new one was provided
    if (newPhone) {
      const { error: phoneErr } = await supabase
        .from("profiles")
        .update({ phone })
        .eq("user_id", targetUserId);
      if (phoneErr) return json({ error: "Failed to update phone", details: phoneErr.message }, 500);
    }

    const name = (profile.full_name || "User").trim();

    // Create PaymentPoint (PalmPay) virtual account
    const ppResp = await fetch("https://api.paymentpoint.co/api/v1/createVirtualAccount", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paymentPointApiSecret}`,
        "api-key": paymentPointApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        name,
        phoneNumber: phone,
        bankCode: ["20946"], // PalmPay
        businessId: paymentPointBusinessId,
      }),
    });
    const rawText = await ppResp.text();
    let ppData: any = {};
    try { ppData = JSON.parse(rawText); } catch {}

    if (!ppResp.ok || ppData?.status === "failed" || ppData?.status === false) {
      return json({ error: "PaymentPoint rejected request", details: ppData || rawText }, 400);
    }

    const bankAccounts: any[] = ppData?.bankAccounts || ppData?.data?.bankAccounts || [];
    const palm = bankAccounts.find((a) =>
      (a?.bankName || a?.bank_name || "").toLowerCase().includes("palmpay")
    ) || bankAccounts[0] || {};

    const accountNumber = palm.accountNumber || palm.account_number || null;
    const accountName = palm.accountName || palm.account_name || name;
    const bankName = palm.bankName || palm.bank_name || "PalmPay";

    if (!accountNumber) {
      return json({ error: "No account returned by provider", details: ppData }, 400);
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ account_number: accountNumber, virtual_account_name: accountName, virtual_account_bank: bankName })
      .eq("user_id", targetUserId);
    if (upErr) return json({ error: "Failed to save account", details: upErr.message }, 500);

    return json({ success: true, phone, accountNumber, accountName, bankName });
  } catch (e: any) {
    console.error("admin-fix-user-account error:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
