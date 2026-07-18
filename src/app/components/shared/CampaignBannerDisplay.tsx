import type { ReactNode } from 'react';
import { RulesetTag } from './RulesetTag';
import type { Campaign } from '../../campaigns/campaignTypes';

export type CampaignBannerSize = 'full' | 'compact';

interface SizePreset {
  /** Usata identica per il box immagine E per il placeholder senza immagine
   *  - un'unica fonte di verità per l'aspect ratio, cosi' i due rami non
   *  possono mai disallinearsi (bug di oggi: il placeholder usava un'altezza
   *  fissa "indovinata" per una sola larghezza di contenitore, che smetteva
   *  di combaciare con l'aspect ratio non appena la card veniva usata in un
   *  contesto di larghezza diversa - griglia stretta vs card a piena
   *  larghezza). aspect-ratio funziona anche su un div vuoto, quindi non
   *  serve un'altezza fissa separata per il placeholder. */
  imageBoxClassName: string;
  overlayPaddingClassName: string;
  logoClassName: string;
  /** Posizione verticale del blocco logo+testo dentro il banner. */
  logoTopClassName: string;
  /** Allineamento incrociato del flex logo+testo: "items-start" (ancorato
   *  dall'alto, cresce verso il basso) per il banner pieno, "items-center"
   *  (centrato, stesso spazio sopra/sotto) per la card compatta - li'
   *  logoTopClassName usa top-1/2 -translate-y-1/2 invece di un top-[X%]. */
  overlayAlignClassName: string;
  nameClassName: string;
  descriptionClassName: string;
  metaClassName: string;
  /** Scurisce l'immagine sotto il testo - assente per "full" (l'immagine è
   *  il soggetto lì), presente per "compact" dove il testo deve prevalere
   *  su una card piccola invece di competere con la foto. */
  dimOverlayClassName: string | null;
  /** Text-shadow sul badge ruleset (stesso TEXT_SHADOW_STYLE già su
   *  nome/descrizione/data) - necessario solo in "full": lì il badge sta nel
   *  primo 28% dell'immagine, fascia non coperta dallo scrim (assente) né
   *  dal gradiente inferiore (ancora trasparente li'), quindi il contrasto
   *  dipende solo dalla foto sottostante. "compact" ha già lo scrim scuro
   *  uniforme dietro, quindi non ne ha bisogno. */
  badgeTextShadow: boolean;
}

// Un solo prop "size" invece di una prop per ogni valore (logo/font/aspect):
// oggi servono solo due preset (banner pieno in CampaignHome, card compatta
// in HomeScreen) - se ne servisse un terzo in futuro si aggiunge qui, non
// alla firma del componente.
const SIZE_PRESETS: Record<CampaignBannerSize, SizePreset> = {
  full: {
    imageBoxClassName: 'aspect-[3.8/1] w-full',
    overlayPaddingClassName: 'px-6',
    logoClassName: 'h-28 w-28',
    logoTopClassName: 'top-[28%]',
    overlayAlignClassName: 'items-start',
    nameClassName: 'text-2xl font-semibold',
    descriptionClassName: 'mt-1 max-w-md text-sm',
    metaClassName: 'mt-2 text-xs',
    dimOverlayClassName: null,
    badgeTextShadow: true,
  },
  compact: {
    // Aspect alto = box basso (altezza = larghezza / aspect) - 6.4 e' il
    // doppio di 3.2 (round precedente), quindi altezza dimezzata a parita'
    // di larghezza. Le card di joinedCampaigns vivono in una griglia 2-3
    // colonne (molto più strette di mostRecentCampaign, a piena larghezza):
    // il logo sotto e' tarato sul caso piu' stretto, non sul piu' largo.
    imageBoxClassName: 'aspect-[6.4/1] w-full',
    overlayPaddingClassName: 'px-3',
    logoClassName: 'h-28 w-28',
    // Centrato (non ancorato dall'alto come "full"): stesso spazio sopra e
    // sotto logo+testo, non più a ridosso del bordo superiore della card.
    logoTopClassName: 'top-1/2 -translate-y-1/2',
    overlayAlignClassName: 'items-center',
    nameClassName: 'text-3xl font-semibold',
    descriptionClassName: 'mt-0.5 line-clamp-1 text-[11px]',
    metaClassName: 'mt-1 text-[10px]',
    dimOverlayClassName: 'bg-black/60',
    badgeTextShadow: false,
  },
};

