  import { useState, useEffect, useRef } from 'react';
  import { X } from 'lucide-react';
  import type { Character, Stile, Viaggio, Trait, Abilita, Equipment } from '../../../types/character';
  import { STYLE_TRAITS, JOURNEY_TRAITS } from '../../../data/traits';
  import {
    OGGETTI_TASCABILI,
    OGGETTI_TRASPORTABILI,
    RISORSE,
    RISORSE_VEICOLI
  } from '../../../data/equipmentData';
  import { generateUUID } from '../../../lib/uuid';
  
  interface CharacterCreationWizardProps {
    onClose: () => void;
    onAdd: (character: Character & { player: string; notes: string }) => void;
    existingCharacters: Array<{ id: string; name: string }>;
    initialCharacter?: (Character & { player: string; notes: string }) | null;
  }
  
  // Definizione dei Viaggi per ogni Stile
  const VIAGGI_PER_STILE: Record<Stile, Viaggio[]> = {
    Jock: ['Campione', 'Bullo', 'Fratello maggiore'],
    Cheerleader: ['Stronza suprema', "Fidanzata d'America", 'Sbandata'],
    Nerd: ['Primo della classe', 'Smanettone', 'Sapientino'],
    Goth: ['Occultista', 'Metallaro', 'Emo'],
    'Self-made': ['Ex-promessa', 'Lavoratore', 'Espulso'],
    Rebel: ['Teppista', 'Attivista', 'Skater'],
    Gangsta: ['Delinquente', 'Genio del ghetto', 'Ladruncolo'],
    "Daddy's kid": ['Party animal', 'Nato per vincere', 'Rampollo della malavita']
  };
  
  // Bonus Ambito per ogni Stile
  type AmbitoType = 'Fisico' | 'Scuola' | 'Carisma' | 'Strada';
  
  const STILE_AMBITO_BONUS: Record<Stile, AmbitoType> = {
    Jock: 'Fisico',
    Cheerleader: 'Carisma',
    Nerd: 'Scuola',
    Goth: 'Strada',
    'Self-made': 'Carisma',
    Rebel: 'Fisico',
    Gangsta: 'Strada',
    "Daddy's kid": 'Scuola'
  };
  
  const VIAGGIO_AMBITO_BONUS: Record<Viaggio, AmbitoType> = {
    // Jock
    'Campione': 'Carisma',
    'Bullo': 'Strada',
    'Fratello maggiore': 'Scuola',
    // Cheerleader
    'Stronza suprema': 'Fisico',
    "Fidanzata d'America": 'Scuola',
    'Sbandata': 'Strada',
    // Nerd
    'Primo della classe': 'Fisico',
    'Smanettone': 'Strada',
    'Sapientino': 'Carisma',
    // Goth
    'Occultista': 'Scuola',
    'Metallaro': 'Fisico',
    'Emo': 'Carisma',
    // Self-made
    'Ex-promessa': 'Fisico',
    'Lavoratore': 'Strada',
    'Espulso': 'Scuola',
    // Rebel
    'Teppista': 'Strada',
    'Attivista': 'Scuola',
    'Skater': 'Carisma',
    // Gangsta
    'Delinquente': 'Fisico',
    'Genio del ghetto': 'Scuola',
    'Ladruncolo': 'Carisma',
    // Daddy's kid
    'Party animal': 'Carisma',
    'Nato per vincere': 'Fisico',
    'Rampollo della malavita': 'Strada'
  };
  
  // Calcola gli ambiti basandosi su stile e viaggio
  const calculateAmbiti = (style: Stile, viaggio: Viaggio): { Fisico: number; Scuola: number; Carisma: number; Strada: number } => {
    const ambiti = { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 };
  
    // Aggiungi bonus dello Stile
    const styleBonus = STILE_AMBITO_BONUS[style];
    ambiti[styleBonus] = Math.min(2, ambiti[styleBonus] + 1);
  
    // Aggiungi bonus del Viaggio
    const viaggioBonus = VIAGGIO_AMBITO_BONUS[viaggio];
    ambiti[viaggioBonus] = Math.min(2, ambiti[viaggioBonus] + 1);
  
    return ambiti;
  };
  
  // Descrizioni degli Ambiti
  const AMBITO_DESCRIPTIONS: Record<AmbitoType, string> = {
    Fisico: 'Stai agendo in questo ambito quando fai affidamento sulle tue caratteristiche fisiche per affrontare eventi faticosi, far valere il tuo fisico o cimentarti in prove di atletica.',
    Scuola: 'Riflette le tue competenze apprese durante gli anni di scuola e lo studio individuale.',
    Carisma: 'Rappresenta il tuo modo di interagire con le altre persone e il mondo esterno.',
    Strada: 'È quanto appreso nella famigerata università della vita, al di fuori delle mura sicure di casa e scuola.'
  };
  
  // Descrizioni delle Abilità
  const ABILITA_DESCRIPTIONS: Record<Abilita, string> = {
    // Fisico
    Muscoli: 'Sollevare, spingere, tirare.',
    Sport: 'Correre, saltare, scalare, nuotare o cavalcare.',
    Acrobatica: 'Compiere balzi felini o esercizi di equilibrismo.',
    Resistenza: 'Sopportare la fatica, i traumi fisici, il sonno e condizioni estreme.',
    Freddezza: 'Reagire prontamente a un pericolo o a un improvviso cambiamento di scenario.',
    // Scuola
    Cultura: 'Conoscenze generali, storiche o specifiche come arte e musica, ricordare un evento.',
    Tecnologia: 'Avere conoscenze di base di meccanica, elettronica e informatica e saperle applicare.',
    Studio: 'Sapersi focalizzare sui dettagli, trovare indizi o oggetti nascosti.',
    'Pronto Soccorso': 'Prestare cure mediche, cucire ferite, steccare arti rotti.',
    Scienze: 'Conoscenza di anatomia, conoscenze specifiche di chimica, fisica, geologia e astronomia.',
    // Carisma
    Esibirsi: 'Suonare, cantare, recitare, parlare in pubblico, attirare l\'attenzione.',
    Parlantina: 'Convincere, confondere o raggirare.',
    Fascino: 'Sedurre, ammaliare o fare buona impressione.',
    Intuito: 'Comprendere le intenzioni altrui, saper leggere le situazioni al volo.',
    Leadership: 'Imporre la propria autorità, intimidire, ispirare.',
    // Strada
    Furtività: 'Nascondersi, muoversi silenziosamente, passare inosservati, pedinare, dileguarsi tra la folla.',
    Mira: 'Centrare una finestra con un sasso, lanciare un coltello con precisione.',
    Sopravvivenza: 'Conoscenze relative al mondo animale e vegetale e pratiche della vita all\'aria aperta come metodi di sopravvivenza e campeggio.',
    Crimine: 'Scassinare, borseggiare, reperire materiali illegali.',
    Allerta: 'Percepire minacce o pericoli tramite i cinque sensi.'
  };
  
  // Abilità raggruppate per Ambito
  const ABILITA_PER_AMBITO: Record<AmbitoType, Abilita[]> = {
    Fisico: ['Muscoli', 'Sport', 'Acrobatica', 'Resistenza', 'Freddezza'],
    Scuola: ['Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze'],
    Carisma: ['Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Leadership'],
    Strada: ['Furtività', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta']
  };
  
  // Abilità che ricevono +1 da ogni Stile (10 punti totali)
  const STILE_ABILITA: Record<Stile, Abilita[]> = {
    'Jock': ['Muscoli', 'Sport', 'Acrobatica', 'Resistenza', 'Freddezza', 'Pronto Soccorso', 'Esibirsi', 'Fascino', 'Leadership', 'Sopravvivenza'],
    'Cheerleader': ['Sport', 'Acrobatica', 'Freddezza', 'Cultura', 'Studio', 'Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Mira'],
    'Nerd': ['Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze', 'Intuito', 'Furtività', 'Mira', 'Sopravvivenza', 'Allerta'],
    'Goth': ['Resistenza', 'Cultura', 'Tecnologia', 'Studio', 'Scienze', 'Esibirsi', 'Fascino', 'Intuito', 'Furtività', 'Crimine'],
    'Self-made': ['Muscoli', 'Acrobatica', 'Resistenza', 'Tecnologia', 'Pronto Soccorso', 'Scienze', 'Intuito', 'Mira', 'Crimine', 'Allerta'],
    'Rebel': ['Acrobatica', 'Freddezza', 'Pronto Soccorso', 'Esibirsi', 'Parlantina', 'Leadership', 'Furtività', 'Sopravvivenza', 'Crimine', 'Allerta'],
    'Gangsta': ['Muscoli', 'Sport', 'Resistenza', 'Freddezza', 'Parlantina', 'Intuito', 'Furtività', 'Sopravvivenza', 'Crimine', 'Allerta'],
    "Daddy's kid": ['Muscoli', 'Sport', 'Cultura', 'Studio', 'Tecnologia', 'Scienze', 'Parlantina', 'Fascino', 'Leadership', 'Mira']
  };
  
  // Abilità che ricevono +1 da ogni Viaggio (10 punti totali)
  const VIAGGIO_ABILITA: Record<Viaggio, Abilita[]> = {
    'Campione': ['Muscoli', 'Sport', 'Resistenza', 'Freddezza', 'Pronto Soccorso', 'Esibirsi', 'Fascino', 'Leadership', 'Mira', 'Sopravvivenza'],
    'Bullo': ['Muscoli', 'Sport', 'Resistenza', 'Pronto Soccorso', 'Esibirsi', 'Parlantina', 'Intuito', 'Furtività', 'Crimine', 'Allerta'],
    'Fratello maggiore': ['Sport', 'Cultura', 'Tecnologia', 'Studio', 'Scienze', 'Parlantina', 'Fascino', 'Leadership', 'Sopravvivenza', 'Allerta'],
    'Stronza suprema': ['Sport', 'Acrobatica', 'Resistenza', 'Freddezza', 'Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Mira', 'Allerta'],
    "Fidanzata d'America": ['Sport', 'Acrobatica', 'Cultura', 'Studio', 'Pronto Soccorso', 'Scienze', 'Esibirsi', 'Fascino', 'Leadership', 'Sopravvivenza'],
    'Sbandata': ['Muscoli', 'Tecnologia', 'Pronto Soccorso', 'Parlantina', 'Intuito', 'Leadership', 'Furtività', 'Mira', 'Crimine', 'Allerta'],
    'Primo della classe': ['Sport', 'Acrobatica', 'Cultura', 'Studio', 'Scienze', 'Fascino', 'Leadership', 'Furtività', 'Mira', 'Sopravvivenza'],
    'Smanettone': ['Freddezza', 'Cultura', 'Tecnologia', 'Scienze', 'Intuito', 'Furtività', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta'],
    'Sapientino': ['Resistenza', 'Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze', 'Esibirsi', 'Parlantina', 'Intuito', 'Allerta'],
    'Occultista': ['Freddezza', 'Cultura', 'Studio', 'Pronto Soccorso', 'Scienze', 'Intuito', 'Furtività', 'Mira', 'Sopravvivenza', 'Crimine'],
    'Metallaro': ['Muscoli', 'Sport', 'Acrobatica', 'Tecnologia', 'Esibirsi', 'Parlantina', 'Fascino', 'Leadership', 'Crimine', 'Allerta'],
    'Emo': ['Resistenza', 'Freddezza', 'Cultura', 'Tecnologia', 'Studio', 'Scienze', 'Esibirsi', 'Fascino', 'Intuito', 'Mira'],
    'Ex-promessa': ['Sport', 'Acrobatica', 'Freddezza', 'Pronto Soccorso', 'Esibirsi', 'Fascino', 'Intuito', 'Leadership', 'Mira', 'Allerta'],
    'Lavoratore': ['Muscoli', 'Freddezza', 'Tecnologia', 'Parlantina', 'Fascino', 'Leadership', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta'],
    'Espulso': ['Resistenza', 'Cultura', 'Tecnologia', 'Studio', 'Scienze', 'Parlantina', 'Fascino', 'Intuito', 'Furtività', 'Sopravvivenza'],
    'Teppista': ['Sport', 'Acrobatica', 'Freddezza', 'Tecnologia', 'Parlantina', 'Intuito', 'Furtività', 'Mira', 'Crimine', 'Allerta'],
    'Attivista': ['Muscoli', 'Resistenza', 'Cultura', 'Studio', 'Pronto Soccorso', 'Scienze', 'Esibirsi', 'Fascino', 'Leadership', 'Sopravvivenza'],
    'Skater': ['Sport', 'Acrobatica', 'Freddezza', 'Tecnologia', 'Pronto Soccorso', 'Esibirsi', 'Fascino', 'Furtività', 'Mira', 'Allerta'],
    'Delinquente': ['Muscoli', 'Acrobatica', 'Resistenza', 'Pronto Soccorso', 'Fascino', 'Leadership', 'Furtività', 'Sopravvivenza', 'Crimine', 'Allerta'],
    'Genio del ghetto': ['Freddezza', 'Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze', 'Esibirsi', 'Parlantina', 'Intuito', 'Mira'],
    'Ladruncolo': ['Sport', 'Acrobatica', 'Freddezza', 'Parlantina', 'Fascino', 'Intuito', 'Furtività', 'Mira', 'Crimine', 'Allerta'],
    'Party animal': ['Acrobatica', 'Resistenza', 'Pronto Soccorso', 'Scienze', 'Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Sopravvivenza', 'Crimine'],
    'Nato per vincere': ['Muscoli', 'Sport', 'Resistenza', 'Freddezza', 'Cultura', 'Studio', 'Esibirsi', 'Parlantina', 'Fascino', 'Mira'],
    'Rampollo della malavita': ['Muscoli', 'Freddezza', 'Cultura', 'Tecnologia', 'Intuito', 'Leadership', 'Furtività', 'Mira', 'Crimine', 'Allerta']
  };
  
  // Equipaggiamento iniziale per ogni Stile
  type StartingEquipment = {
    inTasca: string[];
    aCasa: string[];
  };
  
  const STILE_STARTING_EQUIPMENT: Record<Stile, StartingEquipment> = {
    'Jock': {
      inTasca: ['Pettine'],
      aCasa: ['Protezioni Sportive', 'Mazza da Baseball']
    },
    'Cheerleader': {
      inTasca: ['Pochette Portatrucchi'],
      aCasa: ['Bastone da Mojorette', 'Pompon']
    },
    'Nerd': {
      inTasca: ['Coltellino Multiuso'],
      aCasa: ['Videocamera Compatta', 'Computer collegato a Internet (56K)', 'Macchina Fotografica a Rullino']
    },
    'Goth': {
      inTasca: ['Walkman', 'Bracciale Borchiato'],
      aCasa: ['Giradischi', 'Strumento Musicale']
    },
    'Self-made': {
      inTasca: ['Accendino'],
      aCasa: ['Cassetta degli Attrezzi', 'Chiave Idraulica']
    },
    'Rebel': {
      inTasca: ['Bomboletta Spray'],
      aCasa: ['Skateboard'] // o Rollerblade, il giocatore potrà scegliere
    },
    'Gangsta': {
      inTasca: ['Coltello a Serramanico'], // o Tirapugni, il giocatore potrà scegliere
      aCasa: ['Piede di Porco']
    },
    "Daddy's kid": {
      inTasca: ['Telefono Cellulare'],
      aCasa: ['Racchetta da Tennis', 'Mazza da Golf']
    }
  };
  
  // Cittadini degni di nota di Innsmouth
  const NOTABLE_CITIZENS = [
    'Abigail Prinn (albergatrice)',
    'Alonzo Typer (coach)',
    'Antonis Martinius Frostwick (traduttore)',
    'Arthur Duthoo (senzatetto)',
    'Asenath Waite (giornalista)',
    'Audrey Davis (negoziante)',
    'Beatrix Pillar (poliziotta)',
    'Aldo Ambrosian (poliziotto)',
    'Christopher Thomas Lazer (guardiano del faro)',
    'Daniel Upton (preside)',
    'Dorcas Frye (sfasciacarrozze)',
    'Francis Guts (poeta)',
    'Francis Wayland Thurston (sindaco)',
    'Henry Akeley (gestore del videostore)',
    'Henry Armitage (bibliotecario)',
    'Jack Ferguson (presidente del cineforum)',
    'Joe Masurevich (pescatore)',
    'Johannes Vanderhoff (reverendo)',
    'Joseph Curwen (becchino)',
    'Keziah Mason (direttrice del diner)',
    'Lavinia Watheley (boss della malavita)',
    'Luke Zars (autista)',
    'Marceline Bedard (estetista)',
    'Marshall Andrews (medico)',
    'Martin Bergermann (sensei)',
    'Obed Marsh (imprenditore)',
    'Richard Coates (professore di inglese)',
    'Richard Upton Pickman (artista)',
    'Swami Chandraputra (gestore della ruota panoramica)',
    'Thomas Malone (capitano di polizia)',
    'Woody Plunders (antiquario)',
    'Zadok Allen (ubriacone)',
  ];
  
  const STYLE_DESCRIPTIONS: Record<Stile, string> = {
    Jock: 'Atletico, competitivo, impulsivo. Vive il corpo e la pressione del gruppo.',
    Cheerleader: 'Carismatica, visibile, sociale. Sa influenzare e dominare la scena.',
    Nerd: 'Intelligente, metodico, curioso. Cerca risposte dove gli altri vedono caos.',
    Goth: 'Cupə, sensibilə, magnetico. Intuisce l’ombra e convive con l’inquietudine.',
    'Self-made': 'Durə, praticə, indipendente. Si è costruito da solo un posto nel mondo.',
    Rebel: 'Istintivo, incendiario, insofferente alle regole. Agisce prima di chiedere permesso.',
    Gangsta: 'Stradale, diffidente, concreto. Sa leggere il pericolo e sopravvivere.',
    "Daddy's kid": 'Privilegiato, educato al successo, abituato a ottenere spazio e risorse.'
  };
  
  const VIAGGIO_DESCRIPTIONS: Record<Viaggio, string> = {
    'Campione': 'Abituato a vincere e a essere osservato.',
    'Bullo': 'Domina con pressione, forza o intimidazione.',
    'Fratello maggiore': 'Protegge, guida, si prende responsabilità.',
    'Stronza suprema': 'Controlla gerarchie sociali e reputazione.',
    "Fidanzata d'America": 'Perfetta in superficie, fragile sotto pressione.',
    'Sbandata': 'Instabile, intensa, imprevedibile.',
    'Primo della classe': 'Brillante, preciso, ossessionato dal risultato.',
    'Smanettone': 'Tecnico, curioso, ingegnoso.',
    'Sapientino': 'Studioso, teorico, spesso sottovalutato.',
    'Occultista': 'Attirato dal mistero, dai simboli e dal proibito.',
    'Metallaro': 'Viscerale, rumoroso, identitario.',
    'Emo': 'Emotivo, introspettivo, vulnerabile.',
    'Ex-promessa': 'Ha conosciuto aspettative alte e possibili cadute.',
    'Lavoratore': 'Concreto, resistente, temprato dalla fatica.',
    'Espulso': 'Marchiato, fuori posto, abituato al rifiuto.',
    'Teppista': 'Provoca, rompe, alza la tensione.',
    'Attivista': 'Crede in qualcosa e combatte per difenderlo.',
    'Skater': 'Libero, mobile, allergico ai binari.',
    'Delinquente': 'Naviga ai margini, conosce rischio e opportunità.',
    'Genio del ghetto': 'Mente brillante cresciuta dove tutto costa doppio.',
    'Ladruncolo': 'Rapido, opportunista, invisibile quando serve.',
    'Party animal': 'Sociale, eccessivo, sempre in mezzo alla folla.',
    'Nato per vincere': 'Ambizioso, competitivo, educato all’eccellenza.',
    'Rampollo della malavita': 'Protetto dal potere sbagliato, cresciuto nell’ombra.'
  };
  
  export function CharacterCreationWizard({
    onClose,
    onAdd,
    existingCharacters,
    initialCharacter
  }: CharacterCreationWizardProps) {
    const [step, setStep] = useState(1);
    const totalSteps = 8;
  
    // Step 1-2: Info Base
    const [name, setName] = useState(initialCharacter?.name ?? '');
    const [player, setPlayer] = useState(initialCharacter?.player ?? '');
    const [style, setStyle] = useState<Stile>(initialCharacter?.style ?? 'Jock');
    const [viaggio, setViaggio] = useState<Viaggio>(initialCharacter?.viaggio ?? 'Campione');
  
    // Step 3: Tutore e Legame
    const [tutore, setTutore] = useState(initialCharacter?.tutore ?? '');
    const [tutoreInputType, setTutoreInputType] = useState<'custom' | 'notable'>(
    initialCharacter?.tutore && NOTABLE_CITIZENS.includes(initialCharacter.tutore)
      ? 'notable'
      : 'custom'
    );
    const [legame, setLegame] = useState(() => {
    if (initialCharacter?.legameDescription) {
      return initialCharacter.legameDescription;
    }
  
    if (initialCharacter?.legame === 'Da definire in seguito') {
      return 'Da definire in seguito';
    }
  
    if (!initialCharacter?.linkedCharacterId) {
      return initialCharacter?.legame ?? '';
    }
  
    return '';
  });
    
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>(() => {
    if (initialCharacter?.linkedCharacterId) {
      const stillExists = existingCharacters.some(
        character => character.id === initialCharacter.linkedCharacterId
      );
  
      return stillExists ? initialCharacter.linkedCharacterId : '';
    }
  
    if (initialCharacter?.legame === 'Da definire in seguito') {
      return 'LATER';
    }
  
    return '';
  });
  
    // Step 4: Tipo Speciale
    const [tipoSpeciale, setTipoSpeciale] = useState(
    (initialCharacter as (Character & { player: string; notes: string; tipoSpeciale?: string }) | null)?.tipoSpeciale ?? ''
    );
    const [tipoSpecialeInputType, setTipoSpecialeInputType] = useState<'custom' | 'notable'>(
    tipoSpeciale && NOTABLE_CITIZENS.includes(tipoSpeciale)
      ? 'notable'
      : 'custom'
    );
  
    // Step 5: Ambiti e Abilità
    const [bonusAbilita, setBonusAbilita] = useState<Record<Abilita, number>>(() => {
    if (!initialCharacter?.abilita) {
      return {} as Record<Abilita, number>;
    }
  
    const initialBonus = {} as Record<Abilita, number>;
  
    Object.values(ABILITA_PER_AMBITO)
      .flat()
      .forEach((abilita) => {
        const baseValue =
          1 +
          (STILE_ABILITA[initialCharacter.style]?.includes(abilita) ? 1 : 0) +
          (VIAGGIO_ABILITA[initialCharacter.viaggio]?.includes(abilita) ? 1 : 0);
  
        const savedValue = initialCharacter.abilita[abilita] ?? baseValue;
        const bonus = Math.max(0, savedValue - baseValue);
  
        if (bonus > 0) {
          initialBonus[abilita] = bonus;
        }
      });
  
    return initialBonus;
  });
  
  const [puntiAbilitaRimasti, setPuntiAbilitaRimasti] = useState(() => {
    if (!initialCharacter?.abilita) {
      return 2;
    }
  
    const spentPoints = Object.values(ABILITA_PER_AMBITO)
      .flat()
      .reduce((total, abilita) => {
        const baseValue =
          1 +
          (STILE_ABILITA[initialCharacter.style]?.includes(abilita) ? 1 : 0) +
          (VIAGGIO_ABILITA[initialCharacter.viaggio]?.includes(abilita) ? 1 : 0);
  
        const savedValue = initialCharacter.abilita[abilita] ?? baseValue;
        return total + Math.max(0, savedValue - baseValue);
      }, 0);
  
    return Math.max(0, 2 - spentPoints);
  });
  
  // Step 6: Storia
  const [storia, setStoria] = useState(initialCharacter?.notes ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(initialCharacter?.coverImageUrl ?? '');
  const [portraitImageUrl, setPortraitImageUrl] = useState(initialCharacter?.portraitImageUrl ?? '');
  const [portraitCroppedImageUrl, setPortraitCroppedImageUrl] = useState(
    initialCharacter?.portraitCroppedImageUrl ?? ''
  );
  
  const [coverPositionX, setCoverPositionX] = useState(initialCharacter?.coverPositionX ?? 0);
  const [coverPositionY, setCoverPositionY] = useState(initialCharacter?.coverPositionY ?? 0);
  const [coverScale, setCoverScale] = useState(initialCharacter?.coverScale ?? 1);
  
  const [portraitCrop, setPortraitCrop] = useState(() => ({
  centerX: initialCharacter?.portraitCrop?.centerX ?? 0.5,
  centerY: initialCharacter?.portraitCrop?.centerY ?? 0.5,
  zoom: initialCharacter?.portraitCrop?.zoom ?? 1
  }));
  
  const [dragTarget, setDragTarget] = useState<null | 'cover' | 'portrait'>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [startPosition, setStartPosition] = useState<{ x: number; y: number } | null>(null);
  const portraitZoomRef = useRef<HTMLDivElement | null>(null);
  const coverZoomRef = useRef<HTMLDivElement | null>(null);
  const [portraitCropStart, setPortraitCropStart] = useState<{
    centerX: number;
    centerY: number;
  } | null>(null);
  
  const clampScale = (value: number) => Math.max(1, Math.min(3, value));
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  
  const handleDragStart = (
    event: React.MouseEvent<HTMLDivElement>,
    target: 'cover' | 'portrait'
  ) => {
    event.preventDefault();
  
    setDragTarget(target);
    setDragStart({ x: event.clientX, y: event.clientY });
  
    if (target === 'cover') {
      setStartPosition({ x: coverPositionX, y: coverPositionY });
      setPortraitCropStart(null);
    } else {
      setStartPosition({ x: 0, y: 0 });
      setPortraitCropStart({
        centerX: portraitCrop.centerX,
        centerY: portraitCrop.centerY
      });
    }
  };
  
  const handleImageWheel = (
    event: React.WheelEvent<HTMLDivElement>,
    target: 'cover' | 'portrait'
  ) => {
    event.preventDefault();
  
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
  
    if (target === 'cover') {
      setCoverScale(prev => clampScale(prev + delta));
    } else {
      setPortraitCrop(prev => ({
        ...prev,
        zoom: clampScale(prev.zoom + delta)
      }));
    }
  };
  
  useEffect(() => {
    const portraitEl = portraitZoomRef.current;
    const coverEl = coverZoomRef.current;

    const portraitHandler = (e: WheelEvent) => {
      e.preventDefault();
      handleImageWheel(e as any, 'portrait');
    };
    const coverHandler = (e: WheelEvent) => {
      e.preventDefault();
      handleImageWheel(e as any, 'cover');
    };

    portraitEl?.addEventListener('wheel', portraitHandler, { passive: false });
    coverEl?.addEventListener('wheel', coverHandler, { passive: false });

    return () => {
      portraitEl?.removeEventListener('wheel', portraitHandler);
      coverEl?.removeEventListener('wheel', coverHandler);
    };
  }, [portraitImageUrl, coverImageUrl]);

  useEffect(() => {
    if (!dragTarget || !dragStart) {
      return;
    }
  
    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;
  
      if (dragTarget === 'cover' && startPosition) {
        setCoverPositionX(startPosition.x + deltaX);
        setCoverPositionY(startPosition.y + deltaY);
        return;
      }
  
      if (dragTarget === 'portrait' && portraitCropStart) {
      const previewSize = 160;
      const dragFactor = 0.7;
  
      const deltaXNormalized = (deltaX / previewSize) * dragFactor;
      const deltaYNormalized = (deltaY / previewSize) * dragFactor;
  
    setPortraitCrop(prev => ({
    ...prev,
    centerX: clamp01(portraitCropStart.centerX - deltaXNormalized / prev.zoom),
    centerY: clamp01(portraitCropStart.centerY - deltaYNormalized / prev.zoom)
  }));
  }
    };
  
    const handleMouseUp = () => {
      setDragTarget(null);
      setDragStart(null);
      setStartPosition(null);
      setPortraitCropStart(null);
    };
  
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragTarget, dragStart, startPosition, portraitCropStart]);
  
  const createCroppedPortrait = (source: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
  
      img.onload = () => {
        const outputSize = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
  
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponibile'));
          return;
        }
  
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, outputSize, outputSize);
  
        const drawWidth = img.width * portraitCrop.zoom;
        const drawHeight = img.height * portraitCrop.zoom;
  
        const drawX = outputSize / 2 - portraitCrop.centerX * drawWidth;
        const drawY = outputSize / 2 - portraitCrop.centerY * drawHeight;
  
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  
        resolve(canvas.toDataURL('image/png'));
      };
  
      img.onerror = () => reject(new Error('Impossibile caricare l’immagine'));
      img.src = source;
    });
  };
  
  useEffect(() => {
    if (!portraitImageUrl) {
      setPortraitCroppedImageUrl('');
      return;
    }
  
    let cancelled = false;
  
    const updatePortraitPreview = async () => {
      try {
        const cropped = await createCroppedPortrait(portraitImageUrl);
        if (!cancelled) {
          setPortraitCroppedImageUrl(cropped);
        }
      } catch (error) {
        console.error('Errore aggiornamento portrait preview:', error);
      }
    };
  
    updatePortraitPreview();
  
    return () => {
      cancelled = true;
    };
  }, [portraitImageUrl, portraitCrop]);
  
  const handleImageFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    target: 'cover' | 'portrait'
  ) => {
    const file = event.target.files?.[0];
  
    if (!file) {
      return;
    }
  
    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      return;
    }
  
    const reader = new FileReader();
  
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
  
      if (target === 'cover') {
        setCoverImageUrl(result);
        setCoverPositionX(0);
        setCoverPositionY(0);
        setCoverScale(1);
      } else {
        setPortraitImageUrl(result);
        setPortraitCroppedImageUrl('');
        setPortraitCrop({
          centerX: 0.5,
          centerY: 0.5,
          zoom: 1.15
        });
      }
    };
  
    reader.readAsDataURL(file);
  };
  
    // Step 7: Equipaggiamento
    const [inTasca, setInTasca] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(item => item.type === 'tascabile' && item.location === 'in_tasca')
    .map(item => item.name) ?? []
);
  
  const [trasportabiliNelZaino, setTrasportabiliNelZaino] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(
      item =>
        item.name !== 'Zaino' &&
        (item.type === 'trasportabile' || item.type === 'arma') &&
        item.location === 'nel_zaino'
    )
    .map(item => item.name) ?? []
);
  
 const [trasportabiliIndossati, setTrasportabiliIndossati] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(
      item =>
        item.name !== 'Zaino' &&
        (item.type === 'trasportabile' || item.type === 'arma') &&
        item.location === 'indossato'
    )
    .map(item => item.name) ?? []
);
  
  const [tascabiliACasa, setTascabiliACasa] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(item => item.type === 'tascabile' && item.location === 'a_casa')
    .map(item => item.name) ?? []
);
  
  const [trasportabiliACasa, setTrasportabiliACasa] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(
      item =>
        (item.type === 'trasportabile' || item.type === 'arma') &&
        item.location === 'a_casa'
    )
    .map(item => item.name) ?? []
);
  
  const [risorseACasa, setRisorseACasa] = useState<string[]>(() =>
  initialCharacter?.equipment
    ?.filter(item => item.type === 'risorsa' && item.location === 'a_casa')
    .map(item => item.name) ?? []
);
    const [hasZaino, setHasZaino] = useState(() =>
    initialCharacter?.equipment?.some(item => item.name === 'Zaino') ?? false
  );
  
    // Step 8: Tratti
    const [selectedStyleTrait, setSelectedStyleTrait] = useState<Trait | null>(
    initialCharacter?.tratti?.[0] ?? null
    );
    const [selectedJourneyTraits, setSelectedJourneyTraits] = useState<Trait[]>(
    initialCharacter?.tratti?.slice(1, 3) ?? []
    );
  
    const availableViaggi = VIAGGI_PER_STILE[style];
    const ambiti = calculateAmbiti(style, viaggio);
  
    const availableTipoSpecialeCitizens = NOTABLE_CITIZENS.filter(
    citizen => citizen !== tutore
  );
  
    // Inizializza equipaggiamento di partenza quando lo Stile viene selezionato
    useEffect(() => {
    if (initialCharacter) {
      return;
    }
  
    const startingEquipment = STILE_STARTING_EQUIPMENT[style];
    setInTasca([...startingEquipment.inTasca]);
  setTrasportabiliNelZaino([]);
  setTrasportabiliIndossati([]);
  setTascabiliACasa([]);
  setTrasportabiliACasa([...startingEquipment.aCasa]);
  setRisorseACasa([]);
  setHasZaino(false);
    }, [style, initialCharacter]);
  
    useEffect(() => {
    if (tipoSpecialeInputType === 'notable' && tipoSpeciale === tutore) {
      setTipoSpeciale('');
    }
    }, [tutore, tipoSpeciale, tipoSpecialeInputType]);
  
    // Calcola il valore base di un'abilità: 1 + bonus Stile + bonus Viaggio
    const getAbilitaBaseValue = (abilita: Abilita): number => {
      let base = 1;
  
      // +1 se l'abilità è nella lista dello Stile
      if (STILE_ABILITA[style]?.includes(abilita)) {
        base += 1;
      }
  
      // +1 se l'abilità è nella lista del Viaggio
      if (VIAGGIO_ABILITA[viaggio]?.includes(abilita)) {
        base += 1;
      }
  
      return base;
    };
  
    // Calcola il valore totale di un'abilità (base + bonus)
    const getAbilitaTotalValue = (abilita: Abilita): number => {
      return getAbilitaBaseValue(abilita) + (bonusAbilita[abilita] || 0);
    };
  
    const addBonusAbilita = (abilita: Abilita) => {
      const currentTotal = getAbilitaTotalValue(abilita);
      if (puntiAbilitaRimasti > 0 && currentTotal < 4) {
        setBonusAbilita({ ...bonusAbilita, [abilita]: (bonusAbilita[abilita] || 0) + 1 });
        setPuntiAbilitaRimasti(puntiAbilitaRimasti - 1);
      }
    };
  
    const removeBonusAbilita = (abilita: Abilita) => {
      if (bonusAbilita[abilita] && bonusAbilita[abilita] > 0) {
        const newValue = bonusAbilita[abilita] - 1;
        const newBonus = { ...bonusAbilita };
        if (newValue === 0) {
          delete newBonus[abilita];
        } else {
          newBonus[abilita] = newValue;
        }
        setBonusAbilita(newBonus);
        setPuntiAbilitaRimasti(puntiAbilitaRimasti + 1);
      }
    };
  
    const toggleJourneyTrait = (trait: Trait) => {
      const index = selectedJourneyTraits.findIndex(t => t.name === trait.name);
      if (index >= 0) {
        setSelectedJourneyTraits(selectedJourneyTraits.filter((_, i) => i !== index));
      } else if (selectedJourneyTraits.length < 2) {
        setSelectedJourneyTraits([...selectedJourneyTraits, trait]);
      }
    };
  
    // Funzioni helper per gestire l'equipaggiamento
    const addToInTasca = (item: string) => {
    if (!inTasca.includes(item) && inTasca.length < 5) {
      setInTasca([...inTasca, item]);
    }
  };
  
  const removeFromInTasca = (item: string) => {
    setInTasca(inTasca.filter(i => i !== item));
  };
  
  const addToTrasportabiliNelZaino = (item: string) => {
    const totaleAttivi = trasportabiliNelZaino.length + trasportabiliIndossati.length;
    if (!trasportabiliNelZaino.includes(item) && totaleAttivi < 4) {
      setTrasportabiliNelZaino([...trasportabiliNelZaino, item]);
    }
  };
  
  const removeFromTrasportabiliNelZaino = (item: string) => {
    setTrasportabiliNelZaino(trasportabiliNelZaino.filter(i => i !== item));
  };
  
  const addToTrasportabiliIndossati = (item: string) => {
    const totaleAttivi = trasportabiliNelZaino.length + trasportabiliIndossati.length;
    if (!trasportabiliIndossati.includes(item) && totaleAttivi < 4) {
      setTrasportabiliIndossati([...trasportabiliIndossati, item]);
    }
  };
  
  const removeFromTrasportabiliIndossati = (item: string) => {
    setTrasportabiliIndossati(trasportabiliIndossati.filter(i => i !== item));
  };
  
  const addToTascabiliACasa = (item: string) => {
    if (!tascabiliACasa.includes(item)) {
      setTascabiliACasa([...tascabiliACasa, item]);
    }
  };
  
  const removeFromTascabiliACasa = (item: string) => {
    setTascabiliACasa(tascabiliACasa.filter(i => i !== item));
  };
  
  const addToTrasportabiliACasa = (item: string) => {
    if (!trasportabiliACasa.includes(item)) {
      setTrasportabiliACasa([...trasportabiliACasa, item]);
    }
  };
  
  const removeFromTrasportabiliACasa = (item: string) => {
    setTrasportabiliACasa(trasportabiliACasa.filter(i => i !== item));
  };
  
  const addToRisorseACasa = (item: string) => {
    if (!risorseACasa.includes(item)) {
      setRisorseACasa([...risorseACasa, item]);
    }
  };
  
  const removeFromRisorseACasa = (item: string) => {
    setRisorseACasa(risorseACasa.filter(i => i !== item));
  };
  
    const canProceed = () => {
      switch (step) {
        case 1:
          return name.trim().length > 0 && player.trim().length > 0;
        case 2:
          return style && viaggio;
        case 3:
          const isSpecialSelection = selectedCharacterId === 'LATER';
          return tutore.trim().length > 0 && (isSpecialSelection || legame.trim().length > 0);
        case 4:
          return tipoSpeciale.trim().length > 0;
        case 5:
          return puntiAbilitaRimasti === 0;
        case 6:
          return true; // Storia è opzionale
        case 7:
          return true; // Equipaggiamento è pre-popolato e opzionale aggiungere altro
        case 8:
          return selectedStyleTrait !== null && selectedJourneyTraits.length === 2;
        default:
          return true;
      }
    };
  
    const handleNext = () => {
      if (canProceed() && step < totalSteps) {
        setStep(step + 1);
      }
    };
  
    const handleBack = () => {
      if (step > 1) {
        setStep(step - 1);
      }
    };
  
    const handleSubmit = async () => {
      if (!canProceed()) return;
  
      // Costruisci il personaggio completo
      const tratti = selectedStyleTrait ? [selectedStyleTrait, ...selectedJourneyTraits] : selectedJourneyTraits;
  
      // Crea l'array di equipaggiamento
     const createEquipmentItem = (
  name: string,
  type: Equipment['type'],
  location: Equipment['location'],
  isVehicle: boolean = false
): Equipment => ({
  id: generateUUID(),
  catalogItemId: null,
  source: 'custom',
  name,
  type,
  description: '',
  inseparabile: false,
  isVehicle,
  location
});

const equipment: Equipment[] = [
  ...inTasca.map(item =>
    createEquipmentItem(item, 'tascabile', 'in_tasca')
  ),

  ...trasportabiliNelZaino.map(item =>
    createEquipmentItem(item, 'trasportabile', 'nel_zaino')
  ),

  ...trasportabiliIndossati.map(item =>
    createEquipmentItem(item, 'trasportabile', 'indossato')
  ),

  ...tascabiliACasa.map(item =>
    createEquipmentItem(item, 'tascabile', 'a_casa')
  ),

  ...trasportabiliACasa.map(item =>
    createEquipmentItem(item, 'trasportabile', 'a_casa')
  ),

  ...risorseACasa.map(item =>
    createEquipmentItem(
      item,
      'risorsa',
      'a_casa',
      RISORSE_VEICOLI.includes(item)
    )
  )
];
  
  if (hasZaino) {
  equipment.push(
    createEquipmentItem('Zaino', 'trasportabile', 'indossato')
  );
}
  
      // Calcola i valori finali delle abilità (base + bonus)
      const abilitaFinali: Record<Abilita, number> = {} as Record<Abilita, number>;
      Object.values(ABILITA_PER_AMBITO).flat().forEach(abilita => {
        abilitaFinali[abilita] = getAbilitaTotalValue(abilita);
      });
  
      let finalPortraitCroppedImageUrl: string | undefined = portraitCroppedImageUrl || undefined;
  
  if (portraitImageUrl) {
    try {
      finalPortraitCroppedImageUrl = await createCroppedPortrait(portraitImageUrl);
    } catch (error) {
      console.error('Errore nella generazione del portrait ritagliato:', error);
    }
  }

      
  
      const character: Character & { player: string; notes: string } = {
        id: initialCharacter?.id ?? generateUUID(),
        name: name.trim(),
        player: player.trim(),
        style,
        viaggio,
        ambiti,
        abilita: abilitaFinali,
        freschezza: initialCharacter?.freschezza ?? 12,
        maxFreschezza: initialCharacter?.maxFreschezza ?? 12,
        caselleFrischezzaCruciali: initialCharacter?.caselleFrischezzaCruciali ?? [8, 12],
        follia: initialCharacter?.follia ?? 9,
        maxFollia: initialCharacter?.maxFollia ?? 9,
        conditions: initialCharacter?.conditions ?? [],
        turbe: initialCharacter?.turbe ?? [],
        audacia: initialCharacter?.audacia ?? 1,
        prodigi: initialCharacter?.prodigi ?? 1,
        legame:
    selectedCharacterId === 'LATER'
      ? 'Da definire in seguito'
      : selectedCharacterId !== ''
        ? 'Legame con personaggio'
        : legame.trim(),
  linkedCharacterId:
    selectedCharacterId !== '' && selectedCharacterId !== 'LATER'
      ? selectedCharacterId
      : undefined,
  legameDescription:
    selectedCharacterId !== '' && selectedCharacterId !== 'LATER'
      ? legame.trim()
      : undefined,
        tutore: tutore.trim(),
        tratti,
        equipment,
        tipoSpeciale: tipoSpeciale.trim(),
        notes: storia.trim(),
        coverImageUrl: coverImageUrl.trim() || undefined,
        portraitImageUrl: portraitImageUrl.trim() || undefined,
        portraitCroppedImageUrl: finalPortraitCroppedImageUrl,
        portraitCrop,
        coverPositionX: coverImageUrl ? coverPositionX : undefined,
        coverPositionY: coverImageUrl ? coverPositionY : undefined,
        coverScale: coverImageUrl ? coverScale : undefined,
        
      };
  
      onAdd(character);
      onClose();
    };
  
   
    return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#5c3b2b] bg-[#120f10] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#4a3126] bg-gradient-to-r from-[#241816] via-[#1a1414] to-[#131213] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
    <h2 className="text-2xl font-semibold uppercase tracking-[0.08em] text-[#f3e7d0]">
      {initialCharacter ? 'Modifica Personaggio' : 'Creazione Personaggio'}
    </h2>
    <p className="mt-1 text-sm text-[#b79f84]">
      {initialCharacter
        ? `Modifica in corso · Passaggio ${step} di ${totalSteps}`
        : `Passaggio ${step} di ${totalSteps}`}
    </p>
  </div>
  
            <button
              onClick={onClose}
              className="rounded-md border border-[#5a4030] bg-[#1b1616] p-2 text-[#cbb9a2] transition-colors hover:bg-[#2a1f1d] hover:text-[#f3e7d0]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
  
          {/* Progress */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.08em] text-[#a88f72]">
              <span>Avanzamento rituale</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#2a201e]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8a3d24] to-[#c78b52] transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>
  
        {/* Step nav */}
        <div className="border-b border-[#3b2a22] bg-[#151213] px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {[
              'Base',
              'Origine',
              'Legami',
              'Tipo speciale',
              'Abilità',
              'Storia',
              'Equipaggiamento',
              'Tratti'
            ].map((label, index) => {
              const stepNumber = index + 1;
              const isCurrent = step === stepNumber;
              const isDone = step > stepNumber;
  
              return (
                <div
                  key={label}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.08em] ${
                    isCurrent
                      ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
                      : isDone
                        ? 'border-[#5c4637] bg-[#211918] text-[#d6c4ac]'
                        : 'border-[#352823] bg-transparent text-[#8f7c68]'
                  }`}
                >
                  {stepNumber}. {label}
                </div>
              );
            })}
          </div>
        </div>
  
        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[#110f10] px-6 py-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-[#f3e7d0]">Informazioni Base</h3>
                <p className="mt-1 text-sm text-[#b79f84]">
                  Definisci identità e giocatore del personaggio.
                </p>
              </div>
  
              <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
                <p className="mb-4 text-xs italic text-[#a88f72]">* Campo obbligatorio</p>
  
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
                      Nome dello Studente *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Es. Takeshi Yamada"
                      className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none transition-colors focus:border-[#8a5a34]"
                      autoFocus
                    />
                  </div>
  
                  <div>
                    <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
                      Nome del Giocatore *
                    </label>
                    <input
                      type="text"
                      value={player}
                      onChange={(e) => setPlayer(e.target.value)}
                      placeholder="Il tuo nome"
                      className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none transition-colors focus:border-[#8a5a34]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
  
        {step === 2 && (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Stile e Viaggio</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Scegli l’archetipo e il percorso che definiscono il personaggio.
        </p>
      </div>
  
      <div className="grid gap-4 lg:grid-cols-2">
        {/* STILE */}
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <label className="mb-4 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
            Stile *
          </label>
  
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VIAGGI_PER_STILE) as Stile[]).map((st) => (
              <div key={st} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setStyle(st);
                    setViaggio(VIAGGI_PER_STILE[st][0]);
                  }}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    style === st
                      ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
                      : 'border-[#4b372b] bg-[#0f0d0d] text-[#d9c8b2] hover:bg-[#181313]'
                  }`}
                >
                 <span className="cursor-help group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">
                {st}
                </span>
                </button>
  
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-lg border border-[#6a452f] bg-[#221714] px-3 py-2 text-xs leading-relaxed text-[#f3e7d0] shadow-xl group-hover:block">
                  {STYLE_DESCRIPTIONS[st]}
                </div>
              </div>
            ))}
          </div>
        </div>
  
        {/* VIAGGIO */}
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <label className="mb-4 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
            Viaggio *
          </label>
  
          <div className="flex flex-wrap gap-2">
            {availableViaggi.map((v, index) => {
    const isLast = index === availableViaggi.length - 1;
  
    return (
      <div key={v} className="group relative">
        <button
          type="button"
          onClick={() => setViaggio(v)}
          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
            viaggio === v
              ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
              : 'border-[#4b372b] bg-[#0f0d0d] text-[#d9c8b2] hover:bg-[#181313]'
          }`}
        >
          <span className="cursor-help hover:underline hover:decoration-dotted hover:underline-offset-4">
            {v}
          </span>
        </button>
  
        <div
          className={`pointer-events-none absolute top-full z-20 mt-2 hidden w-64 rounded-lg border border-[#6a452f] bg-[#221714] px-3 py-2 text-xs leading-relaxed text-[#f3e7d0] shadow-xl group-hover:block ${
            isLast ? 'right-0' : 'left-0'
          }`}
        >
          {VIAGGIO_DESCRIPTIONS[v]}
        </div>
      </div>
    );
  })}
          </div>
        </div>
      </div>
  
      {/* AMBITI */}
      <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#a88f72]">
          Ambiti risultanti
        </div>
  
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
         {Object.entries(ambiti).map(([ambito, value]) => (
    <div key={ambito} className="group relative">
      <div className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4">
        <div className="text-xs uppercase tracking-[0.08em] text-[#a88f72]">
          <span className="cursor-help group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">
          {ambito}
          </span>
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#f3e7d0]">{value}</div>
      </div>
  
      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden max-w-[260px] rounded-lg border border-[#6a452f] bg-[#221714] px-3 py-2 text-xs leading-5 text-[#f3e7d0] shadow-xl group-hover:block">
    {AMBITO_DESCRIPTIONS[ambito as AmbitoType]}
      </div>
    </div>
  ))}
        </div>
      </div>
    </div>
  )}
  
          
          {step === 3 && (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Legami e Tutore</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Definisci chi guida il personaggio e il suo legame con il gruppo.
        </p>
      </div>
  
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <div className="mb-4">
            <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[#b79f84]">
              Tutore *
            </div>
  
            <div className="mb-4 flex gap-2">
              <button
    type="button"
    onClick={() => setTutoreInputType('custom')}
    className={`rounded-md px-3 py-2 text-sm border ${
      tutoreInputType === 'custom'
        ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
        : 'border-[#4b372b] bg-[#120f0f] text-[#b79f84]'
    }`}
  >
    Inserimento libero
  </button>
              <button
    type="button"
    onClick={() => setTutoreInputType('notable')}
    className={`rounded-md px-3 py-2 text-sm border ${
      tutoreInputType === 'notable'
        ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
        : 'border-[#4b372b] bg-[#120f0f] text-[#b79f84]'
    }`}
  >
    Abitanti degni di nota
  </button>
            </div>
  
            {tutoreInputType === 'custom' ? (
              <input
                type="text"
                value={tutore}
                onChange={(e) => setTutore(e.target.value)}
                placeholder="Es. Professor Armitage"
                className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
              />
            ) : (
              <select
    value={tutore}
    onChange={(e) => setTutore(e.target.value)}
    className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] outline-none focus:border-[#8a5a34]"
  >
    <option value="">Seleziona un abitante</option>
    {NOTABLE_CITIZENS.map((citizen) => (
      <option key={citizen} value={citizen}>
        {citizen}
      </option>
    ))}
  </select>
            )}
          </div>
        </div>
  
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <div className="mb-4">
            <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[#b79f84]">
              Legame *
            </div>
  
            <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
              Personaggio collegato
            </label>
            <select
    value={selectedCharacterId}
    onChange={(e) => {
    const value = e.target.value;
    setSelectedCharacterId(value);
  
    if (value === 'LATER') {
      setLegame('Da definire in seguito');
    } else if (value === '') {
      setLegame(initialCharacter?.legameDescription ?? '');
    } else {
      setLegame(initialCharacter?.linkedCharacterId === value
        ? initialCharacter?.legameDescription ?? ''
        : '');
    }
  }}
    className="mb-4 w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] outline-none focus:border-[#8a5a34]"
  >
    <option value="">Seleziona</option>
    <option value="LATER">Seleziona in seguito</option>
    {existingCharacters.map((character) => (
      <option key={character.id} value={character.id}>
        {character.name}
      </option>
    ))}
  </select>
  
            {selectedCharacterId !== '' && selectedCharacterId !== 'LATER' && (
    <>
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
        Descrizione del legame
      </label>
      <input
        type="text"
        value={legame}
        onChange={(e) => setLegame(e.target.value)}
        placeholder="Es. Fratello maggiore, migliore amica, rivale..."
        className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
      />
    </>
  )}
  
            {selectedCharacterId === 'LATER' && (
              <div className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4 text-sm text-[#cbb9a2]">
                Questo legame verrà gestito in un secondo momento, dopo la creazione di tutti gli altri Personaggi.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )}
          {step === 4 && (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Tipo Speciale</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
         Scegli una persona che occupa un posto speciale nella tua storia.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
        <div className="mb-4 flex gap-2">
          <button
    type="button"
    onClick={() => {
      setTipoSpecialeInputType('custom');
      
    }}
    className={`rounded-md px-3 py-2 text-sm border ${
      tipoSpecialeInputType === 'custom'
        ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
        : 'border-[#4b372b] bg-[#120f0f] text-[#b79f84]'
    }`}
  >
    Inserimento libero
  </button>
          <button
    type="button"
    onClick={() => {
      setTipoSpecialeInputType('notable');
      
    }}
    className={`rounded-md px-3 py-2 text-sm border ${
      tipoSpecialeInputType === 'notable'
        ? 'border-[#8a5a34] bg-[#4a2a1d] text-[#f3e7d0]'
        : 'border-[#4b372b] bg-[#120f0f] text-[#b79f84]'
    }`}
  >
    Abitanti degni di nota
  </button>
        </div>
  
        {tipoSpecialeInputType === 'custom' ? (
          <div>
            <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
              Tipo Speciale *
            </label>
            <input
              type="text"
              value={tipoSpeciale}
              onChange={(e) => setTipoSpeciale(e.target.value)}
              placeholder="Es. Abigail Prinn"
              className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
            />
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
              Cittadino di riferimento *
            </label>
            <select
              value={tipoSpeciale}
              onChange={(e) => setTipoSpeciale(e.target.value)}
              className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] outline-none focus:border-[#8a5a34]"
            >
              <option value="">Seleziona un cittadino</option>
              {availableTipoSpecialeCitizens.map((citizen) => (
              <option key={citizen} value={citizen}>
              {citizen}
              </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )}
  
          {step === 5 && (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Abilità</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Assegna i 2 punti bonus rimasti. Il valore massimo per abilità è 4.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm uppercase tracking-[0.08em] text-[#b79f84]">
            Punti abilità rimasti
          </div>
          <div className="rounded-full border border-[#8a5a34] bg-[#4a2a1d] px-4 py-1 text-sm font-semibold text-[#f3e7d0]">
            {puntiAbilitaRimasti}
          </div>
        </div>
  
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(ABILITA_PER_AMBITO).map(([ambito, abilitaList]) => (
            <div key={ambito} className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4">
              <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
                {ambito}
              </div>
  
              <div className="space-y-3">
                {abilitaList.map((abilita) => {
                  const totalValue = getAbilitaTotalValue(abilita);
                  const bonusValue = bonusAbilita[abilita] || 0;
                  const canAdd = puntiAbilitaRimasti > 0 && totalValue < 4;
                  const canRemove = bonusValue > 0;
  
                  return (
                    <div
                      key={abilita}
                      className="rounded-lg border border-[#2f2521] bg-[#171313] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-[#f3e7d0]">{abilita}</span>
                        <span className="text-lg font-semibold text-[#f3e7d0]">{totalValue}</span>
                      </div>
  
                      <div className="flex items-center justify-between text-xs text-[#a88f72]">
                        <span>Base: {getAbilitaBaseValue(abilita)}</span>
                        <span>Bonus: +{bonusValue}</span>
                      </div>
  
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => removeBonusAbilita(abilita)}
                          disabled={!canRemove}
                          className="rounded-md border border-[#5a4030] bg-[#1b1616] px-3 py-1.5 text-sm text-[#e7d7c0] disabled:opacity-30"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => addBonusAbilita(abilita)}
                          disabled={!canAdd}
                          className="rounded-md border border-[#8a5a34] bg-[#4a2a1d] px-3 py-1.5 text-sm text-[#f3e7d0] disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}
  
          {step === 6 && (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Storia</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Annotazioni, dettagli di background, memorie e tono del personaggio.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
        <label className="mb-3 block text-sm uppercase tracking-[0.08em] text-[#b79f84]">
          Note narrative
        </label>
        <textarea
          value={storia}
          onChange={(e) => setStoria(e.target.value)}
          placeholder="Scrivi qui il background, dettagli importanti, relazioni, paure, motivazioni..."
          rows={10}
          className="w-full rounded-xl border border-[#4b372b] bg-[#0f0d0d] px-4 py-4 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
    <div className="rounded-2xl border border-[#463227] bg-[#120f0f] p-4">
      <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
        Sfondo personalizzato del personaggio
      </div>
  
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
        URL immagine
      </label>
      <input
        type="text"
        value={coverImageUrl}
        onChange={(e) => setCoverImageUrl(e.target.value)}
        placeholder="https://..."
        className="mb-4 w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
      />
  
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
        Oppure carica da file
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => handleImageFileUpload(e, 'cover')}
        className="block w-full text-sm text-[#cbb9a2] file:mr-4 file:rounded-md file:border-0 file:bg-[#4a2a1d] file:px-3 file:py-2 file:text-sm file:text-[#f3e7d0] hover:file:bg-[#5a3323]"
      />
  
     <div className="mt-4 overflow-hidden rounded-xl border border-[#3d2b21] bg-[#1a1515]">
    {coverImageUrl ? (
      <div
        ref={coverZoomRef}
        onMouseDown={(e) => handleDragStart(e, 'cover')}
        style={{ touchAction: 'none' }}
        className="relative h-48 w-full cursor-move select-none overflow-hidden"
      >
        <img
          src={coverImageUrl}
          alt="Anteprima sfondo personaggio"
          className="absolute left-1/2 top-1/2 select-none"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translate(calc(-50% + ${coverPositionX}px), calc(-50% + ${coverPositionY}px)) scale(${coverScale})`,
            transformOrigin: 'center center',
            willChange: 'transform'
          }}
          draggable={false}
        />
  
        <div className="absolute inset-0 bg-gradient-to-t from-[#120f10]/80 via-[#120f10]/25 to-transparent" />
  
        <div className="absolute inset-x-0 bottom-0 bg-black/40 px-3 py-2 text-xs text-[#f3e7d0]">
          Trascina per centrare · Rotellina per zoom
        </div>
      </div>
    ) : (
      <div className="flex h-48 items-center justify-center text-sm text-[#8f7c68]">
        Nessuno sfondo selezionato
      </div>
    )}
  </div>
    </div>
  
    <div className="rounded-2xl border border-[#463227] bg-[#120f0f] p-4">
      <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
        Portrait tondo
      </div>
  
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
        URL immagine
      </label>
      <input
        type="text"
        value={portraitImageUrl}
        onChange={(e) => setPortraitImageUrl(e.target.value)}
        placeholder="https://..."
        className="mb-4 w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-4 py-3 text-[#f3e7d0] placeholder-[#6f5d4f] outline-none focus:border-[#8a5a34]"
      />
  
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[#a88f72]">
        Oppure carica da file
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => handleImageFileUpload(e, 'portrait')}
        className="block w-full text-sm text-[#cbb9a2] file:mr-4 file:rounded-md file:border-0 file:bg-[#4a2a1d] file:px-3 file:py-2 file:text-sm file:text-[#f3e7d0] hover:file:bg-[#5a3323]"
      />
  
   <div className="mt-4 flex justify-center">
    <div
      ref={portraitZoomRef}
      onMouseDown={(e) => handleDragStart(e, 'portrait')}
      style={{ touchAction: 'none' }}
      className="relative flex h-40 w-40 cursor-move items-center justify-center overflow-hidden rounded-full border-2 border-[#8a5a34] bg-[#1a1515] select-none"
    >
      {portraitCroppedImageUrl ? (
        <img
          src={portraitCroppedImageUrl}
          alt="Anteprima portrait"
          className="h-full w-full object-cover select-none"
          draggable={false}
        />
      ) : portraitImageUrl ? (
        <img
          src={portraitImageUrl}
          alt="Anteprima portrait"
          className="h-full w-full object-cover select-none opacity-80"
          draggable={false}
        />
      ) : (
        <div className="text-center text-sm text-[#8f7c68]">
          Nessun portrait
        </div>
      )}
    </div>
  </div>
  
  {portraitImageUrl && (
    <p className="mt-3 text-center text-xs text-[#8f7c68]">
      Trascina per centrare · Rotellina per zoom
    </p>
  )}
    </div>
  </div>
      </div>
    </div>
  )}
  
          {step === 7 && (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Equipaggiamento</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Organizza ciò che porti con te, ciò che trasporti e ciò che resta a casa.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
        <label className="mb-4 flex items-center gap-3 text-sm text-[#f3e7d0]">
          <input
            type="checkbox"
            checked={hasZaino}
            onChange={(e) => setHasZaino(e.target.checked)}
            className="h-4 w-4 accent-[#8a5a34]"
          />
          Il personaggio ha uno zaino
        </label>
  
        <div className="grid gap-4 xl:grid-cols-3">
          {/* IN TASCA */}
          <div className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
              In Tasca ({inTasca.length}/5)
            </div>
  
            <div className="mb-3 flex gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addToInTasca(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
              >
                <option value="">Aggiungi oggetto</option>
                {OGGETTI_TASCABILI
                  .filter(
                    item =>
                      !inTasca.includes(item) &&
                      !tascabiliACasa.includes(item)
                  )
                  .map(item => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
            </div>
  
            <div className="space-y-2">
              {inTasca.map(item => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                >
                  <span className="text-sm text-[#f3e7d0]">{item}</span>
                  <button
                    type="button"
                    onClick={() => removeFromInTasca(item)}
                    className="text-sm text-[#d7b7b7]"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          </div>
  
          {/* TRASPORTABILI */}
          <div className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
              Trasportabili ({trasportabiliNelZaino.length + trasportabiliIndossati.length}/4)
            </div>
  
            {hasZaino ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                    Nello zaino
                  </div>
  
                  <div className="mb-3 flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addToTrasportabiliNelZaino(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                    >
                      <option value="">Aggiungi oggetto</option>
                      {OGGETTI_TRASPORTABILI
                        .filter(
                          item =>
                            !trasportabiliNelZaino.includes(item) &&
                            !trasportabiliIndossati.includes(item) &&
                            !trasportabiliACasa.includes(item)
                        )
                        .map(item => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                    </select>
                  </div>
  
                  <div className="space-y-2">
                    {trasportabiliNelZaino.map(item => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                      >
                        <span className="text-sm text-[#f3e7d0]">{item}</span>
                        <button
                          type="button"
                          onClick={() => removeFromTrasportabiliNelZaino(item)}
                          className="text-sm text-[#d7b7b7]"
                        >
                          Rimuovi
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
  
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                    Indossati / Addosso
                  </div>
  
                  <div className="mb-3 flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addToTrasportabiliIndossati(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                    >
                      <option value="">Aggiungi oggetto</option>
                      {OGGETTI_TRASPORTABILI
                        .filter(
                          item =>
                            !trasportabiliNelZaino.includes(item) &&
                            !trasportabiliIndossati.includes(item) &&
                            !trasportabiliACasa.includes(item)
                        )
                        .map(item => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                    </select>
                  </div>
  
                  <div className="space-y-2">
                    {trasportabiliIndossati.map(item => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                      >
                        <span className="text-sm text-[#f3e7d0]">{item}</span>
                        <button
                          type="button"
                          onClick={() => removeFromTrasportabiliIndossati(item)}
                          className="text-sm text-[#d7b7b7]"
                        >
                          Rimuovi
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                  Indossati / Addosso
                </div>
  
                <div className="mb-3 flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addToTrasportabiliIndossati(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                  >
                    <option value="">Aggiungi oggetto</option>
                    {OGGETTI_TRASPORTABILI
                      .filter(
                        item =>
                          !trasportabiliIndossati.includes(item) &&
                          !trasportabiliACasa.includes(item)
                      )
                      .map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                </div>
  
                <div className="space-y-2">
                  {trasportabiliIndossati.map(item => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                    >
                      <span className="text-sm text-[#f3e7d0]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTrasportabiliIndossati(item)}
                        className="text-sm text-[#d7b7b7]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
  
          {/* A CASA */}
          <div className="rounded-xl border border-[#3d2b21] bg-[#120f0f] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
              A Casa
            </div>
  
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                  Tascabili
                </div>
                <div className="mb-3 flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addToTascabiliACasa(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                  >
                    <option value="">Aggiungi oggetto</option>
                    {OGGETTI_TASCABILI
                      .filter(
                        item =>
                          !inTasca.includes(item) &&
                          !tascabiliACasa.includes(item)
                      )
                      .map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                </div>
  
                <div className="space-y-2">
                  {tascabiliACasa.map(item => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                    >
                      <span className="text-sm text-[#f3e7d0]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTascabiliACasa(item)}
                        className="text-sm text-[#d7b7b7]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
  
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                  Trasportabili
                </div>
                <div className="mb-3 flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addToTrasportabiliACasa(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                  >
                    <option value="">Aggiungi oggetto</option>
                    {OGGETTI_TRASPORTABILI
                      .filter(
                        item =>
                          !trasportabiliNelZaino.includes(item) &&
                          !trasportabiliIndossati.includes(item) &&
                          !trasportabiliACasa.includes(item)
                      )
                      .map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                </div>
  
                <div className="space-y-2">
                  {trasportabiliACasa.map(item => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                    >
                      <span className="text-sm text-[#f3e7d0]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTrasportabiliACasa(item)}
                        className="text-sm text-[#d7b7b7]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
  
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[#a88f72]">
                  Risorse
                </div>
                <div className="mb-3 flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addToRisorseACasa(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-lg border border-[#4b372b] bg-[#0f0d0d] px-3 py-2 text-[#f3e7d0]"
                  >
                    <option value="">Aggiungi oggetto</option>
                    {RISORSE
                      .filter(item => !risorseACasa.includes(item))
                      .map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                </div>
  
                <div className="space-y-2">
                  {risorseACasa.map(item => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-[#2f2521] bg-[#171313] px-3 py-2"
                    >
                      <span className="text-sm text-[#f3e7d0]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromRisorseACasa(item)}
                        className="text-sm text-[#d7b7b7]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )}
  
        {step === 8 && (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[#f3e7d0]">Tratti</h3>
        <p className="mt-1 text-sm text-[#b79f84]">
          Seleziona 1 tratto di Stile e 2 tratti di Viaggio.
        </p>
      </div>
  
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <div className="mb-4 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
            Tratto di Stile
          </div>
  
          <div className="space-y-3">
            {STYLE_TRAITS[style].map((trait) => {
              const isSelected = selectedStyleTrait?.name === trait.name;
  
              return (
                <button
                  key={trait.name}
                  type="button"
                  onClick={() => setSelectedStyleTrait(trait)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#8a5a34] bg-[#4a2a1d]'
                      : 'border-[#3d2b21] bg-[#120f0f] hover:bg-[#181313]'
                  }`}
                >
                  <div className="font-semibold text-[#f3e7d0]">{trait.name}</div>
                  <div className="mt-1 text-sm text-[#cbb9a2]">{trait.description}</div>
                  <div className="mt-2 text-xs text-[#a88f72]">{trait.benefit}</div>
                </button>
              );
            })}
          </div>
        </div>
  
        <div className="rounded-2xl border border-[#463227] bg-[#171313] p-5">
          <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[#c78b52]">
            Tratti di Viaggio
          </div>
          <div className="mb-4 text-xs text-[#a88f72]">
            Selezionati: {selectedJourneyTraits.length} / 2
          </div>
  
          <div className="space-y-3">
            {JOURNEY_TRAITS[viaggio].map((trait) => {
              const isSelected = selectedJourneyTraits.some(t => t.name === trait.name);
  
              return (
                <button
                  key={trait.name}
                  type="button"
                  onClick={() => toggleJourneyTrait(trait)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#8a5a34] bg-[#4a2a1d]'
                      : 'border-[#3d2b21] bg-[#120f0f] hover:bg-[#181313]'
                  }`}
                >
                  <div className="font-semibold text-[#f3e7d0]">{trait.name}</div>
                  <div className="mt-1 text-sm text-[#cbb9a2]">{trait.description}</div>
                  <div className="mt-2 text-xs text-[#a88f72]">{trait.benefit}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  )}
        </div>
  
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#3b2a22] bg-[#151213] px-6 py-4">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-md border border-[#5a4030] bg-[#1b1616] px-4 py-2 text-sm text-[#e7d7c0] transition-colors hover:bg-[#2a1f1d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Indietro
          </button>
  
          <div className="text-xs uppercase tracking-[0.08em] text-[#8f7c68]">
            Step {step} / {totalSteps}
          </div>
  
          {step < totalSteps ? (
    <button
      onClick={handleNext}
      disabled={!canProceed()}
      className="rounded-md border border-[#8a5a34] bg-[#4a2a1d] px-4 py-2 text-sm text-[#f3e7d0] transition-colors hover:bg-[#5a3323] disabled:cursor-not-allowed disabled:opacity-40"
    >
      Avanti
    </button>
  ) : (
    <button
      onClick={handleSubmit}
      disabled={!canProceed()}
      className="rounded-md border border-[#8a5a34] bg-[#6a341f] px-4 py-2 text-sm text-[#f3e7d0] transition-colors hover:bg-[#7a3d24] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {initialCharacter ? 'Salva modifiche' : 'Crea Personaggio'}
    </button>
  )}
        </div>
      </div>
    </div>
  );
  }
