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
      name: 'Intimidatorio',
      description: 'Sai come spaventare gli altri',
      benefit: '+1 ai tiri per intimidire'
    },
    {
      name: 'Forte e robusto',
      description: 'Sei molto più forte della media',
      benefit: '+1 ai tiri di Muscoli'
    },
    {
      name: 'Reputazione temibile',
      description: 'Tutti sanno chi sei',
      benefit: 'Bonus quando usi la tua reputazione'
    },
    {
      name: 'Pugni pesanti',
      description: 'Sai come colpire duro',
      benefit: '+1 danni nel combattimento corpo a corpo'
    }
  ],
  'Fratello maggiore': [
    {
      name: 'Protettivo',
      description: 'Proteggi chi ti sta a cuore',
      benefit: '+1 quando difendi qualcuno'
    },
    {
      name: 'Responsabile',
      description: 'Ti prendi cura degli altri',
      benefit: '+1 ai tiri di Pronto Soccorso'
    },
    {
      name: 'Esempio da seguire',
      description: 'Gli altri ti guardano come modello',
      benefit: '+1 ai tiri di Leadership con persone più giovani'
    },
    {
      name: 'Esperienza vissuta',
      description: 'Hai già visto tanto',
      benefit: 'Bonus ai tiri di Percezione per pericoli'
    }
  ],

  // CHEERLEADER
  'Stronza suprema': [
    {
      name: 'Regina della scuola',
      description: 'Controlli le dinamiche sociali',
      benefit: '+1 ai tiri di Raggirare'
    },
    {
      name: 'Lingua tagliente',
      description: 'Le tue parole feriscono',
      benefit: '+1 quando insulti o denigri qualcuno'
    },
    {
      name: 'Manipolatrice',
      description: 'Sai come ottenere ciò che vuoi',
      benefit: '+1 ai tiri per manipolare'
    },
    {
      name: 'Rete sociale',
      description: 'Conosci tutti i segreti',
      benefit: 'Bonus quando cerchi informazioni sui compagni'
    }
  ],
  "Fidanzata d'America": [
    {
      name: 'Adorabile',
      description: 'Tutti ti vogliono bene',
      benefit: '+1 ai tiri di Carisma'
    },
    {
      name: 'Sorriso perfetto',
      description: 'Il tuo sorriso conquista tutti',
      benefit: '+1 alle azioni sociali positive'
    },
    {
      name: 'Spirito di squadra',
      description: 'Sai come motivare il gruppo',
      benefit: '+1 ai tiri di Leadership quando supporti'
    },
    {
      name: 'Ottimista',
      description: 'Mantieni sempre il morale alto',
      benefit: 'Bonus quando cerchi di sollevare il morale'
    }
  ],
  Sbandata: [
    {
      name: 'Amore cieco',
      description: 'Farai di tutto per chi ami',
      benefit: '+1 quando agisci per proteggere la persona amata'
    },
    {
      name: 'Romantica',
      description: 'Credi nell\'amore vero',
      benefit: '+1 ai tiri di Percezione riguardo sentimenti'
    },
    {
      name: 'Dedizione totale',
      description: 'Non ti arrendi mai',
      benefit: 'Bonus quando persegui un obiettivo romantico'
    },
    {
      name: 'Cuore spezzato',
      description: 'Hai sofferto per amore',
      benefit: '+1 ai tiri contro manipolazione emotiva'
    }
  ],

  // NERD
  'Primo della classe': [
    {
      name: 'Genio accademico',
      description: 'Sei il migliore in tutte le materie',
      benefit: '+1 ai tiri di Studio'
    },
    {
      name: 'Ricerca meticolosa',
      description: 'Sai dove trovare informazioni',
      benefit: '+1 quando fai ricerche'
    },
    {
      name: 'Memoria perfetta',
      description: 'Ricordi ogni dettaglio',
      benefit: '+1 ai tiri di memoria'
    },
    {
      name: 'Perfezionista',
      description: 'Fai sempre le cose al meglio',
      benefit: 'Puoi ritirare un dado fallito per sessione'
    }
  ],
  Smanettone: [
    {
      name: 'Hacker',
      description: 'Puoi entrare in qualsiasi sistema',
      benefit: '+1 ai tiri per hackerare'
    },
    {
      name: 'Tecnico esperto',
      description: 'Capisci come funziona la tecnologia',
      benefit: '+1 ai tiri di Manualità con elettronica'
    },
    {
      name: 'Gadget improvvisato',
      description: 'Puoi costruire dispositivi utili',
      benefit: 'Una volta per sessione puoi creare un gadget semplice'
    },
    {
      name: 'Rete digitale',
      description: 'Hai contatti online ovunque',
      benefit: 'Bonus quando cerchi informazioni online'
    }
  ],
  Sapientino: [
    {
      name: 'Cultura generale',
      description: 'Sai un po\' di tutto',
      benefit: '+1 ai tiri di conoscenza generale'
    },
    {
      name: 'Curioso',
      description: 'Vuoi sempre sapere di più',
      benefit: '+1 ai tiri di Percezione per dettagli'
    },
    {
      name: 'Enciclopedia ambulante',
      description: 'Hai informazioni su tutto',
      benefit: 'Bonus quando ricordi fatti oscuri'
    },
    {
      name: 'Deduzione logica',
      description: 'Colleghi i puntini facilmente',
      benefit: '+1 quando analizzi indizi'
    }
  ],

  // GOTH
  Occultista: [
    {
      name: 'Ritualista',
      description: 'Conosci rituali oscuri',
      benefit: '+1 quando esegui rituali'
    },
    {
      name: 'Grimorio personale',
      description: 'Hai un libro di conoscenze occulte',
      benefit: '+1 ai tiri per conoscenze sovrannaturali'
    },
    {
      name: 'Terzo occhio',
      description: 'Percepisci l\'invisibile',
      benefit: '+1 ai tiri per percepire presenze'
    },
    {
      name: 'Protezione arcana',
      description: 'Conosci metodi di protezione',
      benefit: '+1 quando ti proteggi dal sovrannaturale'
    }
  ],
  Metallaro: [
    {
      name: 'Resistenza al dolore',
      description: 'Il dolore non ti ferma',
      benefit: '+1 ai tiri di Resistenza'
    },
    {
      name: 'Presenza intimidatoria',
      description: 'Il tuo aspetto spaventa',
      benefit: '+1 ai tiri per intimidire'
    },
    {
      name: 'Musica della furia',
      description: 'La musica ti dà forza',
      benefit: '+1 quando usi la musica per caricarti'
    },
    {
      name: 'Banda metal',
      description: 'Hai amici nella scena metal',
      benefit: 'Bonus quando cerchi aiuto dalla comunità metal'
    }
  ],
  Emo: [
    {
      name: 'Sensibile',
      description: 'Capisci le emozioni altrui',
      benefit: '+1 ai tiri di Percezione su emozioni'
    },
    {
      name: 'Espressione artistica',
      description: 'Esprimi i tuoi sentimenti artisticamente',
      benefit: '+1 ai tiri di Esibirsi'
    },
    {
      name: 'Anima tormentata',
      description: 'Hai già sofferto molto',
      benefit: '+1 ai tiri contro manipolazione emotiva'
    },
    {
      name: 'Empatia profonda',
      description: 'Ti connetti profondamente con gli altri',
      benefit: 'Bonus quando consoli qualcuno'
    }
  ],

  // SELF-MADE
  'Ex-promessa': [
    {
      name: 'Talento innato',
      description: 'Eri davvero bravo una volta',
      benefit: '+1 nella tua vecchia specialità'
    },
    {
      name: 'Determinazione',
      description: 'Vuoi tornare ai vecchi livelli',
      benefit: '+1 quando ti impegni al massimo'
    },
    {
      name: 'Ricordi di gloria',
      description: 'Alcuni si ricordano di te',
      benefit: 'Bonus quando usi la tua vecchia fama'
    },
    {
      name: 'Secondo tentativo',
      description: 'Hai una seconda possibilità',
      benefit: 'Puoi ritirare un dado fallito per sessione'
    }
  ],
  Lavoratore: [
    {
      name: 'Etica del lavoro',
      description: 'Sai cosa significa lavorare duro',
      benefit: '+1 ai tiri di Resistenza fisica'
    },
    {
      name: 'Pratico',
      description: 'Sai come fare le cose',
      benefit: '+1 ai tiri di Manualità'
    },
    {
      name: 'Soldi extra',
      description: 'Hai un reddito dal lavoro',
      benefit: 'Hai più risorse economiche degli altri'
    },
    {
      name: 'Rete lavorativa',
      description: 'Conosci persone dal lavoro',
      benefit: 'Bonus quando cerchi aiuto dai colleghi'
    }
  ],
  Espulso: [
    {
      name: 'Passato oscuro',
      description: 'Hai fatto cose di cui non vai fiero',
      benefit: '+1 ai tiri di Crimine'
    },
    {
      name: 'Duro a morire',
      description: 'Ne hai passate tante',
      benefit: '+1 ai tiri di Resistenza'
    },
    {
      name: 'Lezione imparata',
      description: 'Sai cosa non fare',
      benefit: '+1 quando eviti guai'
    },
    {
      name: 'Seconda possibilità',
      description: 'Vuoi redimarti',
      benefit: 'Bonus quando cerchi di fare la cosa giusta'
    }
  ],

  // REBEL
  Teppista: [
    {
      name: 'Rissa da strada',
      description: 'Sai come combattere',
      benefit: '+1 ai tiri di combattimento corpo a corpo'
    },
    {
      name: 'Reputazione',
      description: 'Sei conosciuto come un duro',
      benefit: '+1 ai tiri per intimidire'
    },
    {
      name: 'Banda',
      description: 'Hai amici teppisti',
      benefit: 'Bonus quando chiami rinforzi'
    },
    {
      name: 'Sopravvissuto',
      description: 'Sei sopravvissuto a molte risse',
      benefit: '+1 ai tiri di Resistenza'
    }
  ],
  Attivista: [
    {
      name: 'Carisma da leader',
      description: 'Sai ispirare gli altri',
      benefit: '+1 ai tiri di Leadership'
    },
    {
      name: 'Rete di attivisti',
      description: 'Conosci altri attivisti',
      benefit: 'Bonus quando organizzi proteste'
    },
    {
      name: 'Eloquenza',
      description: 'Sai parlare in pubblico',
      benefit: '+1 ai tiri di Esibirsi quando parli'
    },
    {
      name: 'Causa giusta',
      description: 'Credi fermamente nella tua causa',
      benefit: '+1 quando agisci per i tuoi ideali'
    }
  ],
  Skater: [
    {
      name: 'Acrobata',
      description: 'Sei esperto in acrobazie e manovre difficili',
      benefit: '+1 ai tiri di Acrobatica'
    },
    {
      name: 'Intascare',
      description: 'Sai come nascondere piccoli oggetti',
      benefit: '+1 ai tiri per nascondere oggetti tascabili'
    },
    {
      name: 'Sesto senso',
      description: 'Percepisci i pericoli prima che accadano',
      benefit: '+1 ai tiri di Allerta per percepire pericoli'
    },
    {
      name: 'Volteggio',
      description: 'Puoi eseguire trick spettacolari',
      benefit: '+1 ai tiri di Acrobatica con lo skateboard'
    }
  ],

  // GANGSTA
  Delinquente: [
    {
      name: 'Vita criminale',
      description: 'Conosci il mondo del crimine',
      benefit: '+1 ai tiri di Crimine'
    },
    {
      name: 'Spietato',
      description: 'Fai ciò che serve',
      benefit: '+1 quando usi la violenza'
    },
    {
      name: 'Contatti loschi',
      description: 'Conosci gente pericolosa',
      benefit: 'Bonus quando cerchi aiuto nel crimine'
    },
    {
      name: 'Sopravvissuto delle strade',
      description: 'Sei cresciuto in strada',
      benefit: '+1 ai tiri di Allerta per pericoli'
    }
  ],
  'Genio del ghetto': [
    {
      name: 'Intelligenza di strada',
      description: 'Capisci le dinamiche del ghetto',
      benefit: '+1 ai tiri sociali nel ghetto'
    },
    {
      name: 'Talento nascosto',
      description: 'Sei molto più intelligente di quanto sembri',
      benefit: '+1 ai tiri di Studio'
    },
    {
      name: 'Ambizione',
      description: 'Vuoi uscire dal ghetto',
      benefit: '+1 quando lavori per il futuro'
    },
    {
      name: 'Doppia vita',
      description: 'Sai muoverti in più mondi',
      benefit: 'Bonus quando ti adatti a contesti diversi'
    }
  ],
  Ladruncolo: [
    {
      name: 'Dita veloci',
      description: 'Sei un esperto borsaiolo',
      benefit: '+1 ai tiri per rubare'
    },
    {
      name: 'Furtivo',
      description: 'Ti muovi senza fare rumore',
      benefit: '+1 ai tiri di Furtività'
    },
    {
      name: 'Occhio clinico',
      description: 'Riconosci gli oggetti di valore',
      benefit: '+1 quando valuti oggetti'
    },
    {
      name: 'Via di fuga',
      description: 'Trovi sempre una via d\'uscita',
      benefit: '+1 quando scappi'
    }
  ],

  // DADDY'S KID
  'Party animal': [
    {
      name: 'Mondano',
      description: 'Conosci tutti i posti giusti',
      benefit: '+1 nelle situazioni di festa'
    },
    {
      name: 'Carisma sfrenato',
      description: 'Sei l\'anima della festa',
      benefit: '+1 ai tiri di Esibirsi in contesti sociali'
    },
    {
      name: 'Resistenza all\'alcol',
      description: 'Reggi più degli altri',
      benefit: '+1 contro effetti di intossicazione'
    },
    {
      name: 'Vita notturna',
      description: 'Conosci il giro delle feste',
      benefit: 'Bonus quando cerchi informazioni nella vita notturna'
    }
  ],
  'Nato per vincere': [
    {
      name: 'Vincente',
      description: 'La fortuna ti assiste sempre',
      benefit: '+1 ai tiri quando conta davvero'
    },
    {
      name: 'Fiducia in sé',
      description: 'Sai di valere',
      benefit: '+1 ai tiri di Leadership'
    },
    {
      name: 'Eredità familiare',
      description: 'La tua famiglia ha una storia di successi',
      benefit: 'Bonus quando usi il nome di famiglia'
    },
    {
      name: 'Aspettative alte',
      description: 'Devi essere il migliore',
      benefit: '+1 quando cerchi di eccellere'
    }
  ],
  'Rampollo della malavita': [
    {
      name: 'Famiglia criminale',
      description: 'Tuo padre è un boss',
      benefit: '+1 quando usi le connessioni criminali'
    },
    {
      name: 'Rispetto della malavita',
      description: 'I criminali ti rispettano',
      benefit: '+1 quando interagisci con criminali'
    },
    {
      name: 'Protezione',
      description: 'Hai sempre delle guardie del corpo',
      benefit: 'Bonus quando sei in pericolo'
    },
    {
      name: 'Affari sporchi',
      description: 'Conosci come funzionano gli affari illegali',
      benefit: '+1 ai tiri di Crimine'
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
