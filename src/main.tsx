import { createRoot } from "react-dom/client";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./app/components/shared/ErrorBoundary";
import { RecoveryEntry } from "./app/recovery/RecoveryEntry";
import { probeLegacyBackend } from "./app/recovery/recoveryProbe";
import { getSupabaseConfig } from "./config/supabase.config";
import "./styles/index.css";

// Critical recovery property: do not import App or any Supabase auth/session module
// until the legacy backend has actually passed both Auth and REST probes.
const LegacyApp = lazy(() => import("./app/App"));
type Mode = "checking" | "legacy" | "recovery";
const legalPaths = new Set(["/privacy", "/elimina-dati", "/news"]);
function Entry() {
  const [mode, setMode] = useState<Mode>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("offline") === "1") return "recovery";
    return "checking";
  });
  const retry = useCallback(async () => {
    setMode("checking");
    const config = getSupabaseConfig();
    const next = await probeLegacyBackend(config.url, config.anonKey);
    setMode(next === "available" ? "legacy" : "recovery");
  }, []);
  useEffect(() => {
    if (mode === "checking") void retry();
    // Run exactly once per page load; repeated checks are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (mode === "legacy" || legalPaths.has(location.pathname)) {
    return <Suspense fallback={<div className="min-h-screen bg-[#090b12] p-8 text-white">Caricamento Hollowgate…</div>}><LegacyApp /></Suspense>;
  }
  if (mode === "recovery") return <RecoveryEntry checking={false} onRetry={() => void retry()} />;
  return <div className="flex min-h-screen items-center justify-center bg-[#090b12] text-white">Verifica disponibilità Hollowgate…</div>;
}
createRoot(document.getElementById("root")!).render(
  <>
    <ErrorBoundary><Entry /></ErrorBoundary>
    <Toaster position="bottom-right" theme="system" richColors closeButton />
  </>
);
