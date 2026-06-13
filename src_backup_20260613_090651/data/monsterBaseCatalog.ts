export type Difficulty =
  | 'Base'
  | 'Critico'
  | 'Estremo'
  | 'Impossibile'
  | 'Non euclideo';

export type MonsterBase = {
  id: string;
  name: string;
  description: string;

  freschezza: number;
  caselleFrischezzaCruciali: number[];

  attacco: Difficulty;
  difesa: Difficulty;
  tiroFollia?: Difficulty | null;

  traitIds: string[];
  specialActionIds: string[];

  puntoDebole: string;

  portraitImageUrl?: string;
  coverImageUrl?: string;
};

export const MONSTER_BASE_CATALOG: MonsterBase[] = [
  {
    id: 'burattino',
    name: 'Burattino',
    description: '',
    freschezza: 3,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Base',
    traitIds: [],
    specialActionIds: [],
    puntoDebole: ''
  },
  {
    id: 'adepto',
    name: 'Adepto',
    description: '',
    freschezza: 4,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Base',
    traitIds: ['armato'],
    specialActionIds: [],
    puntoDebole: ''
  },
  {
    id: 'sacerdote',
    name: 'Sacerdote',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Critico',
    traitIds: ['stregone'],
    specialActionIds: ['incantesimi'],
    puntoDebole: ''
  },
  {
    id: 'abitatore-profondo',
    name: 'Abitatore del Profondo',
    description: '',
    freschezza: 4,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Base',
    tiroFollia: 'Critico',
    traitIds: ['terrificante', 'armato'],
    specialActionIds: ['fetore-nauseabondo', 'incantesimi'],
    puntoDebole: 'Sensibile al calore'
  },
  {
    id: 'assassino-dimensionale',
    name: 'Assassino Dimensionale',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Critico',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'tempra-stellare'],
    specialActionIds: ['rigenerazione'],
    puntoDebole: 'Vulnerabile a legno e pietra'
  },
  {
    id: 'ghoul',
    name: 'Ghoul',
    description: '',
    freschezza: 4,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Base',
    tiroFollia: 'Critico',
    traitIds: ['terrificante'],
    specialActionIds: [],
    puntoDebole: 'Sensibile alla luce'
  },
  {
    id: 'grande-razza-yith',
    name: 'Grande Razza di Yith',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Base',
    difesa: 'Estremo',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'sfuggente'],
    specialActionIds: ['dominazione'],
    puntoDebole: 'Sensibile al freddo'
  },
  {
    id: 'magro-notturno',
    name: 'Magro Notturno',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Critico',
    tiroFollia: 'Critico',
    traitIds: ['terrificante', 'tempra-stellare', 'volante'],
    specialActionIds: ['stridore-infernale'],
    puntoDebole: 'Sensibile alla luce'
  },
  {
    id: 'mi-go',
    name: 'Mi-Go',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Critico',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'tempra-stellare'],
    specialActionIds: ['incantesimi'],
    puntoDebole: 'Sensibile all’acqua'
  },
  {
    id: 'polipo-volante',
    name: 'Polipo Volante',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Estremo',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'tempra-stellare', 'volante'],
    specialActionIds: ['indurre-cecita'],
    puntoDebole: 'Vulnerabile all’elettricità'
  },
  {
    id: 'popolo-serpente',
    name: 'Popolo Serpente',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Base',
    tiroFollia: 'Critico',
    traitIds: ['terrificante', 'stregone'],
    specialActionIds: ['mutare-aspetto', 'incantesimi'],
    puntoDebole: 'Sensibile al freddo'
  },
  {
    id: 'prole-informe',
    name: 'Prole Informe',
    description: '',
    freschezza: 6,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Base',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'tempra-stellare'],
    specialActionIds: ['afferrare'],
    puntoDebole: 'Debole agli incantesimi'
  },
  {
    id: 'prole-stellare',
    name: 'Prole Stellare',
    description: '',
    freschezza: 7,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Estremo',
    tiroFollia: 'Impossibile',
    traitIds: ['terrificante', 'colossale', 'tempra-stellare'],
    specialActionIds: ['afferrare', 'incantesimi'],
    puntoDebole: 'Nessuno'
  },
  {
    id: 'quello-di-prima',
    name: 'Quello-di-Prima',
    description: '',
    freschezza: 6,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Critico',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'volante'],
    specialActionIds: ['afferrare', 'incantesimi'],
    puntoDebole: 'Vulnerabile al fuoco'
  },
  {
    id: 'segugio-astrale',
    name: 'Segugio Astrale',
    description: '',
    freschezza: 5,
    caselleFrischezzaCruciali: [],
    attacco: 'Critico',
    difesa: 'Estremo',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'tempra-stellare', 'vampirismo'],
    specialActionIds: ['balzo-dimensionale'],
    puntoDebole: 'Odiano l’acqua'
  },
  {
    id: 'shantak',
    name: 'Shantak',
    description: '',
    freschezza: 6,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Critico',
    tiroFollia: 'Estremo',
    traitIds: ['terrificante', 'colossale', 'volante'],
    specialActionIds: ['afferrare'],
    puntoDebole: 'Teme i Magri Notturni'
  },
  {
    id: 'shoggoth',
    name: 'Shoggoth',
    description: '',
    freschezza: 7,
    caselleFrischezzaCruciali: [],
    attacco: 'Estremo',
    difesa: 'Base',
    tiroFollia: 'Impossibile',
    traitIds: ['terrificante', 'colossale'],
    specialActionIds: ['afferrare'],
    puntoDebole: 'Debole agli incantesimi'
  }
];