// Map PeerJS and browser ICE states to user-visible connection phases.
export function connectionProblem(iceState,connectionState){
 if(iceState==='failed'||connectionState==='failed')
  return 'Collegamento WebRTC fallito: il browser non riesce a raggiungere l’altro dispositivo. Prova la stessa rete Wi-Fi non ospiti, oppure verifica eventuale isolamento dei client.';
 if(iceState==='disconnected'||connectionState==='disconnected')
  return 'Collegamento WebRTC interrotto: controlla Wi-Fi, cambio rete o sospensione del browser.';
 if(iceState==='checking'||connectionState==='connecting')
  return 'Stanza trovata · verifica della connessione diretta WebRTC in corso';
 return null;
}
export function retryablePeerError(type) {
 return ['network','socket-error','server-error','webrtc'].includes(type);
}
