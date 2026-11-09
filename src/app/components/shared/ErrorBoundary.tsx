import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Barriera errore a livello applicativo: un'eccezione di render non deve
 * mai trasformare la sessione live in uno schermo bianco a meta' partita.
 * Mostra un pannello leggibile con il messaggio e due uscite: riprovare
 * (resetta il boundary senza ricaricare) o ricaricare la pagina.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Errore non gestito nell\'applicazione:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111318] p-6">
        <div className="w-full max-w-lg rounded-xl border border-red-400/30 bg-slate-950/95 p-6 shadow-2xl">
          <h1 className="text-base font-semibold text-red-200">
            Qualcosa è andato storto
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            La schermata ha smesso di funzionare, ma la sessione e i dati sono al sicuro.
            Puoi provare a riprendere da dove eri o ricaricare la pagina.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-black/40 p-3 text-xs text-red-100/90">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-300/30 hover:bg-cyan-500/30"
            >
              Riprova
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/20"
            >
              Ricarica la pagina
            </button>
          </div>
        </div>
      </div>
    );
  }
}
