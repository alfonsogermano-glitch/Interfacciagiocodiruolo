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

// Come broadcastCampaignMembersChange, ma per quando un cambio di proprietà
// di un personaggio non ha (più) una campagna nota su cui appoggiarsi - vedi
// /characters/:id/release: se campaign_id è già null (PG rimosso dalla
// campagna prima del rilascio), non esiste un canale campaign:{id} valido
// su cui notificare. Riusa lo stesso canale privato profile:{userId} già
// usato da createNotification per le notifiche vere e proprie, ma con un
// evento leggero dedicato (nessuna riga in "notifications", solo un ping di
// refresh per chi ha MyCharactersPage.tsx aperta).
async function broadcastCharacterOwnerChange(
  admin: ReturnType<typeof getAdminClient>,
  profileId: string,
): Promise<void> {
  try {
    const result = await admin
      .channel(`profile:${profileId}`, { config: { private: true } })
      .send({ type: "broadcast", event: "character_owner_change", payload: {} });
    if (result !== "ok") {
      console.log("Broadcast character_owner_change non consegnato:", result);
    }
  } catch (err) {
    console.log("Errore broadcast character_owner_change:", err);
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

// "Leave" implicito: se characterOwnerId non ha più nessun PG attivo in
// campaignId (escluso excludeCharacterId, il PG appena spostato/eliminato/
// rilasciato), non è più membro di quella campagna - rimuove la membership
// da entrambe le fonti (KV + tabella Postgres) e da playerCampaigns.
// Estratta qui perché usata da /characters/:id/assign-campaign,
// /characters/:id/release e DELETE /characters/:id - prima era duplicata
// inline in ciascuno, con lo stesso bug in due punti: usava l'id di CHI
// CHIAMA l'endpoint invece di characterOwnerId (il vero proprietario del
// personaggio), quindi quando il GM rimuoveva il PG di un giocatore la
// query controllava i PG rimasti del GM, non quelli del giocatore, e la
// membership del giocatore non veniva mai ripulita. characterOwnerId deve
// sempre essere character.owner_profile_id, mai lo userId del chiamante.
// Ritorna true se la membership è stata rimossa - i chiamanti hanno
// semantiche di broadcast diverse (assign-campaign trasmette solo se
// rimossa, release/delete trasmettono sempre), quindi il broadcast resta a
// carico del chiamante, non di questa funzione.
async function leaveIfLastActiveCharacter(
  admin: ReturnType<typeof getAdminClient>,
  campaignId: string,
  characterOwnerId: string,
  excludeCharacterId: string,
): Promise<boolean> {
  const { data: remaining } = await admin
    .from("characters")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("owner_profile_id", characterOwnerId)
    .eq("status", "active")
    .neq("id", excludeCharacterId);

  if (remaining && remaining.length > 0) return false;

  const members = await kv.get(campaignMembersKey(campaignId)) ?? [];
  await kv.set(campaignMembersKey(campaignId), members.filter((m: any) => m.profileId !== characterOwnerId));
  await admin.from('campaign_members').delete()
    .eq('campaign_id', campaignId)
    .eq('profile_id', characterOwnerId);

  const playerCampaigns = await kv.get(playerCampaignsKey(characterOwnerId)) ?? [];
  await kv.set(playerCampaignsKey(characterOwnerId), playerCampaigns.filter((pc: any) => pc.campaignId !== campaignId));
  return true;
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

// PG "disponibili" (available_for_players=true) di una campagna - letto con
// client admin, non con select diretta del client come faceva prima
// loadAvailableCharactersInCampaigns: la RLS di characters
// (characters_select_own_or_member) filtra silenziosamente le righe di un
// proprietario diverso finche' il richiedente non e' gia' membro - ma chi
// chiama questo endpoint (HomeScreen.tsx/TopBar.tsx) non lo e' ancora per
// definizione, sta decidendo se unirsi. Autorizzato se gia' membro (per
// simmetria/riuso futuro), oppure se possiede un codice invito valido per
// QUESTA campagna, oppure se ha una notifica di invito per nome ancora
// pendente su questa campagna - nessuna delle due richiede membership
// preesistente, a differenza di /campaigns/:id/characters sopra (che per
// questo non e' riusabile qui).
app.get("/make-server-771c5bfd/campaigns/:id/available-characters", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("id");
    const admin = getAdminClient();

    let authorized = false;

    const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
    if (myCampaigns.some((cmp) => cmp.id === campaignId)) {
      authorized = true;
    } else {
      const myJoined = await kv.get(playerCampaignsKey(userId)) ?? [];
      if (myJoined.some((pc: any) => pc.campaignId === campaignId)) authorized = true;
    }

    if (!authorized) {
      const rawCode = c.req.query("code");
      if (rawCode) {
        const normalizedCode = String(rawCode).trim().toUpperCase();
        const membership: CampaignMembership | null = await kv.get(inviteCodeKey(normalizedCode));
        if (membership && membership.campaignId === campaignId) authorized = true;
      }
    }

    if (!authorized) {
      const { data: pending } = await admin
        .from("notifications")
        .select("id")
        .eq("recipient_profile_id", userId)
        .eq("type", "campaign_invite")
        .contains("data", { campaignId, status: "pending" })
        .maybeSingle();
      if (pending) authorized = true;
    }

    if (!authorized) {
      return c.json({ error: "Non hai accesso a questa campagna" }, 403);
    }

    const { data, error } = await admin
      .from("characters")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("available_for_players", true)
      .eq("status", "active");

    if (error) {
      console.log("Errore lettura personaggi disponibili:", error);
      return c.json({ error: "Errore lettura personaggi disponibili" }, 500);
    }

    return c.json({ characters: data ?? [] });
  } catch (err) {
    console.log("Errore GET campaigns/:id/available-characters:", err);
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
      // "Leave" implicito: se questo era l'ultimo PG attivo del PROPRIETARIO
      // del personaggio (character.owner_profile_id, non userId - chi chiama
      // questo endpoint puo' essere il GM che rimuove il PG di un giocatore,
      // vedi il commento su leaveIfLastActiveCharacter) nella vecchia
      // campagna, non ne e' piu' membro - il GM li' (se ha CampaignHome
      // aperto) deve vederlo sparire dalla griglia.
      const removed = await leaveIfLastActiveCharacter(admin, oldCampaignId, character.owner_profile_id, characterId);
      if (removed) {
        await broadcastCampaignMembersChange(admin, oldCampaignId);
      }
    }

    return c.json({ success: true, campaignId: targetCampaignId });
  } catch (err) {
    console.log("Errore POST characters/:id/assign-campaign:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// GM marca/smarca un proprio PG come "disponibile per i giocatori"
// ("Precompilati"). Passa dal server (non piu' scrittura diretta del client
// come in origine) per due motivi, non solo uno: 1) e' l'unica azione
// rimasta in tutto l'app che cambia stato visibile ad altri senza poter
// chiamare broadcastCampaignMembersChange, quindi nessun realtime per chi
// ha MyCharactersPage.tsx aperta finche' non ricarica; 2) la RLS che
// autorizzava lo scrivere diretto controllava solo owner_profile_id, non
// "sei il GM della campagna di questo PG" - un giocatore che ha claimato un
// precompilato ne e' owner_profile_id, quindi poteva (bypassando la UI, che
// nasconde solo la voce di menu) riattivarne la disponibilita' e farselo
// reclamare da un altro giocatore. Qui il controllo e' reale, non solo lato
// client.
app.post("/make-server-771c5bfd/characters/:id/availability", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const { available } = await c.req.json();
    const admin = getAdminClient();

    const { data: character, error: charError } = await admin
      .from("characters")
      .select("id, campaign_id, owner_profile_id")
      .eq("id", characterId)
      .single();
    if (charError || !character) return c.json({ error: "Personaggio non trovato" }, 404);
    if (!character.campaign_id) {
      return c.json({ error: "Questo personaggio non appartiene a una campagna" }, 400);
    }

    const { data: campaignRow, error: campaignError } = await admin
      .from("campaigns")
      .select("owner_profile_id")
      .eq("id", character.campaign_id)
      .single();
    if (campaignError || !campaignRow) return c.json({ error: "Campagna non trovata" }, 404);
    if (campaignRow.owner_profile_id !== userId) {
      return c.json({ error: "Non hai i permessi su questo personaggio" }, 403);
    }
    // Non basta essere il GM della campagna: il PG deve anche essere
    // ancora del GM stesso (un GM che chiama questo endpoint su un PG gia'
    // posseduto da un giocatore potrebbe altrimenti marcarlo disponibile e
    // farlo reclamare da un altro giocatore senza consenso - stessa classe
    // di bug chiusa lato client il 2026-07-22, qui e' il controllo server
    // reale che mancava).
    if (character.owner_profile_id !== campaignRow.owner_profile_id) {
      return c.json({ error: "Puoi rendere disponibili solo i tuoi personaggi" }, 403);
    }

    const patch: Record<string, boolean> = { available_for_players: !!available };
    if (available) patch.claimable_origin = true;

    const { error: updateError } = await admin
      .from("characters")
      .update(patch)
      .eq("id", characterId);
    if (updateError) {
      console.log("Errore update disponibilità personaggio:", updateError);
      return c.json({ error: "Errore aggiornamento disponibilità" }, 500);
    }

    await broadcastCampaignMembersChange(admin, character.campaign_id);

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST characters/:id/availability:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// Assegna/rimuove un PG da una cartella (sistema cartelle in
// CampaignHome.tsx) - mirror stretto di /availability sopra, stessa
// autorizzazione (GM proprietario della campagna), ma SENZA il vincolo
// aggiuntivo "il PG deve essere del GM stesso": qui e' l'opposto, il GM deve
// poter organizzare in cartelle anche i PG posseduti da altri giocatori.
// Update a colonna singola di proposito - PUT /campaigns/:id/characters/:id
// piu' sopra (saveCharacterAsGm) fa un update integrale con default
// hardcoded (?? 0, ?? null) sui campi non passati esplicitamente e
// distruggerebbe cornice/token/sheet_data se richiamato con solo folderId.
// Il vincolo di tipo/campagna (un mostro non in una cartella PNG, un PG non
// in una cartella di un'altra campagna) e' applicato dal trigger DB
// check_character_folder_type (supabase-add-folders.sql), non qui - un
// folderId non valido torna semplicemente un errore Postgres in updateError.
app.post("/make-server-771c5bfd/characters/:id/folder", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
    const { folderId } = await c.req.json();
    const admin = getAdminClient();

    const { data: character, error: charError } = await admin
      .from("characters")
      .select("id, campaign_id")
      .eq("id", characterId)
      .single();
    if (charError || !character) return c.json({ error: "Personaggio non trovato" }, 404);
    if (!character.campaign_id) {
      return c.json({ error: "Questo personaggio non appartiene a una campagna" }, 400);
    }

    const { data: campaignRow, error: campaignError } = await admin
      .from("campaigns")
      .select("owner_profile_id")
      .eq("id", character.campaign_id)
      .single();
    if (campaignError || !campaignRow) return c.json({ error: "Campagna non trovata" }, 404);
    if (campaignRow.owner_profile_id !== userId) {
      return c.json({ error: "Non hai i permessi su questo personaggio" }, 403);
    }

    const { error: updateError } = await admin
      .from("characters")
      .update({ folder_id: folderId ?? null })
      .eq("id", characterId);
    if (updateError) {
      console.log("Errore update cartella personaggio:", updateError);
      return c.json({ error: "Cartella non valida per questo personaggio" }, 400);
    }

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST characters/:id/folder:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// "Precompilati": il giocatore richiede un PG che il GM ha marcato
// available_for_players=true (endpoint sopra). Il vincolo "un solo PG
// attivo per campagna" e' applicato SOLO qui, non in assign-campaign sopra
// (vedi commento nel piano/memoria di progetto: assign-campaign e' un
// percorso ad alto traffico gia' delicato, non va esteso ora per un
// vincolo mai esistito finora).
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
      .select("id, campaign_id, owner_profile_id, available_for_players, status, original_owner_profile_id")
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
    // original_owner_profile_id si valorizza una volta sola: a questo punto
    // character.owner_profile_id e' per costruzione il GM (un PG e'
    // claimabile solo se available_for_players=true, raggiungibile solo
    // quando il PG e' del GM) - sui claim successivi (dopo un release e un
    // nuovo claim) il campo resta quello impostato la prima volta, mai
    // sovrascritto, cosi' "Rilascia" sa sempre a chi tornare anche se
    // campaign_id viene azzerato in futuro (vedi /release sotto).
    const claimUpdate: Record<string, string | boolean> = { owner_profile_id: userId, available_for_players: false };
    if (!character.original_owner_profile_id) {
      claimUpdate.original_owner_profile_id = character.owner_profile_id;
    }
    const { data: updated, error: updateError } = await admin
      .from("characters")
      .update(claimUpdate)
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

    // La composizione visibile della campagna e' cambiata (un PG del GM e'
    // diventato del giocatore) - il GM con CampaignHome.tsx aperta deve
    // vederlo senza dover ricaricare, stesso canale/evento gia' usato per
    // ogni altro caso che cambia chi possiede un PG in una campagna.
    await broadcastCampaignMembersChange(admin, character.campaign_id);

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
      .select("id, campaign_id, owner_profile_id, claimable_origin, original_owner_profile_id")
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
    // original_owner_profile_id (valorizzato al claim, mai piu' toccato) e'
    // la sola fonte per "chi era il GM" - a differenza del vecchio
    // meccanismo (derivarlo da campaign_id -> campaigns.owner_profile_id),
    // funziona anche se il PG ha lasciato la campagna (rimozione volontaria
    // o da parte del GM azzerano campaign_id ma non questo campo). Un PG
    // claimato prima dell'introduzione di questo campo lo avra' per sempre
    // null: caso limite residuo, segnalato esplicitamente invece di un
    // errore generico.
    if (!character.original_owner_profile_id) {
      return c.json({ error: "Impossibile determinare il proprietario originale: questo personaggio è stato richiesto prima dell'introduzione di questa funzionalità. Contatta il GM per un trasferimento manuale." }, 400);
    }

    const { data: updated, error: updateError } = await admin
      .from("characters")
      .update({ owner_profile_id: character.original_owner_profile_id, available_for_players: true })
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

    // Il resto (leave implicito + broadcast) ha senso solo se il PG e'
    // ancora assegnato a una campagna - se campaign_id e' null (PG rilasciato
    // dopo essere stato rimosso dalla campagna) non c'e' membership da cui
    // uscire ne' un canale su cui notificare un GM che, in questo momento,
    // non ha una campagna con questo PG dentro.
    if (character.campaign_id) {
      // "Leave" implicito: se questo era l'ultimo PG attivo del giocatore in
      // questa campagna, non ne e' piu' membro - vedi
      // leaveIfLastActiveCharacter. userId qui coincide sempre con
      // character.owner_profile_id (verificato sopra, /release e' sempre
      // self-service), passato esplicitamente per coerenza col contratto
      // della funzione condivisa.
      await leaveIfLastActiveCharacter(admin, character.campaign_id, character.owner_profile_id, characterId);

      // Incondizionato (non solo nel ramo "leave" sopra): il PG e' tornato al
      // GM ed e' di nuovo disponibile anche se il giocatore resta membro
      // (ha ancora un altro PG attivo li') - la composizione visibile della
      // campagna e' comunque cambiata, il GM deve vederlo senza ricaricare.
      await broadcastCampaignMembersChange(admin, character.campaign_id);
    } else {
      // Nessuna campagna nota per questo PG (rimosso prima del rilascio) -
      // niente canale campaign:{id} su cui notificare. original_owner_profile_id
      // e' garantito non-null a questo punto (controllato sopra) ed e' il GM
      // che ha appena riottenuto il PG: lo notifichiamo sul suo canale
      // personale cosi' MyCharactersPage.tsx si aggiorna senza reload.
      await broadcastCharacterOwnerChange(admin, character.original_owner_profile_id);
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
// Cartelle: sempre scoped a una campagna (a differenza delle note, che
// possono vivere anche senza campagna per un'entita' di catalogo) - GM
// (proprietario campagna) scrive, chiunque sia membro legge. Stessa forma
// delle policy RLS in supabase-add-folders.sql, cosi' un client che bypassa
// questo controllo applicativo trova comunque lo stesso limite a livello DB.
async function canAccessFolders(
  admin: any, userId: string, campaignId: string, mode: 'read' | 'write'
): Promise<boolean> {
  const { data: campaign } = await admin
    .from('campaigns')
    .select('owner_profile_id')
    .eq('id', campaignId)
    .single();
  if (campaign?.owner_profile_id === userId) return true;
  if (mode !== 'read') return false;

  const { data: membership } = await admin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('profile_id', userId)
    .maybeSingle();
  return !!membership;
}

async function isGmOfCampaign(userId: string, campaignId: string | null): Promise<boolean> {
  if (!campaignId) return false;
  const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
  return myCampaigns.some((camp) => camp.id === campaignId);
}

// noteRow: dati della RIGA nota specifica (owner_profile_id/visibility),
// distinti da entityType/entityId che qui rappresentano il CONTENITORE
// (es. 'campaign'+campaignId) - servono solo al ramo 'campaign' sotto, per
// due usi diversi a seconda che siano presenti o no:
// - mode='write', noteRow assente: creazione di una nuova nota (nessuna
//   riga esiste ancora) - concessa a chiunque sia membro, non piu' solo GM.
// - mode='write', noteRow presente: modifica/eliminazione di una nota
//   ESISTENTE - concessa solo al proprietario (oltre al GM, gia' filtrato
//   sopra da isGm).
// - mode='read', noteRow presente: filtro per-riga su visibility='private'
//   (usato per verificare l'accesso a UNA nota specifica, es. PUT/DELETE
//   in lettura preliminare) - la lista (GET) filtra invece riga-per-riga
//   separatamente nell'handler, questa funzione autorizza solo la query
//   nel suo complesso quando noteRow e' assente.
async function canAccessEntityNotes(
  admin: any, userId: string, campaignId: string | null, entityType: string, entityId: string,
  mode: 'read' | 'write' = 'write',
  noteRow?: { owner_profile_id: string | null; visibility: string } | null
): Promise<boolean> {
  const isGm = await isGmOfCampaign(userId, campaignId);
  if (isGm) return true;
  if (entityType === 'campaign') {
    const myJoined: CampaignMembership[] = await kv.get(playerCampaignsKey(userId)) ?? [];
    const isMember = myJoined.some((pc) => pc.campaignId === campaignId);
    if (!isMember) return false;
    if (mode === 'read') {
      if (!noteRow) return true;
      return noteRow.visibility !== 'private' || noteRow.owner_profile_id === userId;
    }
    if (!noteRow) return true;
    return noteRow.owner_profile_id === userId;
  }
  // Sotto-tab di una nota (entity_id = id della nota padre, vedi
  // supabase-add-note-subtabs.sql): eredita i permessi di chi possiede la
  // nota padre, risalendo di un livello - la profondita' e' fissa a 2
  // (una sotto-tab non e' mai a sua volta padre di altre sotto-tab), quindi
  // questa risalita si ferma sempre al primo passo. Passa owner_profile_id/
  // visibility DELLA NOTA PADRE come noteRow: una sotto-tab non ha una
  // propria visibility indipendente, eredita sempre quella del contenitore
  // (creare/modificare una sotto-tab richiede di poter scrivere sulla nota
  // padre, con le stesse regole di sopra).
  if (entityType === 'note') {
    const { data: parentNote } = await admin
      .from('entity_notes')
      .select('entity_type, entity_id, campaign_id, owner_profile_id, visibility')
      .eq('id', entityId)
      .single();
    if (!parentNote) return false;
    return canAccessEntityNotes(
      admin, userId, parentNote.campaign_id, parentNote.entity_type, parentNote.entity_id, mode,
      { owner_profile_id: parentNote.owner_profile_id, visibility: parentNote.visibility }
    );
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

// Cronologia versioni (entity_notes_history, vedi supabase-add-notes-
// history.sql) - una riga per salvataggio SIGNIFICATIVO, non per ogni PUT
// (altrimenti il debounce 400ms lato client - vedi useEntityTabs.ts -
// produrrebbe comunque una riga per ogni pausa di digitazione). Soglia e
// cap qui sotto: nessuna infrastruttura di cron nel progetto, quindi sia
// il throttle sia la pulizia sono opportunistici, eseguiti dentro la
// stessa richiesta che genera un nuovo snapshot - vedi il piano approvato.
const HISTORY_SNAPSHOT_THROTTLE_MS = 15 * 60 * 1000;
const HISTORY_MAX_VERSIONS_PER_NOTE = 50;

// existingRow: la riga DI ENTITY_NOTES PRIMA della modifica in corso - il
// PUT esistente la fetcha gia' per il controllo di permessi (riga
// `existing` sotto), quindi qui non serve nessuna query aggiuntiva per
// leggerla, solo per decidere/eseguire lo snapshot.
// force=false (chiamata normale dal PUT): salta se la nota non ha ancora
// contenuto rich (niente da preservare alla primissima promozione verso
// il nuovo editor) o se sono passati meno di HISTORY_SNAPSHOT_THROTTLE_MS
// dall'ultimo snapshot della stessa nota.
// force=true (chiamata dal ripristino, Fase 2): salta SOLO il controllo
// "nota vuota", MAI la soglia - un ripristino e' un'azione deliberata
// dell'utente, non un artefatto di digitazione: la versione che sta per
// essere sovrascritta va sempre preservata, cosi' il ripristino stesso
// resta annullabile dalla stessa cronologia.
async function snapshotNoteHistory(
  admin: any,
  existingRow: { id: string; campaign_id: string | null; content: string | null; content_rich: any },
  userId: string,
  { force = false }: { force?: boolean } = {}
): Promise<void> {
  if (existingRow.content_rich == null) return;

  if (!force) {
    const { data: last } = await admin
      .from('entity_notes_history')
      .select('created_at')
      .eq('note_id', existingRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < HISTORY_SNAPSHOT_THROTTLE_MS) return;
  }

  const { error: insertError } = await admin.from('entity_notes_history').insert({
    note_id: existingRow.id,
    campaign_id: existingRow.campaign_id,
    content: existingRow.content,
    content_rich: existingRow.content_rich,
    saved_by_profile_id: userId,
  });
  // Uno snapshot mancato non deve mai far fallire il salvataggio/ripristino
  // vero e proprio (che resta l'operazione primaria) - solo un log, stesso
  // principio di "non bloccare l'azione principale per un side-effect".
  if (insertError) {
    console.log("Errore snapshot cronologia nota:", insertError);
    return;
  }

  // Pulizia opportunistica: tiene solo le HISTORY_MAX_VERSIONS_PER_NOTE
  // piu' recenti per questa nota, eseguita solo quando arriva un NUOVO
  // snapshot (non ad ogni PUT). range(N-1,N-1) prende la riga di confine
  // (la N-esima piu' recente, 0-indicizzata) SE esiste almeno N righe -
  // elimina tutto cio' che e' strettamente piu' vecchio di lei, cosi' il
  // confine stesso resta (totale tenuto >= N, mai sotto la soglia).
  const { data: cutoffRow } = await admin
    .from('entity_notes_history')
    .select('created_at')
    .eq('note_id', existingRow.id)
    .order('created_at', { ascending: false })
    .range(HISTORY_MAX_VERSIONS_PER_NOTE - 1, HISTORY_MAX_VERSIONS_PER_NOTE - 1)
    .maybeSingle();
  if (cutoffRow) {
    await admin
      .from('entity_notes_history')
      .delete()
      .eq('note_id', existingRow.id)
      .lt('created_at', cutoffRow.created_at);
  }
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
      .is('deleted_at', null)
      .order('position', { ascending: true });
    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null);

    const { data, error } = await query;

    if (error) return c.json({ error: "Errore lettura note" }, 500);

    // canAccessEntityNotes sopra autorizza solo la query nel suo complesso
    // (nessun noteRow passato) - qui, per la lista di note di campagna, va
    // ANCHE tolta ogni riga privata non propria: la GET restituiva finora
    // sempre tutte le righe indipendentemente da chi chiama (il solo filtro
    // esistente, su `hidden`, vive lato client in useEntityTabs.ts - stesso
    // gap, non lo ripetiamo qui per la nuova visibilita'). Le sotto-tab
    // (entityType='note') non hanno bisogno di questo filtro: l'accesso alla
    // lista stessa e' gia' condizionato dalla visibility della nota padre
    // (vedi canAccessEntityNotes, ramo 'note'), non serve rifiltrare riga
    // per riga qui.
    let notes = data ?? [];
    if (entityType === 'campaign') {
      const isGm = await isGmOfCampaign(userId, campaignId);
      if (!isGm) {
        notes = notes.filter((n: any) => n.visibility !== 'private' || n.owner_profile_id === userId);
      }
    }

    return c.json({ notes });
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
    const { entityType, entityId, tabName, hidden, folderId, visibility } = await c.req.json();
    if (!entityType || !entityId || !tabName) return c.json({ error: "Campi obbligatori mancanti" }, 400);
    if (visibility !== undefined && visibility !== 'all' && visibility !== 'private') {
      return c.json({ error: "visibility non valida" }, 400);
    }

    const admin = getAdminClient();
    // Nessun noteRow qui: e' una CREAZIONE, non esiste ancora una riga - per
    // entityType='campaign' questo concede a qualunque membro (non piu' solo
    // GM) di creare una propria nota, vedi canAccessEntityNotes.
    const allowed = await canAccessEntityNotes(admin, userId, campaignId, entityType, entityId, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso alle note di questa scheda" }, 403);

    const { count } = await admin
      .from('entity_notes')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null);

    // hidden/folderId/visibility opzionali (Note del GM/Campagna, vedi
    // supabase-add-notes-folders.sql/supabase-add-notes-visibility.sql):
    // assenti = comportamento invariato (hidden/visibility ai default DB,
    // nessuna cartella). Creare gia' coi valori giusti evita un giro
    // POST+PUT separato per piazzare subito la nota nella sezione/cartella/
    // visibilita' corretta. owner_profile_id sempre chi crea, mai opzionale:
    // e' il dato stesso che rende possibile "solo il proprietario puo'
    // modificare" per le note create da un giocatore.
    const insertRow: Record<string, unknown> = {
      campaign_id: campaignId, entity_type: entityType, entity_id: entityId, tab_name: tabName, position: count ?? 0,
      owner_profile_id: userId,
    };
    if (typeof hidden === 'boolean') insertRow.hidden = hidden;
    if (typeof folderId === 'string' || folderId === null) insertRow.folder_id = folderId;
    if (visibility === 'all' || visibility === 'private') insertRow.visibility = visibility;

    const { data, error } = await admin
      .from('entity_notes')
      .insert(insertRow)
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
    const { tabName, content, contentRich, position, hidden, folderId, tabOrder, visibility } = await c.req.json();
    if (visibility !== undefined && visibility !== 'all' && visibility !== 'private') {
      return c.json({ error: "visibility non valida" }, 400);
    }
    // contentRich: documento TipTap (editor.getJSON()) - nessuna validazione
    // di forma oltre "e' un oggetto o null", la struttura interna (nodi/marks
    // TipTap) non e' compito del server da validare, stesso principio gia'
    // seguito per `content` (solo typeof string).
    if (contentRich !== undefined && contentRich !== null && typeof contentRich !== 'object') {
      return c.json({ error: "contentRich non valido" }, 400);
    }

    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('entity_notes')
      .select('*')
      .eq('id', noteId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Tab non trovata" }, 404);

    // noteRow = la riga stessa che si sta modificando: per una nota di
    // campagna (existing.entity_type='campaign'), concede la scrittura solo
    // al proprietario (oltre al GM, gia' filtrato da isGm dentro
    // canAccessEntityNotes) - per una sotto-tab (existing.entity_type='note')
    // questi due campi vengono ignorati dal ramo 'note', che risale alla nota
    // padre per conto proprio.
    const allowed = await canAccessEntityNotes(
      admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write',
      { owner_profile_id: existing.owner_profile_id, visibility: existing.visibility }
    );
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof tabName === 'string') patch.tab_name = tabName;
    if (typeof content === 'string') patch.content = content;
    if (contentRich !== undefined) patch.content_rich = contentRich;
    if (typeof position === 'number') patch.position = position;
    if (typeof hidden === 'boolean') patch.hidden = hidden;
    if (typeof folderId === 'string' || folderId === null) patch.folder_id = folderId;
    if (visibility === 'all' || visibility === 'private') patch.visibility = visibility;
    // Ordine delle sotto-tab di QUESTA nota (vedi supabase-add-note-subtabs.sql)
    // - array di id, stesso schema di tabOrderCampaignNotes/tabOrderGmNotes
    // ma persistito qui perche' la nota stessa e' il proprietario naturale
    // delle proprie sotto-tab.
    if (Array.isArray(tabOrder)) patch.tab_order = tabOrder;

    // Se questa stessa richiesta cambia `hidden` (sposta la nota tra "Note
    // del GM" e "Note della Campagna") senza spostarla esplicitamente anche
    // di cartella, e la nota era in una cartella del namespace vecchio
    // (gmnotes/campaignnotes, vedi supabase-add-notes-folders.sql), quella
    // cartella non e' piu' valida per la nuova sezione: il trigger DB
    // check_entity_notes_folder_type respingerebbe l'update con un 500.
    // La stacchiamo qui (torna "senza cartella" nella nuova sezione) invece
    // di un errore poco chiaro per l'utente.
    if (typeof hidden === 'boolean' && hidden !== existing.hidden && existing.folder_id && patch.folder_id === undefined) {
      const expectedEntityType = hidden ? 'gmnotes' : 'campaignnotes';
      const { data: folder } = await admin
        .from('folders')
        .select('entity_type')
        .eq('id', existing.folder_id)
        .maybeSingle();
      if (!folder || folder.entity_type !== expectedEntityType) {
        patch.folder_id = null;
      }
    }

    const { data, error } = await admin
      .from('entity_notes')
      .update(patch)
      .eq('id', noteId)
      .select('*')
      .single();

    if (error) return c.json({ error: "Errore aggiornamento tab" }, 500);

    // Snapshot della versione PRE-modifica (existing, gia' in mano da
    // sopra) in entity_notes_history - solo se questa richiesta tocca
    // davvero il contenuto (stessa condizione gia' usata per costruire
    // patch.content/patch.content_rich sopra), non per un rename/
    // riordino/cambio visibilita' che non ha nulla da preservare.
    // Dopo l'update, non prima: se l'update fallisse (branch sopra) non
    // avrebbe senso registrare uno snapshot per una modifica che non e'
    // mai stata applicata.
    if (typeof content === 'string' || contentRich !== undefined) {
      await snapshotNoteHistory(admin, existing, userId, { force: false });
    }

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

    // noteRow: stessa ragione del PUT sopra - concede l'eliminazione al
    // proprietario oltre che al GM per una nota di campagna.
    const allowed = await canAccessEntityNotes(
      admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write',
      { owner_profile_id: existing.owner_profile_id, visibility: existing.visibility }
    );
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    // Note di Campagna/GM (entity_type='campaign') e le loro sotto-tab
    // (entity_type='note') vanno nel Cestino (soft-delete, vedi
    // supabase-add-notes-trash.sql) - le tab di PG/PNG/Mostro restano
    // hard-delete immediato, invariato: entity_notes e' condivisa da tutto
    // l'app, non solo da Note, quindi questo branch e' l'unico punto che
    // decide chi entra nel Cestino. Nessuna FK "on delete cascade" su
    // entity_id (colonna polimorfica non tipizzata), quindi le sotto-tab
    // vanno sempre risolte esplicitamente qui - un solo passaggio, non
    // ricorsivo: la profondita' e' fissa a 2 livelli, una sotto-tab non ha
    // mai proprie sotto-tab.
    const isTrashable = existing.entity_type === 'campaign' || existing.entity_type === 'note';

    if (isTrashable) {
      const now = new Date().toISOString();
      await admin.from('entity_notes').update({ deleted_at: now, updated_at: now }).eq('entity_type', 'note').eq('entity_id', noteId);
      const { error } = await admin.from('entity_notes').update({ deleted_at: now, updated_at: now }).eq('id', noteId);
      if (error) return c.json({ error: "Errore eliminazione tab" }, 500);
      return c.json({ success: true });
    }

    await admin.from('entity_notes').delete().eq('entity_type', 'note').eq('entity_id', noteId);
    const { error } = await admin.from('entity_notes').delete().eq('id', noteId);
    if (error) return c.json({ error: "Errore eliminazione tab" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE notes:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Cartelle (folders) ─────────────────────────────────────────────────────
// Mirror di /notes sopra: stessa forma di route (GET/POST scoped a
// campaignId, PUT/DELETE scoped all'id della risorsa), ma piu' semplice -
// niente distinzione per visibilita' o proprietario dell'entita' singola,
// solo GM-scrive/membro-legge (vedi canAccessFolders sopra).

app.get("/make-server-771c5bfd/campaigns/:campaignId/folders", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const entityType = c.req.query("entityType");
    if (!entityType) return c.json({ error: "entityType obbligatorio" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessFolders(admin, userId, campaignId, 'read');
    if (!allowed) return c.json({ error: "Non hai accesso alle cartelle di questa campagna" }, 403);

    const { data, error } = await admin
      .from('folders')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('entity_type', entityType)
      .is('deleted_at', null)
      .order('position', { ascending: true });

    if (error) return c.json({ error: "Errore lettura cartelle" }, 500);
    return c.json({ folders: data ?? [] });
  } catch (err) {
    console.log("Errore GET folders:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/campaigns/:campaignId/folders", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const { entityType, name, parentFolderId } = await c.req.json();
    if (!entityType || !name) return c.json({ error: "Campi obbligatori mancanti" }, 400);

    const admin = getAdminClient();
    const allowed = await canAccessFolders(admin, userId, campaignId, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso alle cartelle di questa campagna" }, 403);

    // La position iniziale va contata solo tra i fratelli (stesso genitore,
    // incluso il caso radice) - non tra tutte le cartelle di questo
    // entity_type nella campagna, altrimenti una nuova sotto-cartella
    // erediterebbe una posizione calcolata sul totale sbagliato.
    let countQuery = admin
      .from('folders')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('entity_type', entityType)
      .is('deleted_at', null);
    countQuery = parentFolderId ? countQuery.eq('parent_folder_id', parentFolderId) : countQuery.is('parent_folder_id', null);
    const { count } = await countQuery;

    const { data, error } = await admin
      .from('folders')
      .insert({
        campaign_id: campaignId,
        entity_type: entityType,
        name,
        position: count ?? 0,
        parent_folder_id: parentFolderId ?? null,
      })
      .select('*')
      .single();

    // 400 (non 500): un errore qui e' quasi sempre il trigger
    // check_folder_hierarchy (supabase-add-nested-folders.sql) che rifiuta
    // parentFolderId per tipo/campagna incoerente, ciclo o profondita' oltre
    // 5 livelli - errore di input del client, non un guasto del server.
    // error.message porta il testo della RAISE EXCEPTION del trigger.
    if (error) return c.json({ error: error.message ?? "Cartella genitore non valida" }, 400);
    return c.json({ folder: data });
  } catch (err) {
    console.log("Errore POST folders:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.put("/make-server-771c5bfd/folders/:folderId", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const folderId = c.req.param("folderId");
    // parentFolderId/icon distinti da "assente": null e' un valore esplicito
    // valido ("diventa cartella radice" / "torna all'icona predefinita"),
    // va applicato solo se la chiave e' davvero presente nel body (undefined
    // = non toccare), a differenza di name/position dove "non una stringa/
    // non un numero" basta come guardia.
    const { name, position, parentFolderId, icon } = await c.req.json();

    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Cartella non trovata" }, 404);

    const allowed = await canAccessFolders(admin, userId, existing.campaign_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa cartella" }, 403);

    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof name === 'string') patch.name = name;
    if (typeof position === 'number') patch.position = position;
    if (parentFolderId !== undefined) patch.parent_folder_id = parentFolderId;
    if (icon !== undefined) patch.icon = icon;

    const { data, error } = await admin
      .from('folders')
      .update(patch)
      .eq('id', folderId)
      .select('*')
      .single();

    // 400 (non 500): vedi il commento gemello nella POST sopra - un errore
    // qui e' quasi sempre il trigger check_folder_hierarchy che rifiuta il
    // nuovo parentFolderId (ciclo, profondita', tipo/campagna incoerente).
    if (error) return c.json({ error: error.message ?? "Errore aggiornamento cartella" }, 400);
    return c.json({ folder: data });
  } catch (err) {
    console.log("Errore PUT folders:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.delete("/make-server-771c5bfd/folders/:folderId", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const folderId = c.req.param("folderId");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Cartella non trovata" }, 404);

    const allowed = await canAccessFolders(admin, userId, existing.campaign_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa cartella" }, 403);

    // Cartelle di Note (gmnotes/campaignnotes) vanno nel Cestino
    // (soft-delete, vedi supabase-add-notes-trash.sql) - le cartelle di
    // PG/Precompilati/PNG/Mostro restano hard-delete immediato, invariato:
    // folders e' condivisa da tutto l'app, non solo da Note.
    const isTrashable = existing.entity_type === 'gmnotes' || existing.entity_type === 'campaignnotes';

    if (isTrashable) {
      const now = new Date().toISOString();
      // Orfanizza esplicitamente il contenuto diretto (folder_id -> null):
      // la FK "on delete set null" non scatta qui, la riga della cartella
      // non viene davvero cancellata - stesso comportamento del ramo hard
      // sotto, reso esplicito.
      await admin.from('entity_notes').update({ folder_id: null, updated_at: now }).eq('folder_id', folderId);
      const { error } = await admin.from('folders').update({ deleted_at: now, updated_at: now }).eq('id', folderId);
      if (error) return c.json({ error: "Errore eliminazione cartella" }, 500);
      return c.json({ success: true });
    }

    // Le card dentro restano solo orfane (folder_id -> null via ON DELETE SET
    // NULL sulla FK), mai cancellate insieme alla cartella.
    const { error } = await admin.from('folders').delete().eq('id', folderId);
    if (error) return c.json({ error: "Errore eliminazione cartella" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE folders:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// Route distinta (non un query-param sulla DELETE sopra) apposta: un'azione
// distruttiva e irreversibile su piu' tabelle non deve poter scattare per un
// flag dimenticato/sbagliato. Cancella davvero la cartella E tutto il suo
// sottoalbero (sotto-cartelle + card dentro, ricorsivamente) - a differenza
// della DELETE semplice sopra, che orfanizza soltanto.
//
// L'insieme dei discendenti viene risolto qui, al momento dell'esecuzione,
// non riusa un conteggio gia' mostrato al client in precedenza (evita un
// TOCTOU se nel frattempo qualcosa e' cambiato) - stessa camminata su
// parent_folder_id gia' usata lato client (getFolderDepth/
// countFolderContentsRecursive in CampaignHome.tsx), applicata qui alla
// stessa lista piatta che GET /folders restituisce (nessuna CTE ricorsiva
// SQL da scrivere/mantenere).
app.delete("/make-server-771c5bfd/folders/:folderId/cascade", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const folderId = c.req.param("folderId");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Cartella non trovata" }, 404);

    const allowed = await canAccessFolders(admin, userId, existing.campaign_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa cartella" }, 403);

    const { data: siblings, error: siblingsError } = await admin
      .from('folders')
      .select('id, parent_folder_id')
      .eq('campaign_id', existing.campaign_id)
      .eq('entity_type', existing.entity_type);
    if (siblingsError) return c.json({ error: "Errore lettura sottoalbero cartelle" }, 500);

    // BFS a partire dalla cartella target: {target, ...discendenti a ogni
    // livello}. childrenByParent precalcolato per non rifare una scan
    // lineare di siblings ad ogni passo (irrilevante a questa scala, ma
    // stesso stile "niente query ripetute" del resto del file).
    const childrenByParent = new Map<string, string[]>();
    for (const f of siblings ?? []) {
      const parentId = f.parent_folder_id;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(f.id);
      childrenByParent.set(parentId, list);
    }
    const descendantIds: string[] = [folderId];
    let cursor = 0;
    while (cursor < descendantIds.length) {
      const current = descendantIds[cursor++];
      for (const childId of childrenByParent.get(current) ?? []) {
        if (!descendantIds.includes(childId)) descendantIds.push(childId);
      }
    }

    const tableByEntityType: Record<string, string> = {
      premade: 'characters',
      character: 'characters',
      npc: 'npcs',
      monster: 'monsters',
      gmnotes: 'entity_notes',
      campaignnotes: 'entity_notes',
    };
    const contentTable = tableByEntityType[existing.entity_type];
    if (!contentTable) return c.json({ error: "Tipo di cartella sconosciuto" }, 400);

    // Cartelle di Note (gmnotes/campaignnotes) vanno nel Cestino a cascata
    // (soft-delete, vedi supabase-add-notes-trash.sql) - le altre restano
    // hard-delete invariato (branch sotto). Le note dirette dentro il
    // sottoalbero vanno risolte PRIMA di aggiornarle, per poter cestinare
    // anche le LORO sotto-tab (entity_type='note', entity_id=quella nota) -
    // il filtro folder_id non le raggiungerebbe altrimenti (le sotto-tab
    // non hanno mai un folder_id proprio).
    const isTrashable = existing.entity_type === 'gmnotes' || existing.entity_type === 'campaignnotes';

    if (isTrashable) {
      const now = new Date().toISOString();
      const { data: notesInSubtree } = await admin.from(contentTable).select('id').in('folder_id', descendantIds);
      const noteIds = (notesInSubtree ?? []).map((n: any) => n.id);

      const { error: contentError } = await admin.from(contentTable).update({ deleted_at: now, updated_at: now }).in('folder_id', descendantIds);
      if (contentError) return c.json({ error: "Errore eliminazione contenuto cartella" }, 500);

      if (noteIds.length > 0) {
        await admin.from('entity_notes').update({ deleted_at: now, updated_at: now }).eq('entity_type', 'note').in('entity_id', noteIds);
      }

      const { error: foldersError } = await admin.from('folders').update({ deleted_at: now, updated_at: now }).in('id', descendantIds);
      if (foldersError) return c.json({ error: "Errore eliminazione sottoalbero cartelle" }, 500);

      return c.json({ success: true, deletedFolderIds: descendantIds });
    }

    let contentDeleteQuery = admin.from(contentTable).delete().in('folder_id', descendantIds);
    if (existing.entity_type === 'premade') {
      // Difesa in profondita': availablePremades (cio' che compare in una
      // cartella Precompilati) e' gia' filtrato lato client a
      // owner_profile_id === owner della campagna - un PG davvero reclamato
      // da un giocatore cambia proprietario e sparisce da quella vista,
      // quindi non dovrebbe mai finire in descendantIds. Questo filtro e'
      // una seconda barriera contro un id stantio, non un cambio di
      // comportamento atteso.
      const { data: campaignRow } = await admin
        .from('campaigns')
        .select('owner_profile_id')
        .eq('id', existing.campaign_id)
        .single();
      if (campaignRow?.owner_profile_id) {
        contentDeleteQuery = contentDeleteQuery.eq('owner_profile_id', campaignRow.owner_profile_id);
      }
    }
    const { error: contentError } = await contentDeleteQuery;
    if (contentError) return c.json({ error: "Errore eliminazione contenuto cartella" }, 500);

    const { error: foldersError } = await admin.from('folders').delete().in('id', descendantIds);
    if (foldersError) return c.json({ error: "Errore eliminazione sottoalbero cartelle" }, 500);

    return c.json({ success: true, deletedFolderIds: descendantIds });
  } catch (err) {
    console.log("Errore DELETE folders/cascade:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

// ─── Cestino Note (note/sotto-tab/cartelle) ────────────────────────────────
// Scope fisso: entity_notes con entity_type in ('campaign','note'), folders
// con entity_type in ('gmnotes','campaignnotes') - vedi supabase-add-notes-
// trash.sql. PG/PNG/Mostro non hanno cestino, restano hard-delete (branch
// gia' visto sopra nelle DELETE /notes e /folders). Owner-only ovunque
// (stesso principio di canAccessFolders/canAccessEntityNotes in modalita'
// 'write': solo il GM cestina/ripristina/svuota).

const NOTE_TRASH_ENTITY_TYPES = ['campaign', 'note'];
const FOLDER_TRASH_ENTITY_TYPES = ['gmnotes', 'campaignnotes'];

app.post("/make-server-771c5bfd/notes/:noteId/restore", async (c) => {
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
    if (!NOTE_TRASH_ENTITY_TYPES.includes(existing.entity_type)) return c.json({ error: "Questa tab non ha un cestino" }, 400);

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    // Solo questa riga, mai i discendenti/il genitore (vedi il piano -
    // nessun restore a cascata automatico).
    const { data, error } = await admin
      .from('entity_notes')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .select('*')
      .single();
    if (error) return c.json({ error: "Errore ripristino tab" }, 500);
    return c.json({ note: data });
  } catch (err) {
    console.log("Errore POST notes/:noteId/restore:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.delete("/make-server-771c5bfd/notes/:noteId/purge", async (c) => {
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
    if (!existing.deleted_at) return c.json({ error: "La tab non e' nel cestino" }, 400);

    const allowed = await canAccessEntityNotes(admin, userId, existing.campaign_id, existing.entity_type, existing.entity_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa tab" }, 403);

    // Stesso identico corpo dell'hard-delete di DELETE /notes/:noteId per
    // PG/PNG/Mostro - qui raggiungibile solo da una riga gia' cestinata
    // (guardia sopra), mai su una tab ancora attiva.
    await admin.from('entity_notes').delete().eq('entity_type', 'note').eq('entity_id', noteId);
    const { error } = await admin.from('entity_notes').delete().eq('id', noteId);
    if (error) return c.json({ error: "Errore eliminazione definitiva tab" }, 500);
    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE notes/:noteId/purge:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/folders/:folderId/restore", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const folderId = c.req.param("folderId");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Cartella non trovata" }, 404);
    if (!FOLDER_TRASH_ENTITY_TYPES.includes(existing.entity_type)) return c.json({ error: "Questa cartella non ha un cestino" }, 400);

    const allowed = await canAccessFolders(admin, userId, existing.campaign_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa cartella" }, 403);

    const { data, error } = await admin
      .from('folders')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', folderId)
      .select('*')
      .single();
    if (error) return c.json({ error: "Errore ripristino cartella" }, 500);
    return c.json({ folder: data });
  } catch (err) {
    console.log("Errore POST folders/:folderId/restore:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.delete("/make-server-771c5bfd/folders/:folderId/purge", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const folderId = c.req.param("folderId");
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();
    if (fetchError || !existing) return c.json({ error: "Cartella non trovata" }, 404);
    if (!existing.deleted_at) return c.json({ error: "La cartella non e' nel cestino" }, 400);

    const allowed = await canAccessFolders(admin, userId, existing.campaign_id, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso a questa cartella" }, 403);

    // Stesso BFS di DELETE /folders/:folderId/cascade, qui raggiungibile
    // solo da una cartella gia' cestinata (guardia sopra). I discendenti
    // possono includere sotto-cartelle non ancora cestinate individualmente
    // (es. create dopo il cestinamento del genitore, se mai possibile) -
    // purge le elimina comunque tutte, coerente con "svuota per sempre
    // questo ramo".
    const { data: siblings, error: siblingsError } = await admin
      .from('folders')
      .select('id, parent_folder_id')
      .eq('campaign_id', existing.campaign_id)
      .eq('entity_type', existing.entity_type);
    if (siblingsError) return c.json({ error: "Errore lettura sottoalbero cartelle" }, 500);

    const childrenByParent = new Map<string, string[]>();
    for (const f of siblings ?? []) {
      const parentId = f.parent_folder_id;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(f.id);
      childrenByParent.set(parentId, list);
    }
    const descendantIds: string[] = [folderId];
    let cursor = 0;
    while (cursor < descendantIds.length) {
      const current = descendantIds[cursor++];
      for (const childId of childrenByParent.get(current) ?? []) {
        if (!descendantIds.includes(childId)) descendantIds.push(childId);
      }
    }

    const { data: notesInSubtree } = await admin.from('entity_notes').select('id').in('folder_id', descendantIds);
    const noteIds = (notesInSubtree ?? []).map((n: any) => n.id);
    if (noteIds.length > 0) {
      await admin.from('entity_notes').delete().eq('entity_type', 'note').in('entity_id', noteIds);
    }
    const { error: contentError } = await admin.from('entity_notes').delete().in('folder_id', descendantIds);
    if (contentError) return c.json({ error: "Errore eliminazione definitiva contenuto cartella" }, 500);

    const { error: foldersError } = await admin.from('folders').delete().in('id', descendantIds);
    if (foldersError) return c.json({ error: "Errore eliminazione definitiva sottoalbero cartelle" }, 500);

    return c.json({ success: true, deletedFolderIds: descendantIds });
  } catch (err) {
    console.log("Errore DELETE folders/:folderId/purge:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.get("/make-server-771c5bfd/campaigns/:campaignId/trash", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const admin = getAdminClient();
    const allowed = await canAccessFolders(admin, userId, campaignId, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso al cestino di questa campagna" }, 403);

    const { data: notes, error: notesError } = await admin
      .from('entity_notes')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('entity_type', NOTE_TRASH_ENTITY_TYPES)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (notesError) return c.json({ error: "Errore lettura cestino note" }, 500);

    const { data: folders, error: foldersError } = await admin
      .from('folders')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('entity_type', FOLDER_TRASH_ENTITY_TYPES)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (foldersError) return c.json({ error: "Errore lettura cestino cartelle" }, 500);

    return c.json({ notes: notes ?? [], folders: folders ?? [] });
  } catch (err) {
    console.log("Errore GET campaigns/:campaignId/trash:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/campaigns/:campaignId/trash/restore-all", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const admin = getAdminClient();
    const allowed = await canAccessFolders(admin, userId, campaignId, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso al cestino di questa campagna" }, 403);

    const now = new Date().toISOString();
    await admin.from('entity_notes').update({ deleted_at: null, updated_at: now })
      .eq('campaign_id', campaignId).in('entity_type', NOTE_TRASH_ENTITY_TYPES).not('deleted_at', 'is', null);
    await admin.from('folders').update({ deleted_at: null, updated_at: now })
      .eq('campaign_id', campaignId).in('entity_type', FOLDER_TRASH_ENTITY_TYPES).not('deleted_at', 'is', null);

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST trash/restore-all:", err);
    return c.json({ error: `Errore interno: ${err}` }, 500);
  }
});

app.post("/make-server-771c5bfd/campaigns/:campaignId/trash/empty", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const campaignId = c.req.param("campaignId");
    const admin = getAdminClient();
    const allowed = await canAccessFolders(admin, userId, campaignId, 'write');
    if (!allowed) return c.json({ error: "Non hai accesso al cestino di questa campagna" }, 403);

    // Cancellazione diretta di tutto cio' che e' gia' cestinato per questa
    // campagna/scope - nessuna camminata BFS necessaria (a differenza del
    // purge di una singola cartella): si eliminano TUTTE le righe gia'
    // marcate deleted_at, indipendentemente dalla gerarchia tra loro.
    await admin.from('entity_notes').delete()
      .eq('campaign_id', campaignId).in('entity_type', NOTE_TRASH_ENTITY_TYPES).not('deleted_at', 'is', null);
    await admin.from('folders').delete()
      .eq('campaign_id', campaignId).in('entity_type', FOLDER_TRASH_ENTITY_TYPES).not('deleted_at', 'is', null);

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore POST trash/empty:", err);
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

// Eliminazione unificata: sostituisce sia il delete diretto client-side
// (bypassava il server, quindi non applicava mai il leave implicito) sia il
// vecchio DELETE /campaigns/:id/characters/:characterId (solo GM, nessun
// leave implicito). Permesso derivato dalla riga del personaggio stessa
// (proprietario, o GM della campagna in cui si trova oggi) invece che da un
// :campaignId nell'URL - un solo controllo invece di due ridondanti.
app.delete("/make-server-771c5bfd/characters/:id", async (c) => {
  try {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Non autorizzato" }, 401);
    const userId = await getUserIdFromToken(token);
    if (!userId) return c.json({ error: "Token non valido" }, 401);

    const characterId = c.req.param("id");
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
    let isGm = false;
    if (!isCharacterOwner && character.campaign_id) {
      const myCampaigns: Campaign[] = await kv.get(campaignsKey(userId)) ?? [];
      isGm = myCampaigns.some((camp) => camp.id === character.campaign_id);
    }
    if (!isCharacterOwner && !isGm) {
      return c.json({ error: "Non hai i permessi su questo personaggio" }, 403);
    }

    const { error: deleteError } = await admin
      .from("characters")
      .delete()
      .eq("id", characterId);
    if (deleteError) {
      console.log("Errore eliminazione personaggio:", deleteError);
      return c.json({ error: "Errore eliminazione personaggio" }, 500);
    }

    // "Leave" implicito: stessa funzione di assign-campaign/release -
    // character.owner_profile_id (mai userId: chi elimina puo' essere il GM,
    // non il proprietario). Broadcast incondizionato come in /release: la
    // composizione visibile della campagna e' comunque cambiata (un PG in
    // meno), a prescindere da se il proprietario resta membro o no.
    if (character.campaign_id && character.owner_profile_id) {
      await leaveIfLastActiveCharacter(admin, character.campaign_id, character.owner_profile_id, characterId);
      await broadcastCampaignMembersChange(admin, character.campaign_id);
    }

    return c.json({ success: true });
  } catch (err) {
    console.log("Errore DELETE characters/:id:", err);
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
  logoUrl?: string;
  sessionActive?: boolean;
  sessionActivatedAt?: string;
}

interface CampaignMembership {
  campaignId: string;
  ownerId: string;
}

Deno.serve(app.fetch);
