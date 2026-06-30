"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "./utils";

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
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function readPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const fallback = { panel: '#1a1a1a', text: '#f5f5f5', border: '#444444' };
  if (!el) return fallback;
  const computed = getComputedStyle(el);
  return {
    panel: computed.getPropertyValue('--dash-panel').trim() || fallback.panel,
    text: computed.getPropertyValue('--dash-text-strong').trim() || fallback.text,
    border: computed.getPropertyValue('--dash-border-soft').trim() || fallback.border,
  };
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const [colors, setColors] = React.useState(() => readPaletteColors());

  // Rilegge i colori ogni volta che il tooltip cambia stato (aperto/chiuso)
  // così cattura sempre la palette corrente, anche se è cambiata dopo il mount
  const handleOpenChange = React.useCallback(() => {
    setColors(readPaletteColors());
  }, []);

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        onPointerEnter={handleOpenChange}
        style={{
          backgroundColor: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
        }}
        className={cn(
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          style={{ fill: colors.panel }}
          className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
