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

app.post("/make-server-771c5bfd/campaigns/:id/session", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const { active } = await c.req.json();

    const campaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const index = campaigns.findIndex((c: Campaign) => c.id === campaignId);
    if (index === -1) {
      return c.json({ error: "Campagna non trovata o non sei il proprietario" }, 404);
    }

    const updated = {
      ...campaigns[index],
      sessionActive: !!active,
      sessionActivatedAt: active ? new Date().toISOString() : campaigns[index].sessionActivatedAt,
      updatedAt: new Date().toISOString()
    };
    campaigns[index] = updated;
    await kv.set(campaignsKey(userId), campaigns);

    // Sincronizza anche su Postgres, per la lettura RLS lato giocatori
    await getAdminClient().from('campaigns').update({ session_active: !!active }).eq('id', campaignId);

    return c.json({ campaign: updated });
  } catch (err) {
    console.log("Errore POST campaigns/:id/session:", err);
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

// ─── Report Bug ─────────────────────────────────────────────────────────────

app.post("/make-server-771c5bfd/report-bug", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Non autorizzato" }, 401);
  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Token non valido" }, 401);

  const { message, displayName, email } = await c.req.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return c.json({ error: "Il messaggio non può essere vuoto" }, 400);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.log("RESEND_API_KEY non configurata");
    return c.json({ error: "Servizio email non configurato" }, 500);
  }

  const emailText =
    `Nuovo report bug da Hollow Gate VTT\n\n` +
    `Utente: ${displayName || "Sconosciuto"}\n` +
    `Email registrazione: ${email || "Sconosciuta"}\n\n` +
    `Messaggio:\n${message.trim()}`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Hollow Gate <onboarding@resend.dev>",
      to: "alfonso.germano@gmail.com",
      subject: "Report Bug Hollow Gate VTT",
      text: emailText,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.log("Errore invio email via Resend:", errText);
    return c.json({ error: "Invio email fallito" }, 502);
  }

  return c.json({ success: true });
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
    await getAdminClient().from('campaign_members').upsert(
      { campaign_id: membership.campaignId, profile_id: userId, role: 'player' },
      { onConflict: 'campaign_id,profile_id' }
    );

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

