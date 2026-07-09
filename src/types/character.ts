// Tipi per High School Cthulhu

import type { EquipmentLocation, EquipmentType } from './equipment';
import type { TokenBorderStyle, TokenBorderThickness } from './tokenStyle';

export type Ambito = 'Fisico' | 'Scuola' | 'Carisma' | 'Strada';

export type Abilita =
  // Fisico
  | 'Muscoli' | 'Sport' | 'Acrobatica' | 'Resistenza' | 'Freddezza'
  // Scuola
  | 'Cultura' | 'Tecnologia' | 'Studio' | 'Pronto Soccorso' | 'Scienze'
  // Carisma
  | 'Esibirsi' | 'Parlantina' | 'Fascino' | 'Intuito' | 'Leadership'
  // Strada
  | 'Furtività' | 'Mira' | 'Sopravvivenza' | 'Crimine' | 'Allerta';

export type Stile =
  | 'Jock'
  | 'Cheerleader'
  | 'Nerd'
  | 'Goth'
  | 'Self-made'
  | 'Rebel'
  | 'Gangsta'
  | "Daddy's kid";

export type Viaggio =
  // Jock
  | 'Campione'
  | 'Bullo'
  | 'Fratello maggiore'
  // Cheerleader
  | 'Stronza suprema'
  | "Fidanzata d'America"
  | 'Sbandata'
  // Nerd
  | 'Primo della classe'
  | 'Smanettone'
  | 'Sapientino'
  // Goth
  | 'Occultista'
  | 'Metallaro'
  | 'Emo'
  // Self-made
  | 'Ex-promessa'
  | 'Lavoratore'
  | 'Espulso'
  // Rebel
  | 'Teppista'
  | 'Attivista'
  | 'Skater'
  // Gangsta
  | 'Delinquente'
  | 'Genio del ghetto'
  | 'Ladruncolo'
  // Daddy's kid
  | 'Party animal'
  | 'Nato per vincere'
  | 'Rampollo della malavita';

export type ConditionType =
  | 'Malconcio'
  | 'Fuso'
  | 'Sfigato'
  | 'Fifone'
  | 'Spezzato'
  | 'Stanco'
  | 'Intossicato'
  | 'Malato';

export type TurbaLevel = 'Lieve' | 'Moderata' | 'Grave';

export type CharacterStatus = 'draft' | 'active' | 'archived';

export type EquipmentSource = 'catalog' | 'custom';

export interface Condition {
  type: ConditionType;
  description?: string;
}

export interface Turba {
  level: TurbaLevel;
  trigger: string;
  description: string;
}

export interface Equipment {
  id: string;
  catalogItemId?: string | null;
  source?: EquipmentSource;
  name: string;
  type: EquipmentType;
  description: string;
  inseparabile: boolean;
  isVehicle: boolean;
  location: EquipmentLocation;
}

export interface Trait {
  name: string;
  description: string;
  benefit: string;
}

export interface PortraitCrop {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface Character {
  id: string;
  name: string;
  style: Stile;
  viaggio: Viaggio;
  description?: string;

  // Ambiti
  ambiti: {
    Fisico: number;
    Scuola: number;
    Carisma: number;
    Strada: number;
  };

  // Abilità
  abilita: {
    [key in Abilita]?: number;
  };

  // Freschezza (12 caselle, cruciali: 8 e 12)
  freschezza: number;
  maxFreschezza: number;
  caselleFrischezzaCruciali: number[]; // [8, 12]

  // Spirale della Follia (9 caselle, turbe ogni 3: 3, 6, 9)
  follia: number;
  maxFollia: number;

  // Condizioni
  conditions: Condition[];

  // Turbe
  turbe: Turba[];

  // Audacia
  audacia: number;

  // Prodigi
  prodigi: number;

  // Legame
  legame: string;
  linkedCharacterId?: string;
  legameDescription?: string;

  coverImageUrl?: string;
  portraitImageUrl?: string;
  portraitCroppedImageUrl?: string;

  coverPositionX?: number;
  coverPositionY?: number;
  coverScale?: number;

  portraitCrop?: PortraitCrop;

  // Token mappa (Token Studio) - dedicati, separati dal cerchio portrait
  // sopra: il token sulla mappa e il cerchio nella scheda sono
  // personalizzabili in modo indipendente.
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderLabel?: string | null;
  tokenBorderVisible?: boolean | null;

  // Tutore
  tutore: string;

  // Tratti
  tratti: Trait[];

  // Equipaggiamento
  equipment: Equipment[];

  // Tipo Speciale
  tipoSpeciale: string;
}

export interface GameState {
  drama: number; // 1-12
  characters: Character[];
}

// ========================================================
// Persistenza / Nuova architettura definitiva
// ========================================================

export interface CharacterSheetData {
  style?: Stile;
  viaggio?: Viaggio;
  description?: string;

  ambiti?: {
    Fisico: number;
    Scuola: number;
    Carisma: number;
    Strada: number;
  };

  abilita?: {
    [key in Abilita]?: number;
  };

  freschezza?: number;
  maxFreschezza?: number;
  caselleFrischezzaCruciali?: number[];

  follia?: number;
  maxFollia?: number;

  conditions?: Condition[];
  turbe?: Turba[];
  audacia?: number;
  prodigi?: number;

  legame?: string;
  linkedCharacterId?: string;
  legameDescription?: string;

  coverImageUrl?: string;
  portraitImageUrl?: string;
  portraitCroppedImageUrl?: string;

  coverPositionX?: number;
  coverPositionY?: number;
  coverScale?: number;

  portraitCrop?: PortraitCrop;

  tutore?: string;
  tratti?: Trait[];
  tipoSpeciale?: string;

  notes?: string;
  extra?: Record<string, unknown>;
}