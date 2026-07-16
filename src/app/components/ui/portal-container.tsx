import { createContext, useContext } from 'react';

// Nodo DOM dentro l'albero AppShell (quello con data-dashboard-palette, da
// cui discendono le variabili CSS --dash-*) da usare come container per i
// portali Radix - di default i portali montano su document.body, che sta
// FUORI da quell'albero, quindi le variabili --dash-* non ci arrivano per
// cascata CSS (visto con il menu a tre puntini invisibile in CampaignHome).
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
