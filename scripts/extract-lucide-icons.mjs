import { writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(__dirname,'..');
const LUCIDE_ICONS_DIR=resolve(ROOT,'node_modules/lucide-react/dist/esm/icons');
const OUTPUT_FILE=resolve(ROOT,'src/app/components/session/shared/tiptapIconData.ts');

export const EXPECTED_ICON_COUNT=210;
export const LUCIDE_VERSION='0.487.0';
export const EXPECTED_CATEGORY_COUNTS={"Combattimento":24,"Magia & Occulto":24,"Horror & Mistero":22,"Creature & Natura":22,"Personaggi":18,"Luoghi":20,"Oggetti & Equipaggiamento":26,"Viaggio & Veicoli":18,"Dadi & Gioco":16,"Simboli & Stati":20};
export const LEGACY_ICON_NAMES=["Sword","Swords","Shield","Target","Crosshair","Skull","Bomb","Zap","Flame","Biohazard","Sparkles","Wand","Ghost","Eye","Moon","Sun","Feather","Scroll","Radiation","Snowflake","Compass","Map","MapPin","Mountain","Tent","Footprints","Anchor","Ship","Route","Signpost","User","Users","Crown","GraduationCap","Drama","Briefcase","Key","Gem","Coins","Pickaxe","FlaskConical","Pill","Syringe","Dice6","BookOpen","Castle","Church","Landmark","DoorOpen","Home","Store","Trees","Activity","Bell","Brain","Star","Heart","Music","Theater","Newspaper"];

// Authored source of truth. Icon tuples are [LucideName, ItalianLabel, ItalianAliases?].
export const ICON_CATALOG=[{"category":"Combattimento","icons":[["Sword","Spada",["arma","lama","combattimento"]],["Swords","Spade incrociate",["arma","spada","duello"]],["Shield","Scudo",["difesa","protezione"]],["Target","Bersaglio",["obiettivo","mira"]],["Crosshair","Mirino",["mira","bersaglio"]],["Bomb","Bomba",["esplosivo"]],["Zap","Fulmine",["elettricità","energia"]],["Flame","Fiamma",["fuoco"]],["Axe","Ascia",["arma","scure"]],["Hammer","Martello",["martello","arma"]],["ShieldCheck","Scudo protetto"],["ShieldAlert","Scudo in allerta"],["ShieldX","Scudo annullato"],["ShieldPlus","Scudo rinforzato"],["ShieldMinus","Scudo ridotto"],["Flag","Bandiera"],["FlagTriangleRight","Stendardo"],["Siren","Sirena",["allarme"]],["Radar","Radar",["rilevamento"]],["ScanLine","Scansione"],["BadgeAlert","Distintivo d'allarme"],["BadgeCheck","Distintivo confermato"],["Gavel","Martelletto",["giudice"]],["Anvil","Incudine",["fabbro"]]]},{"category":"Magia & Occulto","icons":[["Sparkles","Scintille",["magia","incanto"]],["Wand","Bacchetta",["magia","incantesimo"]],["Moon","Luna",["notte"]],["Scroll","Pergamena",["pergamena","scrittura"]],["Star","Stella",["astro"]],["WandSparkles","Bacchetta magica",["magia","incantesimo"]],["Sparkle","Scintilla"],["MoonStar","Luna stellata"],["Orbit","Orbita",["pianeta"]],["Atom","Atomo",["energia"]],["Infinity","Infinito",["eterno"]],["Eclipse","Eclissi",["oscurità"]],["CircleDotDashed","Cerchio rituale",["rituale","cerchio magico"]],["Telescope","Telescopio"],["BookOpen","Libro aperto",["libro","grimorio"]],["BookMarked","Libro segnato",["libro","segnalibro"]],["BookOpenText","Grimorio",["magia","libro","incantesimi"]],["ScrollText","Pergamena scritta",["pergamena","testo"]],["Feather","Piuma",["piuma","scrittura"]],["Gem","Gemma",["pietra preziosa"]],["FlaskConical","Ampolla",["pozione","alchimia"]],["CloudMoon","Luna tra le nuvole"],["CloudSun","Sole tra le nuvole"],["Rainbow","Arcobaleno"]]},{"category":"Horror & Mistero","icons":[["Skull","Teschio",["morte","cranio","teschio"]],["Ghost","Fantasma",["spettro","fantasma"]],["Eye","Occhio",["sguardo","osservare"]],["Biohazard","Rischio biologico",["contagio","pericolo"]],["Radiation","Radiazioni",["radioattivo","pericolo"]],["Fingerprint","Impronta digitale",["indizio","impronta"]],["Search","Ricerca",["cerca","indagine"]],["SearchX","Ricerca fallita",["cerca","nessun risultato"]],["ScanEye","Occhio analizzato",["occhio","indagine"]],["FileQuestion","Documento misterioso",["mistero","documento"]],["LockKeyhole","Serratura",["chiuso","serratura"]],["KeyRound","Chiave antica",["chiave","segreto"]],["CloudFog","Nebbia",["foschia","nebbia"]],["Haze","Foschia",["nebbia","foschia"]],["VenetianMask","Maschera",["travestimento","maschera"]],["Rat","Ratto",["topo"]],["Bug","Insetto",["insetto","parassita"]],["BugOff","Insetto barrato"],["AlarmClock","Sveglia",["tempo","allarme"]],["Clock","Orologio",["tempo"]],["ScanFace","Volto analizzato",["volto","identità"]],["Microscope","Microscopio",["indagine","laboratorio"]]]},{"category":"Creature & Natura","icons":[["Trees","Bosco",["foresta","bosco"]],["Mountain","Montagna",["altura"]],["Sun","Sole",["giorno","luce"]],["Snowflake","Fiocco di neve",["freddo","neve"]],["Flower","Fiore"],["Flower2","Fiore sbocciato"],["Leaf","Foglia",["natura"]],["Sprout","Germoglio",["pianta"]],["TreePine","Pino",["albero"]],["TreeDeciduous","Albero",["albero"]],["Bird","Uccello",["animale"]],["Cat","Gatto",["animale","felino"]],["Dog","Cane",["animale"]],["Rabbit","Coniglio",["animale"]],["Snail","Lumaca",["animale"]],["Turtle","Tartaruga",["animale"]],["Fish","Pesce",["animale"]],["Shell","Conchiglia",["mare"]],["PawPrint","Impronta animale",["zampa","traccia"]],["CloudRain","Pioggia",["meteo"]],["CloudLightning","Temporale",["meteo"]],["CloudSnow","Neve",["meteo"]]]},{"category":"Personaggi","icons":[["User","Personaggio",["persona","pg","png"]],["Users","Gruppo",["persone"]],["Crown","Corona",["re","regina","nobiltà"]],["GraduationCap","Studente",["scuola"]],["Drama","Maschere teatrali",["attore","maschera"]],["Briefcase","Valigetta",["lavoro","valigia"]],["UserRound","Persona"],["UserCog","Tecnico"],["UserCheck","Alleato",["alleato","amico"]],["UserX","Nemico",["nemico","avversario"]],["UserPlus","Nuovo personaggio"],["UserMinus","Personaggio rimosso"],["Contact","Contatto",["rubrica"]],["ContactRound","Profilo"],["Baby","Bambino",["neonato"]],["PersonStanding","Persona in piedi"],["Accessibility","Accessibilità"],["Smile","Sorriso",["felice"]]]},{"category":"Luoghi","icons":[["Castle","Castello",["fortezza"]],["Church","Chiesa",["tempio"]],["Landmark","Monumento",["istituzione"]],["DoorOpen","Porta aperta"],["Home","Casa",["abitazione"]],["Store","Negozio",["bottega"]],["School","Scuola",["istituto"]],["Hospital","Ospedale",["clinica"]],["Warehouse","Magazzino",["deposito"]],["Factory","Fabbrica",["industria"]],["Building","Edificio"],["Building2","Palazzo"],["DoorClosed","Porta chiusa"],["Fence","Recinzione",["recinto"]],["Library","Biblioteca",["libri"]],["LibraryBig","Grande biblioteca"],["Hotel","Albergo",["locanda"]],["University","Università",["ateneo"]],["TentTree","Accampamento",["campo"]],["TowerControl","Torre di controllo",["torre"]]]},{"category":"Oggetti & Equipaggiamento","icons":[["Key","Chiave",["aprire"]],["Coins","Monete",["denaro","soldi"]],["Pickaxe","Piccone",["attrezzo"]],["Pill","Pillola",["medicina","farmaco"]],["Syringe","Siringa",["medicina","iniezione"]],["Backpack","Zaino",["borsa"]],["Flashlight","Torcia",["luce"]],["Lamp","Lampada"],["Lightbulb","Lampadina",["idea"]],["Notebook","Taccuino",["note"]],["Book","Libro"],["Camera","Fotocamera",["foto"]],["Radio","Radio",["comunicazione"]],["Phone","Telefono",["chiamata"]],["Smartphone","Smartphone",["cellulare"]],["Watch","Orologio da polso",["tempo"]],["Wrench","Chiave inglese",["attrezzo"]],["Shovel","Pala",["attrezzo"]],["Binoculars","Binocolo",["osservare"]],["Package","Pacco",["spedizione"]],["Box","Scatola",["contenitore"]],["Archive","Archivio",["documenti"]],["Wallet","Portafoglio",["denaro"]],["FileText","Documento",["file"]],["Newspaper","Giornale",["notizie"]],["Music","Musica",["suono"]]]},{"category":"Viaggio & Veicoli","icons":[["Compass","Bussola",["direzione"]],["Map","Mappa",["cartina"]],["MapPin","Segnaposto",["luogo","posizione"]],["Tent","Tenda",["campo"]],["Footprints","Impronte",["tracce"]],["Anchor","Ancora",["porto"]],["Ship","Nave",["barca"]],["Route","Percorso",["strada"]],["Signpost","Segnale stradale",["cartello","direzione"]],["Car","Automobile",["auto","macchina"]],["Bus","Autobus",["pullman"]],["Truck","Camion",["autocarro"]],["Train","Treno",["ferrovia"]],["Plane","Aereo",["volo"]],["Bike","Bicicletta",["bici"]],["Sailboat","Barca a vela",["barca","vela"]],["Navigation","Navigazione",["direzione"]],["Navigation2","Direzione",["freccia"]]]},{"category":"Dadi & Gioco","icons":[["Dice1","Dado uno",["dado","uno"]],["Dice2","Dado due",["dado","due"]],["Dice3","Dado tre",["dado","tre"]],["Dice4","Dado quattro",["dado","quattro"]],["Dice5","Dado cinque",["dado","cinque"]],["Dice6","Dado sei",["dado","sei"]],["Dices","Dadi",["dadi","tiro"]],["Gamepad2","Controller",["gioco"]],["Trophy","Trofeo",["vittoria"]],["Medal","Medaglia",["premio"]],["Award","Premio",["riconoscimento"]],["Goal","Obiettivo",["meta"]],["Puzzle","Enigma",["rompicapo"]],["Spade","Picche",["carte"]],["Club","Fiori",["carte"]],["Diamond","Quadri",["carte"]]]},{"category":"Simboli & Stati","icons":[["Activity","Attività",["stato"]],["Bell","Campana",["notifica"]],["Brain","Cervello",["mente"]],["Heart","Cuore",["vita"]],["Theater","Teatro",["spettacolo"]],["Check","Conferma",["ok","sì"]],["X","Annulla",["no","chiudi"]],["Plus","Più",["aggiungi"]],["Minus","Meno",["rimuovi"]],["CircleCheck","Confermato",["ok"]],["CircleX","Negato",["no"]],["TriangleAlert","Attenzione",["allarme","pericolo"]],["Info","Informazione",["informazioni"]],["Lock","Bloccato",["chiuso"]],["Unlock","Sbloccato",["aperto"]],["EyeOff","Nascosto",["invisibile"]],["Power","Accensione",["energia"]],["Wifi","Connessione",["rete"]],["Volume2","Audio",["suono"]],["Circle","Cerchio",["stato"]]]}];

const KEBAB_OVERRIDES={Home:'house',Train:'tram-front',Unlock:'lock-open'};
function toKebabCase(name){
  return KEBAB_OVERRIDES[name]??name.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Z])([A-Z][a-z])/g,'$1-$2').replace(/([a-zA-Z])([0-9])/g,'$1-$2').toLowerCase();
}

