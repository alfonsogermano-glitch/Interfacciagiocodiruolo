import type { Stile, Viaggio, Trait } from '../types/character';

// Tratti disponibili per ogni Stile (1 tratto selezionabile)
export const STYLE_TRAITS: Record<Stile, Trait[]> = {
  Jock: [
    {
      name: 'Allenato',
      description: 'Hai un corpo in forma e ben preparato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per correre, arrampicarsi o nuotare.'
    },
    {
      name: 'Pilota',
      description: 'Hai raggiunto finalmente la tua indipendenza in fatto di mobilità.',
      benefit: 'Lo so, ti eri già esaltato, ma significa solo che possiedi un\'auto o una motocicletta personale: è proprio tua, non devi chiedere a mamma di prestartela!'
    },
    {
      name: 'Palestrato',
      description: 'Hai un fisico molto muscoloso e potente.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per sollevare, trascinare, trasportare o rompere qualcosa.'
    }
  ],

  Cheerleader: [
    {
      name: 'Acrobata',
      description: 'Sei agile ed esperta in acrobazie.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per compiere acrobazie o frenare le cadute.'
    },
    {
      name: 'Pettegolezzo',
      description: 'Sei un asso nel reperire informazioni indiscrete su fatti altrui.',
      benefit: 'Spendi 1 Audacia. Inventa o chiedi all\'Antico un\'informazione scomoda ottenuta ascoltando i pettegolezzi. Oppure metti in giro una voce.'
    },
    {
      name: 'Super popolare',
      description: 'Sei estremamente nota e ampiamente apprezzata.',
      benefit: 'Rilanci in Sicurezza tutti i tiri quando ti relazioni con altri studenti della scuola.'
    }
  ],

  Nerd: [
    {
      name: 'Copiare',
      description: 'Sei un maestro nell\'imitare le azioni altrui.',
      benefit: 'Spendi 2 Audacia. Dopo che un compagno ha superato un tiro con successo, superi automaticamente lo stesso tiro.'
    },
    {
      name: 'L\'ho letto in un libro',
      description: 'Sei un lettore compulsivo!',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque tiro adoperando l\'Abilità Cultura invece dell\'Abilità richiesta.'
    },
    {
      name: 'Topo di biblioteca',
      description: 'Vivi più tra i libri che tra gli umani.',
      benefit: 'Rilanci in Sicurezza per cercare informazioni in una biblioteca o in un libro, per leggere rapidamente o per tradurre un testo.'
    }
  ],

  Goth: [
    {
      name: 'Attento',
      description: 'Sei un individuo vigile, preciso e scrupoloso.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per notare piccoli indizi come macchioline di sangue o altre sostanze, odori strani, nascondigli, eccetera.'
    },
    {
      name: 'Lupo solitario',
      description: 'Meglio soli che male accompagnati!',
      benefit: 'Ricevi un +1 a tutti i tiri quando ti trovi da solo a dover affrontare un Tiro Azione.'
    },
    {
      name: 'Stoico',
      description: 'Sei forte, impassibile e controllato. Nulla ti turba!',
      benefit: 'Spendi 2 Audacia. Curati da una singola Condizione. Non puoi curare la Condizione Spezzato in questo modo.'
    }
  ],

  'Self-made': [
    {
      name: 'Pilota',
      description: 'Hai raggiunto finalmente la tua indipendenza in fatto di mobilità.',
      benefit: 'Lo so, ti eri già esaltato, ma significa solo che possiedi un\'auto o una motocicletta personale: è proprio tua, non devi chiedere a mamma di prestartela!'
    },
    {
      name: 'Temprato dalle difficoltà',
      description: 'Le avversità della vita ti hanno reso forte.',
      benefit: 'Dopo aver annerito la tua Casella Critica di Freschezza, guadagni 2 Audacia.'
    },
    {
      name: 'Tuttofare',
      description: 'Il genio delle attività multidisciplinari!',
      benefit: 'Spendi 1 Audacia. Rilanci in Sicurezza durante il tuo prossimo turno.'
    }
  ],

  Rebel: [
    {
      name: 'Agile come un gatto',
      description: 'Sei incredibilmente agile e scattante.',
      benefit: 'Spendi 2 Audacia. Esibisciti in una pericolosa acrobazia, evita le conseguenze di una caduta o abbandona un combattimento senza tirare i dadi.'
    },
    {
      name: 'Coraggioso',
      description: 'Non ti fai intimidire facilmente.',
      benefit: 'Rilanci in Sicurezza per resistere a minacce o intimidazioni o per dimostrare coraggio e forza di volontà.'
    },
    {
      name: 'Giullare',
      description: 'Sai come intrattenere e distrarre.',
      benefit: 'Spendi 1 Audacia. Rincuori o allegri un altro Studente, curando la Condizione Fuso, Sfigato o Fifone.'
    }
  ],

  Gangsta: [
    {
      name: 'Brutte compagnie',
      description: 'Conosci le persone giuste nel ghetto.',
      benefit: 'Spendi 2 audacia. Ottieni informazioni o risorse grazie alle tue connessioni con i bassifondi, o alla tua fama.'
    },
    {
      name: 'Minaccioso',
      description: 'Sei un armadio a quattro ante poco amichevole.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per minacciare o intimidire.'
    },
    {
      name: 'Sesto senso',
      description: 'Non ti fregano facilmente.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per comprendere le intenzioni altrui, per interrogare e per riconoscere le bugie.'
    }
  ],

  "Daddy's kid": [
    {
      name: 'Pilota',
      description: 'Hai raggiunto finalmente la tua indipendenza in fatto di mobilità.',
      benefit: 'Lo so, ti eri già esaltato, ma significa solo che possiedi un\'auto o una motocicletta personale: è proprio tua, non devi chiedere a mamma di prestartela!'
    },
    {
      name: 'Carta del papi',
      description: 'Che bello usare i fondi illimitati del papà.',
      benefit: 'Spendi 2 Audacia. Ottieni un equipaggiamento o un servizio costoso gratis.'
    },
    {
      name: 'Non sono stato io',
      description: 'Campione nazionale degli scaricabarile professionisti.',
      benefit: 'Spendi 1 Audacia. Un compagno soffre le conseguenze di un tuo fallimento al posto tuo.'
    }
  ]
};

