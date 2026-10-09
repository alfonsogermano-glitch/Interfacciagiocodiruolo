import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../src/services/supabase/chatService.ts', import.meta.url), 'utf8');
const helpers = await readFile(
  new URL('../src/app/components/session/chatAttachments.ts', import.meta.url),
  'utf8',
);
const assets = await readFile(new URL('../src/services/storage/contentAssets.ts', import.meta.url), 'utf8');
const panel = await readFile(
  new URL('../src/app/components/session/SessionChatPanel.tsx', import.meta.url),
  'utf8',
);
const sidebar = await readFile(
  new URL('../src/app/components/session/SessionRightSidebar.tsx', import.meta.url),
  'utf8',
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const imagePreview = await readFile(new URL('../src/app/components/session/ChatImageAttachment.tsx', import.meta.url), 'utf8');

// Immagini: stesso payload/storage degli allegati, proporzioni preservate e
// URL temporanei rilasciati quando la voce viene rimossa o cambia asset.
assert.match(service, /display\?: 'image';/, 'metadato anteprima immagine mancante');
assert.match(panel, /accept="image\/\*"/, 'picker immagini senza filtro');
assert.match(panel, /onClick=\{\(\) => imageInputRef\.current\?\.click\(\)\}/, 'pulsante immagine inattivo');
assert.match(panel, /await readChatImageSize\(file\)/, 'immagine non validata prima del salvataggio');
assert.match(panel, /attachment\?\.display === 'image'/, 'immagini non distinte dagli allegati generici');
assert.match(imagePreview, /resolveAttachmentBlob\(attachment\)/, 'anteprima non usa lo storage originale');
assert.match(imagePreview, /h-auto w-full max-w-full/, 'anteprima non proporzionale alla larghezza chat');
assert.match(imagePreview, /aspectRatio:/, 'spazio immagine non riservato durante il caricamento');
assert.match(imagePreview, /URL\.revokeObjectURL\(objectUrl\)/, 'URL anteprima non rilasciato');

// ---------------------------------------------------------------
// Migration: bucket chat-attachments (50 MB, qualsiasi mime) + policy.
// ---------------------------------------------------------------
const migrations = readdirSync(new URL('../supabase', import.meta.url))
  .filter((file) => /chat_attachments\.sql$/.test(file));
assert.equal(migrations.length, 1, 'migration chat_attachments.sql assente');
const migration = await readFile(new URL(`../supabase/${migrations[0]}`, import.meta.url), 'utf8');
assert.match(
  migration,
  /values\('chat-attachments','chat-attachments',true,52428800,null\)/,
  'bucket chat-attachments mancante o con limiti errati (50 MB = 52428800, mime illimitati)',
);
assert.match(migration, /on conflict\(id\) do update/, 'insert bucket non idempotente');
assert.match(
  migration,
  /create policy chat_attachments_insert_own on storage\.objects for insert to authenticated with check/,
  'policy insert mancante',
);
assert.match(
  migration,
  /create policy chat_attachments_delete_own on storage\.objects for delete to authenticated/,
  'policy delete mancante',
);
// Path <campagna>/<utente>/<file>: la policy deve vincolare la cartella
// utente e l'appartenenza alla campagna (owner o membro).
assert.equal(
  (migration.match(/\(storage\.foldername\(name\)\)\[2\]=\(select auth\.uid\(\)\)::text/g) ?? []).length >= 2,
  true,
  'policy senza vincolo cartella utente',
);
assert.match(migration, /campaign_members/, 'policy senza controllo membri campagna');
assert.match(migration, /drop policy if exists/, 'policy non idempotente');

// ---------------------------------------------------------------
// Servizio: ChatAttachment, kind attachment, payload solo metadati.
// ---------------------------------------------------------------
assert.match(service, /export interface ChatAttachment/, 'tipo ChatAttachment mancante');
assert.match(service, /fileName: string;/, 'ChatAttachment senza fileName');
assert.match(service, /size: number;/, 'ChatAttachment senza size');
assert.match(service, /storage: 'local' \| 'cloud';/, 'ChatAttachment senza storage Locale/Cloud');
assert.match(service, /attachment\?: ChatAttachment;/, 'ChatMessage senza attachment');
assert.match(
  service,
  /attachment: row\.kind === 'attachment' && payload && payload\.attachment\s*\? \(payload\.attachment as ChatAttachment\)/,
  'rowToEntry non legge payload.attachment',
);
assert.match(service, /export async function sendChatAttachment/, 'sendChatAttachment mancante');
const attachmentStart = service.indexOf('export async function sendChatAttachment');
const attachmentBody = service.slice(attachmentStart, attachmentStart + 1400);
assert.match(attachmentBody, /kind: 'attachment'/, 'insert senza kind attachment');
assert.match(attachmentBody, /content: input\.attachment\.fileName/, 'content non contiene il nome file');
assert.match(attachmentBody, /payload: \{ attachment: input\.attachment \}/, 'metadati non in payload');
// Il payload deve restare piccolo: niente data-URL di file multi-MB nella riga.
assert.ok(
  !/payload: \{[^}]*dataUrl|payload: \{[^}]*publicUrl/.test(attachmentBody),
  'payload allegato non deve contenere URL/dati del file',
);

// ---------------------------------------------------------------
// Helper upload/download: limite 50 MB, routing Locale/Cloud, Salva con nome.
// ---------------------------------------------------------------
assert.match(helpers, /export const MAX_ATTACHMENT_BYTES = 50 \* 1024 \* 1024/, 'limite 50 MB assente');
assert.match(helpers, /export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'/, 'bucket helper assente');
assert.match(helpers, /export function splitAttachmentName/, 'splitAttachmentName mancante');
assert.match(helpers, /export function safeAttachmentPathName/, 'safeAttachmentPathName mancante');
// La modalita' va catturata PRIMA dell'await: e' quella scelta dall'utente al
// momento del caricamento e finisce in payload.storage.
const uploadStart = helpers.indexOf('export async function uploadChatAttachment');
const uploadBody = helpers.slice(uploadStart, helpers.indexOf('export async function resolveAttachmentBlob'));
assert.ok(uploadStart >= 0, 'uploadChatAttachment non trovata');
assert.match(uploadBody, /const storage = selectedContentMode\(\);/, 'modalita non catturata prima del caricamento');
assert.ok(
  uploadBody.indexOf('const storage = selectedContentMode();') < uploadBody.indexOf('await uploadContentAsset'),
  'modalita catturata dopo il caricamento',
);
assert.match(uploadBody, /await uploadContentAsset\(/, 'upload senza routing Locale/Cloud');
assert.match(uploadBody, /assetPath,\s*storage,\s*\};/, 'payload.storage non memorizzato');
assert.ok(!/publicUrl/.test(uploadBody), 'upload non deve propagare publicUrl (data-URL multi-MB) nel payload');
// Download: risale a dove il file e' stato caricato, non alla modalita' corrente.
const resolveStart = helpers.indexOf('export async function resolveAttachmentBlob');
const resolveBody = helpers.slice(resolveStart, helpers.indexOf('interface SaveFilePickerWindow'));
assert.match(resolveBody, /attachment\.storage === 'local'/, 'download senza ramo Locale');
assert.match(resolveBody, /loadContentAssetDataUrl\(/, 'download Locale senza lettura IndexedDB');
assert.match(resolveBody, /getPublicUrl\(attachment\.assetPath\)/, 'download Cloud senza publicUrl');
// Finestra "Salva con nome" (File System Access API) con fallback download.
assert.match(helpers, /showSaveFilePicker/, 'finestra Salva con nome assente');
assert.match(helpers, /suggestedName: attachment\.fileName/, 'Salva con nome senza nome originale');
assert.match(helpers, /anchor\.download = attachment\.fileName/, 'fallback download senza nome originale');
assert.match(helpers, /name === 'AbortError'\) return/, 'annullamento finestra non gestito');

// ---------------------------------------------------------------
// contentAssets: lettura asset Locale + rimozione con modalita' esplicita.
// ---------------------------------------------------------------
assert.match(assets, /export async function loadContentAssetDataUrl/, 'loadContentAssetDataUrl mancante');
assert.match(
  assets,
  /export async function removeContentAsset\(bucket: string, path: string, mode\?: ContentMode\)/,
  'removeContentAsset senza modalita esplicita',
);
assert.match(assets, /\(mode \?\? selectedContentMode\(\)\) === 'local'/, 'rimozione non guidata dalla modalita');

// ---------------------------------------------------------------
// Pannello: bottone "+" attivo, card allegato, tab File, azioni ridotte.
// ---------------------------------------------------------------
assert.match(panel, /const handleFilePicked/, 'handleFilePicked assente');
assert.match(
  panel,
  /onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/,
  'bottone "+" non apre il file picker',
);
assert.match(panel, /disabled=\{uploadingFile\}/, 'bottone "+" non si disattiva durante upload');
assert.match(panel, /<Loader2 className="h-4 w-4 animate-spin" \/>/, 'indicatore di caricamento assente');
const fileInputLine = /<input ref=\{fileInputRef\}[^>]*\/>/.exec(panel);
assert.ok(fileInputLine, 'input file nascosto assente');
assert.ok(!/accept=/.test(fileInputLine[0]), 'input file deve accettare qualsiasi tipo (niente accept)');
// Limite 50 MB validato prima del caricamento.
assert.match(panel, /file\.size > MAX_ATTACHMENT_BYTES/, 'validazione dimensione 50 MB assente');
assert.match(panel, /supera la dimensione massima di 50 MB/, 'errore dimensione non mostrato');
assert.match(panel, /await uploadChatAttachment\(\{/, 'upload non invocato dal pannello');
assert.match(panel, /await sendChatAttachment\(\{/, 'sendChatAttachment non invocata');
assert.match(panel, /chat_message', \{ entry: saved \}/, 'broadcast allegato assente');
// Card in chat: nome + estensione con icona di download, click = Salva con nome.
assert.match(panel, /<FileDown className="h-4 w-4 shrink-0 text-\[var\(--dash-accent\)\]"/, 'icona FileDown assente');
assert.match(panel, /splitAttachmentName\(attachment\?\.fileName \?\? ''\)/, 'split del nome file assente');
assert.match(panel, /\{attachmentName\.base\}/, 'nome base non renderizzato');
assert.match(panel, /\{attachmentName\.ext\}/, 'estensione non renderizzata');
assert.match(panel, /onClick=\{\(\) => handleDownloadAttachment\(item\.message\)\}/, 'click card non scarica');
assert.match(panel, /handleDownloadAttachment = useCallback/, 'handler download assente');
// File generici: due azioni. Immagini: anche Citazione e Copia.
assert.match(panel, /const canQuoteAndCopy = item\.kind !== 'attachment' \|\| attachment\?\.display === 'image'/);
assert.match(panel, /new ClipboardItem\(\{ 'image\/png': chatImageClipboardBlob\(image\) \}\)/);
assert.match(service, /image\?: ChatAttachment;/);
assert.equal(
  (panel.match(/\{canQuoteAndCopy && \(/g) ?? []).length,
  2,
  'Citazione/Copia non entrambe condizionate all\'allegato',
);
assert.equal(
  (panel.match(/aria-label="Citazione"/g) ?? []).length,
  1,
  'bottone Citazione assente o duplicato',
);
// Tab File e merge in timeline.
assert.match(
  panel,
  /if \(activeTab === 'files'\) return item\.kind === 'attachment';/,
  'tab File non filtra gli allegati',
);
assert.match(panel, /entry\.kind === 'attachment'/, 'merge timeline senza ramo allegato');
assert.match(
  panel,
  /const reactions = item\.kind === 'roll' \? item\.reactions : item\.message\.reactions/,
  'letta reazioni non copre anche gli allegati',
);
assert.match(
  panel,
  /const canReact = item\.kind !== 'roll' \|\| item\.roll\.visibility === 'public'/,
  'gate reazioni non copre gli allegati',
);
// Pulizia storage: cancellazione singola e Pulisci chat (solo allegati propri).
assert.match(
  panel,
  /removeContentAsset\(target\.attachment\.bucket, target\.attachment\.assetPath, target\.attachment\.storage\)/,
  'deleteEntry non rimuove i bytes del proprio allegato',
);
assert.match(
  panel,
  /removeContentAsset\(entry\.attachment\.bucket, entry\.attachment\.assetPath, entry\.attachment\.storage\)/,
  'Pulisci chat non rimuove i bytes dei propri allegati',
);
assert.match(panel, /entry\.kind === 'attachment' && entry\.attachment && user && entry\.senderId === user\.id/,
  'pulizia storage non limitata ai propri allegati');

// ---------------------------------------------------------------
// Sidebar: il broadcast chat_message deve far passare anche gli allegati.
// ---------------------------------------------------------------
assert.match(
  sidebar,
  /entry\.kind !== 'message' && entry\.kind !== 'attachment'/,
  'broadcast chat_message non accetta gli allegati',
);

// ---------------------------------------------------------------
// Catena di verifica.
// ---------------------------------------------------------------
assert.ok(pkg.scripts['verify:chat-attachments'], 'script verify:chat-attachments mancante');
assert.match(pkg.scripts.check, /verify:chat-attachments/, 'verify:chat-attachments non inserito in check');

console.log('Chat attachments verification: PASS');
