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
 * I data-attribute qui sotto sono intenzionali: il CSS del picker non deve
 * dedurre la semantica dalla struttura DOM interna di Radix Tooltip. In questo
 * modo categorie, griglie e trigger restano stilizzabili senza rischiare di
 * nascondere o alterare i glifi Lucide.
 */
export function NoteIconGrid({ onChoose, selectedName = null, onRemove }: NoteIconGridProps) {
  return (
    <div className="tiptap-icon-popover-scroll flex max-h-80 flex-col gap-3 overflow-y-auto">
      {selectedName && onRemove && (
        <button
          type="button"
          data-note-icon-remove="true"
          onClick={onRemove}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--dash-text)]"
        >
          <X className="h-4 w-4 shrink-0 text-[var(--dash-text-strong)]" aria-hidden="true" />
          Rimuovi icona
        </button>
      )}

      {ICON_CATEGORIES.map(({ label, icons }) => (
        <div key={label} data-note-icon-category="true">
          <div
            data-note-icon-category-header="true"
            className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]"
          >
            {label}
          </div>
          <div data-note-icon-grid="true" className="grid grid-cols-6 gap-1">
            {icons.map((name) => {
              const IconComponent = NOTE_ICON_COMPONENTS[name];
              if (!IconComponent) return null;
              const isSelected = selectedName === name;
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-note-icon-button="true"
                      aria-pressed={isSelected}
                      onClick={() => onChoose(name)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-[var(--dash-text-strong)] ${
                        isSelected ? 'bg-[var(--dash-surface-2)]' : ''
                      }`}
                    >
                      <IconComponent
                        data-note-icon-glyph="true"
                        className="h-4 w-4 text-[var(--dash-text-strong)]"
                        aria-hidden="true"
                      />
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