// Tratti disponibili per ogni Viaggio (2 tratti selezionabili)
export const JOURNEY_TRAITS: Record<Viaggio, Trait[]> = {
  // JOCK
  Campione: [
    {
      name: 'Infermiere',
      description: 'Supereroe stanco con le Crocs ai piedi.',
      benefit: 'Spendi 1 Audacia. Cura la Condizione Malconcio, Malato o Intossicato di un compagno.'
    },
    {
      name: 'Coraggioso',
      description: 'Non ti fai intimidire facilmente.',
      benefit: 'Rilanci in Sicurezza per resistere a minacce o intimidazioni o per dimostrare coraggio e forza di volontà.'
    },
    {
      name: 'Eroe popolare',
      description: 'L\'idolo di quartiere amato da tutti.',
      benefit: 'Rilanci in Sicurezza tutti i tiri quando ti relazioni con la classe media.'
    },
    {
      name: 'Sempre sul pezzo',
      description: 'Hai gli occhi anche dietro la schiena.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando l\'Abilità Freddezza invece dell\'Abilità richiesta.'
    }
  ],
  Bullo: [
    {
      name: 'Alpha Dog',
      description: 'Quando entri in una stanza, la gerarchia si stabilisce da sola.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando Leadership invece dell\'Abilità richiesta.'
    },
    {
      name: 'Bugiardo',
      description: 'Le tue scuse sono sempre più creative dei tuoi crimini.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per mentire e raggirare.'
    },
    {
      name: 'Manesco',
      description: 'Preferisci risolvere le discussioni con i pugni piuttosto che con le parole.',
      benefit: 'Durante una rissa o una colluttazione rilanci in Sicurezza tutti i tiri.'
    },
    {
      name: 'Minaccioso',
      description: 'Basta uno sguardo per far cambiare idea a chiunque.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per minacciare o intimidire.'
    }
  ],
  'Fratello maggiore': [
    {
      name: 'Altruista',
      description: 'Il tuo bisogno di aiutare gli altri viene sempre prima del tuo.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per aiutare qualcuno in difficoltà. Se fallisci perdi 1 punto di Freschezza aggiuntivo.'
    },
    {
      name: 'Giovane marmotta',
      description: 'Un weekend nei boschi con gli scout ti ha insegnato più di quanto ammetterai mai.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per procacciarti cibo e rifugio in ambienti naturali.'
    },
    {
      name: 'Migliore Amico',
      description: 'Non lasci mai indietro nessuno, costi quel che costi.',
      benefit: 'Spendi 1 Audacia. Subisci una perdita di Freschezza o una Condizione al posto di un altro Studente.'
    },
    {
      name: 'Salvataggio',
      description: 'Arrivi sempre al momento giusto, come nei film.',
      benefit: 'Spendi 1 Audacia. Eviti che un compagno ottenga la Condizione Spezzato oppure salva un compagno che sta per andare Fuori dai giochi.'
    }
  ],

  // CHEERLEADER
  'Stronza suprema': [
    {
      name: 'Agile come un gatto',
      description: 'Non ti sporchi mai le mani, o le scarpe.',
      benefit: 'Spendi 2 Audacia. Esibisciti in una pericolosa acrobazia, evita le conseguenze di una caduta o abbandona un combattimento senza tirare i dadi.'
    },
    {
      name: 'Alpha Dog',
      description: 'Quando entri in una stanza, la gerarchia si stabilisce da sola.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando Leadership invece dell\'Abilità richiesta.'
    },
    {
      name: 'Fascino intimidatorio',
      description: 'Un tuo sguardo vale più di mille minacce.',
      benefit: 'Spendi 2 Audacia. Ottieni un\'informazione o un favore senza tirare i dadi.'
    },
    {
      name: 'Volteggio',
      description: 'Ti muovi con una grazia che nasconde artigli affilati.',
      benefit: 'Spendi 1 Audacia. Reagisci contro un Avversario tirando Acrobatica +1 invece dell\'Abilità richiesta.'
    }
  ],
  "Fidanzata d'America": [
    {
      name: 'Infermiere',
      description: 'Supereroe stanco con le Crocs ai piedi.',
      benefit: 'Spendi 1 Audacia. Cura la Condizione Malconcio, Malato o Intossicato di un compagno.'
    },
    {
      name: 'Altruista',
      description: 'Il tuo bisogno di aiutare gli altri viene sempre prima del tuo.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per aiutare qualcuno in difficoltà. Se fallisci perdi 1 punto di Freschezza aggiuntivo.'
    },
    {
      name: 'Incoraggiamento',
      description: 'Le tue parole sanno tirare fuori il meglio dagli altri.',
      benefit: 'Spendi 1 Audacia. Un altro Studente riceve +1 al suo prossimo Tiro di Azione e rilancia in Sicurezza.'
    },
    {
      name: 'Studente modello',
      description: 'I professori ti adorano, e tu sfrutti la cosa senza vergogna.',
      benefit: 'Rilancia in Sicurezza tutti i tiri quando ti relazioni con i professori.'
    }
  ],
  Sbandata: [
    {
      name: 'Brutte compagnie',
      description: 'Il tuo ragazzo/a ha delle amicizie che tua madre non approverebbe mai.',
      benefit: 'Spendi 2 Audacia. Ottieni informazioni o risorse grazie alle tue connessioni con i bassifondi o alla tua fama.'
    },
    {
      name: 'Bugiardo',
      description: 'Le tue scuse sono sempre più creative dei tuoi crimini.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per mentire o raggirare.'
    },
    {
      name: 'Consiglio non richiesto',
      description: 'Sai sempre come dovrebbero fare le cose gli altri, che lo vogliano sapere o no.',
      benefit: 'Spendi 1 Audacia. Un compagno ottiene +1 al suo prossimo Tiro Azione e rilancia in Sicurezza ma perde 1 punto di Freschezza.'
    },
    {
      name: 'Non sono stato io!',
      description: 'Hai un talento naturale nello scaricare le colpe altrove.',
      benefit: 'Spendi 1 Audacia. Un compagno soffre le conseguenze di un tuo fallimento al posto tuo.'
    }
  ],

  // NERD
  'Primo della classe': [
    {
      name: 'Attento',
      description: 'Non ti sfugge mai nulla, nemmeno quello che gli altri preferirebbero tenere nascosto.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per notare piccoli indizi come macchioline di sangue o altre sostanze, odori strani, nascondigli, eccetera.'
    },
    {
      name: 'Giovane marmotta',
      description: 'Un weekend nei boschi con gli scout ti ha insegnato più di quanto ammetterai mai.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per procacciarti cibo e rifugio in ambienti naturali.'
    },
    {
      name: 'Studente modello',
      description: 'I professori ti adorano, e tu sfrutti la cosa senza vergogna.',
      benefit: 'Rilancia in Sicurezza tutti i tiri quando ti relazioni con i professori.'
    },
    {
      name: 'Tuttofare',
      description: 'Non sei il più bravo in niente, ma te la cavi decentemente in tutto.',
      benefit: 'Spendi 1 Audacia. Rilanci in Sicurezza durante il tuo prossimo tiro.'
    }
  ],
  Smanettone: [
    {
      name: 'Meccanico',
      description: 'Se ha un motore, tu sai come farlo ripartire.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per compiere riparazioni meccaniche o far partire veicoli a motore.'
    },
    {
      name: 'Piccolo chimico',
      description: 'Il tuo laboratorio in cantina ha già causato più di un\'esplosione controllata.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per interagire o studiare sostanze chimiche o per riconoscere fenomeni scientifici.'
    },
    {
      name: 'Pilota',
      description: 'Hai raggiunto finalmente la tua indipendenza in fatto di mobilità.',
      benefit: 'Lo so, ti eri già esaltato, ma significa solo che possiedi un\'auto o una motocicletta personale: è proprio tua, non devi chiedere a mamma di prestartela!'
    },
    {
      name: 'Informatico',
      description: 'Password, firewall, sistemi criptati: per te sono solo un simpatico rompicapo.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per interfacciarti con l\'informatica e l\'elettronica.'
    }
  ],
  Sapientino: [
    {
      name: 'Consiglio non richiesto',
      description: 'Sai sempre come dovrebbero fare le cose gli altri, che lo vogliano sapere o no.',
      benefit: 'Spendi 1 Audacia. Un compagno ottiene +1 al suo prossimo Tiro Azione e rilancia in Sicurezza ma perde 1 punto di Freschezza.'
    },
    {
      name: 'Enciclopedia vivente',
      description: 'Se esiste una domanda, tu hai già la risposta pronta, che qualcuno l\'abbia chiesta o no.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per ricordare eventi storici, luoghi geografici o nozioni di cultura generale.'
    },
    {
      name: 'Non sono stato io!',
      description: 'Hai un talento naturale nello scaricare le colpe altrove.',
      benefit: 'Spendi 1 Audacia. Un compagno soffre le conseguenze di un tuo fallimento al posto tuo.'
    },
    {
      name: 'Pettegolezzo',
      description: 'Sei un asso nel reperire informazioni indiscrete su fatti altrui.',
      benefit: 'Spendi 1 Audacia. Inventa o chiedi all\'Antico un\'informazione scomoda ottenuta ascoltando i pettegolezzi. Oppure metti in giro una voce.'
    }
  ],

  // GOTH
  Occultista: [
    {
      name: 'Conoscenze paranormali',
      description: 'Passi più tempo a leggere di demonologia che di matematica, e si vede.',
      benefit: 'Ricevi un +1 a tutti tiri legati a eventi paranormali, artefatti e formule arcane.'
    },
    {
      name: 'Esoterista',
      description: 'Il velo tra i mondi per te è più sottile che per chiunque altro.',
      benefit: 'Rilanci in Sicurezza tutti i tiri legati a eventi paranormali.'
    },
    {
      name: 'Freddo come il ghiaccio',
      description: 'L\'orrore ti scivola addosso come acqua su un vetro.',
      benefit: 'Rilanci in Sicurezza i Tiri Follia.'
    },
    {
      name: 'Sbagliando si impara',
      description: 'Guardi attentamente ogni errore altrui: la prossima volta tocca a te, e non fallirai.',
      benefit: 'Spendi 2 Audacia. Dopo che un compagno ha fallito un tiro, superi automaticamente lo stesso tiro.'
    }
  ],
  Metallaro: [
    {
      name: 'Alpha Dog',
      description: 'Quando entri in una stanza, la gerarchia si stabilisce da sola.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando Leadership invece dell\'Abilità richiesta.'
    },
    {
      name: 'Animale da palcoscenico',
      description: 'Sul palco (o ovunque tu decida che sia il tuo palco) sei semplicemente inarrestabile.',
      benefit: 'Scegli una forma d\'arte (es. musica, danza, street art, eccetera). Ottieni +1 e rilanci in Sicurezza tutti i tiri relativi alla tua arte.'
    },
    {
      name: 'Palestrato',
      description: 'Hai un fisico molto muscoloso e potente.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per sollevare, trascinare, trasportare o rompere qualcosa.'
    },
    {
      name: 'Super popolare',
      description: 'Sei estremamente noto e ampiamente apprezzato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri quando ti relazioni con altri studenti della scuola.'
    }
  ],
  Emo: [
    {
      name: 'Nichilista',
      description: 'Niente ha davvero importanza, e questo ti rende stranamente lucido nei momenti peggiori.',
      benefit: 'Spendi 2 Audacia. Superi automaticamente un Tiro Reazione.'
    },
    {
      name: 'Ombra',
      description: 'Ti confondi con gli angoli bui molto meglio di quanto la gente pensi sia possibile.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per restare nell\'ombra o eclissarti tra la folla.'
    },
    {
      name: 'Sesto Senso',
      description: 'Vedi attraverso le persone come se fossero fatte di vetro colorato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per comprendere le intenzioni altrui, per interrogare e per riconoscere le bugie.'
    },
    {
      name: 'Temprato dalle difficoltà',
      description: 'Ogni crisi che hai attraversato ti ha reso più duro da spezzare, non di meno.',
      benefit: 'Dopo aver annerito la tua Casella Critica di Freschezza guadagni 2 Audacia.'
    }
  ],

  // SELF-MADE
  'Ex-promessa': [
    {
      name: 'Allenato',
      description: 'Hai un corpo in forma e ben preparato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per correre, arrampicarsi o nuotare.'
    },
    {
      name: 'Migliore Amico',
      description: 'Non lasci mai indietro nessuno, costi quel che costi.',
      benefit: 'Spendi 1 Audacia. Subisci una perdita di Freschezza o una Condizione al posto di un altro Studente.'
    },
    {
      name: 'Rubacuori',
      description: 'Il tuo antico fascino da campione non è ancora del tutto svanito.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per sedurre.'
    },
    {
      name: 'Stoico',
      description: 'Sei forte, impassibile e controllato. Nulla ti turba!',
      benefit: 'Spendi 2 Audacia. Curati da una singola Condizione. Non puoi curare la Condizione Spezzato in questo modo.'
    }
  ],
  Lavoratore: [
    {
      name: 'Lupo solitario',
      description: 'Meglio soli che male accompagnati!',
      benefit: 'Ricevi un +1 a tutti i tiri quando ti trovi da solo a dover affrontare un Tiro Azione.'
    },
    {
      name: 'Meccanico',
      description: 'Se ha un motore, tu sai come farlo ripartire.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per compiere riparazioni meccaniche o far partire veicoli a motore.'
    },
    {
      name: 'Salvataggio',
      description: 'Arrivi sempre al momento giusto, come nei film.',
      benefit: 'Spendi 1 Audacia. Eviti che un compagno ottenga la Condizione Spezzato oppure salva un compagno che sta per andare Fuori dai giochi.'
    },
    {
      name: 'Tosto',
      description: 'Il tuo lavoro ti ha insegnato a reggere qualsiasi cosa la giornata ti butti addosso.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per resistere a sonno, fatica e condizioni estreme.'
    }
  ],
  Espulso: [
    {
      name: 'Incoraggiamento',
      description: 'Le tue parole sanno tirare fuori il meglio dagli altri.',
      benefit: 'Spendi 1 Audacia. Un altro Studente riceve +1 al suo prossimo Tiro di Azione e rilancia in Sicurezza.'
    },
    {
      name: 'L\'arte dell\'arrangiarsi',
      description: 'Anni passati a cavartela da solo ti hanno insegnato a non tornare mai a mani vuote.',
      benefit: 'Spendi 1 Audacia. Procurati cibo, armi improvvisate o altre importanti risorse grazie al tuo ingegno e alle tue conoscenze.'
    },
    {
      name: 'Piccolo chimico',
      description: 'Il tuo laboratorio in cantina ha già causato più di un\'esplosione controllata.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per interagire o studiare sostanze chimiche o per riconoscere fenomeni scientifici.'
    },
    {
      name: 'Sempre sul pezzo',
      description: 'Hai gli occhi anche dietro la schiena.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando l\'Abilità Freddezza invece dell\'Abilità richiesta.'
    }
  ],

  // REBEL
  Teppista: [
    {
      name: 'Animale da palcoscenico',
      description: 'Sul palco (o ovunque tu decida che sia il tuo palco) sei semplicemente inarrestabile.',
      benefit: 'Scegli una forma d\'arte (es. musica, danza, street art, eccetera). Ottieni +1 e rilanci in Sicurezza tutti i tiri relativi alla tua arte.'
    },
    {
      name: 'Osso troppo duro',
      description: 'Più ti fanno male, più diventi difficile da fermare.',
      benefit: 'Spendi 1 Audacia. Dopo aver fallito un Tiro Reazione contro un Avversario, gli infliggi la perdita di 2 punti di Freschezza.'
    },
    {
      name: 'Piccolo chimico',
      description: 'Il tuo laboratorio in cantina ha già causato più di un\'esplosione controllata.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per interagire o studiare sostanze chimiche o per riconoscere fenomeni scientifici.'
    },
    {
      name: 'Scassinatore',
      description: 'Nessuna serratura tra te e dove vuoi arrivare è mai stata un vero ostacolo.',
      benefit: 'Spendi 2 Audacia. Apri una serratura senza tirare dadi.'
    }
  ],
  Attivista: [
    {
      name: 'Incoraggiamento',
      description: 'Le tue parole sanno tirare fuori il meglio dagli altri.',
      benefit: 'Spendi 1 Audacia. Un altro Studente riceve +1 al suo prossimo Tiro di Azione e rilancia in Sicurezza.'
    },
    {
      name: 'Motivatore',
      description: 'Sai come far sentire chiunque capace di spostare le montagne, almeno per un momento.',
      benefit: 'Spendi 1 Audacia e fai guadagnare +2 al prossimo Tiro di un compagno.'
    },
    {
      name: 'Salvataggio',
      description: 'Arrivi sempre al momento giusto, come nei film.',
      benefit: 'Spendi 1 Audacia. Eviti che un compagno ottenga la Condizione Spezzato oppure salva un compagno che sta per andare Fuori dai giochi.'
    },
    {
      name: 'Temprato dalle difficoltà',
      description: 'Ogni crisi che hai attraversato ti ha reso più duro da spezzare, non di meno.',
      benefit: 'Dopo aver annerito la tua Casella Critica di Freschezza guadagni 2 Audacia.'
    }
  ],
  Skater: [
    {
      name: 'Acrobata',
      description: 'Sei agile ed esperto in acrobazie.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per compiere acrobazie o frenare le cadute.'
    },
    {
      name: 'Intascare',
      description: 'Le mani veloci sono un talento naturale, non serve nemmeno pensarci.',
      benefit: 'Spendi 2 Audacia. Ruba un piccolo oggetto senza tirare dadi.'
    },
    {
      name: 'Sesto Senso',
      description: 'Vedi attraverso le persone come se fossero fatte di vetro colorato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per comprendere le intenzioni altrui, per interrogare e per riconoscere le bugie.'
    },
    {
      name: 'Volteggio',
      description: 'Ti muovi con una grazia che nasconde artigli affilati.',
      benefit: 'Spendi 1 Audacia. Reagisci contro un Avversario tirando Acrobatica +1 invece dell\'Abilità richiesta.'
    }
  ],

  // GANGSTA
  Delinquente: [
    {
      name: 'Bassifondi',
      description: 'Conosci i bassifondi e sai come muoverti in mezzo a criminali e poco di buono.',
      benefit: 'Rilanci in Sicurezza tutti i Tiri relativi agli ambienti criminali.'
    },
    {
      name: 'Manesco',
      description: 'Preferisci risolvere le discussioni con i pugni piuttosto che con le parole.',
      benefit: 'Durante una rissa o una colluttazione rilanci in Sicurezza tutti i tiri.'
    },
    {
      name: 'Stoico',
      description: 'Sei forte, impassibile e controllato. Nulla ti turba!',
      benefit: 'Spendi 2 Audacia. Curati da una singola Condizione. Non puoi curare la Condizione Spezzato in questo modo.'
    },
    {
      name: 'Tosto',
      description: 'Le tue giornate ti hanno insegnato a reggere qualsiasi cosa ti buttino addosso.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per resistere a sonno, fatica e condizioni estreme.'
    }
  ],
  'Genio del ghetto': [
    {
      name: 'L\'arte dell\'arrangiarsi',
      description: 'Anni passati a cavartela da solo ti hanno insegnato a non tornare mai a mani vuote.',
      benefit: 'Spendi 1 Audacia. Procurati cibo, armi improvvisate o altre importanti risorse grazie al tuo ingegno e alle tue conoscenze.'
    },
    {
      name: 'L\'ho letto in un libro',
      description: 'Sei un lettore compulsivo!',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque tiro adoperando l\'Abilità Cultura invece dell\'Abilità richiesta.'
    },
    {
      name: 'Sbagliando si impara',
      description: 'Guardi attentamente ogni errore altrui: la prossima volta tocca a te, e non fallirai.',
      benefit: 'Spendi 2 Audacia. Dopo che un compagno ha fallito un tiro, superi automaticamente lo stesso tiro.'
    },
    {
      name: 'Studente modello',
      description: 'I professori ti adorano, e tu sfrutti la cosa senza vergogna.',
      benefit: 'Rilancia in Sicurezza tutti i tiri quando ti relazioni con i professori.'
    }
  ],
  Ladruncolo: [
    {
      name: 'Intascare',
      description: 'Le mani veloci sono un talento naturale, non serve nemmeno pensarci.',
      benefit: 'Spendi 2 Audacia. Ruba un piccolo oggetto senza tirare dadi.'
    },
    {
      name: 'Ombra',
      description: 'Ti confondi con gli angoli bui molto meglio di quanto la gente pensi sia possibile.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per restare nell\'ombra o eclissarti tra la folla.'
    },
    {
      name: 'Scassinatore',
      description: 'Nessuna serratura tra te e dove vuoi arrivare è mai stata un vero ostacolo.',
      benefit: 'Spendi 2 Audacia. Apri una serratura senza tirare dadi.'
    },
    {
      name: 'Tuttofare',
      description: 'Non sei il più bravo in niente, ma te la cavi decentemente in tutto.',
      benefit: 'Spendi 1 Audacia. Rilanci in Sicurezza durante il tuo prossimo tiro.'
    }
  ],

  // DADDY'S KID
  'Party animal': [
    {
      name: 'Copiare',
      description: 'Sei un maestro nell\'imitare le azioni altrui.',
      benefit: 'Spendi 2 Audacia. Dopo che un compagno ha superato un tiro con successo, superi automaticamente lo stesso tiro.'
    },
    {
      name: 'Giullare',
      description: 'Sai come intrattenere e distrarre.',
      benefit: 'Spendi 1 Audacia. Rincuori o rallegri un altro Studente, curando la Condizione Fuso, Sfigato o Fifone.'
    },
    {
      name: 'Rubacuori',
      description: 'Il tuo fascino naturale funziona ovunque ci sia musica alta e luci basse.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per sedurre.'
    },
    {
      name: 'Super popolare',
      description: 'Sei estremamente noto e ampiamente apprezzato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri quando ti relazioni con altri studenti della scuola.'
    }
  ],
  'Nato per vincere': [
    {
      name: 'Allenato',
      description: 'Hai un corpo in forma e ben preparato.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per correre, arrampicarsi o nuotare.'
    },
    {
      name: 'Palestrato',
      description: 'Hai un fisico molto muscoloso e potente.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per sollevare, trascinare, trasportare o rompere qualcosa.'
    },
    {
      name: 'Sbagliando si impara',
      description: 'Guardi attentamente ogni errore altrui: la prossima volta tocca a te, e non fallirai.',
      benefit: 'Spendi 2 Audacia. Dopo che un compagno ha fallito un tiro, superi automaticamente lo stesso tiro.'
    },
    {
      name: 'Tosto',
      description: 'I tuoi allenamenti ti hanno insegnato a reggere qualsiasi cosa la giornata ti butti addosso.',
      benefit: 'Rilanci in Sicurezza tutti i tiri per resistere a sonno, fatica e condizioni estreme.'
    }
  ],
  'Rampollo della malavita': [
    {
      name: 'Alpha Dog',
      description: 'Quando entri in una stanza, la gerarchia si stabilisce da sola.',
      benefit: 'Spendi 1 Audacia. Effettua un qualunque Tiro di Reazione adoperando Leadership invece dell\'Abilità richiesta.'
    },
    {
      name: 'Bassifondi',
      description: 'Conosci i bassifondi e sai come muoverti in mezzo a criminali e poco di buono.',
      benefit: 'Rilanci in Sicurezza tutti i Tiri relativi agli ambienti criminali.'
    },
    {
      name: 'Brutte compagnie',
      description: 'Nonostante l\'educazione impeccabile, conosci gente che tuo padre preferirebbe non nominare a cena.',
      benefit: 'Spendi 2 Audacia. Ottieni informazioni o risorse grazie alle tue connessioni con i bassifondi o alla tua fama.'
    },
    {
      name: 'Osso troppo duro',
      description: 'Più ti fanno male, più diventi difficile da fermare.',
      benefit: 'Spendi 1 Audacia. Dopo aver fallito un Tiro Reazione contro un Avversario, gli infliggi la perdita di 2 punti di Freschezza.'
    }
  ]
};

// Funzione helper per ottenere i tratti disponibili per un personaggio
export function getAvailableTraits(style: Stile, viaggio: Viaggio) {
  return {
    styleTraits: STYLE_TRAITS[style] || [],
    journeyTraits: JOURNEY_TRAITS[viaggio] || []
  };
}
