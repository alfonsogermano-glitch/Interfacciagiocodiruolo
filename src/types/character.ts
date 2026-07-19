// Tipi per High School Cthulhu

import type { EquipmentLocation, EquipmentType } from './equipment';
import type { TokenBorderStyle, TokenBorderThickness } from './tokenStyle';
import type { ImageCrop } from './imageCrop';

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
  // Risultato finale del ritaglio (ImageCropCore nel tab "Immagine"),
  // mostrato in card/griglia/token. Nessun crop {x,y,scale} da mantenere
  // in sincronia altrove.
  portraitImageUrl?: string;
  // Foto intera pre-ritaglio (ridimensionata, non il file grezzo): riapre
  // l'editor da qui invece che dall'ultimo quadrato salvato. Assente per
  // dati precedenti a questo campo - fallback su portraitImageUrl.
  portraitSourceImageUrl?: string;
  // Ultima area di ritaglio confermata (percentuali, formato nativo di
  // react-easy-crop: {x, y, width, height}) - riporta il cropper alla
  // stessa posizione/zoom invece che a centro/zoom di default.
  portraitCropArea?: { x: number; y: number; width: number; height: number } | null;
  // Asset condiviso della raccolta immagini (image_assets) da cui questo
  // personaggio segue la foto sorgente - vedi imageAssetsService.ts.
  // Assente = immagine di proprieta' esclusiva, comportamento invariato
  // (fase di solo schema/scrittura: il rendering non lo usa ancora, vedi
  // Fase 2).
  portraitAssetId?: string | null;

  // Cornice portrait, cover 16:9 e cornice cover - stessa struttura di
  // Monster (monstersTypes.ts), colonne dedicate promosse da sheet_data
  // (vedi charactersService.ts). coverPositionX/Y/coverScale (mai avuti
  // effetto visivo, nessuna UI li applicava come transform) sono stati
  // sostituiti da coverCrop qui sotto.
  portraitFrameAssetId?: string | null;
  portraitFrameRotationDegrees?: number;
  portraitFrameOffsetX?: number;
  portraitFrameOffsetY?: number;
  portraitFrameScaleX?: number;
  portraitFrameScaleY?: number;

  coverImageScale?: number;
  coverCrop?: ImageCrop;
  coverRotationDegrees?: number;
  frameRotation?: 0 | 90;
  frameRotationDegrees?: number;
  coverFrameOffsetX?: number;
  coverFrameOffsetY?: number;
  coverFrameScaleX?: number;
  coverFrameScaleY?: number;
  coverFrameAssetId?: string | null;

  // Token mappa (Token Studio) - dedicati, separati dalla cornice portrait
  // sopra: il token sulla mappa e il ritratto nella scheda sono
  // personalizzabili in modo indipendente.
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  tokenBorderThickness?: TokenBorderThickness | null;
  tokenBorderLabel?: string | null;
  tokenBorderVisible?: boolean | null;

  // "Precompilati": PG creato normalmente dal GM, marcabile come disponibile
  // per i giocatori di una campagna ("Richiedi"/"Rilascia" in MyCharactersPage.tsx).
  // claimableOrigin si accende la prima volta che availableForPlayers viene
  // impostato true e non si spegne mai piu' - distingue un PG nato
  // precompilato (mostra "Rilascia" quando richiesto) da uno creato da zero
  // da un giocatore (non lo mostra mai). Colonne dedicate, mai incluse nel
  // payload generico di saveCharacter (charactersService.ts) per non essere
  // sovrascritte a ogni autosave - vanno tramite funzioni dedicate.
  availableForPlayers?: boolean;
  claimableOrigin?: boolean;

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
  portraitSourceImageUrl?: string;
  portraitCropArea?: { x: number; y: number; width: number; height: number } | null;

  tutore?: string;
  tratti?: Trait[];
  tipoSpeciale?: string;

  notes?: string;
  extra?: Record<string, unknown>;
}