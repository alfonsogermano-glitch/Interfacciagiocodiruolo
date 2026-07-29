"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "./utils";
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId, type PaletteColors } from "./paletteColors";

const PaletteColorsContext = React.createContext<PaletteColors>(DEFAULT_PALETTE_COLORS);

export function TooltipColorsProvider({
  palette,
  children,
}: {
  palette: string;
  children: React.ReactNode;
}) {
  const colors = PALETTE_COLORS[palette as PaletteId] ?? DEFAULT_PALETTE_COLORS;
  return (
    <PaletteColorsContext.Provider value={colors}>
      {children}
    </PaletteColorsContext.Provider>
  );
}

function TooltipProvider({
  delayDuration = 0,
  // Radix, con "hoverable content" attivo (il default), non chiude il
  // tooltip subito quando il puntatore lascia il trigger: calcola un
  // poligono di "grazia" tra il punto di uscita e l'intero rettangolo del
  // contenuto, e resta aperto finche' il puntatore non ne esce (pensato per
  // non far sparire il tooltip mentre ci si sposta verso di esso per
  // leggerlo/selezionarne il testo). Con icone piccole ravvicinate (gap-1,
  // bottoni 28x28 - TrashRow.tsx, FolderRow.tsx, le coppie di pulsanti
  // header in SessionNotesPanel.tsx) quel poligono finisce quasi sempre per
  // includere anche l'icona ADIACENTE, quindi muovere il mouse da un'icona
  // all'altra non fa mai uscire il puntatore dal poligono: il tooltip resta
  // visibile finche' non si esce dall'intero gruppo (bug verificato,
  // indipendente da `side` - stesso motivo per cui provare top/bottom/left
  // non cambiava nulla). Disattivato di default: i tooltip di questa app
  // sono sempre etichette brevi in sola lettura (mai testo da selezionare o
  // contenuto interattivo dentro la bolla), quindi la "grace area" non
  // protegge nessuna interazione reale qui - il costo (chiusura immediata
  // all'uscita dal trigger, invece che "morbida") e' trascurabile per
  // bottoni di dimensione normale, il beneficio (niente piu' tooltip
  // bloccati tra icone ravvicinate) e' netto.
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onClick={event => {
        onClick?.(event);
        // Radix tiene il tooltip visibile finche' il trigger ha il focus
        // (necessario per l'accessibilita' da tastiera) - ma cliccare un
        // <button>/<span> gli da' focus nativo nella maggior parte dei
        // browser (tutti tranne Safari su macOS), quindi il tooltip resta
        // visibile anche dopo che il mouse se n'e' andato, finche' il focus
        // non si sposta altrove. Comportamento noto/documentato di Radix
        // Tooltip quando il trigger e' anche un elemento cliccabile, non un
        // bug applicativo - fix centralizzato qui (non ripetuto in ogni
        // componente che usa TooltipTrigger) cosi' copre automaticamente
        // anche gli usi futuri.
        (event.currentTarget as HTMLElement | null)?.blur?.();
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const colors = React.useContext(PaletteColorsContext);

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        style={{
          backgroundColor: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
        }}
        className={cn(
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[1200] w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
        {/* asChild: il polygon che @radix-ui/react-arrow disegnerebbe da solo
            (asChild=false) e' irraggiungibile da qui - non possiamo dargli
            uno stroke proprio, solo un fill che eredita via cascata SVG. Il
            bordo del riquadro (border: 1px solid, sopra) finiva quindi
            "tagliato" esattamente dove la freccia lo ricopre col proprio
            fill piatto senza contorno: da qui l'interruzione visibile nella
            cornice, sempre sul lato da cui la freccia esce verso il
            trigger - bug verificato 2026-07-29. Fornendo noi stessi il
            <polygon>, possiamo aggiungergli uno stroke che ridisegna quel
            tratto di bordo esattamente dove il fill lo ricopriva, richiudendo
            il contorno. vectorEffect="non-scaling-stroke" evita che lo
            stroke venga deformato dal viewBox non quadrato (30x10, reso poi
            10x10 via preserveAspectRatio="none") e dalla rotazione CSS
            (rotate-45) applicata all'svg intero - senza, lo stesso
            strokeWidth risulterebbe piu' sottile su un asse che sull'altro. */}
        <TooltipPrimitive.Arrow asChild>
          <svg className="z-[1200] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]">
            <polygon
              points="0,0 30,0 15,10"
              style={{
                fill: colors.panel,
                stroke: colors.border,
                strokeWidth: 1,
                vectorEffect: 'non-scaling-stroke',
              }}
            />
          </svg>
        </TooltipPrimitive.Arrow>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
