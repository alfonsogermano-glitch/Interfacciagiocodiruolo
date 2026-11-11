import { useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, Monitor, RefreshCw, ShieldAlert } from 'lucide-react';

function demoInvite(input: string): string | null {
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.trycloudflare.com') ||
        parsed.username || parsed.password) return null;
    const token = new URLSearchParams(parsed.hash.slice(1)).get('join');
    if (!token || token.length < 20) return null;
    return parsed.href;
  } catch { return null; }
}

export function RecoveryEntry({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  const [invite, setInvite] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const join = (event: FormEvent) => {
    event.preventDefault();
    const target = demoInvite(invite);
    if (!target) {
      setValidationError('Inserisci un link completo di invito della demo GM Host, incluso #join=...');
      return;
    }
    window.location.assign(target);
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#090b12] px-5 py-12 text-[#f5f3f0]">
      <div className="w-full max-w-2xl space-y-7 rounded-2xl border border-white/15 bg-[#141823] p-7 shadow-2xl sm:p-10">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-amber-300" />
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-200">Hollowgate · accesso di recupero</p>
            <h1 className="font-serif text-3xl">Il sito resta accessibile</h1>
          </div>
        </div>
        <p className="text-base leading-relaxed text-white/80">
          Il servizio account e campagne online non è raggiungibile correttamente.
          Puoi comunque utilizzare questa pagina senza connessioni a Supabase.
          Nessun dato personale o campagna esistente viene modificato.
        </p>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 font-semibold"><Monitor className="h-5 w-5" /> Collegati alla demo GM Host</div>
          <p className="text-sm text-white/70">Il Game Master avvia la propria applicazione Windows e ti invia un link di partecipazione. Vale per PC e Android, sulla stessa rete o su reti diverse.</p>
          <form onSubmit={join} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="hollowgate-invite">Link invito giocatore</label>
            <input id="hollowgate-invite" value={invite} onChange={event => { setInvite(event.target.value); setValidationError(null); }}
              placeholder="https://...trycloudflare.com/#join=..."
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#090b12] px-3 py-2 text-sm text-white"
            />
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-200 px-4 py-2 font-semibold text-black">
              Entra nella demo <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          {validationError ? <p role="alert" className="text-sm text-rose-300">{validationError}</p> : null}
        </div>
        <div className="space-y-2">
          <button type="button" onClick={onRetry} disabled={checking} className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> {checking ? 'Controllo in corso…' : 'Riprova accesso account e campagne'}
          </button>
          <p className="text-xs text-white/60">Gli account, la registrazione e il recupero delle campagne online richiedono ancora il backend originale. Questa pagina non sostituisce il login né legge dati personali senza autorizzazione.</p>
          <a className="inline-block text-sm text-amber-200 underline" href="/?online=1">Prova comunque l'accesso con account esistente</a>
        </div>
        <a href="/privacy" className="inline-flex items-center gap-1 text-sm text-white/65 underline">Informativa sulla privacy <ExternalLink className="h-3 w-3" /></a>
      </div>
    </main>
  );
}
