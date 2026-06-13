import { useRuleset } from '../../campaigns/RulesetContext';

/** Valori di una creatura/personaggio nel sistema d20 (D&D 5e / Pathfinder) */
export interface D20Stats {
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  // Caratteristiche
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  // Solo PG
  level?: number;
  className?: string;
  proficiencyBonus?: number;
  // Solo creature
  challengeRating?: string;
  creatureType?: string;
}

export const DEFAULT_D20_STATS: D20Stats = {
  hp: 0, maxHp: 10, ac: 10, speed: 30,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  level: 1, className: '', proficiencyBonus: 2,
  challengeRating: '—', creatureType: 'umanoide',
};

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function AbilityScore({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--dash-muted)]">{label}</span>
      <span className="text-lg font-bold text-[var(--dash-accent)]">{modifier(value)}</span>
      <input
        type="number"
        min={1} max={30}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-12 rounded border border-[var(--dash-border)] bg-[var(--dash-input)] py-0.5 text-center text-sm text-[var(--dash-text)]"
      />
    </div>
  );
}

function StatInput({ label, value, onChange, min = 0, max = 999, suffix = '' }: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--dash-muted)]">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={typeof value === 'number' ? 'number' : 'text'}
          value={value}
          min={min} max={max}
          onChange={e => onChange(e.target.value)}
          className="w-20 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text)]"
        />
        {suffix && <span className="text-xs text-[var(--dash-muted)]">{suffix}</span>}
      </div>
    </div>
  );
}

/** Blocco completo stat D20 — usabile in PG, PNG e Mostri */
export function D20StatBlock({
  stats,
  isPlayerCharacter = false,
  isEditing = true,
  onChange,
}: {
  stats: D20Stats;
  isPlayerCharacter?: boolean;
  isEditing?: boolean;
  onChange: (patch: Partial<D20Stats>) => void;
}) {
  const { rulesetId } = useRuleset();
  const isPathfinder = rulesetId === 'pathfinder';

  const abilities: Array<{ label: string; key: keyof D20Stats }> = [
    { label: 'FOR', key: 'str' },
    { label: 'DES', key: 'dex' },
    { label: 'COS', key: 'con' },
    { label: 'INT', key: 'int' },
    { label: 'SAG', key: 'wis' },
    { label: 'CAR', key: 'cha' },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--dash-accent)]">
        {isPathfinder ? 'Statistiche Pathfinder 2e' : 'Statistiche D&D 5e'}
      </h3>

      {/* Classe/livello (solo PG) */}
      {isPlayerCharacter && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--dash-muted)]">Classe</label>
            <input
              type="text"
              value={stats.className ?? ''}
              onChange={e => onChange({ className: e.target.value })}
              placeholder="es. Guerriero"
              className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-1.5 text-sm text-[var(--dash-text)]"
            />
          </div>
          <StatInput
            label="Livello"
            value={stats.level ?? 1}
            onChange={v => onChange({ level: Number(v) })}
            min={1} max={20}
          />
          <StatInput
            label="Bonus Competenza"
            value={stats.proficiencyBonus ?? 2}
            onChange={v => onChange({ proficiencyBonus: Number(v) })}
            suffix="+"
          />
        </div>
      )}

      {/* CR (solo creature) */}
      {!isPlayerCharacter && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--dash-muted)]">Tipo creatura</label>
            <input
              type="text"
              value={stats.creatureType ?? ''}
              onChange={e => onChange({ creatureType: e.target.value })}
              placeholder="es. non morto"
              className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-1.5 text-sm text-[var(--dash-text)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--dash-muted)]">Grado sfida</label>
            <input
              type="text"
              value={stats.challengeRating ?? '—'}
              onChange={e => onChange({ challengeRating: e.target.value })}
              placeholder="es. 1/2, 5"
              className="w-20 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-1.5 text-sm text-[var(--dash-text)]"
            />
          </div>
        </div>
      )}

      {/* HP / CA / Velocità */}
      <div className="flex flex-wrap gap-3">
        {/* HP con barra */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--dash-muted)]">PF attuali / max</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={stats.hp}
              onChange={e => onChange({ hp: Number(e.target.value) })}
              min={0}
              className="w-16 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1.5 text-center text-sm font-semibold text-[var(--dash-accent)]"
            />
            <span className="text-[var(--dash-muted)]">/</span>
            <input
              type="number"
              value={stats.maxHp}
              onChange={e => onChange({ maxHp: Number(e.target.value) })}
              min={1}
              className="w-16 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1.5 text-center text-sm text-[var(--dash-text)]"
            />
          </div>
          {/* Barra PF */}
          <div className="h-1.5 w-full rounded-full bg-[var(--dash-border-soft)]">
            <div
              className="h-full rounded-full bg-[var(--dash-accent)] transition-all"
              style={{ width: `${Math.min(100, (stats.hp / Math.max(1, stats.maxHp)) * 100)}%` }}
            />
          </div>
        </div>

        <StatInput
          label="CA"
          value={stats.ac}
          onChange={v => onChange({ ac: Number(v) })}
          min={1} max={30}
        />
        <StatInput
          label={isPathfinder ? 'Velocità (m)' : 'Velocità (ft)'}
          value={stats.speed}
          onChange={v => onChange({ speed: Number(v) })}
          suffix={isPathfinder ? 'm' : 'ft'}
        />
      </div>

      {/* Caratteristiche */}
      <div>
        <p className="mb-2 text-xs text-[var(--dash-muted)]">Caratteristiche</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {abilities.map(({ label, key }) => (
            <AbilityScore
              key={key}
              label={label}
              value={stats[key] as number}
              onChange={v => onChange({ [key]: v })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Vista compatta (read-only) per le card nella lista */
export function D20StatSummary({ stats }: { stats: D20Stats }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold text-[var(--dash-accent)]">
        ❤ {stats.hp}/{stats.maxHp} PF
      </span>
      <span className="text-[var(--dash-muted)]">CA {stats.ac}</span>
      {stats.level !== undefined && (
        <span className="text-[var(--dash-muted)]">Lv {stats.level} {stats.className}</span>
      )}
      {stats.challengeRating && (
        <span className="text-[var(--dash-muted)]">GS {stats.challengeRating}</span>
      )}
    </div>
  );
}
