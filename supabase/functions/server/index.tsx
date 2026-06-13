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
    const newCampaign = {
      id: requestedId ?? crypto.randomUUID(),
      name: name.trim(),
      description: description?.trim() ?? "",
      ruleset: ruleset ?? "hsc",
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    };

    const existing: unknown[] = await kv.get(campaignsKey(userId)) ?? [];
    await kv.set(campaignsKey(userId), [...existing, newCampaign]);

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

// ─── Type helper (Deno) ─────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  description: string;
  ruleset: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

Deno.serve(app.fetch);