function expandEntry(tuple,category){
  const [name,label,aliases=[]]=tuple;
  return {name,label,aliases,category};
}

export function validateManifest(manifest=ICON_CATALOG){
  const errors=[];
  const expected=Object.entries(EXPECTED_CATEGORY_COUNTS);
  if(manifest.length!==expected.length) errors.push(`categorie: attese ${expected.length}, trovate ${manifest.length}`);
  for(let i=0;i<expected.length;i+=1){
    const [expectedName,expectedCount]=expected[i];
    const actual=manifest[i];
    if(!actual){errors.push(`categoria mancante: ${expectedName}`);continue;}
    if(actual.category!==expectedName) errors.push(`categoria ${i+1}: attesa "${expectedName}", trovata "${actual.category}"`);
    if(actual.icons.length!==expectedCount) errors.push(`categoria "${expectedName}": attese ${expectedCount} icone, trovate ${actual.icons.length}`);
  }
  const entries=manifest.flatMap(section=>section.icons.map(tuple=>expandEntry(tuple,section.category)));
  if(entries.length!==EXPECTED_ICON_COUNT) errors.push(`totale: attesa ${EXPECTED_ICON_COUNT} icone, trovate ${entries.length}`);
  const seen=new Set(),duplicates=new Set();
  for(const entry of entries){
    if(typeof entry.name!=='string'||!entry.name) errors.push(`entry senza nome valida in "${entry.category}"`);
    if(typeof entry.label!=='string'||!entry.label.trim()) errors.push(`"${entry.name}": etichetta italiana mancante`);
    if(!Array.isArray(entry.aliases)||entry.aliases.some(alias=>typeof alias!=='string')) errors.push(`"${entry.name}": aliases non validi`);
    if(seen.has(entry.name)) duplicates.add(entry.name);
    seen.add(entry.name);
  }
  if(duplicates.size) errors.push(`nomi duplicati: ${[...duplicates].join(', ')}`);
  const missingLegacy=LEGACY_ICON_NAMES.filter(name=>!seen.has(name));
  if(missingLegacy.length) errors.push(`icone legacy mancanti: ${missingLegacy.join(', ')}`);
  if(errors.length) throw new Error(`Manifest icone Note non valido:\n- ${errors.join('\n- ')}`);
  return entries;
}

