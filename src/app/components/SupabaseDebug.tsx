import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { testSupabaseConnection } from '../../services/supabase/testConnection';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Trash2 } from 'lucide-react';

export function SupabaseDebug() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTests = async () => {
    setTesting(true);
    setResult(null);

    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      client: {
        isConfigured: isSupabaseConfigured,
        clientExists: !!supabase,
      },
      tests: {}
    };

    // Test: Connection
    try {
      const connectionTest = await testSupabaseConnection();
      debugInfo.tests.connection = connectionTest;
    } catch (error) {
      debugInfo.tests.connection = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    setResult(debugInfo);
    setTesting(false);
  };

  const clearLocalStorage = () => {
    if (confirm('Sicuro di voler cancellare tutti i dati localStorage? Questa operazione ricaricherà la pagina.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="bg-[var(--dash-input)] border border-[var(--dash-border)] rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">

          <div className="space-y-2 mb-4">
            <button
              onClick={runTests}
              disabled={testing}
              className="w-full px-4 py-2 bg-[#4a0e0e] border border-[#6b1515] rounded text-[#e8d4b8] hover:bg-[#6b1515] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              {testing ? 'Testing...' : 'Run Diagnostic Tests'}
            </button>

            <button
              onClick={clearLocalStorage}
              className="w-full px-4 py-2 bg-[#3a1a1a] border border-[#6b1515] rounded text-[#ff6b6b] hover:bg-[#4a0e0e] transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Cancella tutti i dati localStorage
            </button>

            <p className="text-xs text-[#8b7355] italic">
              Attenzione: cancellare localStorage rimuoverà tutti i dati locali non sincronizzati con Supabase e ricaricherà la pagina.
            </p>
          </div>

          {result && (
            <div className="space-y-3">
              {/* Client Status */}
              <div className="bg-[#2a0a0a] rounded p-3 border border-[#4a0e0e]">
                <h5 className="text-[#e8d4b8] text-sm font-medium mb-2">Supabase Client</h5>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {result.client.isConfigured ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="text-[#8b7355]">Is Configured:</span>
                    <span className="text-[#e8d4b8]">{result.client.isConfigured ? 'YES' : 'NO'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.client.clientExists ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="text-[#8b7355]">Client Exists:</span>
                    <span className="text-[#e8d4b8]">{result.client.clientExists ? 'YES' : 'NO'}</span>
                  </div>
                </div>
              </div>

              {/* Connection Test */}
              <div className="bg-[#2a0a0a] rounded p-3 border border-[#4a0e0e]">
                <h5 className="text-[#e8d4b8] text-sm font-medium mb-2">Connection Test</h5>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {result.tests.connection?.connected ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="text-[#8b7355]">Connected:</span>
                    <span className="text-[#e8d4b8]">{result.tests.connection?.connected ? 'YES' : 'NO'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.tests.connection?.tablesExist ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                    )}
                    <span className="text-[#8b7355]">Tables Exist:</span>
                    <span className="text-[#e8d4b8]">{result.tests.connection?.tablesExist ? 'YES' : 'NO'}</span>
                  </div>
                  {result.tests.connection?.error && (
                    <div className="mt-2 p-2 bg-[#3a1a1a] rounded border border-[#6b1515]">
                      <p className="text-[#ff6b6b] text-[10px] font-mono break-all">
                        {result.tests.connection.error}
                      </p>
                    </div>
                  )}
                  {result.tests.connection?.message && (
                    <div className="mt-2 p-2 bg-[#1a2a1a] rounded border border-[#2a5a2a]">
                      <p className="text-green-400 text-[10px]">
                        {result.tests.connection.message}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Raw JSON */}
              <details className="bg-[#2a0a0a] rounded p-3 border border-[#4a0e0e]">
                <summary className="text-[#e8d4b8] text-xs font-medium cursor-pointer">
                  Raw Debug Data (click to expand)
                </summary>
                <pre className="mt-2 text-[10px] text-[#8b7355] overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
