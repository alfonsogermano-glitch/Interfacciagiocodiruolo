import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUserIdFromToken(token: string): Promise<string | null> {
  const { data: { user }, error } = await getAdminClient().auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

function campaignsKey(userId: string) {
  return `campaigns:${userId}`;
}

function inviteCodeKey(code: string) {
  return `inviteCode:${code}`;
}

function campaignMembersKey(campaignId: string) {
  return `campaignMembers:${campaignId}`;
}

function playerCampaignsKey(userId: string) {
  return `playerCampaigns:${userId}`;
}

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    const existing = await kv.get(inviteCodeKey(code));
    if (!existing) return code;
  }
  // Fallback estremamente improbabile: usa un codice più lungo basato su UUID
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ─── Health ─────────────────────────────────────────────────────────────────

app.get("/make-server-771c5bfd/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Auth: Signup ────────────────────────────────────────────────────────────

app.post("/make-server-771c5bfd/auth/signup", async (c) => {
  try {
    const { email, password, displayName } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email e password sono obbligatori" }, 400);
    }

    const { data, error } = await getAdminClient().auth.admin.createUser({
      email,
      password,
      user_metadata: { display_name: displayName ?? email.split("@")[0] },
      email_confirm: true,
    });

    if (error) {
      console.log("Errore signup:", error.message);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ user: { id: data.user.id, email: data.user.email } }, 201);
  } catch (err) {
    console.log("Errore interno signup:", err);
    return c.json({ error: `Errore interno durante la registrazione: ${err}` }, 500);
  }
});

// ─── Auth: Me ───────────────────────────────────────────────────────────────

