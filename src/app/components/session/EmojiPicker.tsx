import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Search, X } from 'lucide-react';
import { EMOJI_GROUPS, type EmojiGroup, type EmojiItem } from '../../../data/emojiData';
import { EmojiFlag, flagImageName } from './EmojiFlag';

const FREQUENT_KEY = 'hsc_emoji_frequent';
const FREQUENT_LIMIT = 16;
const FREQUENT_STORAGE_LIMIT = 100;

type EmojiTabId = 'recent' | 'faces' | 'animals' | 'food' | 'travel' | 'activities' | 'objects' | 'symbols' | 'flags';

interface EmojiTab {
  id: EmojiTabId;
  label: string;
  icon: string | null;
  groupNames: string[];
}

const EMOJI_TABS: EmojiTab[] = [
  { id: 'recent', label: 'Recenti', icon: null, groupNames: [] },
  { id: 'faces', label: 'Faccie e persone', icon: '😀', groupNames: ['Smileys & Emotion', 'People & Body'] },
  { id: 'animals', label: 'Animali e natura', icon: '🐾', groupNames: ['Animals & Nature'] },
  { id: 'food', label: 'Cibo e bevande', icon: '🍔', groupNames: ['Food & Drink'] },
  { id: 'travel', label: 'Viaggi e luoghi', icon: '✈️', groupNames: ['Travel & Places'] },
  { id: 'activities', label: 'Attività', icon: '⚽', groupNames: ['Activities'] },
  { id: 'objects', label: 'Oggetti', icon: '💡', groupNames: ['Objects'] },
  { id: 'symbols', label: 'Simboli', icon: '✳️', groupNames: ['Symbols'] },
  { id: 'flags', label: 'Bandiere', icon: '🚩', groupNames: ['Flags'] },
];

const CATEGORY_TABS = EMOJI_TABS.filter((tab) => tab.id !== 'recent');

const GROUPS_BY_NAME = new Map<string, EmojiGroup>(
  EMOJI_GROUPS.map((group): [string, EmojiGroup] => [group.name, group]),
);

const ITEMS_BY_CHAR = new Map<string, EmojiItem>();
for (const group of EMOJI_GROUPS) {
  for (const item of group.emojis) ITEMS_BY_CHAR.set(item.char, item);
}

interface EmojiSectionData {
  key: string;
  title: string;
  items: EmojiItem[];
}

function itemsForTab(tab: EmojiTab): EmojiItem[] {
  return tab.groupNames.flatMap((name) => GROUPS_BY_NAME.get(name)?.emojis ?? []);
}

function readFrequentCounts(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(FREQUENT_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function topFrequent(counts: Record<string, number>): EmojiItem[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, FREQUENT_LIMIT)
    .map(([char]) => ITEMS_BY_CHAR.get(char))
    .filter((item): item is EmojiItem => Boolean(item));
}

function recordUsage(char: string): void {
  try {
    const counts = readFrequentCounts();
    counts[char] = (counts[char] ?? 0) + 1;
    const pruned = Object.fromEntries(
      Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, FREQUENT_STORAGE_LIMIT)
    );
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(pruned));
  } catch {
    // localStorage non disponibile: le emoji usate non vengono ricordate.
  }
}

interface EmojiSectionProps {
  title: string;
  items: EmojiItem[];
  onHover: (item: EmojiItem) => void;
  onPick: (item: EmojiItem) => void;
}

