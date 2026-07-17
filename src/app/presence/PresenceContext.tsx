import { createContext, useContext, useState } from 'react';

type PresenceContextValue = {
  onlineProfileIds: Set<string>;
  isOnline: (profileId: string | null | undefined) => boolean;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

// Presenza globale ("loggato su Hollow Gate ora") - DISATTIVATA. Il canale
// online:all (ex presence:global) non si è mai sottoscritto con successo
// (CHANNEL_ERROR persistente, causa mai confermata) e non ha alcun
// consumer di useOnlinePresence() nel resto del codice. Tenerlo attivo
// aveva un costo reale: il rejoin automatico della libreria falliva in
// loop indefinito su ogni pagina per ogni utente collegato (trovato
// durante l'indagine sul mancato aggiornamento realtime di CampaignHome,
// 2026-07-19 - non risultato esserne la causa diretta, ma comunque rumore
// senza beneficio). Nessun tentativo di connessione finché non si
// riprende in mano la feature.
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [onlineProfileIds] = useState<Set<string>>(new Set());

  return (
    <PresenceContext.Provider value={{
      onlineProfileIds,
      isOnline: (profileId) => !!profileId && onlineProfileIds.has(profileId),
    }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useOnlinePresence(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('useOnlinePresence deve essere usato dentro PresenceProvider');
  return ctx;
}
