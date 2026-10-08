// Icona "Inserisci immagine" (IconeImmagine.tsx): una cornice con dentro un
// sole che cala dall'angolo alto sinistro verso quello basso destro e va a
// tramontare dietro la montagna. Riusata da TUTTI i pulsanti che
// inseriscono un'immagine: composer della chat, comando "Immagine" delle
// note (slash menu + gutter), CTA copertina campagna, "Aggiungi immagine"
// delle news, faccia dadi del configuratore dadi.
// Ordine DOM = ordine di pittura SVG: prima la CORNICE, poi il SOLE (dentro
// il clip dell'interno) e infine la MONTAGNA - il fill opaco di quest'ultima
// occlude sempre il sole quando egli ci entra dentro, mentre il clipPath
// tiene il sole entro l'interno del riquadro: "sbuca" dall'angolo alto
// sinistro e non esce mai dai bordi.
// Animazioni in src/styles/index.css: chatSoleTramonta muove il sole per un
// ciclo completo lungo la sua traiettoria (0% = posizione di riposo,
// l'angolo alto sinistro, quindi all'hover non ci sono salti), con keyframe
// a velocita' costante (timing lineare + campionati a lunghezza d'arco
// uniforme): il movimento deve restare fluido, senza ondate di
// accelerazioni. chatMontagnaTramonta alterna la montagna da chiaro
// (currentColor, come il sole visibile) a scuro (var(--dash-surface) =
// colore di fondo, come quando il sole e' interamente dietro di lei).
// Entrambe partono all'hover del pulsante, come tutte le altre icone del
// sito.
export function ImageSun({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="image-sun-interior">
          <rect x="4" y="4" width="16" height="16" />
        </clipPath>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <g clipPath="url(#image-sun-interior)">
        <circle className="chat-sole" cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
      </g>
      <path className="chat-montagna" d="M4 20V18.5H10L15.5 9L20 16V20Z" fill="currentColor" />
    </svg>
  );
}