const EmojiSection = memo(function EmojiSection({ title, items, onHover, onPick }: EmojiSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Sezioni fuori schermo montate solo all'avvicinarsi: aprire il picker con
  // ~1900 bottoni gia' pronti era lento, ora il primo paint e' quasi vuoto.
  const [mounted, setMounted] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (mounted) return;
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setMounted(true);
        observer.disconnect();
      }
    }, { rootMargin: '480px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);

  if (items.length === 0) return null;
  // Altezza stimata delle sezioni non montate, cosi' la scrollbar e' gia' corretta.
  const estimatedHeight = 40 + Math.ceil(items.length / 9) * 34;
  return (
    <div
      ref={containerRef}
      className="pt-2.5"
      style={mounted ? undefined : { minHeight: estimatedHeight }}
    >
      <div className="px-1 pb-1.5 text-xs font-semibold text-[var(--dash-muted)]">{title}</div>
      {mounted && (
        <div className="grid grid-cols-9 justify-items-center gap-0.5">
          {items.map((item) => (
            <button
              key={item.char}
              type="button"
              aria-label={item.name}
              onMouseEnter={() => onHover(item)}
              onFocus={() => onHover(item)}
              onClick={() => onPick(item)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-[var(--dash-surface-2)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--dash-accent)]"
            >
              {flagImageName(item.char)
                ? <EmojiFlag char={item.char} className="h-[1.3em] w-[1.3em]" />
                : item.char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

interface EmojiPickerProps {
  onPick: (char: string) => void;
}

export function EmojiPicker({ onPick }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<EmojiTabId>('recent');
  const [hovered, setHovered] = useState<EmojiItem | null>(null);
  const [frequent, setFrequent] = useState<EmojiItem[]>(() => topFrequent(readFrequentCounts()));
  const scrollRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo<EmojiItem[] | null>(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const results: EmojiItem[] = [];
    for (const group of EMOJI_GROUPS) {
      for (const item of group.emojis) {
        const haystack = `${item.name} ${item.shortcode}`.toLowerCase();
        if (tokens.every((token) => haystack.includes(token))) results.push(item);
      }
    }
    return results;
  }, [query]);

  const sections = useMemo<EmojiSectionData[]>(() => {
    if (searchResults) {
      return searchResults.length > 0 ? [{ key: 'results', title: 'Risultati', items: searchResults }] : [];
    }
    const list: EmojiSectionData[] = [];
    const tab = EMOJI_TABS.find((entry) => entry.id === activeTab) ?? EMOJI_TABS[0];
    if (tab.id === 'recent') {
      list.push({ key: 'frequent', title: 'Usati di frequente', items: frequent });
      for (const category of CATEGORY_TABS) {
        list.push({ key: category.id, title: category.label, items: itemsForTab(category) });
      }
      return list;
    }
    list.push({ key: tab.id, title: tab.label, items: itemsForTab(tab) });
    return list;
  }, [searchResults, activeTab, frequent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab, query]);

  const handleHover = useCallback((item: EmojiItem) => setHovered(item), []);

  const handlePick = useCallback((item: EmojiItem) => {
    recordUsage(item.char);
    setFrequent(topFrequent(readFrequentCounts()));
    onPick(item.char);
  }, [onPick]);

  return (
    <div className="flex w-[360px] flex-col rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] shadow-xl">
      <div className="flex items-center gap-0.5 border-b border-[var(--dash-border)] px-2 pt-1.5">
        {EMOJI_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            title={tab.label}
            aria-label={tab.label}
            onClick={() => { setActiveTab(tab.id); setQuery(''); }}
            className={`relative rounded-md p-1.5 transition-colors ${
              activeTab === tab.id && !query
                ? 'text-[var(--dash-accent)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            {tab.icon
              ? <span className="text-lg leading-none">{tab.icon}</span>
              : <Clock className="h-5 w-5" />}
            {activeTab === tab.id && !query && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--dash-accent)]" />
            )}
          </button>
        ))}
      </div>

      <div className="p-2">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--dash-surface-2)] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--dash-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca emoji"
            aria-label="Cerca emoji"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)]"
          />
          {query && (
            <button
              type="button"
              aria-label="Cancella ricerca"
              onClick={() => setQuery('')}
              className="shrink-0 rounded p-0.5 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="h-[300px] overflow-y-auto px-2 pb-2">
        {sections.map((section) => (
          <EmojiSection
            key={section.key}
            title={section.title}
            items={section.items}
            onHover={handleHover}
            onPick={handlePick}
          />
        ))}
        {searchResults && searchResults.length === 0 && (
          <p className="py-12 text-center text-xs text-[var(--dash-muted)]">
            Nessuna emoji trovata per "{query.trim()}"
          </p>
        )}
      </div>

      <div className="flex min-h-[52px] items-center gap-3 border-t border-[var(--dash-border)] px-3">
        {hovered ? (
          <>
            <EmojiFlag char={hovered.char} className="h-8 w-8 text-3xl leading-none" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--dash-text-strong)]">{hovered.name}</div>
              <div className="truncate text-xs text-[var(--dash-muted)]">{hovered.shortcode}</div>
            </div>
          </>
        ) : (
          <span className="text-xs text-[var(--dash-muted)]">Passa il mouse su un'emoji per vederne il nome</span>
        )}
      </div>
    </div>
  );
}