function stripReactKey(iconNode){
  return iconNode.map(([tag,attrs])=>{const {key:_key,...clean}=attrs;return [tag,clean];});
}

export async function generateIconData(){
  const entries=validateManifest();
  const lucide=await import('lucide-react');
  const iconData={},missingExports=[],missingModules=[],invalidNodes=[];
  for(const entry of entries){
    const name=entry.name;
    if(!(name in lucide)){missingExports.push(name);continue;}
    const fileName=toKebabCase(name);
    try{
      const mod=await import(pathToFileURL(resolve(LUCIDE_ICONS_DIR,`${fileName}.js`)).href);
      if(!Array.isArray(mod.__iconNode)||!mod.__iconNode.length){invalidNodes.push(name);continue;}
      iconData[name]=stripReactKey(mod.__iconNode);
    }catch{missingModules.push(`${name} (${fileName}.js)`);}
  }
  const errors=[];
  if(missingExports.length) errors.push(`export Lucide mancanti: ${missingExports.join(', ')}`);
  if(missingModules.length) errors.push(`moduli Lucide mancanti: ${missingModules.join(', ')}`);
  if(invalidNodes.length) errors.push(`SVG Lucide non validi: ${invalidNodes.join(', ')}`);
  if(Object.keys(iconData).length!==EXPECTED_ICON_COUNT) errors.push(`raw SVG generati: attesi ${EXPECTED_ICON_COUNT}, trovati ${Object.keys(iconData).length}`);
  if(errors.length) throw new Error(`Catalogo incompatibile con lucide-react ${LUCIDE_VERSION}:\n- ${errors.join('\n- ')}`);
  const iconCategories=ICON_CATALOG.map(section=>({label:section.category,icons:section.icons.map(tuple=>tuple[0])}));
  const iconMeta=Object.fromEntries(entries.map(entry=>[entry.name,entry]));
  const output=`/** AUTO-GENERATED by scripts/extract-lucide-icons.mjs from lucide-react ${LUCIDE_VERSION}. Do not edit. */
export type IconPrimitive=readonly [tag:string,attrs:Readonly<Record<string,string|number>>];
export interface NoteIconMeta{name:string;label:string;aliases:readonly string[];category:string;}
export const DEFAULT_ICON_NAME='Star';
export const ICON_CATEGORIES:readonly {label:string;icons:readonly string[]}[]=${JSON.stringify(iconCategories,null,2)};
export const ICON_META:Readonly<Record<string,NoteIconMeta>>=${JSON.stringify(iconMeta,null,2)};
export const ICON_DATA:Readonly<Record<string,readonly IconPrimitive[]>>=${JSON.stringify(iconData,null,2)};
`;
  writeFileSync(OUTPUT_FILE,output,'utf8');
  return {entries,iconCategories,iconMeta,iconData,output};
}

async function main(){
  const result=await generateIconData();
  console.log(`Generated ${Object.keys(result.iconData).length} Lucide icons (${LUCIDE_VERSION}) -> ${OUTPUT_FILE}`);
}
const isMain=process.argv[1]?resolve(process.argv[1])===fileURLToPath(import.meta.url):false;
if(isMain) main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
