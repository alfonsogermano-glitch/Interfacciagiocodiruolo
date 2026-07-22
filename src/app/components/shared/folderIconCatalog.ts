// Fonte unica di verita' per il set curato di icone cartella - condivisa tra
// FolderIconPicker (griglia di scelta) e FolderRow in CampaignHome.tsx (resa
// dell'icona effettiva), cosi' le due liste non possono divergere.
import {
  Folder, FolderOpen, FolderClosed, FolderKanban, FolderHeart, FolderKey,
  FolderLock, FolderArchive, Skull, Ghost, Sword, Swords, Shield, Scroll,
  ScrollText, BookOpen, Map, Key, Gem, Crown, Feather, Flame, Moon, Eye,
  Castle, Wand,
  type LucideIcon,
} from 'lucide-react';

export interface FolderIconOption {
  id: string;
  icon: LucideIcon;
  label: string;
}

// Set curato iniziale - solo un array, facile da estendere in seguito.
export const FOLDER_ICON_OPTIONS: FolderIconOption[] = [
  { id: 'folder-open', icon: FolderOpen, label: 'Cartella aperta' },
  { id: 'folder-closed', icon: FolderClosed, label: 'Cartella chiusa' },
  { id: 'folder-kanban', icon: FolderKanban, label: 'Cartella organizzata' },
  { id: 'folder-heart', icon: FolderHeart, label: 'Cartella preferita' },
  { id: 'folder-key', icon: FolderKey, label: 'Cartella chiave' },
  { id: 'folder-lock', icon: FolderLock, label: 'Cartella bloccata' },
  { id: 'folder-archive', icon: FolderArchive, label: 'Archivio' },
  { id: 'skull', icon: Skull, label: 'Teschio' },
  { id: 'ghost', icon: Ghost, label: 'Fantasma' },
  { id: 'sword', icon: Sword, label: 'Spada' },
  { id: 'swords', icon: Swords, label: 'Spade incrociate' },
  { id: 'shield', icon: Shield, label: 'Scudo' },
  { id: 'scroll', icon: Scroll, label: 'Pergamena' },
  { id: 'scroll-text', icon: ScrollText, label: 'Pergamena scritta' },
  { id: 'book-open', icon: BookOpen, label: 'Libro' },
  { id: 'map', icon: Map, label: 'Mappa' },
  { id: 'key', icon: Key, label: 'Chiave' },
  { id: 'gem', icon: Gem, label: 'Gemma' },
  { id: 'crown', icon: Crown, label: 'Corona' },
  { id: 'feather', icon: Feather, label: 'Piuma' },
  { id: 'flame', icon: Flame, label: 'Fiamma' },
  { id: 'moon', icon: Moon, label: 'Luna' },
  { id: 'eye', icon: Eye, label: 'Occhio' },
  { id: 'castle', icon: Castle, label: 'Castello' },
  { id: 'wand', icon: Wand, label: 'Bacchetta' },
];

// Fallback difensivo: un id sconosciuto/rimosso dal set curato (o null,
// "icona predefinita") ricade sull'icona Folder invece di rompere il
// render - stessa normalizzazione a lettura gia' seguita altrove nel
// progetto per dati che possono cambiare forma nel tempo.
export function getFolderIconComponent(iconId: string | null): LucideIcon {
  return FOLDER_ICON_OPTIONS.find((opt) => opt.id === iconId)?.icon ?? Folder;
}
