# Test isolamento chat — staging (Issue #48)

## Evidenze verificate in produzione, sola lettura
`public.chat_messages` contiene: `id uuid`, `campaign_id uuid`, `sender_id text`, `sender_name text`, `sender_avatar_url text`, `content text`, `created_at timestamptz`, `kind text`, `payload jsonb`, `reactions jsonb`.

Sono presenti policy permissive `SELECT USING(true)`, `INSERT WITH CHECK(true)`, `UPDATE USING(true) WITH CHECK(true)` per `authenticated`. Il ruolo dispone dei corrispondenti privilegi SQL. Questi fatti giustificano una verifica urgente dell'isolamento; non sono una dimostrazione che un utente abbia effettivamente letto dati altrui.

## Gate strutturale
`tests/security/chat_rls_catalog.sql` verifica in lettura che RLS sia attivo e che non esistano policy permissive senza vincoli per `authenticated`/`public`. È previsto che **fallisca** sull'attuale configurazione. Non esegue scritture.

Esempio **solo staging**:
```bash
psql -X -v ON_ERROR_STOP=1 -d "$STAGING_DATABASE_URL" -f tests/security/chat_rls_catalog.sql
```

Il test strutturale **non sostituisce** i test diretti con due utenti autenticati e due campagne distinte. Dopo aver predisposto lo staging:
1. Creare GM A, GM B e giocatore C, con campagne A e B e dati sintetici.
2. Usare JWT reali di staging e Data API con ruolo `authenticated`.
3. Come B, tentare SELECT/INSERT/UPDATE sui messaggi di A: devono fallire o restituire zero righe.
4. Come C membro di A, verificare lettura e inserimento autorizzati; `sender_id` deve coincidere con `auth.uid()`.
5. Testare UPDATE su `content`, `sender_id`, `campaign_id` di un messaggio altrui; nessuna modifica consentita.
6. Testare reazioni, eliminazione, notifiche Realtime e tiri segreti con utenti distinti.
7. Ripetere dopo ogni modifica alle policy, con log dei risultati e rollback pronto.

## Strategia patch (non applicata)
Le policy permissive PostgreSQL si combinano con OR. È necessario sostituire le policy troppo ampie, non aggiungerne semplicemente altre. Le nuove condizioni dovranno verificare `campaigns.owner_profile_id = auth.uid()::text` o appartenenza in `campaign_members` e validare `sender_id` per INSERT. Per le reazioni, una policy RLS da sola non impedisce di cambiare altre colonne: valutare GRANT UPDATE limitato alle colonne oppure una RPC dedicata, verificando prima come il client aggiorna i messaggi.

**Nessuna modifica a produzione finché non è disponibile staging e i test non sono superati.**
