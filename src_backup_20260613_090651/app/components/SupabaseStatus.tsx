import { useState, useEffect } from 'react';
import { testSupabaseConnection } from '../../services/supabase/testConnection';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { AlertCircle, CheckCircle, Database, RefreshCw, X } from 'lucide-react';

export function SupabaseStatus() {
  const [isVisible, setIsVisible] = useState(true);
  const [status, setStatus] = useState<{
    connected: boolean;
    tablesExist: boolean;
    loading: boolean;
    error?: string;
    message?: string;
  }>({
    connected: false,
    tablesExist: false,
    loading: true
  });

  const checkConnection = async () => {
    if (!isSupabaseConfigured) {
      setStatus({
        connected: false,
        tablesExist: false,
        loading: false,
        error: 'Supabase non configurato. Connetti il progetto tramite Figma Make.'
      });
      return;
    }

    setStatus(prev => ({ ...prev, loading: true }));
    const result = await testSupabaseConnection();
    setStatus({
      connected: result.connected,
      tablesExist: result.tablesExist,
      loading: false,
      error: result.error,
      message: result.message
    });
  };

  useEffect(() => {
    checkConnection();
  }, []);

  if (!isVisible) {
    return null;
  }

  if (status.loading) {
    return (
      <div className="fixed bottom-4 right-4 bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4 shadow-lg max-w-md">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-[#8b7355] animate-spin" />
          <span className="text-[#e8d4b8]">Verifica connessione Supabase...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4 shadow-lg max-w-md z-50">
      <div className="flex items-start gap-3">
        <Database className="w-5 h-5 text-[#8b7355] mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[#e8d4b8] font-medium">Stato Supabase</h4>
            <button
              onClick={() => setIsVisible(false)}
              className="text-[#8b7355] hover:text-[#e8d4b8] transition-colors"
              title="Nascondi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {/* Connessione */}
            <div className="flex items-center gap-2">
              {status.connected ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-[#8b7355]">Connesso</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-[#8b7355]">Non connesso</span>
                </>
              )}
            </div>

            {/* Tabelle */}
            <div className="flex items-center gap-2">
              {status.tablesExist ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-[#8b7355]">Tabelle configurate</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span className="text-[#8b7355]">Tabelle non trovate</span>
                </>
              )}
            </div>

            {/* Messaggio di errore o info */}
            {(status.error || status.message) && (
              <div className="mt-3 p-2 bg-[#2a0a0a] rounded border border-[#4a0e0e]">
                <p className="text-xs text-[#8b7355]">
                  {status.error || status.message}
                </p>
              </div>
            )}

            {/* Istruzioni se tabelle non esistono */}
            {status.connected && !status.tablesExist && (
              <div className="mt-3 p-2 bg-[#2a0a0a] rounded border border-[#6b1515]">
                <p className="text-xs text-[#e8d4b8] font-medium mb-1">
                  📋 Azione Richiesta:
                </p>
                <ol className="text-xs text-[#8b7355] list-decimal list-inside space-y-1">
                  <li>Apri Supabase Dashboard</li>
                  <li>Vai su SQL Editor</li>
                  <li>Esegui supabase-schema.sql</li>
                </ol>
                <p className="text-xs text-[#8b7355] mt-2">
                  Vedi <code className="bg-[#1a0a0a] px-1">SUPABASE-SETUP.md</code> per i dettagli
                </p>
              </div>
            )}

            {/* Tutto OK */}
            {status.connected && status.tablesExist && (
              <div className="mt-3 p-2 bg-[#1a3a1a] rounded border border-[#2a5a2a]">
                <p className="text-xs text-green-400">
                  ✅ Database pronto! I dati vengono salvati su Supabase.
                </p>
              </div>
            )}
          </div>

          {/* Pulsante ricarica */}
          <button
            onClick={checkConnection}
            className="mt-3 w-full px-3 py-1.5 bg-[#4a0e0e] border border-[#6b1515] rounded text-[#e8d4b8] text-sm hover:bg-[#6b1515] transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Ricontrolla
          </button>
        </div>
      </div>
    </div>
  );
}
