// PeerJS Cloud has no authenticated rooms: a code is valid only while the GM
// has actually acquired its PeerJS identity. Never display a cached old code.
export function newRoomCode(randomBytes) {
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 if(!randomBytes||randomBytes.length!==12)throw Error('12 random bytes required');
 return Array.from(randomBytes,b=>alphabet[b%alphabet.length]).join('');
}
export function explainPeerFailure(error) {
 const type=String(error?.type??'').toLowerCase();
 const message=String(error?.message??'').toLowerCase();
 if(type==='peer-unavailable'||/peer.*unavailable|could not connect to peer|peer not found/.test(message))
  return 'Stanza non raggiungibile. Il GM deve creare una nuova stanza e comunicare il codice visualizzato adesso.';
 if(type==='unavailable-id'||/id.*taken|id.*in use|already taken/.test(message))
  return 'Il codice precedente è ancora occupato sul server PeerJS. Genera una nuova stanza.';
 if(type==='network'||type==='socket-error'||type==='server-error')
  return 'Il servizio di segnalazione non è raggiungibile. Verifica la rete e riprova.';
 return 'Connessione PeerJS: '+(error?.message??error?.type??'errore sconosciuto');
}