app.get("/make-server-771c5bfd/auth/me", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Token mancante" }, 401);

    const { data: { user }, error } = await getAdminClient().auth.getUser(token);
    if (error || !user) return c.json({ error: "Token non valido" }, 401);

    return c.json({
      id: user.id,
      email: user.email,
      displayName: user.user_metadata?.display_name ?? user.email,
    });
  } catch (err) {
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: List ────────────────────────────────────────────────────────

app.get("/make-server-771c5bfd/campaigns", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaigns = await kv.get(campaignsKey(userId)) ?? [];
    return c.json({ campaigns });
  } catch (err) {
    console.log("Errore GET campaigns:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Create ──────────────────────────────────────────────────────

app.post("/make-server-771c5bfd/campaigns", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const { id: requestedId, name, description, ruleset } = await c.req.json();

    if (!name?.trim()) {
      return c.json({ error: "Il nome della campagna è obbligatorio" }, 400);
    }

    const now = new Date().toISOString();
    const inviteCode = await generateUniqueInviteCode();
    const newCampaign = {
      id: requestedId ?? crypto.randomUUID(),
      name: name.trim(),
      description: description?.trim() ?? "",
      ruleset: ruleset ?? "hsc",
      ownerId: userId,
      inviteCode,
      createdAt: now,
      updatedAt: now,
    };

    const existing: unknown[] = await kv.get(campaignsKey(userId)) ?? [];
    await kv.set(campaignsKey(userId), [...existing, newCampaign]);
    await kv.set(inviteCodeKey(inviteCode), { campaignId: newCampaign.id, ownerId: userId });

    return c.json({ campaign: newCampaign }, 201);
  } catch (err) {
    console.log("Errore POST campaigns:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Update ──────────────────────────────────────────────────────

app.put("/make-server-771c5bfd/campaigns/:id", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const patch = await c.req.json();

    const campaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const index = campaigns.findIndex((c: Campaign) => c.id === campaignId);

    if (index === -1) {
      return c.json({ error: "Campagna non trovata" }, 404);
    }

    const updated = {
      ...campaigns[index],
      ...patch,
      id: campaignId,
      ownerId: userId,
      updatedAt: new Date().toISOString(),
    };

    campaigns[index] = updated;
    await kv.set(campaignsKey(userId), campaigns);

    return c.json({ campaign: updated });
  } catch (err) {
    console.log("Errore PUT campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Mark opened ─────────────────────────────────────────────────

app.post("/make-server-771c5bfd/campaigns/:id/open", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const existing: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const idx = existing.findIndex((cmp) => cmp.id === campaignId);
    if (idx === -1) {
      return c.json({ error: "Campagna non trovata o non sei il proprietario" }, 404);
    }

    const now = new Date().toISOString();
    existing[idx] = { ...existing[idx], lastOpenedAt: now };
    await kv.set(campaignsKey(userId), existing);

    return c.json({ campaign: existing[idx] });
  } catch (err) {
    console.log("Errore POST campaigns/:id/open:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Generate invite code ────────────────────────────────────────

app.post("/make-server-771c5bfd/campaigns/:id/invite-code", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const campaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const index = campaigns.findIndex((cmp) => cmp.id === campaignId);
    if (index === -1) {
      return c.json({ error: "Campagna non trovata o non sei il proprietario" }, 404);
    }

    if (campaigns[index].inviteCode) {
      return c.json({ campaign: campaigns[index] });
    }

    const inviteCode = await generateUniqueInviteCode();
    campaigns[index] = { ...campaigns[index], inviteCode, updatedAt: new Date().toISOString() };
    await kv.set(campaignsKey(userId), campaigns);
    await kv.set(inviteCodeKey(inviteCode), { campaignId, ownerId: userId });

    return c.json({ campaign: campaigns[index] });
  } catch (err) {
    console.log("Errore POST campaigns/:id/invite-code:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Delete ──────────────────────────────────────────────────────

app.delete("/make-server-771c5bfd/campaigns/:id", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const campaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const filtered = campaigns.filter((c: Campaign) => c.id !== campaignId);

    await kv.set(campaignsKey(userId), filtered);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Join via invite code ───────────────────────────────────────

app.post("/make-server-771c5bfd/campaigns/join", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const { code } = await c.req.json();
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!normalizedCode) {
      return c.json({ error: "Il codice invito è obbligatorio" }, 400);
    }

    const membership: CampaignMembership | null = await kv.get(inviteCodeKey(normalizedCode));
    if (!membership) {
      return c.json({ error: "Codice invito non valido" }, 404);
    }

    if (membership.ownerId === userId) {
      return c.json({ error: "Sei già il master di questa campagna" }, 400);
    }

    const ownerCampaigns: Campaign[] = await kv.get(campaignsKey(membership.ownerId)) ?? [];
    const campaign = ownerCampaigns.find((cmp) => cmp.id === membership.campaignId);
    if (!campaign) {
      return c.json({ error: "Campagna non trovata" }, 404);
    }

    const members: { profileId: string; role: string; joinedAt: string }[] =
      await kv.get(campaignMembersKey(membership.campaignId)) ?? [];
    if (!members.some((m) => m.profileId === userId)) {
      members.push({ profileId: userId, role: "player", joinedAt: new Date().toISOString() });
      await kv.set(campaignMembersKey(membership.campaignId), members);
    }

    const playerCampaigns: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
    if (!playerCampaigns.some((pc) => pc.campaignId === membership.campaignId)) {
      playerCampaigns.push({ campaignId: membership.campaignId, ownerId: membership.ownerId });
      await kv.set(playerCampaignsKey(userId), playerCampaigns);
    }

    return c.json({ campaign });
  } catch (err) {
    console.log("Errore POST campaigns/join:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Campaigns: Joined (come player) ───────────────────────────────────────

app.get("/make-server-771c5bfd/campaigns/joined", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const playerCampaigns: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];

    const campaigns: Campaign[] = [];
    for (const membership of playerCampaigns) {
      const ownerCampaigns: Campaign[] = await kv.get(campaignsKey(membership.ownerId)) ?? [];
      const campaign = ownerCampaigns.find((cmp) => cmp.id === membership.campaignId);
      if (campaign) campaigns.push(campaign);
    }

    return c.json({ campaigns });
  } catch (err) {
    console.log("Errore GET campaigns/joined:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Type helper (Deno) ─────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  description: string;
  ruleset: string;
  ownerId: string;
  inviteCode?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

interface CampaignMembership {
  campaignId: string;
  ownerId: string;
}

Deno.serve(app.fetch);
