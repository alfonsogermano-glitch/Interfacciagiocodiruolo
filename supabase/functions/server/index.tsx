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

// Usato sia dalla guardia sul cambio ruleset (PUT /campaigns/:id) sia
// dall'endpoint GET .../entity-counts sotto, cosi' la UI puo' disabilitare
// il selettore ruleset senza duplicare la query. Solo conteggi (head: true),
// nessuna riga scaricata. Stesso filtro status:"active" gia' usato in
// GET /campaigns/:id/characters per le characters (soft-delete); npcs e
// monsters non hanno quel concetto, nessun filtro extra li'.
async function getCampaignEntityCounts(campaignId: string) {
  const admin = getAdminClient();
  const [chars, npcs, monsters] = await Promise.all([
    admin.from("characters").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId).eq("status", "active"),
    admin.from("npcs").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId),
    admin.from("monsters").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId),
  ]);
  return {
    characters: chars.count ?? 0,
    npcs: npcs.count ?? 0,
    monsters: monsters.count ?? 0,
  };
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

// Stesse regole di src/lib/validateDisplayName.ts, duplicate qui perché
// l'edge function gira su Deno e non condivide il bundle con il client.
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 32;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;

function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function validateDisplayName(raw: string): string | null {
  const name = normalizeDisplayName(raw);
  if (name.length < DISPLAY_NAME_MIN) return `Il nome deve avere almeno ${DISPLAY_NAME_MIN} caratteri.`;
  if (name.length > DISPLAY_NAME_MAX) return `Il nome non può superare i ${DISPLAY_NAME_MAX} caratteri.`;
  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return "Il nome può contenere solo lettere, numeri, spazi e - _ . '";
  }
  return null;
}

async function findProfileByDisplayName(
  admin: ReturnType<typeof getAdminClient>, name: string
): Promise<{ id: string; display_name: string } | null> {
  // Escape dei caratteri jolly di ILIKE (% e _) per un confronto case-insensitive esatto
  const escaped = name.replace(/[%_]/g, (ch) => `\\${ch}`);
  const { data } = await admin
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", escaped)
    .maybeSingle();
  return data ?? null;
}

async function isDisplayNameTaken(admin: ReturnType<typeof getAdminClient>, name: string): Promise<boolean> {
  return !!(await findProfileByDisplayName(admin, name));
}

