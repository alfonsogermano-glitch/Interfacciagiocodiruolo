export type MonsterSpecialActionBase = {
  id: string;
  name: string;
  description: string;
};

export const MONSTER_SPECIAL_ACTIONS_CATALOG: MonsterSpecialActionBase[] = [
  {
    id: 'afferrare',
    name: 'Afferrare',
    description:
      'Afferra una creatura a portata dei suoi arti e ne impedisce il movimento.'
  },
  {
    id: 'balzo-dimensionale',
    name: 'Balzo Dimensionale',
    description:
      'Scompare magicamente e riappare nello stesso ambiente ma in un altro posto.'
  },
  {
    id: 'dominazione',
    name: 'Dominazione',
    description:
      'Prende il totale controllo di uno Studente e ne controlla la prossima Azione.'
  },
  {
    id: 'fetore-nauseabondo',
    name: 'Fetore Nauseabondo',
    description:
      'Causa Intralcio (-1 al prossimo Tiro) a tutti quelli che si trovano in corpo a corpo.'
  },
  {
    id: 'incantesimi',
    name: 'Incantesimi',
    description:
      'Può lanciare incantesimi. La scelta degli incantesimi è a discrezione dell’Antico.'
  },
  {
    id: 'indurre-cecita',
    name: 'Indurre Cecità',
    description:
      'Fa perdere temporaneamente la vista a una creatura.'
  },
  {
    id: 'mutare-aspetto',
    name: 'Mutare Aspetto',
    description:
      'Assume l’aspetto di una persona, compreso l’abbigliamento.'
  },
  {
    id: 'rigenerazione',
    name: 'Rigenerazione',
    description:
      'Recupera 2 Freschezza.'
  },
  {
    id: 'stridore-infernale',
    name: 'Stridore Infernale',
    description:
      'Causa la Condizione Fifone a tutti quelli che possono udirlo.'
  }
];