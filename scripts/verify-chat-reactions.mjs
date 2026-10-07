import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/services/supabase/chatService.ts', import.meta.url), 'utf8');
const channel = await readFile(
  new URL('../src/services/realtime/campaignChannel.ts', import.meta.url),
  'utf8',
);
const panel = await readFile(
  new URL('../src/app/components/session/SessionChatPanel.tsx', import.meta.url),
  'utf8',
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Migration: colonna reactions + policy UPDATE (senza di essa la RLS in Cloud
// respinge il PATCH delle reazioni).
const migrations = readdirSync(new URL('../supabase', import.meta.url))
  .filter((file) => /chat_messages_reactions\.sql$/.test(file));
assert.equal(migrations.length, 1, 'migration chat_messages_reactions.sql assente');
const migration = await readFile(new URL(`../supabase/${migrations[0]}`, import.meta.url), 'utf8');
assert.match(migration, /ADD COLUMN IF NOT EXISTS reactions JSONB/, 'colonna reactions mancante');
assert.match(migration, /FOR UPDATE TO authenticated/, 'policy UPDATE mancante');
assert.match(migration, /DROP POLICY IF EXISTS/, 'policy non idempotente');

// Servizio: tipi, insert con citazione, toggle reazioni read-modify-write.
assert.match(service, /export interface ChatQuote/, 'tipo ChatQuote mancante');
assert.match(service, /export interface ChatReaction/, 'tipo ChatReaction mancante');
assert.match(service, /export async function toggleChatReaction/, 'toggleChatReaction mancante');
assert.match(service, /payload: input\.quote \? \{ quote: input\.quote \} : undefined/, 'citazione non persistita in payload');
assert.match(service, /payload && payload\.quote \? \(payload\.quote as ChatQuote\)/, 'lettura citazione in rowToEntry mancante');
assert.match(service, /Array\.isArray\(row\.reactions\) \? \(row\.reactions as ChatReaction\[\]\) : \[\]/, 'lettura reazioni in rowToEntry mancante');
assert.match(service, /update\(\{ reactions: next \}\)/, 'update della colonna reactions mancante');
assert.match(service, /reaction\.userId !== input\.userId/, 'sostituzione reazione propria mancante');
assert.match(service, /const mine = current\.filter/, 'filtro reazioni altrui mancante');
assert.match(service, /const alreadySame = current\.some/, 'rilevamento emoji gia\' presente mancante');
assert.match(
  service,
  /\? mine\s*:\s*\[\.\.\.mine, \{/,
  'toggle una-reazione-per-utente assente',
);
// Le righe lette/aggiornate passano da .limit(1): in Locale l'Accept a riga
// singola darebbe 406/PGRST116 sulle righe assenti (localRest).
const toggleStart = service.indexOf('export async function toggleChatReaction');
const toggleEnd = service.indexOf('export async function saveRollEntry');
const toggleBody = service.slice(toggleStart, toggleEnd > toggleStart ? toggleEnd : undefined);
assert.ok(toggleStart >= 0, 'toggleChatReaction non trovato');
assert.ok(!/\.maybeSingle\(\)/.test(toggleBody), 'toggle non deve usare maybeSingle');
assert.match(toggleBody, /\.eq\('id', messageId\)\s*\.limit\(1\)/, 'read reazioni senza limit(1)');
assert.match(toggleBody, /\.select\('reactions'\)\s*\.limit\(1\)/, 'update reazioni senza limit(1)');

// Canale: evento dedicato nel tipo e nel registro.
assert.match(channel, /\| 'chat_reaction'/, 'BroadcastEvent senza chat_reaction');
assert.match(channel, /'chat_reaction',/, 'KNOWN_BROADCAST_EVENTS senza chat_reaction');

// Pannello: auto-close all'invio.
const sendStart = panel.indexOf('const handleSend');
const sendEnd = panel.indexOf('const handleClearChat');
assert.ok(sendStart >= 0 && sendEnd > sendStart, 'handleSend non trovato');
const sendBody = panel.slice(sendStart, sendEnd);
assert.match(sendBody, /setEmojiOpen\(false\)/, 'invio non chiude il picker emoji');
assert.match(sendBody, /setReactionPicker\(null\)/, 'invio non chiude il picker reazioni');
assert.match(sendBody, /quote: replyQuote \?\? undefined/, 'invio senza citazione');
assert.match(sendBody, /setReplyQuote\(null\)/, 'citazione non azzerata dopo l\'invio');

// Pannello: selezione messaggio + azioni emoji/citazione.
assert.match(panel, /data-chat-entry/, 'marker selezione messaggio assente');
assert.match(panel, /aria-label="Reagisci con emoji"/, 'icona reazione assente');
assert.match(panel, /aria-label="Citazione"/, 'icona citazione assente');
assert.match(panel, /toggleReactionPicker/, 'apertura picker reazioni assente');
assert.match(panel, /setReplyQuote\(quoteForItem\(item\)\)/, 'citazione non costruita dall\'item');
assert.match(panel, /data-reaction-picker/, 'picker reazioni non marcato per il click esterno');
// Portal su body: SlideOverPanel (transform + overflow-hidden) altrimenti
// ridefinisce il containing block del fixed e taglierebbe/clippa il picker.
assert.match(panel, /createPortal\(\s*[\s\S]{0,500}data-reaction-picker/, 'picker reazioni non portaled');
// Portal target: nodo con --dash-* (usePortalContainer) o body in fallback,
// mai il solo document.body (le variabili --dash-* non ci arrivano: sfondo vuoto).
assert.match(panel, /usePortalContainer\(\)/, 'usePortalContainer mancante');
assert.match(panel, /portalTarget \?\? document\.body/, 'portal target senza variabili palette');
assert.match(panel, /z-\[96[0-9]\]/, 'z-index picker reazioni non sopra lo SlideOverPanel (z-900)');

// Pannello: reazioni racchiuste in un UNICO cerchietto sul bordo inferiore
// (metà dentro/metà fuori), con tooltip per-emoji e riepilogo sul contenitore.
assert.match(
  panel,
  /-bottom-3 right-2 z-10 flex items-center gap-0\.5 rounded-full/,
  'cerchietto unico contenitore delle reazioni assente',
);
assert.match(panel, /title=\{names\}/, 'tooltip nomi utente sulle reazioni mancante');
assert.match(panel, /void applyReaction\(item\.key, char\)/, 'click badge senza toggle');
assert.match(panel, /groupReactions/, 'raggruppamento reazioni per emoji assente');
assert.match(
  panel,
  /chat_reaction', \{ messageId: entryId, reactions \}/,
  'broadcast reazione mancante',
);
assert.match(panel, /onBroadcast: \{ chat_reaction: /, 'listener broadcast reazione non registrato');

// Pannello: blocco citazione in composizione e nelle bolle.
assert.match(panel, /aria-label="Annulla citazione"/, 'annullo citazione assente');
assert.match(panel, /placeholder=\{replyQuote \? 'Rispondi\.\.\.' : 'Scrivi qualcosa\.\.\.'\}/, 'placeholder contestuale assente');
assert.match(panel, /item\.message\.quote &&/, 'citazione non renderizzata nella bolla');
assert.match(panel, /line-clamp-2/, 'testo citato non troncato nella bolla');

// Catena di verifica.
assert.ok(pkg.scripts['verify:chat-reactions'], 'script verify:chat-reactions mancante');
assert.match(pkg.scripts.check, /verify:chat-reactions/, 'verify:chat-reactions non inserito in check');

console.log('Chat reactions & quote verification: PASS');