// Inserisce una notifica per il destinatario e prova a inviarla via
// Broadcast sul canale profile:{recipientProfileId} (senza mai sottoscrivere
// il canale: usa il fallback HTTP di realtime-js pensato per l'invio
// server-side). Se il broadcast fallisce non è fatale: la riga esiste
// comunque e il client la vede al prossimo GET /notifications.
//
// { config: { private: true } } è OBBLIGATORIO qui, non solo lato client:
// realtime-js include private:this.private nel body del POST REST di
// fallback (RealtimeChannel.send, ramo "canPush() === false"). Senza
// questa config il canale server-side ha private=false di default e il
// messaggio viene pubblicato come broadcast pubblico - il client, che
// sottoscrive lo stesso topic in modalità privata (config.private=true),
// non lo riceve mai. send() inoltre non lancia mai su fallimento REST
// (ritorna la stringa 'error'), quindi va controllato esplicitamente:
// verificato dal vivo con script E2E, non solo per lettura del sorgente.
async function createNotification(
  admin: ReturnType<typeof getAdminClient>,
  recipientProfileId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<any> {
  const { data: row, error } = await admin
    .from("notifications")
    .insert({ recipient_profile_id: recipientProfileId, type, data })
    .select("*")
    .single();
  if (error) throw error;

  try {
    const result = await admin
      .channel(`profile:${recipientProfileId}`, { config: { private: true } })
      .send({ type: "broadcast", event: "notification", payload: { notification: row } });
    if (result !== "ok") {
      console.log("Broadcast notifica non consegnato (riga comunque creata):", result);
    }
  } catch (err) {
    console.log("Errore broadcast notifica (riga comunque creata):", err);
  }
  return row;
}

// Avvisa chi ha CampaignHome.tsx aperto su questa campagna che il roster
// membri è cambiato (join, accept invito, rimozione), cosi' la sezione
// Players/PG si aggiorna senza reload. { config: { private: true } }
// obbligatorio qui: senza, il messaggio parte pubblico mentre il client
// sottoscrive lo stesso topic in modalità privata e non lo riceve mai
// (stesso bug già trovato e corretto per il canale profile:{userId}).
async function broadcastCampaignMembersChange(
  admin: ReturnType<typeof getAdminClient>,
  campaignId: string,
): Promise<void> {
  try {
    const result = await admin
      .channel(`campaign:${campaignId}`, { config: { private: true } })
      .send({ type: "broadcast", event: "members_change", payload: {} });
    if (result !== "ok") {
      console.log("Broadcast members_change non consegnato:", result);
    }
  } catch (err) {
    console.log("Errore broadcast members_change:", err);
  }
}

// Aggiunge un giocatore a una campagna: mirror KV + tabella Postgres reale.
// Estratta qui perché usata da /campaigns/join, /characters/:id/assign-campaign
// e ora anche dall'accept di un invito per nome (supabase/functions/server -
// prima era duplicata due volte inline, una terza copia non conveniva più).
async function addPlayerToCampaign(
  admin: ReturnType<typeof getAdminClient>,
  campaignId: string,
  ownerId: string,
  profileId: string,
): Promise<void> {
  const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
  if (!members.some((m: any) => m.profileId === profileId)) {
    members.push({ profileId, role: "player", joinedAt: new Date().toISOString() });
    await kv.set(campaignMembersKey(campaignId), members);
  }
  await admin.from('campaign_members').upsert(
    { campaign_id: campaignId, profile_id: profileId, role: 'player' },
    { onConflict: 'campaign_id,profile_id' }
  );
  const playerCampaigns = await kv.get(playerCampaignsKey(profileId)) ?? [];
  if (!playerCampaigns.some((pc: any) => pc.campaignId === campaignId)) {
    playerCampaigns.push({ campaignId, ownerId });
    await kv.set(playerCampaignsKey(profileId), playerCampaigns);
  }
  await broadcastCampaignMembersChange(admin, campaignId);
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

    const admin = getAdminClient();
    const trimmedInput = typeof displayName === "string" ? normalizeDisplayName(displayName) : "";
    let finalDisplayName: string;

    if (trimmedInput) {
      // Nome scelto esplicitamente dall'utente: validato e deve essere libero,
      // altrimenti l'utente sceglie di persona un nome diverso.
      const nameError = validateDisplayName(trimmedInput);
      if (nameError) return c.json({ error: nameError }, 400);

      if (await isDisplayNameTaken(admin, trimmedInput)) {
        return c.json({ error: "Questo nome è già in uso, scegline un altro." }, 409);
      }
      finalDisplayName = trimmedInput;
    } else {
      // Nome non scelto dall'utente (campo opzionale lasciato vuoto): fallback
      // dalla email, con suffisso numerico se il default risulta già occupato -
      // qui si risolve automaticamente invece di far fallire la registrazione
      // per un nome che l'utente non ha scelto.
      const base = email.split("@")[0];
      finalDisplayName = base;
      for (let attempt = 0; attempt < 20 && (await isDisplayNameTaken(admin, finalDisplayName)); attempt++) {
        finalDisplayName = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      user_metadata: { display_name: finalDisplayName },
      email_confirm: true,
    });

    if (error) {
      console.log("Errore signup:", error.message);
      // Fallback anti race-condition: se due signup concorrenti passano
      // entrambi il pre-check, l'indice unico su profiles lo intercetta qui.
      if (error.message?.includes("profiles_display_name_unique_ci")) {
        return c.json({ error: "Questo nome è già in uso, scegline un altro." }, 409);
      }
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

    // Blocco reale (non solo un avviso in UI): un cambio di ruleset lascia
    // orfani i campi specifici del vecchio sistema su PG/PNG/Mostri gia'
    // assegnati (es. Audacia/Prodigi/Follia di HSC), che spariscono dalla
    // UI senza alcun avviso al GM. Controllato qui, non solo lato client,
    // perche' la PUT fa un merge generico senza altre validazioni - questo
    // e' l'unico punto che nessun client puo' aggirare.
    if (patch.ruleset && patch.ruleset !== campaigns[index].ruleset) {
      const counts = await getCampaignEntityCounts(campaignId);
      if (counts.characters + counts.npcs + counts.monsters > 0) {
        return c.json({
          error: "Non puoi cambiare il set di regole di una campagna che contiene già personaggi, PNG o mostri.",
        }, 409);
      }
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

// ─── Campaigns: Entity counts (solo per il proprietario) ────────────────────
// Usato dal form "Impostazioni Campagna" per disabilitare il selettore
// ruleset quando la campagna non e' vuota - il vero blocco resta comunque
// la guardia sopra nella PUT, questo endpoint serve solo a evitare il
// tentativo lato UI.
app.get("/make-server-771c5bfd/campaigns/:id/entity-counts", async (c) => {
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

    const counts = await getCampaignEntityCounts(campaignId);
    return c.json(counts);
  } catch (err) {
    console.log("Errore GET campaigns/:id/entity-counts:", err);
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

// ─── Campaigns: Invite by exact display name ───────────────────────────────

app.post("/make-server-771c5bfd/campaigns/:id/invite-by-name", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const { displayName } = await c.req.json();
    const trimmedName = typeof displayName === "string" ? normalizeDisplayName(displayName) : "";
    if (!trimmedName) return c.json({ error: "Il nome è obbligatorio" }, 400);

    const campaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const campaign = campaigns.find((cmp) => cmp.id === campaignId);
    if (!campaign) {
      return c.json({ error: "Campagna non trovata o non sei il proprietario" }, 404);
    }

    const admin = getAdminClient();
    const found = await findProfileByDisplayName(admin, trimmedName);
    if (!found) return c.json({ error: "Nessun utente trovato con questo nome" }, 404);
    if (found.id === userId) return c.json({ error: "Non puoi invitare te stesso" }, 400);

    const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
    if (members.some((m: any) => m.profileId === found.id)) {
      return c.json({ error: "Questo utente è già un membro della campagna" }, 409);
    }

    const { data: pending } = await admin
      .from("notifications")
      .select("id")
      .eq("recipient_profile_id", found.id)
      .eq("type", "campaign_invite")
      .contains("data", { campaignId, status: "pending" })
      .maybeSingle();
    if (pending) return c.json({ error: "Invito già inviato, in attesa di risposta" }, 409);

    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    await createNotification(admin, found.id, "campaign_invite", {
      campaignId,
      campaignName: campaign.name,
      // Il client ne ha bisogno per proporre solo PG compatibili PRIMA di
      // accettare (vedi TopBar.tsx) - scritto qui perche' 'campaign' e' gia'
      // in scope, evita un'altra chiamata di rete solo per il ruleset.
      campaignRuleset: campaign.ruleset ?? null,
      inviterProfileId: userId,
      inviterDisplayName: inviterProfile?.display_name ?? "Un Game Master",
      status: "pending",
    });

    return c.json({ success: true }, 201);
  } catch (err) {
    console.log("Errore POST campaigns/:id/invite-by-name:", err);
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

    await addPlayerToCampaign(getAdminClient(), membership.campaignId, membership.ownerId, userId);

    return c.json({ campaign });
  } catch (err) {
    console.log("Errore POST campaigns/join:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// Risolve un codice invito in {campaignId, campaignName, ruleset} SENZA
// alcun effetto collaterale (nessuna addPlayerToCampaign) - usato dal
// client per sapere il ruleset della campagna PRIMA di completare la join,
// cosi' puo' far scegliere un personaggio compatibile o bloccare del tutto
// se non ce n'e' nessuno, invece di unirsi e basta come fa /campaigns/join
// sopra. Stessa identica validazione di /campaigns/join, solo senza la
// chiamata finale ad addPlayerToCampaign.
app.get("/make-server-771c5bfd/campaigns/invite-preview", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);

    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const normalizedCode = String(c.req.query("code") ?? "").trim().toUpperCase();
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

    return c.json({ campaignId: campaign.id, campaignName: campaign.name, ruleset: campaign.ruleset ?? null });
  } catch (err) {
    console.log("Errore GET campaigns/invite-preview:", err);
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
      .select("id, campaign_id, owner_profile_id, ruleset")
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
    let targetCampaignRuleset: string | null = null;

    if (inviteCode) {
      const normalizedCode = String(inviteCode).trim().toUpperCase();
      const membership = await kv.get(inviteCodeKey(normalizedCode));
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
      targetCampaignId = membership.campaignId;
      targetCampaignRuleset = campaign.ruleset ?? null;

      // Validazione compatibilita' ruleset PRIMA di iscrivere il giocatore
      // alla campagna: un'entita' senza ruleset (dato storico) e' un jolly
      // compatibile con tutto (stessa logica di isRulesetCompatible in
      // src/app/campaigns/campaignTypes.ts, duplicata qui perche' questa
      // edge function Deno non puo' importare da src/).
      if (character.ruleset && targetCampaignRuleset && character.ruleset !== targetCampaignRuleset) {
        return c.json({ error: "Ruleset incompatibile con questa campagna" }, 400);
      }

      await addPlayerToCampaign(admin, targetCampaignId, membership.ownerId, userId);
    } else if (campaignId) {
      const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
      const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
      const ownedMatch = myCampaigns.find((cmp) => cmp.id === campaignId);
      const joinedMatch = myJoined.find((pc) => pc.campaignId === campaignId);
      if (!ownedMatch && !joinedMatch) {
        return c.json({ error: "Non hai accesso a questa campagna" }, 403);
      }
      targetCampaignId = campaignId;
      if (ownedMatch) {
        targetCampaignRuleset = ownedMatch.ruleset ?? null;
      } else if (joinedMatch) {
        const ownerCampaigns: Campaign[] = await kv.get(campaignsKey(joinedMatch.ownerId)) ?? [];
        targetCampaignRuleset = ownerCampaigns.find((cmp) => cmp.id === campaignId)?.ruleset ?? null;
      }

      if (character.ruleset && targetCampaignRuleset && character.ruleset !== targetCampaignRuleset) {
        return c.json({ error: "Ruleset incompatibile con questa campagna" }, 400);
      }
    }

    const { error: updateError } = await admin
      .from("characters")
      .update({
        campaign_id: targetCampaignId,
        // Se il personaggio non aveva ancora un ruleset (dato storico), lo
        // eredita ora dalla campagna a cui viene assegnato invece di
        // restare NULL.
        ...(targetCampaignId && targetCampaignRuleset && !character.ruleset ? { ruleset: targetCampaignRuleset } : {})
      })
      .eq("id", characterId);
    if (updateError) {
      console.log("Errore update campaign_id:", updateError);
      return c.json({ error: "Errore aggiornamento personaggio" }, 500);
    }

    // Ramo campaignId (nessun inviteCode): il giocatore era già membro, qui
    // cambia solo quale PG è assegnato. addPlayerToCampaign (ramo inviteCode
    // sopra) ha già il suo broadcast - qui serve esplicitamente perché questo
    // ramo non passa da addPlayerToCampaign.
    if (!inviteCode && targetCampaignId) {
      await broadcastCampaignMembersChange(admin, targetCampaignId);
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

        // "Leave" implicito: l'ultimo PG attivo del giocatore ha lasciato la
        // vecchia campagna, quindi non è più membro - il GM lì (se ha
        // CampaignHome aperto) deve vederlo sparire dalla griglia.
        await broadcastCampaignMembersChange(admin, oldCampaignId);
      }
    }

    return c.json({ success: true, campaignId: targetCampaignId });
  } catch (err) {
    console.log("Errore POST characters/:id/assign-campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// "Precompilati": il giocatore richiede un PG che il GM ha marcato
// available_for_players=true (setCharacterAvailableForPlayers lato client,
// diretto, non passa da qui - qui serve invece il client admin perche' il
// chiamante NON e' ancora il proprietario della riga, le RLS bloccherebbero
// un update diretto). Il vincolo "un solo PG attivo per campagna" e'
// applicato SOLO qui, non in assign-campaign sopra (vedi commento nel piano/
// memoria di progetto: assign-campaign e' un percorso ad alto traffico gia'
// delicato, non va esteso ora per un vincolo mai esistito finora).
app.post("/make-server-771c5bfd/characters/:id/claim", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const admin = getAdminClient();

    const { data: character, error: charError } = await admin
      .from("characters")
      .select("id, campaign_id, owner_profile_id, available_for_players, status")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      return c.json({ error: "Personaggio non trovato" }, 404);
    }
    if (!character.available_for_players) {
      return c.json({ error: "Questo personaggio non è più disponibile" }, 400);
    }
    if (!character.campaign_id) {
      return c.json({ error: "Questo personaggio non appartiene a una campagna" }, 400);
    }

    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
    const hasAccess = myCampaigns.some((cmp) => cmp.id === character.campaign_id)
      || myJoined.some((pc) => pc.campaignId === character.campaign_id);
    if (!hasAccess) {
      return c.json({ error: "Non hai accesso a questa campagna" }, 403);
    }

    // Un solo PG attivo per giocatore per campagna - bloccato con un errore
    // esplicito, nessuno scollegamento automatico del PG esistente (l'utente
    // deve rilasciarlo/scollegarlo lui stesso prima di richiederne un altro).
    const { data: existingActive } = await admin
      .from("characters")
      .select("id")
      .eq("campaign_id", character.campaign_id)
      .eq("owner_profile_id", userId)
      .eq("status", "active");
    if (existingActive && existingActive.length > 0) {
      return c.json({ error: "Hai già un personaggio in questa campagna" }, 409);
    }

    // Update atomico condizionato su available_for_players=true: se nel
    // frattempo un altro giocatore lo ha gia' richiesto, questa condizione
    // non trova piu' righe e data torna vuoto - race condition coperta senza
    // bisogno di una transazione esplicita.
    const { data: updated, error: updateError } = await admin
      .from("characters")
      .update({ owner_profile_id: userId, available_for_players: false })
      .eq("id", characterId)
      .eq("available_for_players", true)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.log("Errore update claim personaggio:", updateError);
      return c.json({ error: "Errore durante la richiesta" }, 500);
    }
    if (!updated) {
      return c.json({ error: "Questo personaggio è stato appena richiesto da un altro giocatore" }, 409);
    }

    return c.json({ success: true, campaignId: character.campaign_id });
  } catch (err) {
    console.log("Errore POST characters/:id/claim:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// Il giocatore restituisce al GM un PG precompilato che aveva richiesto:
// nessuna cancellazione, solo owner_profile_id che torna al GM della
// campagna e available_for_players che torna true. Stesso "leave implicito"
// gia' visto in assign-campaign se questo era l'ultimo PG attivo del
// giocatore in quella campagna.
app.post("/make-server-771c5bfd/characters/:id/release", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const admin = getAdminClient();

    const { data: character, error: charError } = await admin
      .from("characters")
      .select("id, campaign_id, owner_profile_id, claimable_origin")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      return c.json({ error: "Personaggio non trovato" }, 404);
    }
    if (character.owner_profile_id !== userId) {
      return c.json({ error: "Non hai i permessi su questo personaggio" }, 403);
    }
    if (!character.claimable_origin) {
      return c.json({ error: "Questo personaggio non può essere rilasciato" }, 400);
    }
    if (!character.campaign_id) {
      return c.json({ error: "Questo personaggio non appartiene a una campagna" }, 400);
    }

    const { data: campaignRow, error: campaignError } = await admin
      .from("campaigns")
      .select("owner_profile_id")
      .eq("id", character.campaign_id)
      .single();
    if (campaignError || !campaignRow) {
      return c.json({ error: "Campagna non trovata" }, 404);
    }

    const { data: updated, error: updateError } = await admin
      .from("characters")
      .update({ owner_profile_id: campaignRow.owner_profile_id, available_for_players: true })
      .eq("id", characterId)
      .eq("owner_profile_id", userId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.log("Errore update rilascio personaggio:", updateError);
      return c.json({ error: "Errore durante il rilascio" }, 500);
    }
    if (!updated) {
      return c.json({ error: "Questo personaggio non è più tuo" }, 409);
    }

    // "Leave" implicito: se questo era l'ultimo PG attivo del giocatore in
    // questa campagna, non ne e' piu' membro - stesso blocco di
    // assign-campaign sopra, stessa ragione.
    const { data: remaining } = await admin
      .from("characters")
      .select("id")
      .eq("campaign_id", character.campaign_id)
      .eq("owner_profile_id", userId)
      .eq("status", "active")
      .neq("id", characterId);

    if (!remaining || remaining.length === 0) {
      const members = await kv.get(campaignMembersKey(character.campaign_id)) ?? [];
      await kv.set(campaignMembersKey(character.campaign_id), members.filter((m) => m.profileId !== userId));
      await admin.from('campaign_members').delete()
        .eq('campaign_id', character.campaign_id)
        .eq('profile_id', userId);

      const playerCampaigns = await kv.get(playerCampaignsKey(userId)) ?? [];
      await kv.set(playerCampaignsKey(userId), playerCampaigns.filter((pc) => pc.campaignId !== character.campaign_id));

      await broadcastCampaignMembersChange(admin, character.campaign_id);
    }

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST characters/:id/release:", err);
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

    const targetOwnedCampaign = myCampaigns.find((camp) => camp.id === campaignId);
    const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
    const targetJoinedMembership = myJoined.find((pc) => pc.campaignId === campaignId);
    if (!targetOwnedCampaign && !targetJoinedMembership) {
      return c.json({ error: "Non hai accesso alla campagna di destinazione" }, 403);
    }

    // Validazione compatibilita' ruleset (stessa logica di isRulesetCompatible
    // in src/app/campaigns/campaignTypes.ts, duplicata qui perche' questa
    // edge function Deno non puo' importare da src/).
    let targetCampaignRuleset: string | null = targetOwnedCampaign?.ruleset ?? null;
    if (!targetCampaignRuleset && targetJoinedMembership) {
      const ownerCampaigns: Campaign[] = await kv.get(campaignsKey(targetJoinedMembership.ownerId)) ?? [];
      targetCampaignRuleset = ownerCampaigns.find((cmp) => cmp.id === campaignId)?.ruleset ?? null;
    }
    if (original.ruleset && targetCampaignRuleset && original.ruleset !== targetCampaignRuleset) {
      return c.json({ error: "Ruleset incompatibile con questa campagna" }, 400);
    }

    const { id, created_at, updated_at, ...rest } = original;
    const { data: copy, error: insertError } = await admin
      .from("characters")
      .insert({
        ...rest,
        campaign_id: campaignId,
        ruleset: original.ruleset ?? targetCampaignRuleset,
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

// Verifica se l'utente può leggere/scrivere le note di una data entità.
// mode='read' consente anche l'accesso di sola lettura di un membro campagna
// (usato oggi solo dal ramo 'campaign': le note di campagna sono scritte solo
// dal GM ma lette da tutti i membri, stesso principio delle tab "Segrete" a
// livello di singola tab per PG/PNG/Mostri).
async function canAccessEntityNotes(
  admin: any, userId: string, campaignId: string | null, entityType: string, entityId: string,
  mode: 'read' | 'write' = 'write'
): Promise<boolean> {
  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  const isGm = !!campaignId && myCampaigns.some((camp) => camp.id === campaignId);
  if (isGm) return true;
  if (entityType === 'campaign') {
    if (mode !== 'read') return false;
    const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
    return myJoined.some((pc) => pc.campaignId === campaignId);
  }
  if (entityType === 'character') {
    const { data: character } = await admin
      .from('characters')
      .select('owner_profile_id')
      .eq('id', entityId)
      .single();
    return !!character && character.owner_profile_id === userId;
  }
  // PNG/Mostro: il proprietario ha sempre accesso (es. cataloghi senza
  // campagna, dove non esiste un GM di riferimento); un giocatore (non GM,
  // non proprietario) può leggere le note solo se l'entità è stata resa
  // visibile ai giocatori.
  const table = entityType === 'npc' ? 'npcs' : entityType === 'monster' ? 'monsters' : null;
  if (!table) return false;
  const { data: entity } = await admin
    .from(table)
    .select('visible_to_players, owner_profile_id')
    .eq('id', entityId)
    .single();
  if (!entity) return false;
  return entity.owner_profile_id === userId || entity.visible_to_players === true;
}

// Il client valorizza :campaignId col template literal `${activeCampaignId}`:
// per un'entità senza campagna (es. catalogo PG/PNG/Mostri fuori sessione),
// activeCampaignId è null/undefined lato JS e finisce nel path come la
// stringa letterale "null"/"undefined". Qui la normalizziamo a un vero null,
// cosi' le query/insert sotto usano IS NULL invece di confrontare la colonna
// UUID con quella stringa (che altrimenti fa fallire la query).
function parseCampaignIdParam(raw: string | undefined): string | null {
  return raw && raw !== "null" && raw !== "undefined" ? raw : null;
}

app.get("/make-server-771c5bfd/campaigns/:campaignId/notes", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = parseCampaignIdParam(c.req.param("campaignId"));
    const entityType = c.req.query("entityType");
    const entityId = c.req.query("entityId");
    if (!entityType || !entityId) return c.json({ error: "entityType e entityId obbligatori" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessEntityNotes(admin, userId, campaignId, entityType, entityId, 'read');
    if (!allowed) return c.json({ error: "Non hai accesso alle note di questa scheda" }, 403);

    let query = admin
      .from('entity_notes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('position', { ascending: true });
    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null);

    const { data, error } = await query;

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

    const campaignId = parseCampaignIdParam(c.req.param("campaignId"));
    const { entityType, entityId, tabName } = await c.req.json();
    if (!entityType || !entityId || !tabName) return c.json({ error: "Campi obbligatori mancanti" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessEntityNotes(admin, userId, campaignId, entityType, entityId, 'write');
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

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write');
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

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    const { error } = await admin.from('entity_notes').delete().eq('id', noteId);
    if (error) return c.json({ error: "Errore eliminazione tab" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Notifiche ──────────────────────────────────────────────────────────────

app.get("/make-server-771c5bfd/notifications", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("recipient_profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return c.json({ error: "Errore lettura notifiche" }, 500);
    return c.json({ notifications: data ?? [] });
  } catch (err) {
    console.log("Errore GET notifications:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/notifications/:id/read", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const notificationId = c.req.param("id");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from("notifications")
      .select("recipient_profile_id")
      .eq("id", notificationId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Notifica non trovata" }, 404);
    if (existing.recipient_profile_id !== userId) {
      return c.json({ error: "Non hai accesso a questa notifica" }, 403);
    }

    const { data, error } = await admin
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .select("*")
      .single();
    if (error) return c.json({ error: "Errore aggiornamento notifica" }, 500);
    return c.json({ notification: data });
  } catch (err) {
    console.log("Errore POST notifications/:id/read:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/notifications/read-all", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const admin = getAdminClient();
    const { error } = await admin
      .from("notifications")
      .update({ read: true })
      .eq("recipient_profile_id", userId)
      .eq("read", false);
    if (error) return c.json({ error: "Errore aggiornamento notifiche" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST notifications/read-all:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/notifications/:id/respond", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const notificationId = c.req.param("id");
    const { action } = await c.req.json();
    if (action !== "accept" && action !== "decline") {
      return c.json({ error: "Azione non valida" }, 400);
    }

    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from("notifications")
      .select("*")
      .eq("id", notificationId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Notifica non trovata" }, 404);
    if (existing.recipient_profile_id !== userId) {
      return c.json({ error: "Non hai accesso a questa notifica" }, 403);
    }
    if (existing.type !== "campaign_invite") {
      return c.json({ error: "Tipo di notifica non gestito da questo endpoint" }, 400);
    }
    if (existing.data?.status !== "pending") {
      return c.json({ error: "Invito già gestito" }, 409);
    }

    if (action === "decline") {
      const { data, error } = await admin
        .from("notifications")
        .update({ read: true, data: { ...existing.data, status: "declined" } })
        .eq("id", notificationId)
        .select("*")
        .single();
      if (error) return c.json({ error: "Errore aggiornamento notifica" }, 500);
      return c.json({ success: true, notification: data });
    }

    // accept
    const campaignId = existing.data.campaignId as string;
    const inviterProfileId = existing.data.inviterProfileId as string;
    const ownerCampaigns: Campaign[] = await kv.get(campaignsKey(inviterProfileId)) ?? [];
    const campaign = ownerCampaigns.find((cmp) => cmp.id === campaignId);
    if (!campaign) {
      return c.json({ error: "Campagna non trovata" }, 404);
    }

    await addPlayerToCampaign(admin, campaignId, inviterProfileId, userId);

    const { data, error } = await admin
      .from("notifications")
      .update({ read: true, data: { ...existing.data, status: "accepted" } })
      .eq("id", notificationId)
      .select("*")
      .single();
    if (error) return c.json({ error: "Errore aggiornamento notifica" }, 500);
    return c.json({ success: true, campaignId, notification: data });
  } catch (err) {
    console.log("Errore POST notifications/:id/respond:", err);
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

    await broadcastCampaignMembersChange(admin, campaignId);

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

      // Nomi dei membri (non solo il conteggio) per la card in CampaignsPage.tsx -
      // stesso pattern di join su profiles gia' usato in
      // GET /campaigns/:id/characters piu' sotto, qui applicato ai profileId
      // dei membri invece che ai proprietari dei personaggi (copre anche i
      // membri senza alcun PG, che altrimenti non comparirebbero da nessuna
      // parte sulla card).
      const memberProfileIds = Array.from(
        new Set(members.map((m: any) => m.profileId).filter(Boolean))
      );
      let memberDisplayNameById: Record<string, string> = {};
      if (memberProfileIds.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", memberProfileIds);
        memberDisplayNameById = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.id, p.display_name])
        );
      }
      const memberNames = members
        .map((m: any) => memberDisplayNameById[m.profileId])
        .filter(Boolean);

      return {
        ...camp,
        memberCount: members.length,
        memberNames,
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

// ─── Campaigns: Member names (proprietario o membro - solo nomi, per la card
// e per la sezione Players di CampaignHome) ─
//
// Endpoint volutamente minimo e separato da /members sopra (owner-only,
// dati completi per la futura pagina di gestione campagna): qui un membro
// puo' leggere solo profileId+displayName di se stesso e degli altri
// membri, nessun altro dato (ruolo, data di ingresso, ecc.) - copre anche
// i membri senza alcun PG, che /campaigns/:id/characters non può vedere.
// Il GM (owner) non e' mai in campaign_members (si unisce solo chi fa
// "join", non chi crea la campagna), quindi il suo nome va risolto a parte
// e restituito come campo separato, non dentro "members".
app.get("/make-server-771c5bfd/campaigns/:id/member-names", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    const isOwner = myCampaigns.some((camp) => camp.id === campaignId);

    let ownerId: string;
    if (isOwner) {
      ownerId = userId;
    } else {
      const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
      const membership = myJoined.find((pc) => pc.campaignId === campaignId);
      if (!membership) {
        return c.json({ error: "Non hai accesso a questa campagna" }, 403);
      }
      ownerId = membership.ownerId;
    }

    const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
    const profileIds = Array.from(
      new Set([...members.map((m: any) => m.profileId), ownerId].filter(Boolean))
    );

    let displayNameById: Record<string, string> = {};
    let avatarUrlById: Record<string, string> = {};
    if (profileIds.length > 0) {
      const admin = getAdminClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", profileIds);
      displayNameById = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, p.display_name])
      );
      avatarUrlById = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, p.avatar_url])
      );
    }

    const memberList = members
      .filter((m: any) => m.profileId)
      .map((m: any) => ({ profileId: m.profileId, displayName: displayNameById[m.profileId] ?? null, joinedAt: m.joinedAt ?? null }));

    return c.json({
      members: memberList,
      ownerDisplayName: displayNameById[ownerId] ?? null,
      ownerAvatarUrl: avatarUrlById[ownerId] ?? null,
    });
  } catch (err) {
    console.log("Errore GET campaigns/:id/member-names:", err);
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

  const {
    sheetData, name, style, viaggio, portraitUrl,
    portraitImageUrl, portraitSourceImageUrl, portraitCropArea,
    portraitFrameAssetId, portraitFrameRotationDegrees,
    portraitFrameOffsetX, portraitFrameOffsetY,
    portraitFrameScaleX, portraitFrameScaleY,
    coverImageUrl, coverImageScale, coverCrop, coverRotationDegrees,
    frameRotation, frameRotationDegrees,
    coverFrameOffsetX, coverFrameOffsetY,
    coverFrameScaleX, coverFrameScaleY, coverFrameAssetId,
    tokenColor, tokenBackgroundColor, tokenBorderStyle,
    tokenBorderThickness, tokenBorderLabel, tokenBorderVisible,
  } = await c.req.json();

  const { error: updateError } = await admin
    .from("characters")
    .update({
      name,
      style,
      viaggio,
      portrait_url: portraitUrl ?? null,
      portrait_image_url: portraitImageUrl ?? null,
      portrait_source_image_url: portraitSourceImageUrl ?? null,
      portrait_crop_area: portraitCropArea ?? null,
      portrait_frame_asset_id: portraitFrameAssetId ?? null,
      portrait_frame_rotation_degrees: portraitFrameRotationDegrees ?? 0,
      portrait_frame_offset_x: portraitFrameOffsetX ?? 0,
      portrait_frame_offset_y: portraitFrameOffsetY ?? 0,
      portrait_frame_scale_x: portraitFrameScaleX ?? 1,
      portrait_frame_scale_y: portraitFrameScaleY ?? 1,
      cover_image_url: coverImageUrl ?? null,
      cover_image_scale: coverImageScale ?? 1,
      cover_crop: coverCrop ?? null,
      cover_rotation_degrees: coverRotationDegrees ?? 0,
      frame_rotation: frameRotation ?? 0,
      frame_rotation_degrees: frameRotationDegrees ?? 0,
      cover_frame_offset_x: coverFrameOffsetX ?? 0,
      cover_frame_offset_y: coverFrameOffsetY ?? 0,
      cover_frame_scale_x: coverFrameScaleX ?? 1,
      cover_frame_scale_y: coverFrameScaleY ?? 1,
      cover_frame_asset_id: coverFrameAssetId ?? null,
      token_color: tokenColor ?? null,
      token_background_color: tokenBackgroundColor ?? null,
      token_border_style: tokenBorderStyle ?? null,
      token_border_thickness: tokenBorderThickness ?? null,
      token_border_label: tokenBorderLabel ?? null,
      token_border_visible: tokenBorderVisible ?? null,
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
