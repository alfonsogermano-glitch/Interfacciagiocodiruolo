import type { LucideIcon } from 'lucide-react';
import {
  Activity, Anchor, Bell, Biohazard, Bomb, BookOpen, Brain, Briefcase, Castle, Church, Coins,
  Compass, Crosshair, Crown, Dice6, DoorOpen, Drama, Eye, Feather, Flame, FlaskConical, Footprints,
  Gem, Ghost, GraduationCap, Heart, Home, Key, Landmark, Map, MapPin, Moon, Mountain, Music, Newspaper,
  Pickaxe, Pill, Radiation, Route, Scroll, Shield, Ship, Signpost, Skull, Snowflake, Sparkles, Star,
  Store, Sun, Sword, Swords, Syringe, Target, Tent, Theater, Trees, User, Users, Wand, X, Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { ICON_CATEGORIES } from './tiptapIconData';

/**
 * Unica registry React per il subset Lucide curato delle Note. Il dato delle
 * categorie/nome resta tiptapIconData.ts, condiviso anche dal nodo TipTap;
 * questo mapping aggiunge soltanto i componenti React necessari ai picker.
 */
export const NOTE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Sword, Swords, Shield, Target, Crosshair, Skull, Bomb, Zap, Flame, Biohazard,
  Sparkles, Wand, Ghost, Eye, Moon, Sun, Feather, Scroll, Radiation, Snowflake,
  Compass, Map, MapPin, Mountain, Tent, Footprints, Anchor, Ship, Route, Signpost,
  User, Users, Crown, GraduationCap, Drama, Briefcase,
  Key, Gem, Coins, Pickaxe, FlaskConical, Pill, Syringe, Dice6, BookOpen,
  Castle, Church, Landmark, DoorOpen, Home, Store, Trees,
  Activity, Bell, Brain, Star, Heart, Music, Theater, Newspaper,
};

interface NoteIconGridProps {
  onChoose: (name: string) => void;
  selectedName?: string | null;
  onRemove?: () => void;
}

/**
 * Griglia condivisa dai due punti di inserimento icone:
 * - picker inline dentro il contenuto rich text;
 * - picker dell'icona titolo nella colonna Note.
 *
 * `onRemove` e `selectedName` sono opzionali cosi' il picker inline mantiene
 * esattamente il comportamento precedente, mentre quello del titolo puo'
 * evidenziare la scelta corrente e rimuoverla.
 */
export function NoteIconGrid({ onChoose, selectedName = null, onRemove }: NoteIconGridProps) {
  return (
    <div className="tiptap-icon-popover-scroll flex max-h-80 flex-col gap-3 overflow-y-auto">
      {selectedName && onRemove && (
        <>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
          >
            <X className="h-4 w-4" />
            Rimuovi icona
          </button>
          <div className="border-t border-[var(--dash-border-soft)]" />
        </>
      )}

      {ICON_CATEGORIES.map(({ label, icons }) => (
        <div key={label}>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">{label}</div>
          <div className="grid grid-cols-6 gap-1">
            {icons.map((name) => {
              const IconComponent = NOTE_ICON_COMPONENTS[name];
              if (!IconComponent) return null;
              const isSelected = selectedName === name;
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onChoose(name)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--dash-surface-2)] ${
                        isSelected ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : ''
                      }`}
                    >
                      <IconComponent className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[10001]">{name}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
