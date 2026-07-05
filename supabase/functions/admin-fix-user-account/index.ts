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
    const aspfiyKey = Deno.env.get("ASPFIY_SECRET_KEY")!;

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
    if (!targetUserId || !newPhone) return json({ error: "Missing userId or phone" }, 400);

    const phone = sanitizePhone(newPhone);
    if (!/^\d{11}$/.test(phone) || !/^0[789]/.test(phone)) {
      return json({ error: "Invalid phone number. Must be 11-digit Nigerian mobile (e.g. 08012345678)" }, 400);
    }

    // Load profile
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (pErr || !profile) return json({ error: "User not found" }, 404);

    const email = (profile.email || "").trim().toLowerCase();
    if (!email) return json({ error: "User has no email on file" }, 400);

    // Update phone first
    const { error: phoneErr } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("user_id", targetUserId);
    if (phoneErr) return json({ error: "Failed to update phone", details: phoneErr.message }, 500);

    // Reserve Aspfiy Paga account
    const nameParts = (profile.full_name || "User").trim().split(/\s+/);
    const firstName = nameParts[0] || "User";
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const webhookUrl = `${supabaseUrl}/functions/v1/aspfiy-webhook`;

    const resp = await fetch("https://api-v1.aspfiy.com/reserve-paga/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aspfiyKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, reference: targetUserId, firstName, lastName, webhookUrl, phone }),
    });
    const txt = await resp.text();
    let data: any = {};
    try { data = JSON.parse(txt); } catch {}

    if (!resp.ok || data?.status === false) {
      return json({ error: "Aspfiy rejected request", details: data || txt }, 400);
    }

    const acct = data?.data?.account || data?.data || data?.account || data || {};
    const accountNumber = acct.account_number || acct.accountNumber || acct.accountNo || null;
    const accountName = acct.account_name || acct.accountName || `${firstName} ${lastName}`.trim();
    const bankName = acct.bank_name || acct.bankName || "Paga";

    if (!accountNumber) {
      return json({ error: "No account returned by provider", details: data }, 400);
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ account_number: accountNumber, virtual_account_name: accountName, virtual_account_bank: bankName })
      .eq("user_id", targetUserId);
    if (upErr) return json({ error: "Failed to save account", details: upErr.message }, 500);

    return json({ success: true, phone, accountNumber, accountName });
  } catch (e: any) {
    console.error("admin-fix-user-account error:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});