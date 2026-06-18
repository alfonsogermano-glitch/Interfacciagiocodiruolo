const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#000',
  color: '#ccc',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex',
  justifyContent: 'center',
  padding: '3rem 1.5rem',
};

const contentStyle: React.CSSProperties = {
  maxWidth: 700,
  width: '100%',
};

const backLinkStyle: React.CSSProperties = {
  color: '#c9a04e',
  textDecoration: 'none',
  fontSize: '0.9rem',
  display: 'inline-block',
  marginBottom: '2rem',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontFamily: 'serif',
  fontSize: '2rem',
  fontWeight: 'bold',
  marginBottom: '2rem',
};

const paragraphStyle: React.CSSProperties = {
  lineHeight: 1.75,
  fontSize: '0.95rem',
  marginBottom: '1.25rem',
};

const linkStyle: React.CSSProperties = {
  color: '#c9a04e',
  textDecoration: 'underline',
};

export function PrivacyPolicy() {
  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <a href="/" style={backLinkStyle}>← Torna alla home</a>
        <h1 style={titleStyle}>Informativa sulla Privacy</h1>

        <p style={paragraphStyle}>
          Hollow Gate raccoglie i seguenti dati personali: email e password (per la creazione e
          gestione dell'account), nome visualizzato, e dati relativi alle attività di gioco
          (personaggi creati, campagne, contenuti generati nell'app).
        </p>

        <p style={paragraphStyle}>
          I dati sono salvati su Supabase (infrastruttura cloud) e utilizzati esclusivamente per il
          funzionamento dell'app: autenticazione, salvataggio dei progressi di gioco,
          sincronizzazione tra dispositivi.
        </p>

        <p style={paragraphStyle}>
          Se l'utente effettua il login tramite Google, Discord o Facebook, Hollow Gate riceve solo
          le informazioni base del profilo (nome, email, immagine) necessarie per creare l'account,
          secondo le autorizzazioni concesse dall'utente su quella piattaforma.
        </p>

        <p style={paragraphStyle}>
          I dati non vengono venduti, condivisi con terze parti per scopi pubblicitari, né
          utilizzati per profilazione commerciale.
        </p>

        <p style={paragraphStyle}>
          L'utente può richiedere la cancellazione del proprio account e di tutti i dati associati
          in qualsiasi momento, scrivendo a{' '}
          <a href="mailto:alfonso.germano@gmail.com" style={linkStyle}>alfonso.germano@gmail.com</a>{' '}
          o seguendo le istruzioni nella pagina{' '}
          <a href="/elimina-dati" style={linkStyle}>"Elimina i tuoi dati"</a>.
        </p>

        <p style={paragraphStyle}>
          Contatto per qualsiasi richiesta relativa alla privacy:{' '}
          <a href="mailto:alfonso.germano@gmail.com" style={linkStyle}>alfonso.germano@gmail.com</a>
        </p>

        <p style={{ ...paragraphStyle, color: '#888', marginTop: '2rem' }}>
          Ultimo aggiornamento: giugno 2026
        </p>
      </div>
    </div>
  );
}
