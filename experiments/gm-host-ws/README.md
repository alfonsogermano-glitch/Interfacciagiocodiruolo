# Hollowgate GM Host — test WebSocket senza WebRTC
Prototipo isolato: non è il VTT completo, non salva campagne, non usa Supabase o il dominio di produzione. Utilizzare esclusivamente dati fittizi.
## Windows
1. Installa Node.js 22 e cloudflared (Cloudflare Tunnel) dai siti ufficiali.
2. Scarica la cartella esperimento oppure usa lo ZIP consegnato in chat.
3. Apri PowerShell nella cartella ed esegui:
   ```powershell
   npm install
   npm test
   npm start
   ```
4. Apri **solo sul PC del GM** l'indirizzo `http://localhost:4177/#gm=...` riportato nella console. Non condividere questo URL.
5. In un secondo PowerShell:
   ```powershell
   cloudflared tunnel --url http://localhost:4177
   ```
6. Copia l'indirizzo HTTPS `https://...trycloudflare.com` stampato da cloudflared nel campo della pagina GM, premi **Crea link giocatore**, poi **Copia link**.
7. Invia il link privato al giocatore Android, aprilo in Chrome e premi **Entra nella sessione**. Prova spostamento e d20, confrontando la visualizzazione GM e Android.
8. Arresta server e tunnel con Ctrl+C; i token diventano inutilizzabili.

Niente porte sul router, STUN o TURN. Richiede che il PC GM sia acceso e il tunnel resti attivo.

**Sicurezza e limiti:** Quick Tunnel è un servizio per prove, non garantisce disponibilità e il suo indirizzo cambia. Il link concede accesso alla demo finché il server è acceso. Non usare account, credenziali o dati di campagne reali. Prima della produzione servono autenticazione individuale, autorizzazioni robuste, backup, salvataggio cifrato e integrazione con il client Hollowgate React. Il test su GitHub non dimostra connettività PC–Android.