app.post("/make-server-771c5bfd/characters/:id/assign-campaign", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const { campaignId, inviteCode } = await c.req.json();
    const admin = getAdminClient();

    const { data: character, error: charError } = await admin
      .from("characters")
      .select("id, campaign_id, owner_profile_id")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      return c.json({ error: "Personaggio non trovato" }, 404);
    }
    const isCharacterOwner = character.owner_profile_id === userId;
    if (!isCharacterOwner) {
      const myCampaignsForCheck: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
      const isGmHere = character.campaign_id && myCampaignsForCheck.some((camp) => camp.id === character.campaign_id);
      if (!isGmHere) {
        return c.json({ error: "Non hai i permessi su questo personaggio" }, 403);
      }
    }

    const oldCampaignId: string | null = character.campaign_id;
    let targetCampaignId: string | null = null;

    if (inviteCode) {
      const normalizedCode = String(inviteCode).trim().toUpperCase();
      const membership = await kv.get(inviteCodeKey(normalizedCode));
      if (!membership) {
        return c.json({ error: "Codice invito non valido" }, 404);
      }
      if (membership.ownerId === userId) {
        return c.json({ error: "Sei già il master di questa campagna" }, 400);
      }
      const ownerCampaigns = await kv.get(campaignsKey(membership.ownerId)) ?? [];
      const campaign = ownerCampaigns.find((cmp) => cmp.id === membership.campaignId);
      if (!campaign) {
        return c.json({ error: "Campagna non trovata" }, 404);
      }
      targetCampaignId = membership.campaignId;

      const members = await kv.get(campaignMembersKey(targetCampaignId)) ?? [];
      if (!members.some((m) => m.profileId === userId)) {
        members.push({ profileId: userId, role: "player", joinedAt: new Date().toISOString() });
        await kv.set(campaignMembersKey(targetCampaignId), members);
      }
      await getAdminClient().from('campaign_members').upsert(
        { campaign_id: targetCampaignId, profile_id: userId, role: 'player' },
        { onConflict: 'campaign_id,profile_id' }
      );
      const playerCampaigns = await kv.get(playerCampaignsKey(userId)) ?? [];
      if (!playerCampaigns.some((pc) => pc.campaignId === targetCampaignId)) {
        playerCampaigns.push({ campaignId: targetCampaignId, ownerId: membership.ownerId });
        await kv.set(playerCampaignsKey(userId), playerCampaigns);
      }
    } else if (campaignId) {
      const myCampaigns = await kv.get(campaignsKey(userId)) ?? [];
      const myJoined = await kv.get(playerCampaignsKey(userId)) ?? [];
      const isOwned = myCampaigns.some((cmp) => cmp.id === campaignId);
      const isJoined = myJoined.some((pc) => pc.campaignId === campaignId);
      if (!isOwned && !isJoined) {
        return c.json({ error: "Non hai accesso a questa campagna" }, 403);
      }
      targetCampaignId = campaignId;
    }

    const { error: updateError } = await admin
      .from("characters")
      .update({ campaign_id: targetCampaignId })
      .eq("id", characterId);
    if (updateError) {
      console.log("Errore update campaign_id:", updateError);
      return c.json({ error: "Errore aggiornamento personaggio" }, 500);
    }

    if (oldCampaignId && oldCampaignId !== targetCampaignId) {
      const { data: remaining } = await admin
        .from("characters")
        .select("id")
        .eq("campaign_id", oldCampaignId)
        .eq("owner_profile_id", userId)
        .eq("status", "active")
        .neq("id", characterId);

      if (!remaining || remaining.length === 0) {
        const oldMembers = await kv.get(campaignMembersKey(oldCampaignId)) ?? [];
        await kv.set(campaignMembersKey(oldCampaignId), oldMembers.filter((m) => m.profileId !== userId));
        await getAdminClient().from('campaign_members').delete()
          .eq('campaign_id', oldCampaignId)
          .eq('profile_id', userId);

        const oldPlayerCampaigns = await kv.get(playerCampaignsKey(userId)) ?? [];
        await kv.set(playerCampaignsKey(userId), oldPlayerCampaigns.filter((pc) => pc.campaignId !== oldCampaignId));
      }
    }

    return c.json({ success: true, campaignId: targetCampaignId });
  } catch (err) {
    console.log("Errore POST characters/:id/assign-campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/characters/:id/copy-to-campaign", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const { campaignId } = await c.req.json();
    if (!campaignId) return c.json({ error: "campaignId obbligatorio" }, 400);

    const admin = getAdminClient();
    const { data: original, error: fetchError } = await admin
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .single();

    if (fetchError || !original) {
      return c.json({ error: "Personaggio non trovato" }, 404);
    }

    const isOwnerOfCharacter = original.owner_profile_id === userId;
    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const isGmOfOriginCampaign = myCampaigns.some((camp) => camp.id === original.campaign_id);
    if (!isOwnerOfCharacter && !isGmOfOriginCampaign) {
      return c.json({ error: "Non hai i permessi per copiare questo personaggio" }, 403);
    }

    const isGmOfTargetCampaign = myCampaigns.some((camp) => camp.id === campaignId);
    const myJoined = await kv.get(playerCampaignsKey(userId)) ?? [];
    const isMemberOfTarget = myJoined.some((pc) => pc.campaignId === campaignId);
    if (!isGmOfTargetCampaign && !isMemberOfTarget) {
      return c.json({ error: "Non hai accesso alla campagna di destinazione" }, 403);
    }

    const { id, created_at, updated_at, ...rest } = original;
    const { data: copy, error: insertError } = await admin
      .from("characters")
      .insert({
        ...rest,
        campaign_id: campaignId,
      })
      .select("*")
      .single();

    if (insertError) {
      console.log("Errore copia personaggio:", insertError);
      return c.json({ error: "Errore durante la copia" }, 500);
    }

    return c.json({ character: copy });
  } catch (err) {
    console.log("Errore POST characters/:id/copy-to-campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// Verifica se l'utente può leggere/scrivere le note di una data entità
async function canAccessEntityNotes(
  admin: any, userId: string, campaignId: string, entityType: string, entityId: string
): Promise<boolean> {
  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const isGm = myCampaigns.some((camp) => camp.id === campaignId);
  if (isGm) return true;
  if (entityType !== 'character') return false; // PNG/Mostro: solo GM
  const { data: character } = await admin
    .from('characters')
    .select('owner_profile_id')
    .eq('id', entityId)
    .single();
  return !!character && character.owner_profile_id === userId;
}

app.get("/make-server-771c5bfd/campaigns/:campaignId/notes", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const entityType = c.req.query("entityType");
    const entityId = c.req.query("entityId");
    if (!entityType || !entityId) return c.json({ error: "entityType e entityId obbligatori" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessEntityNotes(admin, userId, campaignId, entityType, entityId);
    if (!allowed) return c.json({ error: "Non hai accesso alle note di questa scheda" }, 403);

    const { data, error } = await admin
      .from('entity_notes')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('position', { ascending: true });

    if (error) return c.json({ error: "Errore lettura note" }, 500);
    return c.json({ notes: data ?? [] });
  } catch (err) {
    console.log("Errore GET notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/campaigns/:campaignId/notes", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const { entityType, entityId, tabName } = await c.req.json();
    if (!entityType || !entityId || !tabName) return c.json({ error: "Campi obbligatori mancanti" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessEntityNotes(admin, userId, campaignId, entityType, entityId);
    if (!allowed) return c.json({ error: "Non hai accesso alle note di questa scheda" }, 403);

    const { count } = await admin
      .from('entity_notes')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    const { data, error } = await admin
      .from('entity_notes')
      .insert({ campaign_id: campaignId, entity_type: entityType, entity_id: entityId, tab_name: tabName, position: count ?? 0 })
      .select('*')
      .single();

    if (error) return c.json({ error: "Errore creazione tab" }, 500);
    return c.json({ note: data });
  } catch (err) {
    console.log("Errore POST notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.put("/make-server-771c5bfd/notes/:noteId", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const noteId = c.req.param("noteId");
    const { tabName, content, position, hidden } = await c.req.json();

    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('entity_notes')
      .select('*')
      .eq('id', noteId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Tab non trovata" }, 404);

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id);
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof tabName === 'string') patch.tab_name = tabName;
    if (typeof content === 'string') patch.content = content;
    if (typeof position === 'number') patch.position = position;
    if (typeof hidden === 'boolean') patch.hidden = hidden;

    const { data, error } = await admin
      .from('entity_notes')
      .update(patch)
      .eq('id', noteId)
      .select('*')
      .single();

    if (error) return c.json({ error: "Errore aggiornamento tab" }, 500);
    return c.json({ note: data });
  } catch (err) {
    console.log("Errore PUT notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.delete("/make-server-771c5bfd/notes/:noteId", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const noteId = c.req.param("noteId");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('entity_notes')
      .select('*')
      .eq('id', noteId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Tab non trovata" }, 404);

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id);
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    const { error } = await admin.from('entity_notes').delete().eq('id', noteId);
    if (error) return c.json({ error: "Errore eliminazione tab" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/campaigns/:id/remove-player", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const { playerProfileId } = await c.req.json();
    if (!playerProfileId) return c.json({ error: "playerProfileId obbligatorio" }, 400);

    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const isGm = myCampaigns.some((camp) => camp.id === campaignId);
    if (!isGm) {
      return c.json({ error: "Solo il proprietario della campagna può rimuovere un giocatore" }, 403);
    }

    const admin = getAdminClient();

    // Svincola tutti i personaggi del giocatore in questa campagna
    await admin
      .from("characters")
      .update({ campaign_id: null })
      .eq("campaign_id", campaignId)
      .eq("owner_profile_id", playerProfileId);

    // Revoca l'appartenenza dal KV (campagna) e dal profilo del giocatore
    const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
    await kv.set(campaignMembersKey(campaignId), members.filter((m: any) => m.profileId !== playerProfileId));

    const playerCampaigns = await kv.get(playerCampaignsKey(playerProfileId)) ?? [];
    await kv.set(playerCampaignsKey(playerProfileId), playerCampaigns.filter((pc: any) => pc.campaignId !== campaignId));

    // Revoca anche su Postgres (per Presence/RLS)
    await admin.from('campaign_members').delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', playerProfileId);

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST campaigns/:id/remove-player:", err);
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

// ─── Campaigns: Overview (campagne proprie con conteggio giocatori + personaggi) ───

app.get("/make-server-771c5bfd/campaigns/overview", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Non autorizzato" }, 401);
  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Token non valido" }, 401);

  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const admin = getAdminClient();

  const enriched = await Promise.all(
    myCampaigns.map(async (camp) => {
      const members = await kv.get(campaignMembersKey(camp.id)) ?? [];
      const { data: chars } = await admin
        .from("characters")
        .select("id, name")
        .eq("campaign_id", camp.id)
        .eq("status", "active");
      return {
        ...camp,
        memberCount: members.length,
        characters: (chars ?? []).map((ch: any) => ({ id: ch.id, name: ch.name })),
      };
    })
  );

  return c.json({ campaigns: enriched });
});

// ─── Campaigns: Members (solo per il proprietario) ──────────────────────────

app.get("/make-server-771c5bfd/campaigns/:id/members", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const owns = myCampaigns.some((camp) => camp.id === campaignId);
    if (!owns) {
      return c.json({ error: "Campagna non trovata o non sei il proprietario" }, 404);
    }

    const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
    return c.json({ members });
  } catch (err) {
    console.log("Errore GET campaigns/:id/members:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.get("/make-server-771c5bfd/campaigns/:id/characters", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Non autorizzato" }, 401);
  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Token non valido" }, 401);

  const campaignId = c.req.param("id");

  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const isOwner = myCampaigns.some((camp) => camp.id === campaignId);

  if (!isOwner) {
    const myJoined = await kv.get(playerCampaignsKey(userId)) ?? [];
    const isMember = myJoined.some((pc) => pc.campaignId === campaignId);
    if (!isMember) {
      return c.json({ error: "Non hai accesso a questa campagna" }, 403);
    }
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("characters")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.log("Errore lettura personaggi campagna:", error);
    return c.json({ error: "Errore lettura personaggi" }, 500);
  }

  const rows = data ?? [];
  const ownerIds = Array.from(new Set(rows.map((r: any) => r.owner_profile_id).filter(Boolean)));

  let displayNameById: Record<string, string> = {};
  let avatarUrlById: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ownerIds);
    displayNameById = Object.fromEntries(
      (profiles ?? []).map((p: any) => [p.id, p.display_name])
    );
    avatarUrlById = Object.fromEntries(
      (profiles ?? []).map((p: any) => [p.id, p.avatar_url])
    );
  }

  const enrichedRows = rows.map((r: any) => ({
    ...r,
    owner_display_name: displayNameById[r.owner_profile_id] ?? null,
    owner_avatar_url: avatarUrlById[r.owner_profile_id] ?? null,
  }));

  return c.json({ characters: enrichedRows });
});

app.put("/make-server-771c5bfd/campaigns/:id/characters/:characterId", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Non autorizzato" }, 401);
  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Token non valido" }, 401);

  const campaignId = c.req.param("id");
  const characterId = c.req.param("characterId");

  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const isOwner = myCampaigns.some((camp) => camp.id === campaignId);
  if (!isOwner) {
    return c.json({ error: "Solo il proprietario della campagna può modificare i personaggi altrui" }, 403);
  }

  const admin = getAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("characters")
    .select("owner_profile_id, campaign_id")
    .eq("id", characterId)
    .single();

  if (fetchError || !existing) {
    return c.json({ error: "Personaggio non trovato" }, 404);
  }
  if (existing.campaign_id !== campaignId) {
    return c.json({ error: "Il personaggio non appartiene a questa campagna" }, 400);
  }

  const { sheetData, name, style, viaggio, portraitUrl, backgroundUrl } = await c.req.json();

  const { error: updateError } = await admin
    .from("characters")
    .update({
      name,
      style,
      viaggio,
      portrait_url: portraitUrl ?? null,
      background_url: backgroundUrl ?? null,
      sheet_data: sheetData,
    })
    .eq("id", characterId);

  if (updateError) {
    console.log("Errore update personaggio (GM):", updateError);
    return c.json({ error: "Errore aggiornamento personaggio" }, 500);
  }

  return c.json({ success: true });
});

app.delete("/make-server-771c5bfd/campaigns/:id/characters/:characterId", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return c.json({ error: "Non autorizzato" }, 401);
  const userId = await getUserIdFromToken(token);
  if (!userId) return c.json({ error: "Token non valido" }, 401);

  const campaignId = c.req.param("id");
  const characterId = c.req.param("characterId");

  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const isOwner = myCampaigns.some((camp) => camp.id === campaignId);
  if (!isOwner) {
    return c.json({ error: "Solo il proprietario della campagna può eliminare i personaggi altrui" }, 403);
  }

  const admin = getAdminClient();
  const { data: existing } = await admin
    .from("characters")
    .select("campaign_id")
    .eq("id", characterId)
    .single();

  if (!existing || existing.campaign_id !== campaignId) {
    return c.json({ error: "Personaggio non trovato in questa campagna" }, 404);
  }

  const { error: deleteError } = await admin
    .from("characters")
    .delete()
    .eq("id", characterId);

  if (deleteError) {
    console.log("Errore eliminazione personaggio (GM):", deleteError);
    return c.json({ error: "Errore eliminazione personaggio" }, 500);
  }

  return c.json({ success: true });
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
  logoUrl?: string;
  sessionActive?: boolean;
  sessionActivatedAt?: string;
}

interface CampaignMembership {
  campaignId: string;
  ownerId: string;
}

Deno.serve(app.fetch);
