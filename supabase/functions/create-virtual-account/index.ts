import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateVirtualAccountRequest {
  userId: string;
  email: string;
  name: string;
  phoneNumber: string;
  force?: boolean;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paymentPointApiKey = Deno.env.get("PAYMENTPOINT_API_KEY")!;
    const paymentPointApiSecret = Deno.env.get("PAYMENTPOINT_API_SECRET")!;
    const paymentPointBusinessId = Deno.env.get("PAYMENTPOINT_BUSINESS_ID")!;

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error("Invalid JWT:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authenticatedUserId = claimsData.user.id;
    console.log("Authenticated user:", authenticatedUserId);

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({})) as Partial<CreateVirtualAccountRequest>;
    const { userId, email: requestedEmail, name: requestedName, phoneNumber: rawPhone } = body;
    const force = (body as any).force === true;

    if (!userId) {
      return jsonResponse({ error: "Missing user ID" }, 400);
    }

    // Verify the request is for the authenticated user
    if (userId !== authenticatedUserId) {
      console.error("User ID mismatch:", userId, authenticatedUserId);
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const userMetadata = claimsData.user.user_metadata || {};
    const email = (requestedEmail || claimsData.user.email || "").trim().toLowerCase();
    const metadataName = (userMetadata.full_name || "").trim();
    const name = ((requestedName && requestedName !== "User" ? requestedName : metadataName) || "User").trim();
    const referralCodeInput = (userMetadata.referral_code || "").trim();

    if (!email) {
      return jsonResponse({ error: "Missing email address" }, 400);
    }

    // Sanitize phone number: strip spaces, dashes, and convert +234 prefix to 0
    let phoneNumber = (rawPhone || userMetadata.phone || "").replace(/[\s\-()]/g, "");
    if (phoneNumber.startsWith("+234")) {
      phoneNumber = "0" + phoneNumber.slice(4);
    } else if (phoneNumber.startsWith("234") && phoneNumber.length === 13) {
      phoneNumber = "0" + phoneNumber.slice(3);
    }

    // Validate: must be exactly 11 digits
    if (!/^\d{11}$/.test(phoneNumber)) {
      console.error("Invalid phone number:", phoneNumber, "from raw:", rawPhone);
      return jsonResponse({ error: "Invalid phone number", details: { status: "fail", message: "Phone number must be 11 digits (e.g. 08012345678)" } }, 400);
    }

    const { data: existingProfile, error: profileLookupError } = await supabase
      .from("profiles")
      .select("id, account_number, virtual_account_name, virtual_account_bank, full_name, phone, email")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileLookupError) {
      console.error("Profile lookup failed:", profileLookupError);
      return jsonResponse({ error: "Failed to check profile", details: profileLookupError }, 500);
    }

    const hasPalmPay =
      (existingProfile?.virtual_account_bank || "").toLowerCase().includes("palmpay");

    if (!force && hasPalmPay && existingProfile?.virtual_account_name && existingProfile?.account_number) {
      return jsonResponse({
        success: true,
        alreadyExists: true,
        accountNumber: existingProfile.account_number,
        accountName: existingProfile.virtual_account_name,
      });
    }

    let profileId = existingProfile?.id;

    if (!existingProfile) {
      const [{ data: generatedAccountNumber, error: accountNumberError }, { data: generatedReferralCode, error: referralCodeError }] = await Promise.all([
        supabase.rpc("generate_account_number"),
        supabase.rpc("generate_referral_code"),
      ]);

      if (accountNumberError || referralCodeError || !generatedAccountNumber || !generatedReferralCode) {
        console.error("Failed to generate profile codes:", accountNumberError || referralCodeError);
        return jsonResponse({ error: "Failed to initialize account profile" }, 500);
      }

      let referredBy: string | null = null;
      if (referralCodeInput) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCodeInput)
          .maybeSingle();
        referredBy = referrer?.id || null;
      }

      const { data: newProfile, error: insertProfileError } = await supabase
        .from("profiles")
        .insert({
          user_id: userId,
          full_name: name,
          phone: phoneNumber,
          email,
          account_number: generatedAccountNumber,
          referral_code: generatedReferralCode,
          referred_by: referredBy,
        })
        .select("id")
        .single();

      if (insertProfileError || !newProfile) {
        console.error("Failed to create missing profile:", insertProfileError);
        return jsonResponse({ error: "Failed to initialize account profile", details: insertProfileError }, 500);
      }

      profileId = newProfile.id;

      if (referredBy) {
        await supabase.from("referrals").insert({ referrer_id: referredBy, referee_id: profileId });
      }
    }

    const [{ data: wallet }, { data: cashbackWallet }, { data: userRole }] = await Promise.all([
      supabase.from("wallets").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("cashback_wallets").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("id").eq("user_id", userId).eq("role", "user").maybeSingle(),
    ]);

    if (!wallet) {
      await supabase.from("wallets").insert({ user_id: userId, balance: 0 });
    }
    if (!cashbackWallet) {
      await supabase.from("cashback_wallets").insert({ user_id: userId, balance: 0 });
    }
    if (!userRole) {
      await supabase.from("user_roles").insert({ user_id: userId, role: "user" });
    }

    console.log(`Creating PaymentPoint (PalmPay) virtual account for user: ${userId}, email: ${email}, phone: ${phoneNumber}`);

    // Call PaymentPoint createVirtualAccount API (issues a PalmPay account)
    const ppResp = await fetch("https://api.paymentpoint.co/api/v1/createVirtualAccount", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paymentPointApiSecret}`,
        "api-key": paymentPointApiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        email,
        name,
        phoneNumber,
        bankCode: ["20946"], // PalmPay
        businessId: paymentPointBusinessId,
      }),
    });
    const rawText = await ppResp.text();
    let ppData: any = {};
    try { ppData = JSON.parse(rawText); } catch { /* keep raw */ }
    console.log(`PaymentPoint status=${ppResp.status}, body=`, rawText);

    if (!ppResp.ok || ppData?.status === "failed" || ppData?.status === false) {
      return jsonResponse({ error: "Failed to create virtual account", details: ppData || rawText }, 400);
    }

    // Prefer PalmPay from bankAccounts, fall back to first item
    const bankAccounts: any[] = ppData?.bankAccounts || ppData?.data?.bankAccounts || [];
    const palm = bankAccounts.find((a) =>
      (a?.bankName || a?.bank_name || "").toLowerCase().includes("palmpay")
    ) || bankAccounts[0] || {};

    const accountNumber = palm.accountNumber || palm.account_number || null;
    const accountName = palm.accountName || palm.account_name || name;
    const bankName = palm.bankName || palm.bank_name || "PalmPay";

    if (!accountNumber) {
      console.warn("Aspfiy did not return an account number in the response. Awaiting webhook.");
      return jsonResponse({
        success: true,
        pending: true,
        message: "Account reservation in progress. It will be available shortly.",
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        account_number: accountNumber,
        virtual_account_name: accountName,
        virtual_account_bank: bankName,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update profile", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully created Aspfiy virtual account: ${accountNumber} for user: ${userId}`);

    return jsonResponse({
      success: true,
      accountNumber,
      bankName,
      accountName,
    });

  } catch (error: unknown) {
    console.error("Error creating virtual account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
