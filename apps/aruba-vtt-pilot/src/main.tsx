import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadPilotSession,logoutPilot} from './client.mjs';
import './styles.css';

type PilotUser={id:string;email:string;displayName:string;role:'admin'|'standard'};
type Status={state:'loading'}|{state:'unauthorized'}|{state:'error'}|{state:'ready';user:PilotUser};
const networkFetch=fetch.bind(window);

function Pilot() {
  const [status,setStatus]=useState<Status>({state:'loading'});
  const [closing,setClosing]=useState(false);
  useEffect(()=>{
    let alive=true;
    void loadPilotSession(networkFetch)
      .then(user=>{
        if(alive)setStatus(user?{state:'ready',user:user as PilotUser}:{state:'unauthorized'});
      })
      .catch(()=>{if(alive)setStatus({state:'error'});});
    return ()=>{alive=false;};
  },[]);

  async function logout() {
    setClosing(true);
    try{
      await logoutPilot(networkFetch);
      window.location.assign('/login');
    }catch{setStatus({state:'error'});setClosing(false);}
  }
  return <main className="stage">
    <header className="brand">
      <span className="sigil" aria-hidden="true">✧</span>
      <span className="wordmark">HOLLOWGATE</span>
      <small>PORTALE VTT · ARUBA</small>
    </header>
    <section className="shell" aria-live="polite">
      {status.state==='loading'&&<p className="status">Verifica della sessione Aruba in corso…</p>}
      {status.state==='unauthorized'&&<>
        <h1>Il varco è chiuso</h1>
        <p>È necessario accedere con un account Aruba verificato.</p>
        <a className="action" href="/login">Vai all’accesso</a>
      </>}
      {status.state==='error'&&<>
        <h1>Accesso non disponibile</h1>
        <p>Non è stato possibile verificare la sessione. Nessun dato di gioco è stato caricato.</p>
        <a className="action" href="/login">Torna all’accesso</a>
      </>}
      {status.state==='ready'&&<>
        <div className="eyebrow">IDENTITÀ VERIFICATA SU ARUBA</div>
        <h1>Bentornato, {status.user.displayName}</h1>
        <p className="subtitle">{status.user.email}</p>
        <span className="role">{status.user.role==='admin'?'Amministratore':'Utente standard'}</span>
        <div className="rule" />
        <h2>Le tue campagne</h2>
        <p>Il collegamento delle campagne a PostgreSQL non è ancora attivo in questo ambiente. Nessuna campagna di Supabase viene mostrata o modificata.</p>
        <div className="features">
          <div><strong>Game Master</strong><span>In preparazione · permessi campagna ancora da migrare</span></div>
          <div><strong>Giocatore</strong><span>In preparazione · partecipazioni ancora da migrare</span></div>
        </div>
        <button type="button" onClick={()=>void logout()} disabled={closing}>
          {closing?'Chiusura della sessione…':'Esci dal portale'}
        </button>
      </>}
    </section>
    <footer>Ambiente privato di prova · Nessun accesso ai dati delle campagne esistenti</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Pilot />);
