// Logica di calcolo condivisa tra CharacterCreationWizard.tsx (creazione) e
// la tab "Origini" di EntityDetailView.tsx (modifica post-creazione). Estratta
// da CharacterCreationWizard.tsx perché entrambi i punti devono applicare
// esattamente le stesse regole quando Stile/Viaggio cambiano.
import type { Stile, Viaggio, Abilita } from '../types/character';

export type AmbitoType = 'Fisico' | 'Scuola' | 'Carisma' | 'Strada';

// Definizione dei Viaggi per ogni Stile
export const VIAGGI_PER_STILE: Record<Stile, Viaggio[]> = {
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
export const STILE_AMBITO_BONUS: Record<Stile, AmbitoType> = {
  Jock: 'Fisico',
  Cheerleader: 'Carisma',
  Nerd: 'Scuola',
  Goth: 'Strada',
  'Self-made': 'Carisma',
  Rebel: 'Fisico',
  Gangsta: 'Strada',
  "Daddy's kid": 'Scuola'
};

export const VIAGGIO_AMBITO_BONUS: Record<Viaggio, AmbitoType> = {
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
export const calculateAmbiti = (style: Stile, viaggio: Viaggio): { Fisico: number; Scuola: number; Carisma: number; Strada: number } => {
  const ambiti = { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 };

  const styleBonus = STILE_AMBITO_BONUS[style];
  ambiti[styleBonus] = Math.min(2, ambiti[styleBonus] + 1);

  const viaggioBonus = VIAGGIO_AMBITO_BONUS[viaggio];
  ambiti[viaggioBonus] = Math.min(2, ambiti[viaggioBonus] + 1);

  return ambiti;
};

// Abilità che ricevono +1 da ogni Stile (10 punti totali)
export const STILE_ABILITA: Record<Stile, Abilita[]> = {
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
export const VIAGGIO_ABILITA: Record<Viaggio, Abilita[]> = {
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

// Calcola il valore base di un'abilità: 1 + bonus Stile + bonus Viaggio.
// Pura: nessuna dipendenza da state di componente (a differenza dell'originale
// nel wizard, che leggeva style/viaggio da closure).
export const getAbilitaBaseValue = (stile: Stile, viaggio: Viaggio, abilita: Abilita): number => {
  let base = 1;
  if (STILE_ABILITA[stile]?.includes(abilita)) base += 1;
  if (VIAGGIO_ABILITA[viaggio]?.includes(abilita)) base += 1;
  return base;
};

// Valore totale di un'abilità (base + eventuali punti bonus assegnati
// manualmente in creazione). bonusAbilita e' esplicito: nel wizard viveva in
// state locale (non persistito), qui e' un parametro cosi' la funzione resta pura.
export const getAbilitaTotalValue = (
  stile: Stile,
  viaggio: Viaggio,
  abilita: Abilita,
  bonusAbilita: Partial<Record<Abilita, number>>
): number => {
  return getAbilitaBaseValue(stile, viaggio, abilita) + (bonusAbilita[abilita] || 0);
};

// Cittadini degni di nota di Innsmouth (pool condivisa per Tutore e Tipo Speciale)
export const NOTABLE_CITIZENS = [
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