// Ombra forte e uniforme (non solo drop-shadow di Tailwind, che a volte
// risulta troppo tenue su foto molto chiare) cosi' il testo resta leggibile
// sopra qualunque immagine di copertina.
const TEXT_SHADOW_STYLE = { textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 1px 12px rgba(0,0,0,0.5)' };

/**
 * Porzione statica del banner di copertina campagna (immagine + sfumatura +
 * logo/nome/descrizione/ruleset+data sovrapposti, più un eventuale slot
 * extra per riga - es. codice invito) - nessuna logica di editing/upload:
 * puramente presentazionale, cosi' da essere riusabile sia in
 * CampaignCoverEditor.tsx (che aggiunge sopra questo componente solo la
 * chrome di modifica: pulsante matita, CTA "aggiungi immagine", modal di
 * upload) sia nelle card della Panoramica (HomeScreen.tsx, sola lettura,
 * dimensioni ridotte via size="compact").
 */
export function CampaignBannerDisplay({
  campaign,
  size = 'full',
  extraRow,
}: {
  campaign: Campaign;
  size?: CampaignBannerSize;
  /** Contenuto opzionale mostrato come quarta riga, sotto ruleset+data -
   *  es. il chip/bottone codice invito in HomeScreen.tsx, che serve solo per
   *  mostRecentCampaign (una card qualunque - joinedCampaigns, il futuro
   *  banner di un'altra pagina - lo omette semplicemente). Interazione e
   *  stato restano nel chiamante: questo componente resta presentazionale,
   *  si limita a posizionare quello che riceve. */
  extraRow?: ReactNode;
}) {
  const preset = SIZE_PRESETS[size];

  return (
    <div className="relative w-full shrink-0 overflow-hidden">
      {campaign.coverImageUrl ? (
        <div className={`${preset.imageBoxClassName} bg-[var(--dash-panel)]`}>
          <img src={campaign.coverImageUrl} alt={campaign.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={`${preset.imageBoxClassName} bg-gradient-to-br from-[var(--dash-panel)] to-black/40`} />
      )}

      {preset.dimOverlayClassName && (
        <div className={`pointer-events-none absolute inset-0 z-[5] ${preset.dimOverlayClassName}`} />
      )}

      {/* Sfumatura verso il basso nel colore di sfondo pagina (non un taglio
          netto) - anche supporto di lettura per nome/descrizione/badge
          sovrapposti qui sotto. Overlay su tutta l'altezza del banner
          (inset-0, non solo l'ultimo terzo): gli stop del gradiente, non
          l'altezza del div, decidono dove inizia la dissolvenza - resta
          piena/nitida fino al 60%, poi sfuma sul restante 40%. Uno stop
          intermedio a mezza opacità (via color-mix, non un rgba hardcoded:
          --dash-bg cambia per palette/tema, color-mix ne prende sempre il
          valore reale) rende la transizione morbida invece di un bordo
          percepibile a due sole tappe (trasparente -> opaco di colpo). */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, transparent 60%, color-mix(in srgb, var(--dash-bg) 50%, transparent) 80%, var(--dash-bg) 100%)',
        }}
      />

      {/* Banner pieno: ancorato dall'alto (items-start), logo e testo
          crescono verso il basso a partire dallo stesso punto invece di
          allinearsi al bordo inferiore reciproco. Card compatta: centrato
          (items-center + top-1/2 -translate-y-1/2), stesso spazio sopra e
          sotto. */}
      <div className={`absolute inset-x-0 z-20 flex gap-4 ${preset.overlayAlignClassName} ${preset.logoTopClassName} ${preset.overlayPaddingClassName}`}>
        <div className={`${preset.logoClassName} shrink-0 overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-lg`}>
          {campaign.logoUrl ? (
            <img src={campaign.logoUrl} alt={campaign.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2">
              <img src="/icon-source-1024.png" alt="" className="h-full w-full object-contain opacity-80" style={{ filter: 'invert(1)' }} />
            </div>
          )}
        </div>

        <div className="min-w-0 pb-1">
          <h1 className={`${preset.nameClassName} text-white`} style={TEXT_SHADOW_STYLE}>{campaign.name}</h1>
          {campaign.description && (
            <p className={`${preset.descriptionClassName} max-w-md text-white/90`} style={TEXT_SHADOW_STYLE}>{campaign.description}</p>
          )}
          <div className={`flex flex-wrap items-center gap-2 text-white/90 ${preset.metaClassName}`}>
            <span style={preset.badgeTextShadow ? TEXT_SHADOW_STYLE : undefined}>
              <RulesetTag rulesetId={campaign.ruleset} />
            </span>
            <span style={TEXT_SHADOW_STYLE}>
              Creata il {new Date(campaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          {extraRow && <div className="mt-1.5">{extraRow}</div>}
        </div>
      </div>
    </div>
  );
}
