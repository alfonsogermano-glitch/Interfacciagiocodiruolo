export type MonsterTraitBase = {
  id: string;
  name: string;
  description: string;
};

export const MONSTER_TRAITS_CATALOG: MonsterTraitBase[] = [
  {
    id: 'armato',
    name: 'Armato',
    description:
      'Se non ottieni nemmeno un Successo Base nel Tiro di Reazione, subisci la Condizione Malconcio.'
  },
  {
    id: 'colossale',
    name: 'Colossale',
    description:
      'Non può mai subire la perdita di più di 1 Freschezza in seguito a un attacco.'
  },
  {
    id: 'sfuggente',
    name: 'Sfuggente',
    description:
      'Il primo personaggio che lo attacca a distanza manca automaticamente.'
  },
  {
    id: 'stregone',
    name: 'Stregone',
    description:
      'Può lanciare incantesimi.'
  },
  {
    id: 'tempra-stellare',
    name: 'Tempra Stellare',
    description:
      'Può essere ferito solo da armi magiche.'
  },
  {
    id: 'terrificante',
    name: 'Terrificante',
    description:
      'La sua vista causa un Tiro Follia.'
  },
  {
    id: 'vampirismo',
    name: 'Vampirismo',
    description:
      'Ogni volta che fallisci un Tiro Reazione nei confronti dei suoi attacchi, recupera 1 Freschezza.'
  },
  {
    id: 'vista-onnisciente',
    name: 'Vista Onnisciente',
    description:
      'Vede attraverso muri e ostacoli.'
  },
  {
    id: 'volante',
    name: 'Volante',
    description:
      'È in grado di spostarsi in volo.'
  }
];