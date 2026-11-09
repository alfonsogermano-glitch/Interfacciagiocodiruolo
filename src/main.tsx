import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./app/App";
import { ErrorBoundary } from "./app/components/shared/ErrorBoundary";
import "./styles/index.css";

// Viene montato qui (non in App) perche' e' un overlay globale indipendente
// dai provider: senza questo nodo tutti i toast dell'app (errori chat, dadi,
// upload) finivano nel vuoto.
createRoot(document.getElementById("root")!).render(
  <>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster position="bottom-right" theme="system" richColors closeButton />
  </>
);
