import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRollResultPayload(value: unknown): value is Record<string, unknown> & {
  id: string;
  campaignId: string;
  rollerId: string;
  rollerName: string;
  formulaName: string;
  formulaText: string;
  visibility: "secret";
  total: number;
  createdAt: number;
} {
  if (!isRecord(value)) return false;
  for (const key of ["id", "campaignId", "rollerId", "rollerName", "formulaName", "formulaText"] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) return false;
  }
  if (value.visibility !== "secret") return false;
  if (typeof value.total !== "number" || !Number.isFinite(value.total)) return false;
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return false;
  if (!Array.isArray(value.sourceItems)) return false;
  if (!Array.isArray(value.diceGroups)) return false;
  if (!Array.isArray(value.arithmeticSteps)) return false;
  if (!Array.isArray(value.comparisons)) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration error" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json({ error: "Missing authorization" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!isRecord(body) || typeof body.campaignId !== "string" || !isRollResultPayload(body.result)) {
    return json({ error: "Invalid dice roll payload" }, 400);
  }

  const campaignId = body.campaignId;
  const result = body.result;
  if (result.campaignId !== campaignId) return json({ error: "Campaign mismatch" }, 400);
  if (result.visibility !== 'secret') return json({ error: "Only secret rolls may use this relay" }, 400);
  if (result.rollerId !== user.id) return json({ error: "Roller mismatch" }, 403);

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('owner_profile_id')
    .eq('id', campaignId)
    .is('deleted_at', null)
    .maybeSingle();

  if (campaignError) return json({ error: "Campaign lookup failed" }, 500);
  if (!campaign) return json({ error: "Campaign not found" }, 404);

  const ownerProfileId = String(campaign.owner_profile_id);
  if (ownerProfileId === user.id) {
    return json({ error: "GM secret rolls must remain local" }, 400);
  }

  const { data: membership, error: membershipError } = await admin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (membershipError) return json({ error: "Membership lookup failed" }, 500);
  if (!membership) return json({ error: "Not a campaign member" }, 403);

  await admin.realtime.setAuth(serviceRoleKey);
  const channel = admin.channel(`profile:${ownerProfileId}`, { config: { private: true } });

  try {
    const response = await channel.httpSend('dice_roll', result);
    if (response.success === false) {
      console.error('Secret dice relay failed:', response.status, response.error);
      return json({ error: "Realtime relay failed" }, 502);
    }
  } finally {
    await admin.removeChannel(channel);
  }

  return json({ ok: true });
});
