export type RulesetId = 'hsc' | 'dnd5e' | 'pathfinder' | 'coc7e' | 'cocclassic' | 'custom';

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
    color: '#8b1a1a',
    stats: ['Corpo', 'Mente', 'Spirito', 'Influenza'],
    healthLabel: 'Freschezza',
    hasAudacia: true,
    diceType: 'd6',
  },
  dnd5e: {
    id: 'dnd5e',
    name: 'D&D 5e',
    description: 'Quinta edizione di Dungeons & Dragons. Fantasy epico con classi e livelli.',
    color: '#6b46c1',
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
  coc7e: {
    id: 'coc7e',
    name: 'Il Richiamo di Cthulhu 7° Ed.',
    description: 'Indagini nei misteri dei Miti di Cthulhu nell\'America anni \'20, con un sistema a percentuali aggiornato e più snello rispetto alle edizioni precedenti.',
    color: '#1a5c3a',
    stats: ['FOR', 'DES', 'COS', 'INT', 'POT', 'EDU', 'ASP', 'FAS'],
    healthLabel: 'Punti Ferita',
    hasAudacia: false,
    diceType: 'd100',
  },
  cocclassic: {
    id: 'cocclassic',
    name: 'Il Richiamo di Cthulhu Classic Edition',
    description: 'La versione storica del gioco di ruolo investigativo lovecraftiano, con il classico sistema percentuale e la Tabella della Resistenza per i confronti diretti.',
    color: '#3d2b1f',
    stats: ['FOR', 'DES', 'COS', 'INT', 'POT', 'EDU', 'ASP', 'FAS'],
    healthLabel: 'Punti Ferita',
    hasAudacia: false,
    diceType: 'd100',
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

export const VISIBLE_RULESETS = Object.values(RULESETS).filter(
  rs => rs.id !== 'dnd5e' && rs.id !== 'pathfinder'
);

export interface Campaign {
  id: string;
  name: string;
  description: string;
  ruleset: RulesetId;
  ownerId: string;
  inviteCode?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  logoUrl?: string;
}

// id opzionale: usato dalla migrazione per preservare il legacy campaign ID
export type CampaignCreateInput = Pick<Campaign, 'name' | 'description' | 'ruleset'> & { id?: string };
