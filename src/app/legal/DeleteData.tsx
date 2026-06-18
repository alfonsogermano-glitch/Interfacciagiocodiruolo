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

export function DeleteData() {
  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <a href="/" style={backLinkStyle}>← Torna alla home</a>
        <h1 style={titleStyle}>Elimina i tuoi dati</h1>

        <p style={paragraphStyle}>
          Per richiedere la cancellazione completa del tuo account Hollow Gate e di tutti i dati
          associati (personaggi, campagne, informazioni di profilo), invia una email a{' '}
          <a href="mailto:alfonso.germano@gmail.com" style={linkStyle}>alfonso.germano@gmail.com</a>{' '}
          con oggetto "Richiesta cancellazione dati" dall'indirizzo email associato al tuo account.
        </p>

        <p style={paragraphStyle}>
          La richiesta verrà elaborata entro 30 giorni e riceverai una conferma via email una volta
          completata la cancellazione.
        </p>
      </div>
    </div>
  );
}
