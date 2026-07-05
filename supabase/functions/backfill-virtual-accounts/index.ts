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
  // 10-digit local mobile without the leading 0 (e.g. 8131320548)
  if (p.length === 10 && /^[789]/.test(p)) p = "0" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const aspfiyKey = Deno.env.get("ASPFIY_SECRET_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const webhookUrl = `${supabaseUrl}/functions/v1/aspfiy-webhook`;

  // Admin-only: require admin role on the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: claims } = await supabase.auth.getClaims(token);
  if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone, email, virtual_account_name, account_number")
    .or("virtual_account_name.is.null,account_number.is.null");

  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const p of profiles || []) {
    if (p.virtual_account_name && p.account_number) continue;

    const phone = sanitizePhone(p.phone || "");
    if (!/^\d{11}$/.test(phone)) {
      results.push({ user_id: p.user_id, ok: false, reason: "invalid_phone", phone: p.phone });
      continue;
    }
    const email = (p.email || "").trim().toLowerCase();
    if (!email) {
      results.push({ user_id: p.user_id, ok: false, reason: "missing_email" });
      continue;
    }
    const nameParts = (p.full_name || "User").trim().split(/\s+/);
    const firstName = nameParts[0] || "User";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    try {
      const resp = await fetch("https://api-v1.aspfiy.com/reserve-palmpay/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aspfiyKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          reference: p.user_id,
          firstName,
          lastName,
          webhookUrl,
          phone,
        }),
      });
      const txt = await resp.text();
      let data: any = {};
      try { data = JSON.parse(txt); } catch {}

      if (!resp.ok) {
        results.push({ user_id: p.user_id, ok: false, reason: "aspfiy_error", status: resp.status, body: data || txt });
        continue;
      }

      const acct = data?.data?.account || data?.data || data?.account || data || {};
      const accountNumber = acct.account_number || acct.accountNumber || acct.accountNo || null;
      const accountName = acct.account_name || acct.accountName || `${firstName} ${lastName}`.trim();
      const bankName = acct.bank_name || acct.bankName || "PalmPay";

      if (!accountNumber) {
        results.push({ user_id: p.user_id, ok: false, reason: "no_account_in_response", body: data });
        continue;
      }

      const { error: upErr } = await supabase
        .from("profiles")
        .update({ account_number: accountNumber, virtual_account_name: accountName, virtual_account_bank: bankName })
        .eq("user_id", p.user_id);

      if (upErr) {
        results.push({ user_id: p.user_id, ok: false, reason: "db_update_failed", err: upErr.message });
        continue;
      }
      results.push({ user_id: p.user_id, ok: true, accountNumber });
    } catch (e: any) {
      results.push({ user_id: p.user_id, ok: false, reason: "exception", err: String(e) });
    }

    // gentle pacing to avoid provider rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  const ok = results.filter((r) => r.ok).length;
  return json({ total: results.length, success: ok, failed: results.length - ok, results });
});