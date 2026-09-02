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
  onFocus,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onFocus={event => {
        onFocus?.(event);
        if (event.defaultPrevented) return;

        // Radix Tooltip apre anche sul focus. Quando un Popover viene aperto
        // col mouse, Radix puo' spostare programmaticamente il focus sul primo
        // controllo interno: quel focus non rappresenta un'intenzione
        // dell'utente di leggere il tooltip. Manteniamo invece il focus da
        // tastiera, riconoscibile tramite :focus-visible.
        if (!(event.currentTarget as HTMLElement).matches(':focus-visible')) {
          event.preventDefault();
        }
      }}
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
        }}
        className={cn(
          "pointer-events-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[1200] w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
        {/* Arrow SENZA stroke, come in origine - il primo tentativo di fix
            (dare uno stroke al polygon intero, vedi storia git) chiudeva si'
            il buco nella cornice ma delineava anche la punta esterna rivolta
            verso il trigger, che deve restare piatta/senza contorno per
            fondersi visivamente col corpo - selezionare a mano SOLO i due
            lati "giusti" del polygon non e' praticabile da qui: quali lati
            finiscano dentro il riquadro (nascosti, irrilevanti) o fuori
            (visibili) dipende dalla rotazione combinata data da
            PopperArrow per ciascun side (top/right/bottom/left) + il nostro
            rotate-45, diversa per ciascuno dei 4 casi. */}
        <TooltipPrimitive.Arrow
          style={{ fill: colors.panel }}
          className="z-[1200] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
        />
        {/* Cornice del riquadro ridisegnata QUI, come layer separato DOPO
            l'arrow (quindi sopra di essa nell'ordine di paint), invece che
            come proprieta' `border` sul Content sopra: un `border` sul
            Content stesso viene dipinto PRIMA dei suoi figli (l'arrow e'
            un figlio), quindi l'arrow lo ricopriva col proprio fill piatto
            esattamente dove i due si sovrappongono - da li' il buco nella
            cornice (bug verificato 2026-07-29). Questo layer e' un
            rettangolo assoluto statico, mai ruotato: indipendentemente da
            side/rotazione dell'arrow, ridisegna l'intero perimetro
            arrotondato del riquadro SOPRA a tutto, richiudendo il buco
            senza mai delineare la sagoma dell'arrow (che resta cosi'
            visibile solo per il proprio fill, non per un contorno). */}
        <div
          aria-hidden="true"
          style={{ border: `1px solid ${colors.border}` }}
          className="pointer-events-none absolute inset-0 z-[1200] rounded-md"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
