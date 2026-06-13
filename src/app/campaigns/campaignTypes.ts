export type RulesetId = 'hsc' | 'dnd5e' | 'pathfinder' | 'custom';

export interface RulesetDefinition {
  id: RulesetId;
  name: string;
  description: string;
  /** Colore badge identificativo */
  color: string;
  /** Campi stat principali del personaggio */
  stats: string[];
  /** Unità salute (es. "Freschezza", "PF", "HP") */
  healthLabel: string;
  /** Usa il sistema Audacia/Follia */
  hasAudacia: boolean;
  /** Usa il dado (es. "d6", "d20") */
  diceType: string;
}

export const RULESETS: Record<RulesetId, RulesetDefinition> = {
  hsc: {
    id: 'hsc',
    name: 'High School Cthulhu',
    description: 'Horror cosmico ambientato in un liceo giapponese. Usa Freschezza, Audacia e Follia.',
    color: '#8a5a34',
    stats: ['Corpo', 'Mente', 'Spirito', 'Influenza'],
    healthLabel: 'Freschezza',
    hasAudacia: true,
    diceType: 'd6',
  },
  dnd5e: {
    id: 'dnd5e',
    name: 'D&D 5e',
    description: 'Quinta edizione di Dungeons & Dragons. Fantasy epico con classi e livelli.',
    color: '#e74c3c',
    stats: ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR'],
    healthLabel: 'Punti Ferita',
    hasAudacia: false,
    diceType: 'd20',
  },
  pathfinder: {
    id: 'pathfinder',
    name: 'Pathfinder 2e',
    description: 'Fantasy tattico con sistema a 3 azioni e grande profondità di personalizzazione.',
    color: '#8e44ad',
    stats: ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR'],
    healthLabel: 'Punti Ferita',
    hasAudacia: false,
    diceType: 'd20',
  },
  custom: {
    id: 'custom',
    name: 'Regolamento personalizzato',
    description: 'Usa la dashboard come strumento generico, adattala al tuo sistema.',
    color: '#27ae60',
    stats: [],
    healthLabel: 'Salute',
    hasAudacia: false,
    diceType: 'd6',
  },
};

export interface Campaign {
  id: string;
  name: string;
  description: string;
  ruleset: RulesetId;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// id opzionale: usato dalla migrazione per preservare il legacy campaign ID
export type CampaignCreateInput = Pick<Campaign, 'name' | 'description' | 'ruleset'> & { id?: string };
