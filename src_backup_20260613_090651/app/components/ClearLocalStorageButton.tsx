import { Trash2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Componente per cancellare localStorage con un pulsante
 * Da aggiungere temporaneamente nella pagina Impostazioni
 */
export function ClearLocalStorageButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    // Trova tutte le chiavi che iniziano con 'hsc_'
    const keys = Object.keys(localStorage).filter(key => key.startsWith('hsc_'));

    console.log(`Cancellazione di ${keys.length} chiavi:`, keys);

    // Cancella ogni chiave
    keys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`✅ Cancellata: ${key}`);
    });

    setCleared(true);
    setShowConfirm(false);

    console.log('✅ localStorage cancellato completamente!');

    // Ricarica la pagina dopo 2 secondi
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  if (cleared) {
    return (
      <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 text-center">
        <p className="font-semibold text-green-700">
          ✅ localStorage cancellato!
        </p>
        <p className="mt-2 text-sm text-green-600">
          Ricaricamento della pagina in corso...
        </p>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4">
        <p className="mb-4 font-semibold text-red-700">
          ⚠️ ATTENZIONE: Vuoi davvero cancellare tutti i dati locali?
        </p>
        <p className="mb-4 text-sm text-red-600">
          Questa azione cancellerà TUTTI i dati salvati in localStorage (personaggi, luoghi, mostri, ecc.).
          I dati nel database Supabase NON verranno cancellati.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            Sì, cancella tutto
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="rounded bg-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-400"
          >
            Annulla
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="flex items-center gap-2 rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
    >
      <Trash2 className="h-4 w-4" />
      Cancella localStorage (Reset Dati Locali)
    </button>
  );
}
