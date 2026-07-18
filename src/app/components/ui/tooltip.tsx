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
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
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
        <TooltipPrimitive.Arrow
          style={{ fill: colors.panel }}
          className="z-[1200] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
