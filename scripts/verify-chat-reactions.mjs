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

// Pannello: cancellazione CON dialog di conferma + broadcast ai peer.
assert.match(panel, /aria-label="Cancella"/, 'icona cancella messaggio assente');
assert.match(panel, /setConfirmDelete\(item\.key\)/, 'Cancella non apre la conferma');
assert.match(panel, /void deleteEntry\(id\)/, 'dialog conferma non invoca deleteEntry');
assert.match(panel, /await deleteChatMessage\(entryId\)/, 'deleteChatMessage non chiamata');
assert.match(
  panel,
  /chat_delete', \{ messageId: entryId \}/,
  'broadcast chat_delete mancante',
);
assert.match(panel, /chat_delete: handleChatDeleteBroadcast/, 'listener chat_delete non registrato');
assert.match(channel, /'chat_delete',/, 'evento chat_delete non nel canale');

// Pannello: icona Copia (animazione copy gia' in CSS/IconeCopia) + feedback.
assert.match(panel, /copiedId === item\.key \? 'Copiato' : 'Copia'/, 'icona Copia assente');
assert.match(panel, /from '\.\.\/IconeCopia'/, 'Copy non importata da IconeCopia');
assert.match(panel, /navigator\.clipboard\.writeText\(copyTextOfItem\(/, 'copia negli appunti mancante');
assert.match(panel, /setCopiedId\(entry\.key\)/, 'feedback Copiato mancante');

// Copia = SOLO appunti: non popola né mette a fuoco il composer (il testo puo'
// essere incollato in un'altra chat o in un altro programma esterno). Il
// formato blockquote resta negli appunti e l'incollo nel composer e' sempre
// riconosciuto da parseQuotedPaste; per citare nella stessa chat serve il
// bottone Citazione.
assert.match(panel, /\.map\(\(line\) => `> \$\{line\}`\)/, 'formato blockquote della copia assente');
assert.match(panel, /onPaste=\{handleComposerPaste\}/, 'paste intelligente nel composer assente');
assert.match(panel, /parseQuotedPaste\(/, 'handler paste non usa parseQuotedPaste');
const copyEntryBody = /const copyEntry = useCallback\(\(entry: TimelineItem\) => \{([\s\S]*?)\}, \[\]\);/.exec(panel);
assert.ok(copyEntryBody, 'copyEntry assente');
assert.ok(
  !/setReplyQuote\(|setMessage\(|caretRef\.current|inputRef\.current\?\.focus\(\)/.test(copyEntryBody[1]),
  'Copia non deve popolare né mettere a fuoco il composer',
);
// Sintesi roll: i dadi custom/solo-immagini (total null) devono descrivere le
// facce uscite - mai "-> null" come con il totale grezzo.
assert.match(panel, /content: rollResultSummary\(item\.roll\)/, 'quoteForItem roll non usa rollResultSummary');
assert.match(panel, /\$\{roll\.rollerName\}: \$\{rollResultSummary\(roll\)\}/, 'copyTextOfItem roll non usa rollResultSummary');
assert.ok(!/→ \$\{item\.roll\.total\}/.test(panel), 'sintesi roll vecchia con total grezzo ancora presente');
const pasteModule = await readFile(
  new URL('../src/app/components/session/chatPaste.ts', import.meta.url),
  'utf8',
);
assert.match(pasteModule, /export function parseQuotedPaste/, 'modulo parseQuotedPaste mancante');
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
assert.match(panel, /onBroadcast: \{\s*chat_reaction: handleChatReactionBroadcast/, 'listener broadcast reazione non registrato');

// Pannello: blocco citazione in composizione e nelle bolle.
assert.match(panel, /aria-label="Annulla citazione"/, 'annullo citazione assente');
assert.match(panel, /placeholder=\{replyQuote \? 'Rispondi\.\.\.' : 'Scrivi qualcosa\.\.\.'\}/, 'placeholder contestuale assente');
assert.match(panel, /item\.message\.quote &&/, 'citazione non renderizzata nella bolla');
assert.match(panel, /line-clamp-2/, 'testo citato non troncato nella bolla');

// Pannello: le quattro azioni (Emoji/Cita/Copia/Elimina) compaiono anche sui
// tiri di sessione - i dadi custom appena tirati non hanno (ancora) la riga in
// `entries`: le reazioni vivono in sessionRollReactions e l'Elimina toglie
// anche la copia locale del tiro tramite removeRoll.
assert.match(panel, /reactions: sessionRollReactions\[roll\.id\] \?\? \[\]/, 'tiri di sessione senza reazioni unite');
assert.match(
  panel,
  /const canReact = item\.kind !== 'roll' \|\| item\.roll\.visibility === 'public'/,
  'gate reazioni sui tiri (solo con riga persistita) assente',
);
assert.ok(!/canAct\b/.test(panel), 'vecchio gate canAct ancora presente');
assert.match(panel, /removeRoll\(entryId\)/, 'Elimina non toglie la copia locale del tiro');
assert.match(panel, /removeRoll\(messageId\)/, 'broadcast chat_delete non toglie la copia locale');
assert.match(
  panel,
  /setSessionRollReactions\(\(prev\) => \(\{ \.\.\.prev, \[messageId\]: next \}\)\)/,
  'reazioni broadcast non unite ai tiri di sessione',
);

// Citazione con facce visive: ChatQuote.diceFaces raccoglie le facce custom
// uscite e ChatQuoteContent le mostra (icona/immagine xN) al posto della
// conversione testuale, sia nel banner composer sia nella bolla del messaggio.
assert.match(service, /diceFaces\?: ChatQuoteDiceFace\[\]/, 'ChatQuote senza facce custom');
assert.match(service, /export interface ChatQuoteDiceFace/, 'tipo ChatQuoteDiceFace mancante');
assert.match(panel, /diceFaces = customDiceFacesForRoll\(item\.roll\)/, 'quoteForItem non raccoglie le facce custom');
assert.match(panel, /function ChatQuoteContent/, 'componente ChatQuoteContent mancante');
assert.match(panel, /<ChatQuoteContent quote=\{replyQuote\} \/>/, 'banner composer senza ChatQuoteContent');
assert.match(panel, /<ChatQuoteContent quote=\{item\.message\.quote\} \/>/, 'bolla messaggio senza ChatQuoteContent');
assert.match(panel, /<CustomDieFaceResult/, 'faccia custom non renderizzata nella citazione');

// Catena di verifica.
assert.ok(pkg.scripts['verify:chat-reactions'], 'script verify:chat-reactions mancante');
assert.match(pkg.scripts.check, /verify:chat-reactions/, 'verify:chat-reactions non inserito in check');

console.log('Chat reactions & quote verification: PASS');
