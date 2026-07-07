  import { useState, useEffect } from 'react';
  import { X } from 'lucide-react';
  import { ImageCropUploadModal } from '../shared/ImageCropUploadModal';
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
    const [description, setDescription] = useState(initialCharacter?.description ?? '');
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
  
  const [showPortraitCrop, setShowPortraitCrop] = useState(false);
  const [showCoverCrop, setShowCoverCrop] = useState(false);

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
          return name.trim().length > 0;
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
  
      const finalPortraitCroppedImageUrl: string | undefined = portraitCroppedImageUrl || undefined;

      const character: Character & { player: string; notes: string } = {
        id: initialCharacter?.id ?? generateUUID(),
        name: name.trim(),
        // player non è più un campo del wizard: è sempre derivato dal proprietario, mai digitato manualmente.
        // Si preserva un eventuale valore legacy già presente sul personaggio, senza mai scriverlo da qui.
        player: initialCharacter?.player ?? '',
        description: description.trim(),
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
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-bg)] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[var(--dash-border)] bg-gradient-to-r from-[var(--dash-panel)] via-[var(--dash-panel)] to-[var(--dash-panel)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
    <h2 className="text-2xl font-semibold uppercase tracking-[0.08em] text-[var(--dash-text-strong)]">
      {initialCharacter ? 'Modifica Personaggio' : 'Creazione Personaggio'}
    </h2>
    <p className="mt-1 text-sm text-[var(--dash-muted)]">
      {initialCharacter
        ? `Modifica in corso · Passaggio ${step} di ${totalSteps}`
        : `Passaggio ${step} di ${totalSteps}`}
    </p>
  </div>
  
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
  
          {/* Progress */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              <span>Avanzamento rituale</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--dash-surface-2)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--dash-accent)] to-[var(--dash-accent-2)] transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>
  
        {/* Step nav */}
        <div className="border-b border-[var(--dash-border)] bg-[var(--dash-panel)] px-6 py-3">
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
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
                      : isDone
                        ? 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-transparent text-[var(--dash-muted)]'
                  }`}
                >
                  {stepNumber}. {label}
                </div>
              );
            })}
          </div>
        </div>
  
        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[var(--dash-bg)] px-6 py-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Informazioni Base</h3>
                <p className="mt-1 text-sm text-[var(--dash-muted)]">
                  Definisci identità e giocatore del personaggio.
                </p>
              </div>
  
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
                <p className="mb-4 text-xs italic text-[var(--dash-accent-2)]">* Campo obbligatorio</p>
  
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                      Nome dello Studente *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Es. Takeshi Yamada"
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none transition-colors focus:border-[var(--dash-accent)]"
                      autoFocus
                    />
                  </div>
  
                  <div>
                    <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                      Breve descrizione del personaggio
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Es. Il timido secchione del gruppo"
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none transition-colors focus:border-[var(--dash-accent)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
  
        {step === 2 && (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Stile e Viaggio</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Scegli l’archetipo e il percorso che definiscono il personaggio.
        </p>
      </div>
  
      <div className="grid gap-4 lg:grid-cols-2">
        {/* STILE */}
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <label className="mb-4 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
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
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
                      : 'border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                  }`}
                >
                 <span className="cursor-help group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">
                {st}
                </span>
                </button>
  
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                  {STYLE_DESCRIPTIONS[st]}
                </div>
              </div>
            ))}
          </div>
        </div>
  
        {/* VIAGGIO */}
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <label className="mb-4 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
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
              ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
              : 'border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
          }`}
        >
          <span className="cursor-help hover:underline hover:decoration-dotted hover:underline-offset-4">
            {v}
          </span>
        </button>
  
        <div
          className={`pointer-events-none absolute top-full z-20 mt-2 hidden w-64 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--dash-text-strong)] shadow-xl group-hover:block ${
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
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          Ambiti risultanti
        </div>
  
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
         {Object.entries(ambiti).map(([ambito, value]) => (
    <div key={ambito} className="group relative">
      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
        <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          <span className="cursor-help group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">
          {ambito}
          </span>
        </div>
        <div className="mt-3 text-2xl font-semibold text-[var(--dash-text-strong)]">{value}</div>
      </div>
  
      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden max-w-[260px] rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-2 text-xs leading-5 text-[var(--dash-text-strong)] shadow-xl group-hover:block">
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
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Legami e Tutore</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Definisci chi guida il personaggio e il suo legame con il gruppo.
        </p>
      </div>
  
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <div className="mb-4">
            <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
              Tutore *
            </div>
  
            <div className="mb-4 flex gap-2">
              <button
    type="button"
    onClick={() => setTutoreInputType('custom')}
    className={`rounded-md px-3 py-2 text-sm border ${
      tutoreInputType === 'custom'
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
    }`}
  >
    Inserimento libero
  </button>
              <button
    type="button"
    onClick={() => setTutoreInputType('notable')}
    className={`rounded-md px-3 py-2 text-sm border ${
      tutoreInputType === 'notable'
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
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
                className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
              />
            ) : (
              <select
    value={tutore}
    onChange={(e) => setTutore(e.target.value)}
    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
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
  
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <div className="mb-4">
            <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
              Legame *
            </div>
  
            <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
    className="mb-4 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
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
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        Descrizione del legame
      </label>
      <input
        type="text"
        value={legame}
        onChange={(e) => setLegame(e.target.value)}
        placeholder="Es. Fratello maggiore, migliore amica, rivale..."
        className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
      />
    </>
  )}
  
            {selectedCharacterId === 'LATER' && (
              <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4 text-sm text-[var(--dash-text)]">
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
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Tipo Speciale</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
         Scegli una persona che occupa un posto speciale nella tua storia.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <div className="mb-4 flex gap-2">
          <button
    type="button"
    onClick={() => {
      setTipoSpecialeInputType('custom');
      
    }}
    className={`rounded-md px-3 py-2 text-sm border ${
      tipoSpecialeInputType === 'custom'
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
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
        ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)] text-[var(--dash-text-strong)]'
        : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
    }`}
  >
    Abitanti degni di nota
  </button>
        </div>
  
        {tipoSpecialeInputType === 'custom' ? (
          <div>
            <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
              Tipo Speciale *
            </label>
            <input
              type="text"
              value={tipoSpeciale}
              onChange={(e) => setTipoSpeciale(e.target.value)}
              placeholder="Es. Abigail Prinn"
              className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
            />
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
              Cittadino di riferimento *
            </label>
            <select
              value={tipoSpeciale}
              onChange={(e) => setTipoSpeciale(e.target.value)}
              className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] outline-none focus:border-[var(--dash-accent)]"
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
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Abilità</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Assegna i 2 punti bonus rimasti. Il valore massimo per abilità è 4.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
            Punti abilità rimasti
          </div>
          <div className="rounded-full border border-[var(--dash-accent)] bg-[var(--dash-surface)] px-4 py-1 text-sm font-semibold text-[var(--dash-text-strong)]">
            {puntiAbilitaRimasti}
          </div>
        </div>
  
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(ABILITA_PER_AMBITO).map(([ambito, abilitaList]) => (
            <div key={ambito} className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
              <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                      className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-[var(--dash-text-strong)]">{abilita}</span>
                        <span className="text-lg font-semibold text-[var(--dash-text-strong)]">{totalValue}</span>
                      </div>
  
                      <div className="flex items-center justify-between text-xs text-[var(--dash-accent-2)]">
                        <span>Base: {getAbilitaBaseValue(abilita)}</span>
                        <span>Bonus: +{bonusValue}</span>
                      </div>
  
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => removeBonusAbilita(abilita)}
                          disabled={!canRemove}
                          className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-3 py-1.5 text-sm text-[var(--dash-text-strong)] disabled:opacity-30"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => addBonusAbilita(abilita)}
                          disabled={!canAdd}
                          className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-surface)] px-3 py-1.5 text-sm text-[var(--dash-text-strong)] disabled:opacity-30"
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
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Storia</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Annotazioni, dettagli di background, memorie e tono del personaggio.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <label className="mb-3 block text-sm uppercase tracking-[0.08em] text-[var(--dash-muted)]">
          Note narrative
        </label>
        <textarea
          value={storia}
          onChange={(e) => setStoria(e.target.value)}
          placeholder="Scrivi qui il background, dettagli importanti, relazioni, paure, motivazioni..."
          rows={10}
          className="w-full rounded-xl border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-4 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
    <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
      <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        Sfondo personalizzato del personaggio
      </div>
  
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        URL immagine
      </label>
      <input
        type="text"
        value={coverImageUrl}
        onChange={(e) => setCoverImageUrl(e.target.value)}
        placeholder="https://..."
        className="mb-4 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
      />
  
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-input)]">
        <button
          type="button"
          onClick={() => setShowCoverCrop(true)}
          className="relative h-48 w-full overflow-hidden"
        >
          {coverImageUrl ? (
            <img src={coverImageUrl} alt="Anteprima sfondo personaggio" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--dash-muted)]">
              Nessuno sfondo selezionato
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-black/40 px-3 py-2 text-xs text-[var(--dash-text-strong)]">
            Clicca per scegliere/ritagliare
          </div>
        </button>
      </div>

      {showCoverCrop && (
        <ImageCropUploadModal
          bucket="character-portraits"
          storagePath={`${initialCharacter?.id ?? 'new'}-${Date.now()}/cover.jpg`}
          cropShape="rect"
          aspect={16 / 9}
          uploadLabel="Seleziona lo sfondo del personaggio"
          onUploaded={(url) => {
            setCoverImageUrl(url);
            setCoverPositionX(0);
            setCoverPositionY(0);
            setCoverScale(1);
            setShowCoverCrop(false);
          }}
          onClose={() => setShowCoverCrop(false)}
        />
      )}
    </div>

    <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
      <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        Portrait tondo
      </div>

      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        URL immagine
      </label>
      <input
        type="text"
        value={portraitImageUrl}
        onChange={(e) => setPortraitImageUrl(e.target.value)}
        placeholder="https://..."
        className="mb-4 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-3 text-[var(--dash-text-strong)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
      />

      <div className="mt-4 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setShowPortraitCrop(true)}
          className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--dash-accent)] bg-[var(--dash-input)]"
        >
          {portraitCroppedImageUrl || portraitImageUrl ? (
            <img
              src={portraitCroppedImageUrl || portraitImageUrl}
              alt="Anteprima portrait"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-center text-sm text-[var(--dash-muted)]">Nessun portrait</div>
          )}
        </button>
        <p className="text-center text-xs text-[var(--dash-muted)]">Clicca per scegliere/ritagliare</p>
      </div>

      {showPortraitCrop && (
        <ImageCropUploadModal
          bucket="character-portraits"
          storagePath={`${initialCharacter?.id ?? 'new'}-${Date.now()}/portrait.jpg`}
          cropShape="round"
          aspect={1}
          uploadLabel="Seleziona il ritratto del personaggio"
          onUploaded={(url) => {
            setPortraitCroppedImageUrl(url);
            setPortraitImageUrl(url);
            setShowPortraitCrop(false);
          }}
          onClose={() => setShowPortraitCrop(false)}
        />
      )}
    </div>
  </div>
      </div>
    </div>
  )}
  
          {step === 7 && (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Equipaggiamento</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Organizza ciò che porti con te, ciò che trasporti e ciò che resta a casa.
        </p>
      </div>
  
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
        <label className="mb-4 flex items-center gap-3 text-sm text-[var(--dash-text-strong)]">
          <input
            type="checkbox"
            checked={hasZaino}
            onChange={(e) => setHasZaino(e.target.checked)}
            className="h-4 w-4 accent-[var(--dash-accent)]"
          />
          Il personaggio ha uno zaino
        </label>
  
        <div className="grid gap-4 xl:grid-cols-3">
          {/* IN TASCA */}
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                  className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                >
                  <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                  <button
                    type="button"
                    onClick={() => removeFromInTasca(item)}
                    className="text-sm text-[var(--dash-text-strong)]"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          </div>
  
          {/* TRASPORTABILI */}
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              Trasportabili ({trasportabiliNelZaino.length + trasportabiliIndossati.length}/4)
            </div>
  
            {hasZaino ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                        className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                      >
                        <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                        <button
                          type="button"
                          onClick={() => removeFromTrasportabiliNelZaino(item)}
                          className="text-sm text-[var(--dash-text-strong)]"
                        >
                          Rimuovi
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
  
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                      className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                        className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                      >
                        <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                        <button
                          type="button"
                          onClick={() => removeFromTrasportabiliIndossati(item)}
                          className="text-sm text-[var(--dash-text-strong)]"
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
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                      className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTrasportabiliIndossati(item)}
                        className="text-sm text-[var(--dash-text-strong)]"
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
          <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
            <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
              A Casa
            </div>
  
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                      className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTascabiliACasa(item)}
                        className="text-sm text-[var(--dash-text-strong)]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
  
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                      className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromTrasportabiliACasa(item)}
                        className="text-sm text-[var(--dash-text-strong)]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
  
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text-strong)]"
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
                      className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--dash-text-strong)]">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFromRisorseACasa(item)}
                        className="text-sm text-[var(--dash-text-strong)]"
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
        <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">Tratti</h3>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">
          Seleziona 1 tratto di Stile e 2 tratti di Viaggio.
        </p>
      </div>
  
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <div className="mb-4 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
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
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:bg-[var(--dash-surface-2)]'
                  }`}
                >
                  <div className="font-semibold text-[var(--dash-text-strong)]">{trait.name}</div>
                  <div className="mt-1 text-sm text-[var(--dash-text)]">{trait.description}</div>
                  <div className="mt-2 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>
                </button>
              );
            })}
          </div>
        </div>
  
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-5">
          <div className="mb-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
            Tratti di Viaggio
          </div>
          <div className="mb-4 text-xs text-[var(--dash-accent-2)]">
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
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-surface)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:bg-[var(--dash-surface-2)]'
                  }`}
                >
                  <div className="font-semibold text-[var(--dash-text-strong)]">{trait.name}</div>
                  <div className="mt-1 text-sm text-[var(--dash-text)]">{trait.description}</div>
                  <div className="mt-2 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>
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
        <div className="flex items-center justify-between border-t border-[var(--dash-border)] bg-[var(--dash-panel)] px-6 py-4">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Indietro
          </button>
  
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
            Step {step} / {totalSteps}
          </div>
  
          {step < totalSteps ? (
    <button
      onClick={handleNext}
      disabled={!canProceed()}
      className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-surface)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      Avanti
    </button>
  ) : (
    <button
      onClick={handleSubmit}
      disabled={!canProceed()}
      className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {initialCharacter ? 'Salva modifiche' : 'Crea Personaggio'}
    </button>
  )}
        </div>
      </div>
    </div>
  );
  }
